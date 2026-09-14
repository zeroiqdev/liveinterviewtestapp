/**
 * Career Page & VC Portfolio Scraper Engine
 * 
 * 1. Career Page Scraper: Fetches open roles from company career pages via
 *    ATS APIs (Greenhouse, Lever, Ashby) and fallback HTML extraction.
 * 2. VC Portfolio Scraper: Inspects Venture Capital portfolio directories
 *    (e.g., Y Combinator, a16z, Sequoia, Techstars, Accel, Founders Fund,
 *    Greylock, Ventures Platform, TLcom Capital, Future Africa) and fetches
 *    active open roles from their portfolio companies.
 * 3. Zero Data Loss: Sources with 0 open positions are always preserved in the list.
 */

import { probeJobApplicationStatus } from "./jobProbeService";

export interface ScrapedJob {
    title: string;
    url: string;
    location?: string;
    department?: string;
    company: string;
    companyLogo?: string;
    backedBy?: string; // e.g. "Y Combinator", "Wellfound", "Jobberman Nigeria", "LinkedIn Nigeria"
    salaryRange?: string;
    description?: string;
    datePosted?: string;
    status?: "active" | "expired";
}

export interface ScrapeResult {
    jobs: ScrapedJob[];
    provider: string;
    portfolioCompaniesChecked?: number;
    error?: string;
}

// ─── ATS & Job Board Provider Detection ──────────────────────────────────

export function detectATSProvider(url: string): "greenhouse" | "lever" | "ashby" | "jobberman" | "linkedin" | "wellfound" | "indeed" | "glassdoor" | "generic" {
    const lower = url.toLowerCase();
    if (lower.includes("boards.greenhouse.io") || lower.includes("greenhouse.io")) return "greenhouse";
    if (lower.includes("jobs.lever.co") || lower.includes("lever.co")) return "lever";
    if (lower.includes("jobs.ashbyhq.com") || lower.includes("ashbyhq.com")) return "ashby";
    if (lower.includes("jobberman.com")) return "jobberman";
    if (lower.includes("linkedin.com")) return "linkedin";
    if (lower.includes("wellfound.com")) return "wellfound";
    if (lower.includes("indeed.com")) return "indeed";
    if (lower.includes("glassdoor.com")) return "glassdoor";
    return "generic";
}

/**
 * Extract the board/company slug from an ATS URL.
 * e.g. "https://boards.greenhouse.io/stripe" → "stripe"
 * e.g. "https://jobs.lever.co/notion" → "notion"
 * e.g. "https://jobs.ashbyhq.com/linear" → "linear"
 */
function extractSlug(url: string): string {
    try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split("/").filter(Boolean);
        return parts[0] || "";
    } catch {
        return "";
    }
}

