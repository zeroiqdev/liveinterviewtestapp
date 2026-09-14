import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { isJobLocationMatch, isJobRoleMatch, normalizeUserRoleFamily, UserLocation } from "@/utils/locationDetector";

export interface JobItem {
    id: string;
    title: string;
    company: string;
    companyLogo?: string;
    location: string;
    roleFamily: string;
    url: string;
    employmentType: string;
    salaryRange?: string;
    description?: string;
    source: "manual" | "scraped";
    datePosted: string;
    status?: "active" | "expired";
    isRemoteGlobal?: boolean;
    isAfrica?: boolean;
    isNigeria?: boolean;
}

const JOBS_FILE_PATH = path.join(process.cwd(), "src", "engine", "data", "jobs.json");

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

function sanitizeJob(j: JobItem): JobItem {
    return {
        ...j,
        title: decodeHtmlEntities(j.title),
        company: decodeHtmlEntities(j.company),
        location: decodeHtmlEntities(j.location),
        description: decodeHtmlEntities(j.description),
    };
}

async function readJobs(): Promise<JobItem[]> {
    try {
        const data = await fs.readFile(JOBS_FILE_PATH, "utf-8");
        const list: JobItem[] = JSON.parse(data);
        return list.map(sanitizeJob);
    } catch {
        return [];
    }
}

