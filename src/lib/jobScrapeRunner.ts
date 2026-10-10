/**
 * Runs the job scraper over the configured sources. Shared by the admin
 * "scrape" button (POST /api/jobs/scrape) and the scheduled run
 * (GET /api/cron/scrape-jobs), so both behave the same.
 *
 * A full pass over every source takes longer than one serverless request may
 * run, so a pass works to a time budget: sources are taken least recently
 * scraped first, and whatever doesn't fit is picked up by the next run.
 */

import type { JobItem } from "@/app/api/jobs/route";
import type { ScraperSource } from "@/app/api/jobs/sources/route";
import { scrapeCareerPage, classifyRoleFamily, generateRoleOverview } from "@/services/careerPageScraper";
import { probeJobApplicationStatus } from "@/services/jobProbeService";
import {
    commitScraperSourceResult,
    ensureJobStorageInitialized,
    firstSeenDates,
    getAllJobs,
    getSources,
    recordSeenJobs,
    setCompanyLogos,
    updateScrapedJobDetails,
} from "@/lib/jobStorage";
import { companyKey, resolveCompanyLogos } from "@/lib/companyLogos";

const MAX_POSTING_AGE_DAYS = 14;
/** Sources scraped at the same time. */
const CONCURRENCY = 5;
/** Structured boards list only open jobs; other pages have each link checked. */
const STRUCTURED_PROVIDERS = ["greenhouse", "ashby", "lever", "workable", "wellfound", "vc_portfolio", "linkedin", "jobberman"];

export interface SourceResult {
    sourceId: string;
    companyName: string;
    provider: string;
    jobsFound: number;
    newJobs: number;
    error?: string;
}

export interface ScrapeRun {
    /** Sources that were due in this run. */
    sourcesDue: number;
    sourcesScraped: number;
    /** Sources left for the next run because the time budget ran out. */
    sourcesRemaining: number;
    totalJobsFound: number;
    newJobs: number;
    totalJobs: number;
    results: SourceResult[];
}

export class SourceNotFoundError extends Error {}

function today(): string {
    return new Date().toISOString().split("T")[0];
}