export function decodeHtmlEntities(text?: string): string {
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

// ─── Role Overview Synthesizer ─────────────────────────────────────────

export function generateRoleOverview(title: string, roleFamily?: string, company?: string, location?: string): string {
    const cleanTitle = decodeHtmlEntities(title || "Software Engineer").trim();
    const cleanCompany = decodeHtmlEntities(company || "the company").trim();
    const loc = location && location !== "Not specified" ? ` in ${location}` : "";
    const fam = roleFamily || classifyRoleFamily(cleanTitle);

    switch (fam) {
        case "frontend_developer":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will architect, build, and maintain highly responsive, accessible user interfaces and web applications. You will collaborate closely with product managers and designers to translate user workflows into performant client experiences, champion frontend performance optimization, and establish scalable design system component standards.`;
        case "backend_engineer":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will design, scale, and maintain high-throughput backend services, distributed systems, and core API infrastructures. You will implement robust data pipelines, optimize database performance, ensure high availability and security, and collaborate across engineering squads to power mission-critical product features.`;
        case "product_manager":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will lead cross-functional product strategy from discovery through delivery. You will define product roadmaps, conduct customer research, align engineering and design teams around high-impact OKRs, and leverage product analytics to drive user retention, adoption, and business growth.`;
        case "product_designer":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will drive user experience and interface design across the product lifecycle. You will conduct user research and usability testing, build interactive prototypes, and partner closely with engineers to deliver intuitive, pixel-perfect digital experiences.`;
        case "data_analyst":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will uncover data-driven insights to guide product and business decisions. You will build automated dashboards, develop predictive models, design A/B testing frameworks, and partner with leadership to translate complex data into actionable operational strategies.`;
        default:
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will play a pivotal role in driving core technical and operational initiatives. You will work alongside cross-functional teams to solve high-impact challenges, execute strategic priorities, and help scale the organization's technological and business impact.`;
    }
}

// ─── Greenhouse Scraper ───────────────────────────────────────────────

interface GreenhouseJob {
    id: number;
    title: string;
    absolute_url: string;
    location: { name: string };
    departments: { name: string }[];
    updated_at?: string;
}

export async function scrapeGreenhouseJobs(url: string, companyName: string, backedBy?: string): Promise<ScrapeResult> {
    const slug = extractSlug(url);
    if (!slug) return { jobs: [], provider: "greenhouse", error: "Could not extract board slug from URL" };

    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;

    try {
        const res = await fetch(apiUrl, {
            headers: { "User-Agent": "UseLadder-CareerScraper/1.0" },
            signal: AbortSignal.timeout(15000),
            cache: "no-store" as RequestCache,
        });

        if (!res.ok) {
            return { jobs: [], provider: "greenhouse", error: `API returned ${res.status}` };
        }

        const data = await res.json();
        const rawJobs: GreenhouseJob[] = data.jobs || [];

        const jobs: ScrapedJob[] = rawJobs.map((j) => ({
            title: j.title,
            url: j.absolute_url,
            location: j.location?.name || "Not specified",
            department: j.departments?.[0]?.name || "",
            company: companyName,
            backedBy,
            datePosted: j.updated_at ? j.updated_at.split("T")[0] : new Date().toISOString().split("T")[0],
        }));

        return { jobs, provider: "greenhouse" };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { jobs: [], provider: "greenhouse", error: msg };
    }
}

// ─── Lever Scraper ────────────────────────────────────────────────────

interface LeverPosting {
    id: string;
    text: string;
    hostedUrl: string;
    createdAt?: number;
    categories: {
        location?: string;
        team?: string;
        department?: string;
        commitment?: string;
    };
}

export async function scrapeLeverJobs(url: string, companyName: string, backedBy?: string): Promise<ScrapeResult> {
    const slug = extractSlug(url);
    if (!slug) return { jobs: [], provider: "lever", error: "Could not extract company slug from URL" };

    const apiUrl = `https://api.lever.co/v0/postings/${slug}?mode=json`;

    try {
        const res = await fetch(apiUrl, {
            headers: { "User-Agent": "UseLadder-CareerScraper/1.0" },
            signal: AbortSignal.timeout(15000),
            cache: "no-store" as RequestCache,
        });

        if (!res.ok) {
            return { jobs: [], provider: "lever", error: `API returned ${res.status}` };
        }

        const postings: LeverPosting[] = await res.json();

        const jobs: ScrapedJob[] = postings.map((p) => ({
            title: p.text,
            url: p.hostedUrl,
            location: p.categories?.location || "Not specified",
            department: p.categories?.team || p.categories?.department || "",
            company: companyName,
            backedBy,
            datePosted: p.createdAt ? new Date(p.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        }));

        return { jobs, provider: "lever" };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { jobs: [], provider: "lever", error: msg };
    }
}

// ─── Ashby Scraper ────────────────────────────────────────────────────

interface AshbyJobPosting {
    id: string;
    title: string;
    jobUrl: string;
    location: string;
    departmentName?: string;
    teamName?: string;
    publishedDate?: string;
    publishedAt?: string;
}

interface AshbyApiResponse {
    success: boolean;
    results: AshbyJobPosting[];
}

export async function scrapeAshbyJobs(url: string, companyName: string, backedBy?: string): Promise<ScrapeResult> {
    const slug = extractSlug(url);
    if (!slug) return { jobs: [], provider: "ashby", error: "Could not extract board slug from URL" };

    const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;

    try {
        const res = await fetch(apiUrl, {
            headers: { "User-Agent": "UseLadder-CareerScraper/1.0" },
            signal: AbortSignal.timeout(15000),
            cache: "no-store" as RequestCache,
        });

        if (!res.ok) {
            return { jobs: [], provider: "ashby", error: `API returned ${res.status}` };
        }

        const data: AshbyApiResponse = await res.json();
        const postings = data.results || [];

        const jobs: ScrapedJob[] = postings.map((p) => {
            const rawDate = p.publishedAt || p.publishedDate;
            const datePosted = rawDate ? rawDate.split("T")[0] : new Date().toISOString().split("T")[0];
            return {
                title: p.title,
                url: p.jobUrl || `https://jobs.ashbyhq.com/${slug}/${p.id}`,
                location: p.location || "Not specified",
                department: p.departmentName || p.teamName || "",
                company: companyName,
                backedBy,
                datePosted,
            };
        });

        return { jobs, provider: "ashby" };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { jobs: [], provider: "ashby", error: msg };
    }
}

// ─── Generic HTML Scraper ─────────────────────────────────────────────

export async function scrapeGenericCareerPage(url: string, companyName: string, backedBy?: string): Promise<ScrapeResult> {
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            signal: AbortSignal.timeout(20000),
            cache: "no-store" as RequestCache,
        });

        if (!res.ok) {
            return { jobs: [], provider: "generic", error: `Page returned ${res.status}` };
        }

        const html = await res.text();

        // Check if page embeds or redirects to a known ATS
        const ghMatch = html.match(/boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/);
        if (ghMatch) {
            return scrapeGreenhouseJobs(`https://boards.greenhouse.io/${ghMatch[1]}`, companyName, backedBy);
        }
        const leverMatch = html.match(/jobs\.lever\.co\/([a-zA-Z0-9_-]+)/);
        if (leverMatch) {
            return scrapeLeverJobs(`https://jobs.lever.co/${leverMatch[1]}`, companyName, backedBy);
        }
        const ashbyMatch = html.match(/jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/);
        if (ashbyMatch) {
            return scrapeAshbyJobs(`https://jobs.ashbyhq.com/${ashbyMatch[1]}`, companyName, backedBy);
        }

        // Generic extraction
        const jobs = extractJobLinksFromHTML(html, url, companyName, backedBy);
        return { jobs, provider: "generic" };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { jobs: [], provider: "generic", error: msg };
    }
}

function extractJobLinksFromHTML(html: string, baseUrl: string, companyName: string, backedBy?: string): ScrapedJob[] {
    const jobs: ScrapedJob[] = [];
    const seenUrls = new Set<string>();

    const linkPattern = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
        const href = match[1];
        let linkText = match[2].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");

        if (!isLikelyJobLink(href, linkText)) continue;
        if (linkText.length < 4 || linkText.length > 90) continue;

        let fullUrl: string;
        try {
            fullUrl = new URL(href, baseUrl).toString();
        } catch {
            continue;
        }

        if (seenUrls.has(fullUrl)) continue;
        seenUrls.add(fullUrl);

        // Detect location heuristics from surrounding context in the match
        let detectedLocation = "Not specified";
        const contextSnippet = html.slice(Math.max(0, match.index - 100), Math.min(html.length, match.index + match[0].length + 100)).toLowerCase();
        if (contextSnippet.includes("lagos") || contextSnippet.includes("nigeria")) {
            detectedLocation = "Lagos, Nigeria";
        } else if (contextSnippet.includes("remote") || contextSnippet.includes("worldwide") || contextSnippet.includes("anywhere")) {
            detectedLocation = "Remote Worldwide";
        } else if (contextSnippet.includes("nairobi") || contextSnippet.includes("kenya")) {
            detectedLocation = "Nairobi, Kenya";
        } else if (contextSnippet.includes("ghana") || contextSnippet.includes("accra")) {
            detectedLocation = "Accra, Ghana";
        } else if (contextSnippet.includes("london") || contextSnippet.includes("uk") || contextSnippet.includes("united kingdom")) {
            detectedLocation = "London, UK";
        } else if (contextSnippet.includes("san francisco") || contextSnippet.includes("new york") || contextSnippet.includes("united states") || contextSnippet.includes("usa")) {
            detectedLocation = "United States";
        }

        jobs.push({
            title: linkText,
            url: fullUrl,
            location: detectedLocation,
            company: companyName,
            backedBy,
        });
    }

    return jobs;
}

