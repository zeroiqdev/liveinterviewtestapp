import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { detectATSProvider } from "@/services/careerPageScraper";

export interface ScraperSource {
    id: string;
    url: string;
    companyName: string;
    sourceType: "career_page" | "vc_portfolio";
    atsProvider: string;
    enabled: boolean;
    lastScraped: string | null;
    lastJobCount: number;
    dateAdded: string;
}

const SOURCES_FILE_PATH = path.join(process.cwd(), "src", "engine", "data", "scraperSources.json");

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

/**
 * Attempt to extract a company name from a URL domain.
 * e.g. "https://boards.greenhouse.io/stripe" → "Stripe"
 * e.g. "https://jobs.lever.co/notion" → "Notion"
 * e.g. "https://openai.com/careers" → "Openai"
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

export async function GET() {
    const sources = await readSources();
    return NextResponse.json({ sources, totalCount: sources.length });
}

// ─── POST: Add a new scraper source ──────────────────────────────────

export async function POST(req: Request) {
    try {
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

        const sources = await readSources();

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

        sources.push(newSource);
        await saveSources(sources);

        return NextResponse.json({ success: true, source: newSource }, { status: 201 });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}

// ─── PUT: Update a scraper source ────────────────────────────────────

export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, companyName, sourceType, enabled } = body;

        if (!id) {
            return NextResponse.json({ error: "Source ID is required." }, { status: 400 });
        }

        const sources = await readSources();
        const index = sources.findIndex((s) => s.id === id);

        if (index === -1) {
            return NextResponse.json({ error: "Source not found." }, { status: 404 });
        }

        if (companyName !== undefined) sources[index].companyName = companyName.trim();
        if (sourceType !== undefined) sources[index].sourceType = sourceType;
        if (enabled !== undefined) sources[index].enabled = enabled;

        await saveSources(sources);

        return NextResponse.json({ success: true, source: sources[index] });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}

// ─── DELETE: Remove a scraper source ─────────────────────────────────

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID parameter is required." }, { status: 400 });
        }

        let sources = await readSources();
        const before = sources.length;
        sources = sources.filter((s) => s.id !== id);

        if (sources.length === before) {
            return NextResponse.json({ error: "Source not found." }, { status: 404 });
        }

        await saveSources(sources);

        return NextResponse.json({ success: true, message: "Source removed successfully." });
    } catch (err: unknown) {
        const error = err instanceof Error ? err.message : "Internal Error";
        return NextResponse.json({ error }, { status: 500 });
    }
}