/** Scrapes one source, stores what's new and reconciles what's gone. */
async function scrapeSource(source: ScraperSource, existingUrls: Map<string, string>, cutoffDate: string): Promise<SourceResult> {
    const result = await scrapeCareerPage(
        source.url,
        source.companyName,
        source.sourceType,
        source.atsProvider !== "generic" ? source.atsProvider : undefined
    );

    // A posting fetched before is not new just because it turned up again.
    // Sources that give no posting date stamp everything "today"; a job can't
    // have been posted after we first saw it, so the earlier date wins and
    // the job ages out for good instead of coming back every two weeks.
    const urls = result.jobs.map((scraped) => scraped.url.toLowerCase());
    const seen = await firstSeenDates(urls);
    const newlySeen: Array<{ url: string; firstSeen: string }> = [];
    for (const scraped of result.jobs) {
        const url = scraped.url.toLowerCase();
        const claimed = scraped.datePosted || today();
        const known = seen.get(url) ?? existingUrls.get(url);
        if (!seen.has(url)) newlySeen.push({ url, firstSeen: known && known < claimed ? known : claimed });
        if (known && known < claimed) scraped.datePosted = known;
    }
    await recordSeenJobs(newlySeen);

    // Each company's logo is found once and kept in our own storage; jobs
    // carry that address, never the job board's or a guessed one.
    const logos = await resolveCompanyLogos(
        result.jobs.map((scraped) => ({
            company: scraped.company || source.companyName,
            jobUrl: scraped.url,
            listingLogoUrl: scraped.companyLogo,
        }))
    ).catch(() => new Map<string, string>());
    const logoByCompany = new Map<string, string>();
    for (const scraped of result.jobs) {
        const company = scraped.company || source.companyName;
        scraped.companyLogo = logos.get(companyKey(company));
        if (scraped.companyLogo) logoByCompany.set(company, scraped.companyLogo);
    }

    let candidates = result.jobs.filter(
        (scraped) => !existingUrls.has(scraped.url.toLowerCase()) && (scraped.datePosted || today()) >= cutoffDate
    );

    // Unstructured pages can link to closed postings: keep only links that still accept applications.
    if (!STRUCTURED_PROVIDERS.includes(result.provider)) {
        const open: typeof candidates = [];
        for (let i = 0; i < candidates.length; i += 10) {
            const batch = candidates.slice(i, i + 10);
            const probes = await Promise.allSettled(batch.map((scraped) => probeJobApplicationStatus(scraped.url, 2500)));
            batch.forEach((scraped, k) => {
                const probe = probes[k];
                if (probe.status === "fulfilled" && !probe.value.isOpen) return;
                open.push(scraped);
            });
        }
        candidates = open;
    }

    const newJobs: JobItem[] = [];
    for (const scraped of candidates) {
        const jobUrl = scraped.url.toLowerCase();
        if (existingUrls.has(jobUrl)) continue;
        const roleFamily = classifyRoleFamily(scraped.title, scraped.department);
        const company = scraped.company || source.companyName;
        newJobs.push({
            id: `scrape_${source.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title: scraped.title.trim(),
            company,
            companyLogo: scraped.companyLogo,
            location: scraped.location || "Not specified",
            roleFamily,
            url: scraped.url,
            employmentType: "Full-time",
            salaryRange: scraped.salaryRange || "Competitive",
            description:
                scraped.description && !scraped.description.startsWith("Portfolio company of")
                    ? scraped.description
                    : generateRoleOverview(scraped.title, roleFamily, company, scraped.location),
            fullDescription: scraped.fullDescription,
            responsibilities: scraped.responsibilities,
            source: "scraped",
            datePosted: scraped.datePosted || today(),
            status: "active",
        });
        existingUrls.set(jobUrl, scraped.datePosted || today());
    }

    await commitScraperSourceResult({
        sourceId: source.id,
        companyName: source.companyName,
        newJobs,
        liveBoardUrls: result.jobs.map((job) => job.url.toLowerCase()),
        jobsFoundCount: result.jobs.length,
        cutoffDate,
    });

    // Jobs already stored get the posting's real text too, and the logo.
    await updateScrapedJobDetails(result.jobs);
    await setCompanyLogos(logoByCompany);

    return {
        sourceId: source.id,
        companyName: source.companyName,
        provider: result.provider,
        jobsFound: result.jobs.length,
        newJobs: newJobs.length,
        error: result.error,
    };
}

/**
 * Scrape one source (by id) or every enabled source, least recently scraped
 * first, starting no new batch once `budgetMs` has passed.
 */
export async function runScrape(opts: { sourceId?: string | null; budgetMs: number }): Promise<ScrapeRun> {
    const startedAt = Date.now();
    // Without the database there is nowhere to read sources from or store
    // results in: stop here rather than scrape and fail on every write.
    if (!(await ensureJobStorageInitialized())) throw new Error("The jobs database is unreachable; nothing was scraped.");
    const sources = await getSources();

    let due: ScraperSource[];
    if (opts.sourceId) {
        const found = sources.find((source) => source.id === opts.sourceId);
        if (!found) throw new SourceNotFoundError("Source not found.");
        due = [found];
    } else {
        due = sources
            .filter((source) => source.enabled)
            .sort((a, b) => (a.lastScraped || "").localeCompare(b.lastScraped || ""));
    }

    const cutoffDate = new Date(Date.now() - MAX_POSTING_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const existingJobs = (await getAllJobs()).filter(
        (job) => (job.status || "active") === "active" && (!job.datePosted || job.datePosted >= cutoffDate)
    );
    // Address → posting date of every job currently on the board.
    const existingUrls = new Map(existingJobs.map((job) => [job.url.toLowerCase(), job.datePosted]));

    const results: SourceResult[] = [];
    let scraped = 0;
    for (let i = 0; i < due.length; i += CONCURRENCY) {
        // Always do the first batch; after that, stop when the budget is spent.
        if (i > 0 && Date.now() - startedAt > opts.budgetMs) break;
        const batch = due.slice(i, i + CONCURRENCY);
        const settled = await Promise.allSettled(batch.map((source) => scrapeSource(source, existingUrls, cutoffDate)));
        settled.forEach((outcome, k) => {
            if (outcome.status === "fulfilled") {
                results.push(outcome.value);
            } else {
                results.push({
                    sourceId: batch[k].id,
                    companyName: batch[k].companyName,
                    provider: "error",
                    jobsFound: 0,
                    newJobs: 0,
                    error: outcome.reason?.message || "Source scrape failed",
                });
            }
        });
        scraped += batch.length;
    }

    return {
        sourcesDue: due.length,
        sourcesScraped: scraped,
        sourcesRemaining: due.length - scraped,
        totalJobsFound: results.reduce((sum, result) => sum + result.jobsFound, 0),
        newJobs: results.reduce((sum, result) => sum + result.newJobs, 0),
        totalJobs: (await getAllJobs()).length,
        results,
    };
}