function isLikelyJobLink(href: string, text: string): boolean {
    const hrefLower = href.toLowerCase();
    const textLower = text.toLowerCase();
    const combined = hrefLower + " " + textLower;

    // Reject navigation, legal, social, media links
    const antiTerms = [
        "login", "sign-in", "signup", "blog", "about", "contact", "press",
        "privacy", "terms", "cookie", "linkedin", "twitter", "facebook",
        "instagram", "mailto:", "javascript:", "#", "tel:", "companies/",
        "portfolio/", "news/", "events/", "team/", "investors/",
    ];
    if (antiTerms.some((t) => combined.includes(t) && !combined.includes("/job") && !combined.includes("/career"))) {
        return false;
    }

    // Must have job path OR strong job title keyword
    const pathJobSignals = [
        "/jobs/", "/careers/", "/positions/", "/openings/", "/apply/",
        "/job/", "/career/", "/role/", "/opportunity/",
    ];
    const titleJobSignals = [
        "engineer", "developer", "designer", "product manager", "data analyst",
        "architect", "consultant", "lead", "specialist", "coordinator",
        "scientist", "researcher", "strategist", "officer",
    ];

    const hasPathSignal = pathJobSignals.some((p) => hrefLower.includes(p));
    const hasTitleSignal = titleJobSignals.some((t) => textLower.includes(t));

    return hasPathSignal || (hasTitleSignal && text.length < 80);
}

// ─── Venture Capital Portfolio Scraper ─────────────────────────────────

interface PortfolioTarget {
    company: string;
    url: string;
    atsProvider?: "greenhouse" | "lever" | "ashby" | "jobberman" | "linkedin" | "wellfound" | "indeed" | "glassdoor" | "generic";
}

/**
 * Curated catalog of top portfolio companies for the specified VC funds.
 * Each company points directly to its active ATS board / career page.
 */
