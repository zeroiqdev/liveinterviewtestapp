import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendOnboardingEmails } from "@/lib/onboardingEmails";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/cron/onboarding-emails — every day (see vercel.json), sends new
 * accounts their day-1 resume email and day-2 tip email.
 */
export async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.error("[cron/onboarding-emails] CRON_SECRET is not set; refusing to run.");
        return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }
    const given = Buffer.from(req.headers.get("authorization") || "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const result = await sendOnboardingEmails();
        console.info(`[cron/onboarding-emails] resume ${result.resume}, tip ${result.tip}, failed ${result.failed}`);
        return NextResponse.json({ success: true, ...result });
    } catch (err) {
        console.error("[cron/onboarding-emails]", err);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
