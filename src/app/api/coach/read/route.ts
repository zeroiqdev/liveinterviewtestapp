import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import CoachRead, { coachMessageKind } from "@/models/CoachRead";
import { requireAuth } from "@/lib/session";
import { serverError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/** GET /api/coach/read — the ids of the coach messages this user has opened. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        await dbConnect();
        const rows = await CoachRead.find({ email: auth.session.email }).select("messageId").lean();
        return NextResponse.json({ read: rows.map((row) => row.messageId) });
    } catch (err) {
        return serverError("api/coach/read", err, "Couldn't load read messages.");
    }
}

/** POST /api/coach/read — note that this user opened a coach message. Body: { id, label? } */
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const body = await req.json().catch(() => ({}));
        const messageId = typeof body.id === "string" ? body.id.slice(0, 120) : "";
        if (!/^coach-[a-z0-9_-]+$/i.test(messageId)) return NextResponse.json({ error: "Unknown message." }, { status: 400 });
        await dbConnect();
        await CoachRead.updateOne(
            { email: auth.session.email, messageId },
            { $setOnInsert: { email: auth.session.email, messageId, kind: coachMessageKind(messageId), label: typeof body.label === "string" ? body.label.slice(0, 120) : undefined, readAt: new Date() } },
            { upsert: true }
        );
        return NextResponse.json({ success: true });
    } catch (err) {
        return serverError("api/coach/read", err, "Couldn't save that.");
    }
}
