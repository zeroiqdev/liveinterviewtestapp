import { NextRequest, NextResponse } from "next/server";
import { isJobLocationMatch, isJobRoleMatch, UserLocation } from "@/utils/locationDetector";
import {
    getAllJobs,
    getJobById,
    createJob,
    updateJob,
    deleteJob,
    purgeExpiredJobs,
} from "@/lib/jobStorage";
import { collapseDuplicateJobs } from "@/lib/jobDedupe";
import { requireAdmin } from "@/lib/session";

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
    /** A short summary. */
    description?: string;
    /** The posting's full text. Only present on a single job fetched by id. */
    fullDescription?: string;
    /** The posting's duties. Only present on a single job fetched by id. */
    responsibilities?: string[];
    source: "manual" | "scraped";
    datePosted: string;
    status?: "active" | "expired";
    isRemoteGlobal?: boolean;
    isAfrica?: boolean;
    isNigeria?: boolean;
    /** In lists: how many other locations this same role is open in. */
    moreLocations?: number;
}

/** The most jobs one list response carries (about 2.5 MB). */
const MAX_LISTED_JOBS = 3000;
const AFRICAN_LOCATION =
    /nigeria|lagos|abuja|port harcourt|ibadan|kano|africa|kenya|nairobi|ghana|accra|johannesburg|cape town|egypt|cairo|rwanda|kigali|uganda|kampala|tanzania|senegal|dakar|ethiopia|morocco/i;

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const roleFamily = searchParams.get("roleFamily");
    const userRole = searchParams.get("userRole");
    const source = searchParams.get("source");
    const search = searchParams.get("search");
    const status = searchParams.get("status") || "active"; // "active" | "expired" | "all"
    const freshness = searchParams.get("freshness"); // "14d" | "7d" | "3d" | "all"
    const country = searchParams.get("country");
    const city = searchParams.get("city");
    const isAfricaParam = searchParams.get("isAfrica");
    const timezone = searchParams.get("timezone");
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;

    // One job, with its full text and duties (lists leave those out).
    const id = searchParams.get("id");
    if (id) {
        const job = await getJobById(id);
        if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
        return NextResponse.json({ job });
    }

    let jobs = await getAllJobs();

    const MAX_POSTING_AGE_DAYS = 14;
    const ttlCutoff = new Date(Date.now() - MAX_POSTING_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // 0. Status & Freshness filtering
    if (status === "active") {
        jobs = jobs.filter((j) => (j.status || "active") === "active" && (!j.datePosted || j.datePosted >= ttlCutoff));
    } else if (status === "expired") {
        jobs = jobs.filter((j) => j.status === "expired" || (j.datePosted && j.datePosted < ttlCutoff));
    }

    // 0b. Optional explicit freshness filter
    if (freshness === "14d") {
        const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        jobs = jobs.filter((j) => !j.datePosted || j.datePosted >= cutoff);
    } else if (freshness === "7d") {
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

    // The same role is often posted once per city, or simply twice: show it
    // once. (`status=all` is the admin's view of every stored row.)
    if (status !== "all") jobs = collapseDuplicateJobs(jobs);

    // A response may not exceed a few megabytes, and thousands of jobs do.
    // When there are more than fit, keep African jobs first, then the newest.
    const totalCount = jobs.length;
    const locationSorted = Boolean(country || isAfricaParam !== null || timezone);
    if (jobs.length > MAX_LISTED_JOBS && !locationSorted) {
        jobs = jobs
            .map((job, index) => ({ job, index, african: AFRICAN_LOCATION.test(job.location) }))
            .sort((a, b) => Number(b.african) - Number(a.african) || b.job.datePosted.localeCompare(a.job.datePosted) || a.index - b.index)
            .map((entry) => entry.job);
    }
    jobs = jobs.slice(0, Math.min(limit && limit > 0 ? limit : MAX_LISTED_JOBS, MAX_LISTED_JOBS));

    return NextResponse.json({ jobs, totalCount, listed: jobs.length });
}

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAdmin(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }

        const body = await req.json();
        const { title, company, location, roleFamily, url, employmentType, salaryRange, description } = body;

        if (!title || !company || !location || !roleFamily) {
            return NextResponse.json(
                { error: "Title, Company, Location, and Role Family are required." },
                { status: 400 }
            );
        }

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
            status: "active",
        };

        const created = await createJob(newJob);

        return NextResponse.json({ success: true, job: created }, { status: 201 });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const authResult = await requireAdmin(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }

        const body = await req.json();
        const { id, title, company, location, roleFamily, url, employmentType, salaryRange, description, status } = body;

        if (!id || !title || !company) {
            return NextResponse.json({ error: "ID, Title, and Company are required." }, { status: 400 });
        }

        const updateData: Partial<JobItem> = {
            title: title.trim(),
            company: company.trim(),
            location: location.trim(),
            roleFamily: roleFamily.trim(),
            url: url?.trim(),
            employmentType: employmentType?.trim(),
            salaryRange: salaryRange?.trim(),
            description: description?.trim(),
            status: status === "expired" ? "expired" : "active",
        };

        const updated = await updateJob(id, updateData);

        if (!updated) {
            return NextResponse.json({ error: "Job not found." }, { status: 404 });
        }

        return NextResponse.json({ success: true, job: updated });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const authResult = await requireAdmin(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        const purgeExpired = searchParams.get("purgeExpired") === "true";

        if (purgeExpired) {
            const ttlCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            const purgedCount = await purgeExpiredJobs(ttlCutoff);
            const remainingJobs = await getAllJobs();
            return NextResponse.json({
                success: true,
                message: `Purged ${purgedCount} expired/stale role(s).`,
                purgedCount,
                remainingCount: remainingJobs.length,
            });
        }

        if (!id) {
            return NextResponse.json({ error: "ID parameter is required." }, { status: 400 });
        }

        await deleteJob(id);

        return NextResponse.json({ success: true, message: "Job deleted successfully." });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}
