import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { JobItem } from "../route";

const JOBS_FILE_PATH = path.join(process.cwd(), "src", "engine", "data", "jobs.json");

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

const CLOSED_POSTING_SIGNALS = [
    "no longer accepting applications",
    "position has been closed",
    "posting has expired",
    "job not found",
    "this job is no longer available",
    "this role has been filled",
    "applications for this role are closed",
    "page not found",
    "404 not found",
    "this opening is closed",
    "job opening closed",
    "no longer open",
    "posting closed",
];

/**
 * Validates whether a specific job URL is still live or if the employer took it down.
 */
export async function checkJobHealth(url: string): Promise<{ isLive: boolean; reason?: string }> {
    if (!url || url === "#" || !url.startsWith("http")) {
        return { isLive: true };
    }

    try {
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            signal: AbortSignal.timeout(6000),
            redirect: "follow",
            cache: "no-store" as RequestCache,
        });

        // 1. HTTP Status Checks
        if (res.status === 404 || res.status === 410) {
            return { isLive: false, reason: `HTTP_${res.status}_Not_Found` };
        }

        // 2. Redirected back to generic career homepage (e.g. /careers or /jobs)
        const finalUrl = res.url.toLowerCase();
        const initialUrl = url.toLowerCase();
        if (
            initialUrl.includes("/job") ||
            initialUrl.includes("/apply") ||
            initialUrl.includes("/position")
        ) {
            if (
                finalUrl.endsWith("/careers") ||
                finalUrl.endsWith("/jobs") ||
                finalUrl.endsWith("/") ||
                finalUrl.endsWith("/careers/")
            ) {
                return { isLive: false, reason: "Redirected_To_Homepage" };
            }
        }

        // 3. Scan body text for soft 404 / closed posting indicators
        const html = await res.text();
        const textLower = html.toLowerCase();

        for (const signal of CLOSED_POSTING_SIGNALS) {
            if (textLower.includes(signal)) {
                return { isLive: false, reason: `Posting_Closed: "${signal}"` };
            }
        }

        return { isLive: true };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network error";
        return { isLive: true, reason: msg };
    }
}

/**
 * POST /api/jobs/validate-expiry
 * 
 * Query params:
 *   - limit (default 30): Number of active jobs to validate in parallel
 *   - checkAll (boolean): Check all active jobs
 */
export async function POST(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const limitParam = searchParams.get("limit");
        const checkAll = searchParams.get("checkAll") === "true";
        const limit = checkAll ? 200 : limitParam ? parseInt(limitParam) : 40;

        const jobs = await readJobs();
        const activeJobs = jobs.filter((j) => (j.status || "active") === "active");

        if (activeJobs.length === 0) {
            return NextResponse.json({
                success: true,
                checkedCount: 0,
                expiredFound: 0,
                message: "No active jobs to validate.",
            });
        }

        // Pick jobs to validate (prefer older posted jobs or unverified ones)
        const targetJobs = activeJobs.slice(0, limit);
        let expiredFound = 0;
        const details: Array<{ id: string; title: string; company: string; isLive: boolean; reason?: string }> = [];

        // Concurrency batch of 8
        for (let i = 0; i < targetJobs.length; i += 8) {
            const batch = targetJobs.slice(i, i + 8);
            const batchResults = await Promise.allSettled(
                batch.map(async (job) => {
                    const health = await checkJobHealth(job.url);
                    return { job, health };
                })
            );

            for (const r of batchResults) {
                if (r.status === "fulfilled") {
                    const { job, health } = r.value;
                    const jobIndex = jobs.findIndex((j) => j.id === job.id);
                    if (jobIndex !== -1) {
                        if (!health.isLive) {
                            jobs[jobIndex].status = "expired";
                            expiredFound++;
                        }
                    }
                    details.push({
                        id: job.id,
                        title: job.title,
                        company: job.company,
                        isLive: health.isLive,
                        reason: health.reason,
                    });
                }
            }
        }

        await saveJobs(jobs);

        return NextResponse.json({
            success: true,
            checkedCount: targetJobs.length,
            expiredFound,
            activeCount: jobs.filter((j) => (j.status || "active") === "active").length,
            message: `Validated ${targetJobs.length} active roles: detected and marked ${expiredFound} expired posting(s).`,
            details,
        });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Validation failed";
        return NextResponse.json({ error }, { status: 500 });
    }
}
