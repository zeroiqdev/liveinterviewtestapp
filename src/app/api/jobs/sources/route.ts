import { NextRequest, NextResponse } from "next/server";
import { detectATSProvider } from "@/services/careerPageScraper";
import {
    getSources,
    addSource,
    updateSource,
    deleteSource,
} from "@/lib/jobStorage";
import { requireAdmin } from "@/lib/session";

export interface ScraperSource {
    id: string;
    url: string;
    companyName: string;
    sourceType: "career_page" | "vc_portfolio" | "job_board";
    atsProvider: string;
    enabled: boolean;
    lastScraped: string | null;
    lastJobCount: number;
    dateAdded: string;
}

/**
 * Attempt to extract a company name from a URL domain.
 */
function guessCompanyName(url: string): string {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();

        // ATS-hosted boards: extract from path
        if (host.includes("greenhouse.io") || host.includes("lever.co") || host.includes("ashbyhq.com")) {
            const slug = parsed.pathname.split("/").filter(Boolean)[0] || "";
            return slug.charAt(0).toUpperCase() + slug.slice(1);
        }

        // Regular domains: use subdomain-free domain name
        const parts = host.replace("www.", "").split(".");
        const name = parts[0] || "Unknown";
        return name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
        return "Unknown";
    }
}

// ─── GET: List all scraper sources ────────────────────────────────────

export async function GET(req: NextRequest) {
    const authResult = await requireAdmin(req);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const sources = await getSources();
    return NextResponse.json({ sources, totalCount: sources.length });
}

// ─── POST: Add a new scraper source ──────────────────────────────────

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAdmin(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }

        const body = await req.json();
        const { url, companyName, sourceType } = body;

        if (!url) {
            return NextResponse.json({ error: "URL is required." }, { status: 400 });
        }

        // Validate URL format
        try {
            new URL(url);
        } catch {
            return NextResponse.json({ error: "Invalid URL format." }, { status: 400 });
        }

        const sources = await getSources();

        // Check for duplicate URL
        if (sources.some((s) => s.url.toLowerCase() === url.toLowerCase())) {
            return NextResponse.json({ error: "This URL is already in the sources list." }, { status: 409 });
        }

        const detectedProvider = detectATSProvider(url);
        const resolvedName = companyName?.trim() || guessCompanyName(url);

        const newSource: ScraperSource = {
            id: `src_${Date.now()}`,
            url: url.trim(),
            companyName: resolvedName,
            sourceType: sourceType || "career_page",
            atsProvider: detectedProvider,
            enabled: true,
            lastScraped: null,
            lastJobCount: 0,
            dateAdded: new Date().toISOString().split("T")[0],
        };

        await addSource(newSource);

        return NextResponse.json({ success: true, source: newSource }, { status: 201 });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}

// ─── PUT: Update a scraper source ────────────────────────────────────

export async function PUT(req: NextRequest) {
    try {
        const authResult = await requireAdmin(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }

        const body = await req.json();
        const { id, companyName, sourceType, enabled } = body;

        if (!id) {
            return NextResponse.json({ error: "Source ID is required." }, { status: 400 });
        }

        const updates: Partial<ScraperSource> = {};
        if (companyName !== undefined) updates.companyName = companyName.trim();
        if (sourceType !== undefined) updates.sourceType = sourceType;
        if (enabled !== undefined) updates.enabled = enabled;

        const updated = await updateSource(id, updates);

        if (!updated) {
            return NextResponse.json({ error: "Source not found." }, { status: 404 });
        }

        return NextResponse.json({ success: true, source: updated });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}

// ─── DELETE: Remove a scraper source ─────────────────────────────────

export async function DELETE(req: NextRequest) {
    try {
        const authResult = await requireAdmin(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID parameter is required." }, { status: 400 });
        }

        await deleteSource(id);

        return NextResponse.json({ success: true, message: "Source removed successfully." });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}