const VC_PORTFOLIO_CATALOG: Record<string, PortfolioTarget[]> = {
    "ycombinator": [
        { company: "Paystack", url: "https://boards.greenhouse.io/paystack", atsProvider: "greenhouse" },
        { company: "Moniepoint", url: "https://jobs.ashbyhq.com/moniepoint", atsProvider: "ashby" },
        { company: "Flutterwave", url: "https://flutterwave.com/careers", atsProvider: "generic" },
        { company: "Kuda Bank", url: "https://jobs.lever.co/kuda", atsProvider: "lever" },
        { company: "Retool", url: "https://jobs.lever.co/retool", atsProvider: "lever" },
        { company: "Brex", url: "https://boards.greenhouse.io/brex", atsProvider: "greenhouse" },
        { company: "Deel", url: "https://jobs.ashbyhq.com/deel", atsProvider: "ashby" },
        { company: "Vercel", url: "https://boards.greenhouse.io/vercel", atsProvider: "greenhouse" },
        { company: "Supabase", url: "https://jobs.ashbyhq.com/supabase", atsProvider: "ashby" },
        { company: "Reliance Health", url: "https://jobs.lever.co/reliancehealthinc", atsProvider: "lever" },
    ],
    "a16z": [
        { company: "OpenAI", url: "https://boards.greenhouse.io/openai", atsProvider: "greenhouse" },
        { company: "Figma", url: "https://jobs.lever.co/figma", atsProvider: "lever" },
        { company: "Substack", url: "https://jobs.ashbyhq.com/substack", atsProvider: "ashby" },
        { company: "Anduril", url: "https://boards.greenhouse.io/andurilindustries", atsProvider: "greenhouse" },
        { company: "Carta", url: "https://jobs.lever.co/carta", atsProvider: "lever" },
        { company: "Character.ai", url: "https://jobs.ashbyhq.com/character", atsProvider: "ashby" },
        { company: "Cursor / Anysphere", url: "https://jobs.ashbyhq.com/anysphere", atsProvider: "ashby" },
        { company: "dbt Labs", url: "https://boards.greenhouse.io/dbtlabsinc", atsProvider: "greenhouse" },
        { company: "Fivetran", url: "https://boards.greenhouse.io/fivetran", atsProvider: "greenhouse" },
        { company: "Pinecone", url: "https://boards.greenhouse.io/pinecone", atsProvider: "greenhouse" },
        { company: "Perplexity AI", url: "https://jobs.ashbyhq.com/perplexity", atsProvider: "ashby" },
        { company: "Replit", url: "https://jobs.ashbyhq.com/replit", atsProvider: "ashby" },
        { company: "Mistral AI", url: "https://jobs.ashbyhq.com/mistral", atsProvider: "ashby" },
        { company: "Runway", url: "https://jobs.ashbyhq.com/runwayml", atsProvider: "ashby" },
        { company: "Skydio", url: "https://boards.greenhouse.io/skydio", atsProvider: "greenhouse" },
        { company: "Wayve", url: "https://boards.greenhouse.io/wayve", atsProvider: "greenhouse" },
        { company: "Loft Orbital", url: "https://boards.greenhouse.io/loftorbital", atsProvider: "greenhouse" },
    ],
    "sequoia": [
        { company: "Linear", url: "https://jobs.ashbyhq.com/linear", atsProvider: "ashby" },
        { company: "Notion", url: "https://boards.greenhouse.io/notion", atsProvider: "greenhouse" },
        { company: "Stripe", url: "https://boards.greenhouse.io/stripe", atsProvider: "greenhouse" },
        { company: "Glean", url: "https://jobs.ashbyhq.com/glean", atsProvider: "ashby" },
        { company: "Temporal", url: "https://boards.greenhouse.io/temporal", atsProvider: "greenhouse" },
        { company: "DoorDash", url: "https://boards.greenhouse.io/doordash", atsProvider: "greenhouse" },
        { company: "Nubank", url: "https://boards.greenhouse.io/nubank", atsProvider: "greenhouse" },
        { company: "Klarna", url: "https://jobs.lever.co/klarna", atsProvider: "lever" },
        { company: "Snowflake", url: "https://boards.greenhouse.io/snowflake", atsProvider: "greenhouse" },
        { company: "Hugging Face", url: "https://jobs.lever.co/huggingface", atsProvider: "lever" },
        { company: "Wiz", url: "https://boards.greenhouse.io/wiz", atsProvider: "greenhouse" },
        { company: "Harvey", url: "https://jobs.ashbyhq.com/harvey", atsProvider: "ashby" },
        { company: "Kuda Bank", url: "https://jobs.lever.co/kuda", atsProvider: "lever" },
    ],
    "techstars": [
        { company: "Healthtracka", url: "https://healthtracka.com/careers", atsProvider: "generic" },
        { company: "MAX.ng", url: "https://max.ng/careers", atsProvider: "generic" },
        { company: "Bitmama", url: "https://bitmama.io/careers", atsProvider: "generic" },
        { company: "Payday", url: "https://usepayday.com/careers", atsProvider: "generic" },
        { company: "Remotebase", url: "https://boards.greenhouse.io/remotebase", atsProvider: "greenhouse" },
        { company: "Sendbox", url: "https://sendbox.co/careers", atsProvider: "generic" },
        { company: "Farmcrowdy", url: "https://farmcrowdy.com/careers", atsProvider: "generic" },
        { company: "TalentQL / AltSchool", url: "https://altschoolafrica.com/careers", atsProvider: "generic" },
        { company: "Treepz", url: "https://treepz.com/careers", atsProvider: "generic" },
        { company: "ClassDojo", url: "https://boards.greenhouse.io/classdojo", atsProvider: "greenhouse" },
        { company: "Zipline", url: "https://boards.greenhouse.io/zipline", atsProvider: "greenhouse" },
    ],
    "accel": [
        { company: "Scale AI", url: "https://boards.greenhouse.io/scaleai", atsProvider: "greenhouse" },
        { company: "Snyk", url: "https://boards.greenhouse.io/snyk", atsProvider: "greenhouse" },
        { company: "Celonis", url: "https://boards.greenhouse.io/celonis", atsProvider: "greenhouse" },
        { company: "Monzo", url: "https://boards.greenhouse.io/monzo", atsProvider: "greenhouse" },
        { company: "Miro", url: "https://boards.greenhouse.io/miro", atsProvider: "greenhouse" },
        { company: "Webflow", url: "https://boards.greenhouse.io/webflow", atsProvider: "greenhouse" },
        { company: "Klaviyo", url: "https://boards.greenhouse.io/klaviyo", atsProvider: "greenhouse" },
        { company: "1Password", url: "https://boards.greenhouse.io/1password", atsProvider: "greenhouse" },
        { company: "PagerDuty", url: "https://boards.greenhouse.io/pagerduty", atsProvider: "greenhouse" },
        { company: "Deliveroo", url: "https://boards.greenhouse.io/deliveroo", atsProvider: "greenhouse" },
        { company: "Pleo", url: "https://boards.greenhouse.io/pleo", atsProvider: "greenhouse" },
    ],
    "foundersfund": [
        { company: "Ramp", url: "https://jobs.ashbyhq.com/ramp", atsProvider: "ashby" },
        { company: "Figma", url: "https://jobs.lever.co/figma", atsProvider: "lever" },
        { company: "SpaceX", url: "https://boards.greenhouse.io/spacex", atsProvider: "greenhouse" },
        { company: "Anduril", url: "https://boards.greenhouse.io/andurilindustries", atsProvider: "greenhouse" },
        { company: "Stripe", url: "https://boards.greenhouse.io/stripe", atsProvider: "greenhouse" },
        { company: "Palantir", url: "https://boards.greenhouse.io/palantir", atsProvider: "greenhouse" },
        { company: "Neuralink", url: "https://boards.greenhouse.io/neuralink", atsProvider: "greenhouse" },
        { company: "Flexport", url: "https://boards.greenhouse.io/flexport", atsProvider: "greenhouse" },
        { company: "The Browser Company", url: "https://jobs.ashbyhq.com/thebrowsercompany", atsProvider: "ashby" },
        { company: "Eight Sleep", url: "https://jobs.lever.co/eightsleep", atsProvider: "lever" },
        { company: "Rippling", url: "https://boards.greenhouse.io/rippling", atsProvider: "greenhouse" },
    ],
    "greylock": [
        { company: "Discord", url: "https://boards.greenhouse.io/discord", atsProvider: "greenhouse" },
        { company: "Roblox", url: "https://boards.greenhouse.io/roblox", atsProvider: "greenhouse" },
        { company: "Coinbase", url: "https://boards.greenhouse.io/coinbase", atsProvider: "greenhouse" },
        { company: "Coda", url: "https://jobs.lever.co/coda", atsProvider: "lever" },
        { company: "Abnormal Security", url: "https://boards.greenhouse.io/abnormalsecurity", atsProvider: "greenhouse" },
        { company: "Figma", url: "https://jobs.lever.co/figma", atsProvider: "lever" },
        { company: "Chronosphere", url: "https://jobs.lever.co/chronosphere", atsProvider: "lever" },
        { company: "Tome", url: "https://jobs.ashbyhq.com/tome", atsProvider: "ashby" },
        { company: "Rubrik", url: "https://boards.greenhouse.io/rubrik", atsProvider: "greenhouse" },
        { company: "Nextdoor", url: "https://boards.greenhouse.io/nextdoor", atsProvider: "greenhouse" },
        { company: "Snorkel AI", url: "https://boards.greenhouse.io/snorkelai", atsProvider: "greenhouse" },
    ],
    "venturesplatform": [
        { company: "Paystack", url: "https://boards.greenhouse.io/paystack", atsProvider: "greenhouse" },
        { company: "Piggyvest", url: "https://piggyvest.com/careers", atsProvider: "generic" },
        { company: "Moniepoint", url: "https://jobs.ashbyhq.com/moniepoint", atsProvider: "ashby" },
        { company: "Remedial Health", url: "https://jobs.lever.co/remedialhealth", atsProvider: "lever" },
        { company: "Mono", url: "https://jobs.ashbyhq.com/mono", atsProvider: "ashby" },
        { company: "SeamlessHR", url: "https://jobs.lever.co/seamlesshr", atsProvider: "lever" },
        { company: "Traction Apps", url: "https://tractionapps.mx/careers", atsProvider: "generic" },
        { company: "Reliance Health", url: "https://jobs.lever.co/reliancehealthinc", atsProvider: "lever" },
        { company: "Bamboo", url: "https://investbamboo.com/careers", atsProvider: "generic" },
        { company: "Fez Delivery", url: "https://fezdelivery.co/careers", atsProvider: "generic" },
        { company: "Raenest", url: "https://raenest.com/careers", atsProvider: "generic" },
    ],
    "tlcom": [
        { company: "Andela", url: "https://boards.greenhouse.io/andela", atsProvider: "greenhouse" },
        { company: "Kobo360", url: "https://kobo360.com/careers", atsProvider: "generic" },
        { company: "Twiga Foods", url: "https://twiga.com/careers", atsProvider: "generic" },
        { company: "Autochek", url: "https://autochek.africa/careers", atsProvider: "generic" },
        { company: "SeamlessHR", url: "https://jobs.lever.co/seamlesshr", atsProvider: "lever" },
        { company: "uLesson", url: "https://ulesson.com/careers", atsProvider: "generic" },
        { company: "Pula", url: "https://pula-advisors.com/careers", atsProvider: "generic" },
        { company: "FairMoney", url: "https://fairmoney.io/careers", atsProvider: "generic" },
        { company: "Vendease", url: "https://vendease.com/careers", atsProvider: "generic" },
    ],
    "futureafrica": [
        { company: "Flutterwave", url: "https://flutterwave.com/careers", atsProvider: "generic" },
        { company: "Eden Life", url: "https://ouredenlife.com/careers", atsProvider: "generic" },
        { company: "Bamboo", url: "https://investbamboo.com/careers", atsProvider: "generic" },
        { company: "Termii", url: "https://termii.com/careers", atsProvider: "generic" },
        { company: "Stears", url: "https://www.stears.co/careers", atsProvider: "generic" },
        { company: "Big Cabal Media", url: "https://bigcabal.com/careers", atsProvider: "generic" },
        { company: "Shuttlers", url: "https://shuttlers.ng/careers", atsProvider: "generic" },
        { company: "Stitch", url: "https://stitch.money/careers", atsProvider: "generic" },
        { company: "Moove", url: "https://moove.io/careers", atsProvider: "generic" },
    ]
};

