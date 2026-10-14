import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { generateTipDrafts } from "@/lib/weeklyTipDrafts";
import { weekNumber } from "@/lib/weeklyTips";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/cron/weekly-tips — every Thursday (see vercel.json), writes next
 * week's tips as drafts so there are a few days to review them in the admin
 * portal. It never approves anything.
 */
export async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.error("[cron/weekly-tips] CRON_SECRET is not set; refusing to run.");
        return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }
    const given = Buffer.from(req.headers.get("authorization") || "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const result = await generateTipDrafts(weekNumber() + 1);
        console.info(`[cron/weekly-tips] week ${result.week}: wrote ${result.written.length}, kept ${result.kept.length}, failed ${result.failed.length}`);
        return NextResponse.json({ success: true, ...result });
    } catch (err) {
        console.error("[cron/weekly-tips]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
