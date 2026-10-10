import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runScrape } from "@/lib/jobScrapeRunner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SCRAPE_BUDGET_MS = 240_000;

/**
 * GET /api/cron/scrape-jobs — the scheduled scrape (see vercel.json).
 *
 * Vercel calls this with `Authorization: Bearer <CRON_SECRET>` when the
 * CRON_SECRET environment variable is set. Without the variable the endpoint
 * refuses everyone, so it can't be triggered by strangers.
 */
export async function GET(req: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.error("[cron/scrape-jobs] CRON_SECRET is not set; refusing to run.");
        return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }
    const given = Buffer.from(req.headers.get("authorization") || "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const run = await runScrape({ budgetMs: SCRAPE_BUDGET_MS });
        console.info(
            `[cron/scrape-jobs] scraped ${run.sourcesScraped}/${run.sourcesDue} sources, ` +
                `${run.newJobs} new jobs, ${run.sourcesRemaining} left for the next run`
        );
        const failed = run.results.filter((result) => result.error);
        if (failed.length) {
            console.warn(`[cron/scrape-jobs] ${failed.length} source(s) reported errors:`, failed.map((f) => `${f.companyName}: ${f.error}`).join("; "));
        }
        return NextResponse.json({
            success: true,
            sourcesScraped: run.sourcesScraped,
            sourcesRemaining: run.sourcesRemaining,
            newJobs: run.newJobs,
            totalJobs: run.totalJobs,
        });
    } catch (err) {
        console.error("[cron/scrape-jobs] failed:", err);
        return NextResponse.json({ error: "Scrape failed" }, { status: 500 });
    }
}