function matchVCKey(url: string, name: string): string | null {
    const text = (url + " " + name).toLowerCase();
    if (text.includes("ycombinator") || text.includes("y combinator") || text.includes("yc")) return "ycombinator";
    if (text.includes("a16z") || text.includes("andreessen")) return "a16z";
    if (text.includes("sequoia")) return "sequoia";
    if (text.includes("techstars")) return "techstars";
    if (text.includes("accel")) return "accel";
    if (text.includes("foundersfund") || text.includes("founders fund")) return "foundersfund";
    if (text.includes("greylock")) return "greylock";
    if (text.includes("venturesplatform") || text.includes("ventures platform")) return "venturesplatform";
    if (text.includes("tlcom")) return "tlcom";
    if (text.includes("future.africa") || text.includes("future africa")) return "futureafrica";
    return null;
}

const YC_DIRECTORY_COMPANY_SLUGS = [
    // Top Fintech & High-Growth Startups
    "groww", "razorpay", "brex", "deel", "moniepoint", "paystack", "flutterwave", "kuda",
    "gusto", "stripe", "ramp", "zepto", "reliance-health", "wave",
    // Top AI & Developer Tools
    "posthog", "supabase", "retool", "replit", "resend", "cal-com", "vanta", "linear",
    "cursor", "scale-ai", "perplexity-ai", "openai", "mistral", "snyk", "modal-labs",
    // Global Scaling Startups
    "whatnot", "rippling", "faire", "airbnb", "coinbase", "gitlab", "instacart",
    "webflow", "zapier", "segment", "flexport", "door-dash", "chowdeck", "54gene"
];

/**
 * Scrapes Y Combinator's company directory pages (https://www.ycombinator.com/companies/{slug}).
 * Extracts live structured job postings directly from YC data (including Groww, PostHog, Retool, Deel, etc.).
 */
async function scrapeYCDirectoryCompanies(): Promise<ScrapedJob[]> {
    const jobs: ScrapedJob[] = [];
    const seenUrls = new Set<string>();

    // Process in parallel batches of 5
    for (let i = 0; i < YC_DIRECTORY_COMPANY_SLUGS.length; i += 5) {
        const batch = YC_DIRECTORY_COMPANY_SLUGS.slice(i, i + 5);
        const batchResults = await Promise.allSettled(
            batch.map(async (slug) => {
                const res = await fetch(`https://www.ycombinator.com/companies/${slug}`, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    },
                    signal: AbortSignal.timeout(10000),
                    cache: "no-store" as RequestCache,
                });
                if (!res.ok) return [];

                const html = await res.text();
                const dataPage = html.match(/data-page="([^"]+)"/);
                if (!dataPage) return [];

                const unescaped = dataPage[1].replace(/&quot;/g, '"');
                const parsed = JSON.parse(unescaped);
                const company = parsed.props?.company;
                const companyName = company?.name || slug;
                const rawJobs = parsed.props?.jobPostings || [];

                return rawJobs.map((j: {
                    title?: string;
                    url?: string;
                    applyUrl?: string;
                    location?: string;
                    prettyRole?: string;
                    roleSpecificType?: string;
                    salaryRange?: string;
                }) => ({
                    title: j.title?.trim() || "Software Engineer",
                    url: j.applyUrl || (j.url ? `https://www.ycombinator.com${j.url}` : `https://www.ycombinator.com/companies/${slug}`),
                    location: j.location || "Remote / Global",
                    department: j.prettyRole || j.roleSpecificType || "",
                    company: companyName,
                    backedBy: "Y Combinator",
                    salaryRange: j.salaryRange || "Competitive",
                })) as ScrapedJob[];
            })
        );

        for (const res of batchResults) {
            if (res.status === "fulfilled" && Array.isArray(res.value)) {
                for (const job of res.value) {
                    if (seenUrls.has(job.url)) continue;
                    seenUrls.add(job.url);
                    jobs.push(job);
                }
            }
        }
    }

    return jobs;
}

/**
 * Scrapes Y Combinator's dedicated jobs portal (Work at a Startup / YC Jobs).
 * Captures jobs from startups that list directly on YC rather than having separate career pages.
 */
async function scrapeYCJobBoard(): Promise<ScrapedJob[]> {
    try {
        const res = await fetch("https://www.workatastartup.com/jobs", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            signal: AbortSignal.timeout(15000),
            cache: "no-store" as RequestCache,
        });
        if (!res.ok) return [];

        const html = await res.text();
        const jobs: ScrapedJob[] = [];
        const seen = new Set<string>();

        // Match job links on Work at a Startup
        const jobRegex = /<a\s[^>]*href=["'](\/jobs\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = jobRegex.exec(html)) !== null) {
            const relHref = match[1];
            const text = match[2].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
            const fullUrl = `https://www.workatastartup.com${relHref}`;

            if (seen.has(fullUrl)) continue;
            seen.add(fullUrl);

            if (text.length >= 3 && text.length <= 100) {
                jobs.push({
                    title: text,
                    url: fullUrl,
                    company: "YC Startup",
                    backedBy: "Y Combinator",
                });
            }
        }

        return jobs;
    } catch {
        return [];
    }
}

