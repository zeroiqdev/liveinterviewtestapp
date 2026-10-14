import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import AppFeedback, { FEEDBACK_KINDS, type FeedbackKind } from "@/models/AppFeedback";
import { requireAdmin, requireAuth } from "@/lib/session";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

const MAX_MESSAGE = 2000;
const MAX_CONTEXT = 12_000;

function text(value: unknown, max: number): string {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** POST /api/app-feedback — a signed-in user sends a note about the product. */
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const limited = await rateLimit(LIMITS.feedback, `user:${auth.session.email}`);
        if (limited) return limited;

        const body = await req.json().catch(() => ({}));
        const message = text(body.message, MAX_MESSAGE);
        const tags: string[] = Array.isArray(body.tags) ? body.tags.map((tag: unknown) => text(tag, 60)).filter(Boolean).slice(0, 8) : [];
        const rating = [1, 2, 3].includes(body.rating) ? (body.rating as number) : undefined;
        // A tap is enough: a rating or a quick-pick reason needs no typing.
        if (message.length < 3 && tags.length === 0 && !rating) {
            return NextResponse.json({ error: "Pick an option or write a short message first." }, { status: 400 });
        }
        // What the app captured by itself. Bounded, so it can't be used to store anything large.
        const contextJson = body.context && typeof body.context === "object" ? JSON.stringify(body.context) : "";
        const context = contextJson && contextJson.length <= MAX_CONTEXT ? JSON.parse(contextJson) : undefined;
        const kind: FeedbackKind = FEEDBACK_KINDS.includes(body.kind) ? body.kind : "other";

        await dbConnect();
        // Who sent it comes from the session, never from the request.
        await AppFeedback.create({
            email: auth.session.email,
            name: auth.session.name || "",
            role: auth.session.role || "",
            kind,
            message,
            section: text(body.section, 60) || "Unknown",
            path: text(body.path, 200),
            interviewSessionId: text(body.interviewSessionId, 80) || undefined,
            detail: text(body.detail, 120) || undefined,
            viewport: text(body.viewport, 30) || undefined,
            tags,
            rating,
            context,
            userAgent: (req.headers.get("user-agent") || "").slice(0, 300) || undefined,
        });
        return NextResponse.json({ success: true });
    } catch (err) {
        return serverError("api/app-feedback", err, "We couldn't send your feedback. Please try again.");
    }
}

/** GET /api/app-feedback (admin) — the latest feedback, newest first. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        await dbConnect();
        const items = await AppFeedback.find().sort({ createdAt: -1 }).limit(300).lean();
        return NextResponse.json({
            items: items.map((item) => ({ ...item, id: String(item._id), _id: undefined })),
            open: items.filter((item) => !item.resolved).length,
        });
    } catch (err) {
        return serverError("api/app-feedback", err, "Couldn't load feedback.");
    }
}

/** PATCH /api/app-feedback (admin) — mark one item resolved or open again. */
export async function PATCH(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const body = await req.json().catch(() => ({}));
        if (typeof body.id !== "string" || !/^[a-f0-9]{24}$/i.test(body.id)) return NextResponse.json({ error: "Unknown item." }, { status: 400 });
        await dbConnect();
        await AppFeedback.updateOne({ _id: body.id }, { $set: { resolved: Boolean(body.resolved) } });
        return NextResponse.json({ success: true });
    } catch (err) {
        return serverError("api/app-feedback", err, "Couldn't update feedback.");
    }
}
