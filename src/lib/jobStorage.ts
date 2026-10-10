import fs from "fs/promises";
import path from "path";
import dbConnect from "@/lib/mongodb";
import Job from "@/models/Job";
import ScraperSource from "@/models/ScraperSource";
import SeenJob from "@/models/SeenJob";
import type { JobItem } from "@/app/api/jobs/route";
import type { ScraperSource as ScraperSourceType } from "@/app/api/jobs/sources/route";

const JOBS_FILE_PATH = path.join(process.cwd(), "src", "engine", "data", "jobs.json");
const SOURCES_FILE_PATH = path.join(process.cwd(), "src", "engine", "data", "scraperSources.json");

let isSeeding = false;
let isInitialized = false;

function decodeHtmlEntities(text?: string): string {
    if (!text) return "";
    return text
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#039;|&apos;|&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&nbsp;/gi, " ")
        .replace(/&#8211;|&ndash;/gi, "–")
        .replace(/&#8212;|&mdash;/gi, "—")
        .replace(/&rsquo;|&lsquo;/gi, "'")
        .replace(/&rdquo;|&ldquo;/gi, '"');
}

export function sanitizeJob(j: JobItem): JobItem {
    return {
        ...j,
        title: decodeHtmlEntities(j.title),
        company: decodeHtmlEntities(j.company),
        location: decodeHtmlEntities(j.location),
        description: decodeHtmlEntities(j.description),
    };
}

async function readLocalJobs(): Promise<JobItem[]> {
    try {
        const data = await fs.readFile(JOBS_FILE_PATH, "utf-8");
        const list: JobItem[] = JSON.parse(data);
        return list.map(sanitizeJob);
    } catch {
        return [];
    }
}

async function readLocalSources(): Promise<ScraperSourceType[]> {
    try {
        const data = await fs.readFile(SOURCES_FILE_PATH, "utf-8");
        return JSON.parse(data);
    } catch {
        return [];
    }
}

/**
 * Ensures MongoDB contains existing jobs and scraper sources.
 * On first initialization, if the MongoDB collection is empty,
 * it seeds from the local JSON files once. After that, MongoDB
 * is the sole database and local JSON files are no longer touched.
 */
export async function ensureJobStorageInitialized(): Promise<boolean> {
    if (isInitialized) return true;
    if (isSeeding) return false;

    try {
        await dbConnect();
        isSeeding = true;

        const sourceCount = await ScraperSource.countDocuments();
        if (sourceCount === 0) {
            const localSources = await readLocalSources();
            if (localSources.length > 0) {
                console.log(`[jobStorage] Seeding ${localSources.length} scraper sources into MongoDB...`);
                await ScraperSource.insertMany(localSources, { ordered: false }).catch(() => {});
            }
        }

        const jobCount = await Job.countDocuments();
        if (jobCount === 0) {
            const localJobs = await readLocalJobs();
            if (localJobs.length > 0) {
                console.log(`[jobStorage] Seeding ${localJobs.length} jobs into MongoDB...`);
                const batchSize = 500;
                for (let i = 0; i < localJobs.length; i += batchSize) {
                    const batch = localJobs.slice(i, i + batchSize);
                    await Job.insertMany(batch, { ordered: false }).catch(() => {});
                }
            }
        }

        isInitialized = true;
        return true;
    } catch (err) {
        console.error("[jobStorage] Initialization/Connection error:", err);
        return false;
    } finally {
        isSeeding = false;
    }
}

// ─── Scraper Sources Operations ──────────────────────────────────────────

export async function getSources(): Promise<ScraperSourceType[]> {
    try {
        await ensureJobStorageInitialized();
        const sources = await ScraperSource.find().sort({ dateAdded: -1 }).lean();
        if (sources.length > 0) {
            return sources.map((s) => ({
                id: s.id,
                url: s.url,
                companyName: s.companyName,
                sourceType: s.sourceType as "career_page" | "vc_portfolio" | "job_board",
                atsProvider: s.atsProvider,
                enabled: s.enabled,
                lastScraped: s.lastScraped,
                lastJobCount: s.lastJobCount,
                dateAdded: s.dateAdded,
            }));
        }
    } catch (err) {
        console.warn("[jobStorage] Failed to fetch sources from DB, falling back to JSON:", err);
    }
    return readLocalSources();
}

export async function addSource(source: ScraperSourceType): Promise<ScraperSourceType> {
    try {
        await ensureJobStorageInitialized();
        await ScraperSource.create(source);
    } catch (err) {
        console.error("[jobStorage] Could not insert source to DB:", err);
    }
    return source;
}

export async function updateSource(
    id: string,
    updates: Partial<ScraperSourceType>
): Promise<ScraperSourceType | null> {
    try {
        await ensureJobStorageInitialized();
        const doc = await ScraperSource.findOneAndUpdate(
            { id },
            { $set: updates },
            { new: true }
        ).lean();
        if (doc) {
            const typed = doc as unknown as ScraperSourceType;
            return {
                id: typed.id,
                url: typed.url,
                companyName: typed.companyName,
                sourceType: typed.sourceType,
                atsProvider: typed.atsProvider,
                enabled: typed.enabled,
                lastScraped: typed.lastScraped,
                lastJobCount: typed.lastJobCount,
                dateAdded: typed.dateAdded,
            };
        }
    } catch (err) {
        console.error("[jobStorage] Failed to update source in DB:", err);
    }
    return null;
}

export async function deleteSource(id: string): Promise<boolean> {
    try {
        await ensureJobStorageInitialized();
        await ScraperSource.deleteOne({ id });
        return true;
    } catch (err) {
        console.error("[jobStorage] Failed to delete source from DB:", err);
        return false;
    }
}

// ─── Jobs Operations ─────────────────────────────────────────────────────

export async function getAllJobs(): Promise<JobItem[]> {
    try {
        await ensureJobStorageInitialized();
        // Lists never carry a posting's full text or duties: with thousands of
        // jobs that made the response several times larger than a serverless
        // function may send. A single job's details come from getJobById.
        const docs = await Job.find().select("-fullDescription -responsibilities").lean();
        if (docs.length > 0) {
            return docs.map((d) => ({
                id: d.id,
                title: decodeHtmlEntities(d.title),
                company: decodeHtmlEntities(d.company),
                companyLogo: d.companyLogo,
                location: decodeHtmlEntities(d.location),
                roleFamily: d.roleFamily,
                url: d.url,
                employmentType: d.employmentType || "Full-time",
                salaryRange: d.salaryRange || "Competitive",
                description: decodeHtmlEntities(d.description),
                source: (d.source as "manual" | "scraped") || "scraped",
                datePosted: d.datePosted,
                status: (d.status as "active" | "expired") || "active",
                isRemoteGlobal: d.isRemoteGlobal,
                isAfrica: d.isAfrica,
                isNigeria: d.isNigeria,
            }));
        }
    } catch (err) {
        console.warn("[jobStorage] Failed to fetch jobs from DB, falling back to JSON:", err);
    }
    return readLocalJobs();
}

/** When each of these postings (by lower-cased address) was first seen, for those seen before. */
export async function firstSeenDates(urls: string[]): Promise<Map<string, string>> {
    const seen = new Map<string, string>();
    if (urls.length === 0) return seen;
    try {
        await ensureJobStorageInitialized();
        for (let i = 0; i < urls.length; i += 2000) {
            const docs = await SeenJob.find({ url: { $in: urls.slice(i, i + 2000) } }).select("url firstSeen").lean();
            for (const doc of docs) seen.set(doc.url, doc.firstSeen);
        }
    } catch (err) {
        console.warn("[jobStorage] Could not read seen postings:", err);
    }
    return seen;
}

/** Remembers postings seen for the first time. Ones already remembered keep their date. */
export async function recordSeenJobs(entries: Array<{ url: string; firstSeen: string }>): Promise<void> {
    if (entries.length === 0) return;
    try {
        await ensureJobStorageInitialized();
        for (let i = 0; i < entries.length; i += 1000) {
            await SeenJob.bulkWrite(
                entries.slice(i, i + 1000).map((entry) => ({
                    updateOne: {
                        filter: { url: entry.url },
                        update: { $setOnInsert: { url: entry.url, firstSeen: entry.firstSeen, createdAt: new Date() } },
                        upsert: true,
                    },
                })),
                { ordered: false }
            );
        }
    } catch (err) {
        console.warn("[jobStorage] Could not record seen postings:", err);
    }
}

/** One job with everything stored for it, including its full text and duties. */
export async function getJobById(id: string): Promise<JobItem | null> {
    try {
        await ensureJobStorageInitialized();
        const d = await Job.findOne({ id }).lean();
        if (!d) return null;
        return {
            id: d.id,
            title: decodeHtmlEntities(d.title),
            company: decodeHtmlEntities(d.company),
            companyLogo: d.companyLogo,
            location: decodeHtmlEntities(d.location),
            roleFamily: d.roleFamily,
            url: d.url,
            employmentType: d.employmentType || "Full-time",
            salaryRange: d.salaryRange || "Competitive",
            description: decodeHtmlEntities(d.description),
            fullDescription: d.fullDescription,
            responsibilities: d.responsibilities,
            source: (d.source as "manual" | "scraped") || "scraped",
            datePosted: d.datePosted,
            status: (d.status as "active" | "expired") || "active",
        };
    } catch (err) {
        console.warn("[jobStorage] Failed to fetch job from DB:", err);
        return null;
    }
}

/** Sets the stored logo on every job of each company (company name → logo address). */
export async function setCompanyLogos(logos: Map<string, string>): Promise<number> {
    if (logos.size === 0) return 0;
    try {
        await ensureJobStorageInitialized();
        const result = await Job.bulkWrite(
            [...logos].map(([company, companyLogo]) => ({
                updateMany: { filter: { company, companyLogo: { $ne: companyLogo } }, update: { $set: { companyLogo } } },
            })),
            { ordered: false }
        );
        return result.modifiedCount;
    } catch (err) {
        console.error("[jobStorage] setCompanyLogos DB error:", err);
        return 0;
    }
}

/**
 * Stores the summary, full text and duties read from a careers system on jobs
 * already in the database (matched by posting URL), so jobs scraped before
 * that text was collected get it too.
 */
export async function updateScrapedJobDetails(
    jobs: Array<{ url: string; description?: string; fullDescription?: string; responsibilities?: string[] }>
): Promise<number> {
    const withText = jobs.filter((job) => job.fullDescription);
    if (withText.length === 0) return 0;
    try {
        await ensureJobStorageInitialized();
        let updated = 0;
        for (let i = 0; i < withText.length; i += 500) {
            const result = await Job.bulkWrite(
                withText.slice(i, i + 500).map((job) => ({
                    updateOne: {
                        filter: { url: job.url },
                        update: {
                            $set: {
                                fullDescription: job.fullDescription,
                                ...(job.description ? { description: job.description } : {}),
                                responsibilities: job.responsibilities ?? [],
                            },
                        },
                    },
                })),
                { ordered: false }
            );
            updated += result.modifiedCount;
        }
        return updated;
    } catch (err) {
        console.error("[jobStorage] updateScrapedJobDetails DB error:", err);
        return 0;
    }
}

export async function createJob(job: JobItem): Promise<JobItem> {
    const cleanJob = sanitizeJob(job);
    try {
        await ensureJobStorageInitialized();
        await Job.create(cleanJob);
    } catch (err) {
        console.error("[jobStorage] Could not insert job to DB:", err);
    }
    return cleanJob;
}

export async function updateJob(id: string, updates: Partial<JobItem>): Promise<JobItem | null> {
    try {
        await ensureJobStorageInitialized();
        const doc = await Job.findOneAndUpdate(
            { id },
            { $set: updates },
            { new: true }
        ).lean();
        if (doc) {
            return sanitizeJob(doc as unknown as JobItem);
        }
    } catch (err) {
        console.error("[jobStorage] Failed to update job in DB:", err);
    }
    return null;
}

export async function deleteJob(id: string): Promise<boolean> {
    try {
        await ensureJobStorageInitialized();
        await Job.deleteOne({ id });
        return true;
    } catch (err) {
        console.error("[jobStorage] Failed to delete job from DB:", err);
        return false;
    }
}

export async function purgeExpiredJobs(ttlCutoff: string): Promise<number> {
    try {
        await ensureJobStorageInitialized();
        const res = await Job.deleteMany({
            $or: [
                { status: "expired" },
                { datePosted: { $lt: ttlCutoff } }
            ]
        });
        return res.deletedCount || 0;
    } catch (err) {
        console.error("[jobStorage] Failed to purge expired jobs in DB:", err);
        return 0;
    }
}

/**
 * Scraper reconciliation:
 * 1. Inserts new jobs into DB
 * 2. Purges stale jobs for the scraped source that no longer appear on their live board
 * 3. Enforces the 14-day TTL cutoff
 * 4. Updates the scraper source lastScraped timestamp and lastJobCount in MongoDB
 */
export async function commitScraperSourceResult(params: {
    sourceId: string;
    companyName: string;
    newJobs: JobItem[];
    liveBoardUrls: string[];
    jobsFoundCount: number;
    cutoffDate: string;
}): Promise<void> {
    const { sourceId, companyName, newJobs, liveBoardUrls, jobsFoundCount, cutoffDate } = params;

    try {
        await ensureJobStorageInitialized();

        // 1. Insert new jobs (if any)
        if (newJobs.length > 0) {
            await Job.insertMany(newJobs.map(sanitizeJob), { ordered: false }).catch((err) => {
                console.warn("[jobStorage] Partial duplicate/error on new jobs insertMany:", err.message);
            });
        }

        // 2. Delta reconciliation: remove jobs from this company/source that are missing from liveBoardUrls
        if (liveBoardUrls.length > 0) {
            const escapedCompany = companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            await Job.deleteMany({
                $and: [
                    {
                        $or: [
                            { company: { $regex: new RegExp(`^${escapedCompany}$`, "i") } },
                            { id: { $regex: new RegExp(`^scrape_${sourceId}`) } },
                        ]
                    },
                    { url: { $nin: liveBoardUrls } }
                ]
            });
        }

        // 3. Purge global expired / past-TTL jobs
        await Job.deleteMany({
            $or: [
                { status: "expired" },
                { datePosted: { $lt: cutoffDate } }
            ]
        });

        // 4. Update source metadata in MongoDB
        await ScraperSource.updateOne(
            { id: sourceId },
            {
                $set: {
                    lastScraped: new Date().toISOString(),
                    lastJobCount: jobsFoundCount,
                }
            }
        );
    } catch (err) {
        console.error("[jobStorage] commitScraperSourceResult DB error:", err);
    }
}