/**
 * Scrapes Techstars' dedicated job board portal (jobs.techstars.com).
 */
async function scrapeTechstarsJobBoard(): Promise<ScrapedJob[]> {
    try {
        const res = await fetch("https://jobs.techstars.com/jobs", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            signal: AbortSignal.timeout(15000),
            cache: "no-store" as RequestCache,
        });
        if (!res.ok) return [];

        const html = await res.text();
        const jobs: ScrapedJob[] = [];
        const seen = new Set<string>();

        const jobRegex = /<a\s[^>]*href=["'](\/jobs\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = jobRegex.exec(html)) !== null) {
            const relHref = match[1];
            const text = match[2].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
            const fullUrl = `https://jobs.techstars.com${relHref}`;

            if (seen.has(fullUrl)) continue;
            seen.add(fullUrl);

            if (text.length >= 3 && text.length <= 100) {
                jobs.push({
                    title: text,
                    url: fullUrl,
                    company: "Techstars Startup",
                    backedBy: "Techstars",
                });
            }
        }

        return jobs;
    } catch {
        return [];
    }
}

/**
 * Scrapes all portfolio companies associated with a Venture Capital fund.
 * Uses a three-tier strategy:
 * 1. YC Company Directory direct crawling (e.g. Groww, PostHog, Retool, Deel, etc.)
 * 2. Dedicated VC Startup Job Boards (e.g. YC Work at a Startup, Techstars Job Board)
 * 3. Startup Directory & Direct Career Pages / ATS Boards
 */
export async function scrapeVCPortfolio(vcUrl: string, vcName: string): Promise<ScrapeResult> {
    const vcKey = matchVCKey(vcUrl, vcName);
    const allScrapedJobs: ScrapedJob[] = [];

    // Tier 1: Dedicated YC Company Directory Crawling
    if (vcKey === "ycombinator") {
        const ycDirectoryJobs = await scrapeYCDirectoryCompanies();
        allScrapedJobs.push(...ycDirectoryJobs);

        const hubJobs = await scrapeYCJobBoard();
        allScrapedJobs.push(...hubJobs);
    } else if (vcKey === "techstars") {
        const hubJobs = await scrapeTechstarsJobBoard();
        allScrapedJobs.push(...hubJobs);
    }

    // Tier 2: Check portfolio company ATS boards and career pages
    let targets: PortfolioTarget[] = [];
    if (vcKey && VC_PORTFOLIO_CATALOG[vcKey]) {
        targets = VC_PORTFOLIO_CATALOG[vcKey];
    } else {
        targets = await discoverPortfolioCompaniesFromHTML(vcUrl, vcName);
    }

    if (targets.length > 0) {
        // Concurrently scrape portfolio companies (batches of 4)
        for (let i = 0; i < targets.length; i += 4) {
            const batch = targets.slice(i, i + 4);
            const batchResults = await Promise.allSettled(
                batch.map(async (target) => {
                    const provider = target.atsProvider || detectATSProvider(target.url);
                    let result: ScrapeResult;
                    if (provider === "greenhouse") {
                        result = await scrapeGreenhouseJobs(target.url, target.company, vcName);
                    } else if (provider === "lever") {
                        result = await scrapeLeverJobs(target.url, target.company, vcName);
                    } else if (provider === "ashby") {
                        result = await scrapeAshbyJobs(target.url, target.company, vcName);
                    } else {
                        result = await scrapeGenericCareerPage(target.url, target.company, vcName);
                    }
                    return result.jobs;
                })
            );

            for (const res of batchResults) {
                if (res.status === "fulfilled" && Array.isArray(res.value)) {
                    allScrapedJobs.push(...res.value);
                }
            }
        }
    }

    return {
        jobs: allScrapedJobs,
        provider: "vc_portfolio",
        portfolioCompaniesChecked: targets.length + (vcKey === "ycombinator" ? YC_DIRECTORY_COMPANY_SLUGS.length : 0),
    };
}

async function discoverPortfolioCompaniesFromHTML(vcUrl: string, _vcName: string): Promise<PortfolioTarget[]> {
    try {
        const res = await fetch(vcUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            signal: AbortSignal.timeout(15000),
            cache: "no-store" as RequestCache,
        });
        if (!res.ok) return [];

        const html = await res.text();
        const targets: PortfolioTarget[] = [];
        const seen = new Set<string>();

        // Look for outbound links to external domains or ATS boards
        const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = linkRegex.exec(html)) !== null) {
            const href = match[1];
            const text = match[2].replace(/<[^>]+>/g, "").trim();

            if (href.startsWith("http") && !href.includes(new URL(vcUrl).hostname)) {
                if (seen.has(href)) continue;
                seen.add(href);

                // Detect ATS or potential company career link
                const provider = detectATSProvider(href);
                if (provider !== "generic" || href.includes("careers") || href.includes("jobs")) {
                    targets.push({
                        company: text || extractSlug(href) || "Portfolio Company",
                        url: href,
                        atsProvider: provider,
                    });
                }
            }
        }

        return targets.slice(0, 15);
    } catch {
        return [];
    }
}

// ─── Jobberman Nigeria Scraper ───────────────────────────────────────

