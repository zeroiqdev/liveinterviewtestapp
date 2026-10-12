import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { runScrape, SourceNotFoundError } from "@/lib/jobScrapeRunner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Leaves time to store results and respond before the request is cut off. */
const SCRAPE_BUDGET_MS = 240_000;

/**
 * POST /api/jobs/scrape (admin)
 *
 * Query params:
 *   - sourceId (optional): scrape a single source by ID
 *   - (none): scrape enabled sources, least recently scraped first, for as
 *     long as the time budget allows; `sourcesRemaining` says how many are
 *     left for another run.
 */
export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAdmin(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }

        const sourceId = new URL(req.url).searchParams.get("sourceId");
        const run = await runScrape({ sourceId, budgetMs: SCRAPE_BUDGET_MS });

        if (run.sourcesDue === 0) {
            return NextResponse.json({
                success: true,
                scrapedCount: 0,
                totalJobs: run.totalJobs,
                message: "No enabled sources to scrape.",
                results: [],
            });
        }

        const remaining = run.sourcesRemaining
            ? ` ${run.sourcesRemaining} source(s) didn't fit in this run; scrape again to continue.`
            : "";
        return NextResponse.json({
            success: true,
            scrapedCount: run.newJobs,
            totalJobsFound: run.totalJobsFound,
            totalJobs: run.totalJobs,
            sourcesScraped: run.sourcesScraped,
            sourcesRemaining: run.sourcesRemaining,
            message: `Scraped ${run.sourcesScraped} source(s): found ${run.totalJobsFound} total jobs, ${run.newJobs} new.${remaining}`,
            results: run.results,
        });
    } catch (err: unknown) {
        if (err instanceof SourceNotFoundError) {
            return NextResponse.json({ error: err.message }, { status: 404 });
        }
        const error = err instanceof Error ? err.message : "Scraping failed";
        return NextResponse.json({ error }, { status: 500 });
    }
}
