import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import WeeklyTipDraft from "@/models/WeeklyTipDraft";
import { requireAdmin } from "@/lib/session";
import { serverError } from "@/lib/apiError";
import { TIP_FAMILIES, cleanTip, generateTipDrafts } from "@/lib/weeklyTipDrafts";
import { actionForTopic, weekNumber } from "@/lib/weeklyTips";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Only this week and the next can be worked on: past weeks have been sent. */
function editableWeek(value: unknown): number | null {
    const week = Number(value);
    const now = weekNumber();
    return Number.isInteger(week) && week >= now && week <= now + 1 ? week : null;
}

/** GET /api/admin/weekly-tips?week= — every role's tip for a week, drafts included. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const now = weekNumber();
        const week = editableWeek(new URL(req.url).searchParams.get("week")) ?? now;
        await dbConnect();
        const tips = await WeeklyTipDraft.find({ week }).lean();
        return NextResponse.json({
            week,
            thisWeek: now,
            families: Object.entries(TIP_FAMILIES).map(([family, label]) => {
                const tip = tips.find((candidate) => candidate.family === family);
                return { family, label, tip: tip ? { id: String(tip._id), topic: tip.topic, title: tip.title, body: tip.body, tryThis: tip.tryThis, action: tip.action ?? actionForTopic(tip.topic), status: tip.status, edited: tip.edited } : null };
            }),
        });
    } catch (err) {
        return serverError("api/admin/weekly-tips", err, "Couldn't load the weekly tips.");
    }
}

/** POST — write drafts. Body: { week, family? (one role, replacing its tip), all? } */
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const body = await req.json().catch(() => ({}));
        const week = editableWeek(body.week);
        if (week === null) return NextResponse.json({ error: "Tips can only be written for this week or next week." }, { status: 400 });
        const one = typeof body.family === "string" && TIP_FAMILIES[body.family] ? body.family : null;
        // Asking again for one role replaces its tip; writing for everyone leaves approved and edited tips alone.
        const result = await generateTipDrafts(week, one ? { families: [one], force: true } : {});
        if (result.written.length === 0 && result.failed.length > 0) {
            return NextResponse.json({ error: "The tips couldn't be written just now. Please try again in a minute." }, { status: 502 });
        }
        return NextResponse.json({ success: true, ...result });
    } catch (err) {
        return serverError("api/admin/weekly-tips", err, "Couldn't write the tips.");
    }
}

/** PATCH — edit a tip's wording and/or approve it. Body: { id, title?, body?, tryThis?, topic?, status? } or { week, approveAll: true } */
export async function PATCH(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const body = await req.json().catch(() => ({}));
        await dbConnect();

        if (body.approveAll) {
            const week = editableWeek(body.week);
            if (week === null) return NextResponse.json({ error: "Unknown week." }, { status: 400 });
            const result = await WeeklyTipDraft.updateMany({ week, status: "draft" }, { $set: { status: "approved", approvedBy: auth.session.email, approvedAt: new Date() } });
            return NextResponse.json({ success: true, approved: result.modifiedCount });
        }

        if (typeof body.id !== "string" || !/^[a-f0-9]{24}$/i.test(body.id)) return NextResponse.json({ error: "Unknown tip." }, { status: 400 });
        const tip = await WeeklyTipDraft.findById(body.id);
        if (!tip || editableWeek(tip.week) === null) return NextResponse.json({ error: "This tip can no longer be changed." }, { status: 400 });

        if (typeof body.title === "string" || typeof body.body === "string") {
            const clean = cleanTip({ topic: body.topic ?? tip.topic, title: body.title ?? tip.title, body: body.body ?? tip.body, tryThis: body.tryThis ?? tip.tryThis, action: body.action ?? tip.action });
            if (!clean) return NextResponse.json({ error: "A tip needs a title and at least a sentence of advice." }, { status: 400 });
            const changed = clean.title !== tip.title || clean.body !== tip.body || clean.tryThis !== tip.tryThis || clean.topic !== tip.topic || clean.action !== tip.action;
            Object.assign(tip, clean);
            if (changed) tip.edited = true;
        }
        if (body.status === "approved" || body.status === "draft") {
            tip.status = body.status;
            tip.approvedBy = body.status === "approved" ? auth.session.email : undefined;
            tip.approvedAt = body.status === "approved" ? new Date() : undefined;
        }
        await tip.save();
        return NextResponse.json({ success: true });
    } catch (err) {
        return serverError("api/admin/weekly-tips", err, "Couldn't save the tip.");
    }
}