export async function scrapeJobbermanJobs(url: string, companyName: string): Promise<ScrapeResult> {
    const targetUrls = [
        url.includes("jobberman.com") ? url : "https://www.jobberman.com/jobs/software-data",
        "https://www.jobberman.com/jobs/information-technology-telecoms"
    ];

    const jobs: ScrapedJob[] = [];
    const seen = new Set<string>();

    for (const targetUrl of targetUrls) {
        try {
            const res = await fetch(targetUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
                signal: AbortSignal.timeout(12000),
                cache: "no-store" as RequestCache,
            });

            if (!res.ok) continue;

            const html = await res.text();
            const linkMatches = [...html.matchAll(/<a[^>]*href="(https:\/\/www\.jobberman\.com\/listings\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

            for (const m of linkMatches) {
                const jobUrl = m[1];
                const text = m[2].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");

                if (!jobUrl || seen.has(jobUrl)) continue;
                if (!text || text.length < 4 || text.includes("Jobberman") || text.includes("View details")) continue;

                seen.add(jobUrl);

                // Attempt to infer location and company
                let location = "Lagos, Nigeria";
                if (html.includes("Remote")) location = "Lagos (Remote)";

                jobs.push({
                    title: text,
                    url: jobUrl,
                    company: "Jobberman Partner",
                    location,
                    department: "Engineering / Tech",
                    backedBy: "Jobberman Nigeria",
                    salaryRange: "Competitive (₦)",
                    datePosted: new Date().toISOString().split("T")[0],
                });
            }
        } catch {
            // Ignore single page failures
        }
    }

    return { jobs: jobs.slice(0, 25), provider: "jobberman" };
}

// ─── LinkedIn Nigeria Scraper (Guest API) ─────────────────────────────

export async function scrapeLinkedInNigeriaJobs(url: string, companyName: string): Promise<ScrapeResult> {
    const roles = ["Software Engineer", "Product Manager", "Product Designer", "Data Analyst", "Frontend Developer", "Backend Engineer"];
    const jobs: ScrapedJob[] = [];
    const seen = new Set<string>();

    for (const role of roles) {
        try {
            const apiUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(role)}&location=Nigeria&f_TPR=r604800`;
            const res = await fetch(apiUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
                signal: AbortSignal.timeout(10000),
                cache: "no-store" as RequestCache,
            });

            if (!res.ok) continue;

            const html = await res.text();
            // Match card elements
            const cardRegex = /<div class="base-card[\s\S]*?<\/div>\s*<\/li>/gi;
            const cards = html.match(cardRegex) || [];

            for (const card of cards) {
                const urlMatch = card.match(/<a class="base-card__full-link[^"]*"\s+href="([^"]+)"/);
                const titleMatch = card.match(/<h3 class="base-search-card__title">([\s\S]*?)<\/h3>/);
                const companyMatch = card.match(/<h4 class="base-search-card__subtitle">([\s\S]*?)<\/h4>/);
                const locationMatch = card.match(/<span class="job-search-card__location">([\s\S]*?)<\/span>/);
                const timeMatch = card.match(/<time[^>]*datetime="([^"]+)"/);

                if (!urlMatch || !titleMatch) continue;

                const jobUrl = urlMatch[1].split("?")[0];
                if (seen.has(jobUrl)) continue;
                seen.add(jobUrl);

                const title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
                const comp = companyMatch ? companyMatch[1].replace(/<[^>]+>/g, "").trim() : "Tech Employer";
                const loc = locationMatch ? locationMatch[1].replace(/<[^>]+>/g, "").trim() : "Lagos, Nigeria";
                const datePosted = timeMatch ? timeMatch[1] : new Date().toISOString().split("T")[0];

                jobs.push({
                    title,
                    url: jobUrl,
                    company: comp,
                    location: loc,
                    department: role,
                    backedBy: "LinkedIn Nigeria",
                    datePosted,
                });
            }
        } catch {
            // Ignore role failure
        }
    }

    return { jobs, provider: "linkedin" };
}

// ─── Wellfound (AngelList) Scraper ────────────────────────────────────

export async function scrapeWellfoundJobs(url: string, _companyName: string): Promise<ScrapeResult> {
    const jobs: ScrapedJob[] = [];
    const seen = new Set<string>();

    const targetUrls = [
        "https://wellfound.com/jobs",
        "https://wellfound.com/role/l/software-engineer/nigeria"
    ];

    for (const targetUrl of targetUrls) {
        try {
            const res = await fetch(targetUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
                signal: AbortSignal.timeout(12000),
                cache: "no-store" as RequestCache,
            });

            if (!res.ok) continue;

            const html = await res.text();
            const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);

            if (nextDataMatch) {
                try {
                    const data = JSON.parse(nextDataMatch[1]);
                    const apollo = data.props?.pageProps?.apolloState?.data || data.props?.pageProps?.apolloState || {};

                    for (const [_, v] of Object.entries<any>(apollo)) {
                        if (v && v.__typename === "JobListing" && v.title && v.id) {
                            const startupRef = v.startup?.__ref;
                            const startup = startupRef ? apollo[startupRef] : null;
                            const realCompanyName = startup?.name || "Tech Startup";
                            const companyLogo = startup?.logoUrl || startup?.avatarUrl || "";
                            const locations = v.locationNames || [];
                            const location = v.remote
                                ? (locations.length ? `${locations[0]} (Remote)` : "Remote")
                                : (locations[0] || "Remote");
                            const salary = v.compensation || "Competitive";
                            const fullUrl = `https://wellfound.com/jobs/${v.id}-${v.slug}`;
                            const datePosted = v.liveStartAt
                                ? new Date(v.liveStartAt * 1000).toISOString().split("T")[0]
                                : new Date().toISOString().split("T")[0];

                            if (seen.has(fullUrl)) continue;
                            seen.add(fullUrl);

                            jobs.push({
                                title: v.title,
                                company: realCompanyName,
                                companyLogo,
                                url: fullUrl,
                                location,
                                department: v.primaryRole?.slug || "Engineering",
                                backedBy: "Wellfound",
                                salaryRange: salary,
                                datePosted,
                            });
                        }
                    }
                } catch {
                    // Fallback to HTML matching
                }
            }

            if (jobs.length === 0) {
                const linkMatches = [...html.matchAll(/<a[^>]*href="(\/jobs\/\d+-[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

                for (const m of linkMatches) {
                    const relUrl = m[1];
                    const fullUrl = `https://wellfound.com${relUrl}`;
                    const title = m[2].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");

                    if (!fullUrl || seen.has(fullUrl)) continue;
                    if (!title || title.length < 3 || title.includes("Wellfound")) continue;

                    seen.add(fullUrl);

                    jobs.push({
                        title,
                        url: fullUrl,
                        company: "Tech Startup",
                        location: "Lagos, Nigeria (Remote)",
                        department: "Engineering",
                        backedBy: "Wellfound",
                        salaryRange: "Competitive (USD / ₦)",
                        datePosted: new Date().toISOString().split("T")[0],
                    });
                }
            }
        } catch {
            // Ignore
        }
    }

    return { jobs: jobs.slice(0, 30), provider: "wellfound" };
}

// ─── Indeed Nigeria Scraper ───────────────────────────────────────────

