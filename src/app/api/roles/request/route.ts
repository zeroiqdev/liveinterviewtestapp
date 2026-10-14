import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import RoleRequest from "@/models/RoleRequest";
import { LIMITS, clientIp, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";
import { cleanRoleRequest } from "@/lib/tryInterview";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/roles/request — no account needed.
 * Body: { role, email? }
 * Someone's role isn't on the list: count the request so it shows in admin.
 */
export async function POST(req: NextRequest) {
    try {
        const limited = await rateLimit(LIMITS.roleRequest, `ip:${clientIp(req)}`);
        if (limited) return limited;

        const body = await req.json().catch(() => ({}));
        const role = cleanRoleRequest(body.role);
        if (!role) return NextResponse.json({ error: "Tell us the role you're looking for." }, { status: 400 });
        const email = typeof body.email === "string" && EMAIL_RE.test(body.email.trim()) ? body.email.trim().toLowerCase().slice(0, 200) : "";

        await dbConnect();
        await RoleRequest.updateOne(
            { key: role.toLowerCase() },
            {
                $setOnInsert: { role, firstRequestedAt: new Date() },
                $set: { lastRequestedAt: new Date() },
                $inc: { count: 1 },
                ...(email ? { $addToSet: { emails: email } } : {}),
            },
            { upsert: true }
        );
        return NextResponse.json({ ok: true });
    } catch (err) {
        return serverError("api/roles/request", err, "We couldn't send your request. Please try again.");
    }
}
