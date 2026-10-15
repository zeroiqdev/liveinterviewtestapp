import { randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import DiscountCode from "@/models/DiscountCode";
import { requireAdmin } from "@/lib/session";
import { serverError } from "@/lib/apiError";
import { describeDiscount, newCodeProblem, normalizeDiscountCode } from "@/lib/discounts";

export const dynamic = "force-dynamic";

/** A fresh code, readable aloud: no 0/O or 1/I. */
function generateDiscountCode(prefix = ""): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let body = "";
    for (let i = 0; i < 8; i++) body += alphabet[randomInt(0, alphabet.length)];
    const start = normalizeDiscountCode(prefix).slice(0, 10);
    return start ? `${start}-${body}` : body;
}

/** GET /api/admin/discounts — every code, newest first. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        await dbConnect();
        const codes = await DiscountCode.find().sort({ createdAt: -1 }).limit(300).lean();
        return NextResponse.json({
            codes: codes.map((c) => ({
                id: String(c._id),
                code: c.code,
                kind: c.kind,
                value: c.value,
                description: describeDiscount(c),
                maxUses: c.maxUses ?? null,
                uses: c.uses ?? 0,
                expiresAt: c.expiresAt ?? null,
                active: c.active,
                note: c.note ?? "",
                createdAt: c.createdAt,
            })),
        });
    } catch (err) {
        return serverError("api/admin/discounts", err, "Couldn't load discount codes.");
    }
}

/**
 * POST /api/admin/discounts — { kind, value, code?, prefix?, maxUses?, expiresAt?, note? }.
 * Leave out `code` to have one made up.
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const body = await req.json().catch(() => ({}));
        const problem = newCodeProblem(body);
        if (problem) return NextResponse.json({ error: problem }, { status: 400 });

        const typed = normalizeDiscountCode(body.code);
        if (body.code && typed.length < 4) return NextResponse.json({ error: "A code needs at least 4 letters or numbers." }, { status: 400 });
        const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
        if (expiresAt && Number.isNaN(expiresAt.getTime())) return NextResponse.json({ error: "That expiry date isn't valid." }, { status: 400 });
        const maxUses = body.maxUses === null || body.maxUses === undefined || body.maxUses === "" ? null : Number(body.maxUses);

        await dbConnect();
        // A made-up code is retried on the rare clash; a typed one must be new.
        for (let attempt = 0; attempt < 5; attempt++) {
            const code = typed || generateDiscountCode(typeof body.prefix === "string" ? body.prefix : "");
            if (await DiscountCode.exists({ code })) {
                if (typed) return NextResponse.json({ error: "That code already exists." }, { status: 409 });
                continue;
            }
            const created = await DiscountCode.create({
                code,
                kind: body.kind,
                value: Number(body.value),
                maxUses,
                expiresAt,
                note: typeof body.note === "string" ? body.note.slice(0, 200) : "",
                createdBy: auth.session.email,
            });
            return NextResponse.json({ id: String(created._id), code: created.code });
        }
        return NextResponse.json({ error: "Couldn't make a unique code. Try again." }, { status: 500 });
    } catch (err) {
        return serverError("api/admin/discounts POST", err, "Couldn't create that code.");
    }
}

/** PATCH /api/admin/discounts — { id, active }: switch a code on or off. */
export async function PATCH(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const body = await req.json().catch(() => ({}));
        if (typeof body.id !== "string" || !/^[a-f0-9]{24}$/i.test(body.id) || typeof body.active !== "boolean") {
            return NextResponse.json({ error: "Unknown code." }, { status: 400 });
        }
        await dbConnect();
        await DiscountCode.updateOne({ _id: body.id }, { $set: { active: body.active } });
        return NextResponse.json({ ok: true });
    } catch (err) {
        return serverError("api/admin/discounts PATCH", err, "Couldn't change that code.");
    }
}

/** DELETE /api/admin/discounts?id= — remove a code. Purchases that used it keep its name. */
export async function DELETE(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const id = new URL(req.url).searchParams.get("id");
        if (!id || !/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Unknown code." }, { status: 400 });
        await dbConnect();
        await DiscountCode.deleteOne({ _id: id });
        return NextResponse.json({ ok: true });
    } catch (err) {
        return serverError("api/admin/discounts DELETE", err, "Couldn't delete that code.");
    }
}
