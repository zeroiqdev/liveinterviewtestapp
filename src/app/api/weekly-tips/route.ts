import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { approvedTipFor } from "@/lib/weeklyTipDrafts";
import { weekNumber } from "@/lib/weeklyTips";
import { serverError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/** GET /api/weekly-tips — this week's and last week's approved tip for the signed-in user's kind of role. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const week = weekNumber();
        const family = auth.session.roleFamily || "";
        const [thisWeek, lastWeek] = await Promise.all([approvedTipFor(family, week), approvedTipFor(family, week - 1)]);
        return NextResponse.json({ tips: [thisWeek, lastWeek] });
    } catch (err) {
        return serverError("api/weekly-tips", err, "Couldn't load this week's tip.");
    }
}