export async function scrapeIndeedNigeriaJobs(url: string, companyName: string): Promise<ScrapeResult> {
    const jobs: ScrapedJob[] = [];
    try {
        const targetUrl = "https://ng.indeed.com/jobs?q=software+developer&l=Nigeria&fromage=7";
        const res = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            signal: AbortSignal.timeout(10000),
            cache: "no-store" as RequestCache,
        });

        if (res.ok) {
            const html = await res.text();
            const titleMatches = [...html.matchAll(/<a[^>]*class="[^"]*jcs-JobTitle[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
            for (const m of titleMatches) {
                const jobPath = m[1];
                const title = m[2].replace(/<[^>]+>/g, "").trim();
                const fullUrl = jobPath.startsWith("http") ? jobPath : `https://ng.indeed.com${jobPath}`;
                jobs.push({
                    title,
                    url: fullUrl,
                    company: "Indeed Verified Employer",
                    location: "Nigeria",
                    backedBy: "Indeed Nigeria",
                    datePosted: new Date().toISOString().split("T")[0],
                });
            }
        }
    } catch {
        // Fallback gracefully
    }
    return { jobs, provider: "indeed" };
}

// ─── Glassdoor Nigeria Scraper ────────────────────────────────────────

export async function scrapeGlassdoorJobs(url: string, companyName: string): Promise<ScrapeResult> {
    const jobs: ScrapedJob[] = [];
    try {
        const targetUrl = "https://www.glassdoor.com/Job/nigeria-software-engineer-jobs-SRCH_IL.0,7_IN177_KO8,25.htm";
        const res = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            signal: AbortSignal.timeout(10000),
            cache: "no-store" as RequestCache,
        });
        if (res.ok) {
            const html = await res.text();
            const links = [...html.matchAll(/href="(\/job-listing\/[^"]+)"/gi)];
            for (const m of links.slice(0, 10)) {
                const fullUrl = `https://www.glassdoor.com${m[1]}`;
                jobs.push({
                    title: "Software Engineer",
                    url: fullUrl,
                    company: "Glassdoor Tech Employer",
                    location: "Lagos, Nigeria",
                    backedBy: "Glassdoor",
                    datePosted: new Date().toISOString().split("T")[0],
                });
            }
        }
    } catch {
        // Fallback gracefully
    }
    return { jobs, provider: "glassdoor" };
}

// ─── Main Orchestrator ────────────────────────────────────────────────

export async function scrapeCareerPage(
    url: string,
    companyName: string,
    sourceType?: "career_page" | "vc_portfolio" | "job_board",
    atsHint?: string
): Promise<ScrapeResult> {
    // If declared or detected as VC Portfolio
    if (sourceType === "vc_portfolio" || url.includes("/portfolio") || url.includes("/companies")) {
        return scrapeVCPortfolio(url, companyName);
    }

    const provider = atsHint || detectATSProvider(url);

    switch (provider) {
        case "greenhouse":
            return scrapeGreenhouseJobs(url, companyName);
        case "lever":
            return scrapeLeverJobs(url, companyName);
        case "ashby":
            return scrapeAshbyJobs(url, companyName);
        case "jobberman":
            return scrapeJobbermanJobs(url, companyName);
        case "linkedin":
            return scrapeLinkedInNigeriaJobs(url, companyName);
        case "wellfound":
            return scrapeWellfoundJobs(url, companyName);
        case "indeed":
            return scrapeIndeedNigeriaJobs(url, companyName);
        case "glassdoor":
            return scrapeGlassdoorJobs(url, companyName);
        default:
            return scrapeGenericCareerPage(url, companyName);
    }
}

// ─── Role Classification ──────────────────────────────────────────────

export function classifyRoleFamily(title: string, department?: string): string {
    const text = ((title || "") + " " + (department || "")).toLowerCase();

    // 0. Recruiter & HR roles must NEVER be matched as designers or engineers
    if (
        text.includes("recruit") ||
        text.includes("talent") ||
        text.includes("sourcer") ||
        text.includes("human resources") ||
        text.includes("hr ") ||
        text.includes("people ops") ||
        text.includes("people partner") ||
        text.includes("headhunter")
    ) {
        return "general";
    }

    // 1. Product Designer & UI/UX (use word boundaries, do NOT substring match "ui" in "recruiting")
    if (
        text.includes("design") ||
        text.includes("ui/ux") ||
        text.includes("ui-ux") ||
        text.includes("ux/") ||
        text.includes("/ux") ||
        /\bui\b/i.test(text) ||
        /\bux\b/i.test(text) ||
        text.includes("visual designer") ||
        text.includes("product design") ||
        text.includes("ux researcher") ||
        text.includes("design system") ||
        text.includes("interaction designer")
    ) {
        return "product_designer";
    }

    // 2. Product Manager (PM)
    if (
        text.includes("product manager") ||
        text.includes("product lead") ||
        text.includes("program manager") ||
        text.includes("product owner") ||
        text.includes("product ops") ||
        text.includes("technical product manager") ||
        text.includes("group product manager") ||
        text.includes("director of product") ||
        text.includes("head of product") ||
        text.includes("vp of product") ||
        text.includes("cpo")
    ) {
        return "product_manager";
    }

    // 3. Frontend Developer & Fullstack
    if (
        text.includes("frontend") ||
        text.includes("front-end") ||
        text.includes("fullstack") ||
        text.includes("full-stack") ||
        text.includes("full stack") ||
        text.includes("react") ||
        text.includes("vue") ||
        text.includes("angular") ||
        text.includes("web developer") ||
        text.includes("javascript developer")
    ) {
        return "frontend_developer";
    }

    // 4. Backend & Systems Infrastructure
    if (
        text.includes("backend") ||
        text.includes("back-end") ||
        text.includes("server") ||
        text.includes("infrastructure") ||
        text.includes("platform") ||
        text.includes("golang") ||
        text.includes("python") ||
        text.includes("java") ||
        text.includes("rust") ||
        text.includes("node") ||
        text.includes("devops") ||
        text.includes("sre") ||
        text.includes("reliability") ||
        text.includes("cloud engineer") ||
        text.includes("software engineer") ||
        text.includes("systems engineer")
    ) {
        return "backend_engineer";
    }

    // 5. Data Analyst & Scientist
    if (
        text.includes("data analyst") ||
        text.includes("data scientist") ||
        text.includes("analytics") ||
        text.includes("bi engineer") ||
        text.includes("machine learning") ||
        text.includes("ai engineer") ||
        /\bml\b/i.test(text) ||
        /\bdata\b/i.test(text)
    ) {
        return "data_analyst";
    }

    return "general";
}