async function saveJobs(jobs: JobItem[]) {
    await fs.writeFile(JOBS_FILE_PATH, JSON.stringify(jobs, null, 2), "utf-8");
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const roleFamily = searchParams.get("roleFamily");
    const userRole = searchParams.get("userRole");
    const source = searchParams.get("source");
    const search = searchParams.get("search");
    const status = searchParams.get("status") || "active"; // "active" | "expired" | "all"
    const freshness = searchParams.get("freshness"); // "7d" | "30d" | "all"
    const country = searchParams.get("country");
    const city = searchParams.get("city");
    const isAfricaParam = searchParams.get("isAfrica");
    const timezone = searchParams.get("timezone");
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;

    let jobs = await readJobs();

    const MAX_POSTING_AGE_DAYS = 7;
    const ttlCutoff = new Date(Date.now() - MAX_POSTING_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // 0. Status & Freshness filtering
    if (status === "active") {
        jobs = jobs.filter((j) => (j.status || "active") === "active" && (!j.datePosted || j.datePosted >= ttlCutoff));
    } else if (status === "expired") {
        jobs = jobs.filter((j) => j.status === "expired" || (j.datePosted && j.datePosted < ttlCutoff));
    }

    // 0b. Optional explicit freshness filter
    if (freshness === "7d") {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        jobs = jobs.filter((j) => !j.datePosted || j.datePosted >= cutoff);
    } else if (freshness === "3d") {
        const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        jobs = jobs.filter((j) => !j.datePosted || j.datePosted >= cutoff);
    }

    // 1. Filter by role family or specific user role
    if (userRole && userRole !== "all") {
        jobs = jobs.filter((j) => isJobRoleMatch(j.roleFamily, j.title, userRole));
    } else if (roleFamily && roleFamily !== "all") {
        jobs = jobs.filter((j) => j.roleFamily === roleFamily);
    }

    // 2. Filter by source (manual vs scraped)
    if (source && source !== "all") {
        jobs = jobs.filter((j) => j.source === source);
    }

    // 3. Search query filter
    if (search) {
        const q = search.toLowerCase();
        jobs = jobs.filter(
            (j) =>
                j.title.toLowerCase().includes(q) ||
                j.company.toLowerCase().includes(q) ||
                j.location.toLowerCase().includes(q) ||
                (j.description && j.description.toLowerCase().includes(q))
        );
    }

    // 4. Geographic Location matching (User's location OR Global Remote)
    if (country || isAfricaParam !== null || timezone) {
        const isAfrica: boolean = isAfricaParam === "true" || (country ? country.toLowerCase() === "nigeria" : false);
        const isNigeria: boolean = country ? country.toLowerCase() === "nigeria" : isAfrica;
        const userLoc: UserLocation = {
            country: country || (isAfrica ? "Nigeria" : "Worldwide"),
            countryCode: isAfrica ? "NG" : "US",
            city: city || undefined,
            continent: isAfrica ? "Africa" : "Worldwide",
            timezone: timezone || (isAfrica ? "Africa/Lagos" : "UTC"),
            isAfrica,
            isNigeria,
            source: "manual",
        };

        jobs = jobs.filter((j) => isJobLocationMatch(j.location, userLoc));

        // Prioritize local matches first, then regional Africa/Europe, then global remote
        jobs.sort((a, b) => {
            const aLoc = a.location.toLowerCase();
            const bLoc = b.location.toLowerCase();

            const aIsLocal = userLoc.isNigeria && (aLoc.includes("nigeria") || aLoc.includes("lagos"));
            const bIsLocal = userLoc.isNigeria && (bLoc.includes("nigeria") || bLoc.includes("lagos"));

            if (aIsLocal && !bIsLocal) return -1;
            if (!aIsLocal && bIsLocal) return 1;

            const aIsAfrica = aLoc.includes("africa") || aLoc.includes("nigeria") || aLoc.includes("kenya") || aLoc.includes("ghana");
            const bIsAfrica = bLoc.includes("africa") || bLoc.includes("nigeria") || bLoc.includes("kenya") || bLoc.includes("ghana");

            if (userLoc.isAfrica) {
                if (aIsAfrica && !bIsAfrica) return -1;
                if (!aIsAfrica && bIsAfrica) return 1;
            }

            return 0;
        });
    }

    if (limit && limit > 0) {
        jobs = jobs.slice(0, limit);
    }

    return NextResponse.json({ jobs, totalCount: jobs.length });
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { title, company, location, roleFamily, url, employmentType, salaryRange, description } = body;

        if (!title || !company || !location || !roleFamily) {
            return NextResponse.json(
                { error: "Title, Company, Location, and Role Family are required." },
                { status: 400 }
            );
        }

        const jobs = await readJobs();
        const newJob: JobItem = {
            id: `job_${Date.now()}`,
            title: title.trim(),
            company: company.trim(),
            location: location.trim(),
            roleFamily: roleFamily.trim(),
            url: url?.trim() || "#",
            employmentType: employmentType?.trim() || "Full-time",
            salaryRange: salaryRange?.trim() || "Competitive",
            description: description?.trim() || "",
            source: "manual",
            datePosted: new Date().toISOString().split("T")[0],
        };

        jobs.unshift(newJob);
        await saveJobs(jobs);

        return NextResponse.json({ success: true, job: newJob }, { status: 201 });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, title, company, location, roleFamily, url, employmentType, salaryRange, description, status } = body;

        if (!id || !title || !company) {
            return NextResponse.json({ error: "ID, Title, and Company are required." }, { status: 400 });
        }

        const jobs = await readJobs();
        const index = jobs.findIndex((j) => j.id === id);

        if (index === -1) {
            return NextResponse.json({ error: "Job not found." }, { status: 404 });
        }

        jobs[index] = {
            ...jobs[index],
            title: title.trim(),
            company: company.trim(),
            location: location.trim(),
            roleFamily: roleFamily.trim(),
            url: url?.trim() || jobs[index].url,
            employmentType: employmentType?.trim() || jobs[index].employmentType,
            salaryRange: salaryRange?.trim() || jobs[index].salaryRange,
            description: description?.trim() || jobs[index].description,
            status: status === "expired" ? "expired" : "active",
        };

        await saveJobs(jobs);

        return NextResponse.json({ success: true, job: jobs[index] });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        const purgeExpired = searchParams.get("purgeExpired") === "true";

        let jobs = await readJobs();

        if (purgeExpired) {
            const beforeCount = jobs.length;
            const ttlCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            jobs = jobs.filter((j) => {
                const isExpired = (j.status || "active") === "expired";
                const isTooOld = j.datePosted && j.datePosted < ttlCutoff;
                return !isExpired && !isTooOld;
            });
            const purgedCount = beforeCount - jobs.length;
            await saveJobs(jobs);
            return NextResponse.json({
                success: true,
                message: `Purged ${purgedCount} expired/stale role(s).`,
                purgedCount,
                remainingCount: jobs.length,
            });
        }

        if (!id) {
            return NextResponse.json({ error: "ID parameter is required." }, { status: 400 });
        }

        jobs = jobs.filter((j) => j.id !== id);
        await saveJobs(jobs);

        return NextResponse.json({ success: true, message: "Job deleted successfully." });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}
