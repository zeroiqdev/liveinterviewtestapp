import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { JobItem } from "../route";
import type { ScraperSource } from "../sources/route";
import { scrapeCareerPage, classifyRoleFamily, generateRoleOverview } from "@/services/careerPageScraper";
import { probeJobApplicationStatus } from "@/services/jobProbeService";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_POSTING_AGE_DAYS = 7;

const JOBS_FILE_PATH = path.join(process.cwd(), "src", "engine", "data", "jobs.json");
const SOURCES_FILE_PATH = path.join(process.cwd(), "src", "engine", "data", "scraperSources.json");

async function readJobs(): Promise<JobItem[]> {
    try {
        const data = await fs.readFile(JOBS_FILE_PATH, "utf-8");
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function saveJobs(jobs: JobItem[]) {
    await fs.writeFile(JOBS_FILE_PATH, JSON.stringify(jobs, null, 2), "utf-8");
}

async function readSources(): Promise<ScraperSource[]> {
    try {
        const data = await fs.readFile(SOURCES_FILE_PATH, "utf-8");
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function saveSources(sources: ScraperSource[]) {
    await fs.writeFile(SOURCES_FILE_PATH, JSON.stringify(sources, null, 2), "utf-8");
}

interface SourceResult {
    sourceId: string;
    companyName: string;
    provider: string;
    jobsFound: number;
    newJobs: number;
    error?: string;
}

/**
 * POST /api/jobs/scrape
 * 
 * Query params:
 *   - sourceId (optional): scrape a single source by ID
 *   - (none): scrape all enabled sources
 */
export async function POST(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const singleSourceId = searchParams.get("sourceId");

        const sources = await readSources();
        let existingJobs = await readJobs();

        const cutoffDate = new Date(Date.now() - MAX_POSTING_AGE_DAYS * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

        // 0. Storage Purge: Hard delete any jobs older than 7 days or marked expired
        existingJobs = existingJobs.filter(
            (j) => (j.status || "active") === "active" && (!j.datePosted || j.datePosted >= cutoffDate)
        );

        const existingUrls = new Set(existingJobs.map((j) => j.url.toLowerCase()));

        // Determine which sources to scrape
        let targetSources: ScraperSource[];
        if (singleSourceId) {
            const found = sources.find((s) => s.id === singleSourceId);
            if (!found) {
                return NextResponse.json({ error: "Source not found." }, { status: 404 });
            }
            targetSources = [found];
        } else {
            targetSources = sources.filter((s) => s.enabled);
        }

        if (targetSources.length === 0) {
            return NextResponse.json({
                success: true,
                scrapedCount: 0,
                totalJobs: existingJobs.length,
                message: "No enabled sources to scrape.",
                results: [],
            });
        }

        const allNewJobs: JobItem[] = [];
        const results: SourceResult[] = [];

        // Scrape each source concurrently (with a concurrency limit of 5)
        const chunks: ScraperSource[][] = [];
        for (let i = 0; i < targetSources.length; i += 5) {
            chunks.push(targetSources.slice(i, i + 5));
        }

        for (const chunk of chunks) {
            const chunkResults = await Promise.allSettled(
                chunk.map(async (source) => {
                    const result = await scrapeCareerPage(
                        source.url,
                        source.companyName,
                        source.sourceType,
                        source.atsProvider !== "generic" ? source.atsProvider : undefined
                    );

                    let newCount = 0;
                    const validCandidates = result.jobs.filter((scraped) => {
                        const jobUrl = scraped.url.toLowerCase();
                        if (existingUrls.has(jobUrl)) return false;
                        const datePosted = scraped.datePosted || new Date().toISOString().split("T")[0];
                        return datePosted >= cutoffDate;
                    });

                    const isStructuredAts = ["greenhouse", "ashby", "lever", "wellfound", "vc_portfolio"].includes(result.provider);

                    if (isStructuredAts) {
                        for (const scraped of validCandidates) {
                            const jobUrl = scraped.url.toLowerCase();
                            if (existingUrls.has(jobUrl)) continue;

                            const roleFam = classifyRoleFamily(scraped.title, scraped.department);
                            const description = (scraped.description && !scraped.description.startsWith("Portfolio company of"))
                                ? scraped.description
                                : generateRoleOverview(scraped.title, roleFam, scraped.company || source.companyName, scraped.location);

                            const jobItem: JobItem = {
                                id: `scrape_${source.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                title: scraped.title.trim(),
                                company: scraped.company || source.companyName,
                                companyLogo: scraped.companyLogo,
                                location: scraped.location || "Not specified",
                                roleFamily: roleFam,
                                url: scraped.url,
                                employmentType: "Full-time",
                                salaryRange: scraped.salaryRange || "Competitive",
                                description,
                                source: "scraped",
                                datePosted: scraped.datePosted || new Date().toISOString().split("T")[0],
                                status: "active",
                            };

                            allNewJobs.push(jobItem);
                            existingUrls.add(jobUrl);
                            newCount++;
                        }
                    } else {
                        // Probe generic/unstructured links in parallel batches of 10
                        for (let j = 0; j < validCandidates.length; j += 10) {
                            const batch = validCandidates.slice(j, j + 10);
                            const probeResults = await Promise.allSettled(
                                batch.map((scraped) => probeJobApplicationStatus(scraped.url, 2500))
                            );

                            for (let k = 0; k < batch.length; k++) {
                                const scraped = batch[k];
                                const probe = probeResults[k];
                                if (probe.status === "fulfilled" && !probe.value.isOpen) {
                                    continue; // Discard closed
                                }

                                const jobUrl = scraped.url.toLowerCase();
                                if (existingUrls.has(jobUrl)) continue;

                                const roleFam = classifyRoleFamily(scraped.title, scraped.department);
                                const description = (scraped.description && !scraped.description.startsWith("Portfolio company of"))
                                    ? scraped.description
                                    : generateRoleOverview(scraped.title, roleFam, scraped.company || source.companyName, scraped.location);

                                const jobItem: JobItem = {
                                    id: `scrape_${source.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                    title: scraped.title.trim(),
                                    company: scraped.company || source.companyName,
                                    companyLogo: scraped.companyLogo,
                                    location: scraped.location || "Not specified",
                                    roleFamily: roleFam,
                                    url: scraped.url,
                                    employmentType: "Full-time",
                                    salaryRange: scraped.salaryRange || "Competitive",
                                    description,
                                    source: "scraped",
                                    datePosted: scraped.datePosted || new Date().toISOString().split("T")[0],
                                    status: "active",
                                };

                                allNewJobs.push(jobItem);
                                existingUrls.add(jobUrl);
                                newCount++;
                            }
                        }
                    }

                    // Delta Reconciliation (Hard Purge): Delete previous jobs from this source that are no longer on their live board
                    const freshLiveUrls = new Set(result.jobs.map((j) => j.url.toLowerCase()));
                    if (result.jobs.length > 0) {
                        existingJobs = existingJobs.filter((existingJob) => {
                            const isFromThisSource =
                                existingJob.company?.toLowerCase() === source.companyName.toLowerCase() ||
                                existingJob.id.startsWith(`scrape_${source.id}`);
                            if (isFromThisSource && !freshLiveUrls.has(existingJob.url.toLowerCase())) {
                                return false; // Purge from database
                            }
                            return true;
                        });
                    }

                    // Update source metadata
                    const sourceIdx = sources.findIndex((s) => s.id === source.id);
                    if (sourceIdx !== -1) {
                        sources[sourceIdx].lastScraped = new Date().toISOString();
                        sources[sourceIdx].lastJobCount = result.jobs.length;
                    }

                    return {
                        sourceId: source.id,
                        companyName: source.companyName,
                        provider: result.provider,
                        jobsFound: result.jobs.length,
                        newJobs: newCount,
                        error: result.error,
                    } as SourceResult;
                })
            );

            for (const r of chunkResults) {
                if (r.status === "fulfilled") {
                    results.push(r.value);
                } else {
                    results.push({
                        sourceId: "unknown",
                        companyName: "Unknown",
                        provider: "error",
                        jobsFound: 0,
                        newJobs: 0,
                        error: r.reason?.message || "Source scrape failed",
                    });
                }
            }
        }

        // Save updated jobs (strictly active and within 7-day TTL)
        const updatedJobs = [...allNewJobs, ...existingJobs].filter(
            (j) => (j.status || "active") === "active" && (!j.datePosted || j.datePosted >= cutoffDate)
        );
        await saveJobs(updatedJobs);
        await saveSources(sources);

        const totalNewJobs = allNewJobs.length;
        const totalJobsFound = results.reduce((sum, r) => sum + r.jobsFound, 0);

        return NextResponse.json({
            success: true,
            scrapedCount: totalNewJobs,
            totalJobsFound,
            totalJobs: updatedJobs.length,
            sourcesScraped: targetSources.length,
            message: `Scraped ${targetSources.length} source(s): found ${totalJobsFound} total jobs, ${totalNewJobs} new.`,
            results,
        });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Scraping failed";
        return NextResponse.json({ error }, { status: 500 });
    }
}
