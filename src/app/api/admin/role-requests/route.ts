import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import RoleRequest from "@/models/RoleRequest";
import { requireAdmin } from "@/lib/session";
import { serverError } from "@/lib/apiError";
import { getRoles } from "@/lib/adminStorage";
import { sendEmail } from "@/lib/email";
import { roleAddedEmail } from "@/lib/roleRequests";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/** GET /api/admin/role-requests — roles people asked for, most requested first. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        await dbConnect();
        const requests = await RoleRequest.find().sort({ count: -1, lastRequestedAt: -1 }).limit(200).lean();
        return NextResponse.json({
            requests: requests.map((r) => ({ id: String(r._id), role: r.role, count: r.count, emails: r.emails ?? [], lastRequestedAt: r.lastRequestedAt })),
        });
    } catch (err) {
        return serverError("api/admin/role-requests", err, "Couldn't load role requests.");
    }
}

/** DELETE /api/admin/role-requests?id= — clear a request once it's been dealt with. */
export async function DELETE(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const id = new URL(req.url).searchParams.get("id");
        if (!id || !/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Unknown request." }, { status: 400 });
        await dbConnect();
        await RoleRequest.deleteOne({ _id: id });
        return NextResponse.json({ ok: true });
    } catch (err) {
        return serverError("api/admin/role-requests", err, "Couldn't remove that request.");
    }
}

/**
 * POST /api/admin/role-requests — body { id, role }: the role people asked for
 * has been added (as `role`, one of the roles on the list). Emails everyone who
 * asked to be told, then clears the request.
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const body = await req.json().catch(() => ({}));
        const id = typeof body.id === "string" ? body.id : "";
        if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Unknown request." }, { status: 400 });
        const roles = await getRoles();
        const role = roles.find((r) => r.title === body.role);
        if (!role) return NextResponse.json({ error: "Add the role to the list first, then choose it here." }, { status: 400 });

        await dbConnect();
        const request = await RoleRequest.findById(id).lean();
        if (!request) return NextResponse.json({ error: "Unknown request." }, { status: 404 });

        let sent = 0;
        let failed = 0;
        for (const email of request.emails ?? []) {
            const message = roleAddedEmail({ requested: request.role, role: role.title, siteUrl: SITE_URL });
            try {
                await sendEmail({ to: email, ...message });
                sent++;
            } catch (err) {
                failed++;
                console.warn("[role-requests] email not sent:", (err as Error).message);
            }
        }
        // Kept if any email failed, so it can be sent again.
        if (failed === 0) await RoleRequest.deleteOne({ _id: id });
        return NextResponse.json({ sent, failed });
    } catch (err) {
        return serverError("api/admin/role-requests POST", err, "Couldn't send those emails.");
    }
}
