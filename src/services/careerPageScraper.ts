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
    const cleanTitle = decodeHtmlEntities(title || "Professional").trim();
    const cleanCompany = decodeHtmlEntities(company || "the organization").trim();
    const loc = location && location !== "Not specified" ? ` in ${location}` : "";
    const fam = roleFamily || classifyRoleFamily(cleanTitle);

    switch (fam) {
        case "frontend_developer":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will architect, build, and maintain highly responsive, accessible user interfaces and web applications. You will collaborate closely with product managers and designers to translate user workflows into performant client experiences, champion frontend performance optimization, and establish scalable design system component standards.`;
        case "devops_sre":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will architect, automate, and scale resilient cloud infrastructure, CI/CD deployment pipelines, and observability stacks. You will champion site reliability engineering (SRE) best practices, optimize container orchestration with Kubernetes, manage multi-region cloud networks, and ensure 99.99% system availability and security.`;
        case "backend_engineer":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will design, scale, and maintain high-throughput backend services, distributed systems, and core API infrastructures. You will implement robust data pipelines, optimize database performance, ensure high availability and security, and collaborate across engineering squads to power mission-critical product features.`;
        case "product_manager":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will lead cross-functional product strategy from discovery through delivery. You will define product roadmaps, conduct customer research, align engineering and design teams around high-impact OKRs, and leverage product analytics to drive user retention, adoption, and business growth.`;
        case "ui_designer":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will craft intuitive, accessible, and pixel-perfect user interfaces across web and mobile surfaces. You will architect robust design systems, establish design tokens and component guidelines in Figma, collaborate closely with frontend engineers during handoff, and elevate visual craft through typography, layout, micro-interactions, and visual hierarchy.`;
        case "product_designer":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will drive user experience and interface design across the product lifecycle. You will conduct user research and usability testing, build interactive prototypes, and partner closely with engineers to deliver intuitive, pixel-perfect digital experiences.`;
        case "product_marketer":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will spearhead go-to-market strategy, product positioning, and messaging. You will conduct competitive market intelligence, orchestrate cross-channel launch campaigns, and partner with sales and product teams to drive user acquisition, engagement, and market adoption.`;
        case "data_analyst":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will uncover data-driven insights to guide product and business decisions. You will build automated dashboards, develop predictive models, design A/B testing frameworks, and partner with leadership to translate complex data into actionable operational strategies.`;
        case "business_analyst":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will bridge the gap between business objectives and technology solutions. You will gather business requirements, evaluate workflows, formulate data-backed process improvements, and partner with cross-functional stakeholders to optimize operational efficiency.`;
        case "banking_finance":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will drive financial modeling, fiscal planning, and strategic investment analysis. You will manage financial reporting, conduct valuation and risk assessments, ensure regulatory compliance, and deliver actionable fiscal insights to executive decision-makers.`;
        case "sales":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will drive revenue growth and commercial pipeline expansion. You will identify target enterprise accounts, build strategic client relationships, conduct solution presentations, negotiate agreements, and consistently deliver against ambitious revenue milestones.`;
        case "customer_service":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will serve as the primary customer champion and brand ambassador. You will manage customer inquiries, troubleshoot issues with empathy and precision, improve service level agreements, and collaborate with operations to elevate overall client satisfaction.`;
        case "virtual_assistant":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will deliver high-level executive and operational administrative support. You will manage complex calendar schedules, coordinate correspondence and documentation, organize meetings, and streamline workflows to ensure smooth organizational operations.`;
        case "oil_gas":
            return `As a ${cleanTitle} at ${cleanCompany}${loc}, you will contribute to critical energy operations, technical maintenance, and HSE compliance protocols. You will oversee operational integrity, ensure adherence to stringent safety and environmental regulations, optimize field production workflows, and partner with multidisciplinary energy teams.`;
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
            headers: { "User-Agent": "GetPrepped-CareerScraper/1.0" },
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
            headers: { "User-Agent": "GetPrepped-CareerScraper/1.0" },
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
    jobUrl?: string;
    applyUrl?: string;
    location?: string;
    department?: string;
    departmentName?: string;
    team?: string;
    teamName?: string;
    publishedDate?: string;
    publishedAt?: string;
}

interface AshbyApiResponse {
    success?: boolean;
    results?: AshbyJobPosting[];
    jobs?: AshbyJobPosting[];
}

export async function scrapeAshbyJobs(url: string, companyName: string, backedBy?: string): Promise<ScrapeResult> {
    const slug = extractSlug(url);
    if (!slug) return { jobs: [], provider: "ashby", error: "Could not extract board slug from URL" };

    const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${slug}`;

    try {
        const res = await fetch(apiUrl, {
            headers: { "User-Agent": "GetPrepped-CareerScraper/1.0" },
            signal: AbortSignal.timeout(15000),
            cache: "no-store" as RequestCache,
        });

        if (!res.ok) {
            return { jobs: [], provider: "ashby", error: `API returned ${res.status}` };
        }

        const data: AshbyApiResponse = await res.json();
        const postings = data.jobs || data.results || [];

        const jobs: ScrapedJob[] = postings.map((p) => {
            const rawDate = p.publishedAt || p.publishedDate;
            const datePosted = rawDate ? rawDate.split("T")[0] : new Date().toISOString().split("T")[0];
            return {
                title: p.title,
                url: p.jobUrl || p.applyUrl || `https://jobs.ashbyhq.com/${slug}/${p.id}`,
                location: p.location || "Not specified",
                department: p.department || p.departmentName || p.team || p.teamName || "",
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

interface JobbermanCategory {
    slug: string;
    url: string;
    department: string;
}

const JOBBERMAN_CATEGORIES: JobbermanCategory[] = [
    { slug: "software-data", url: "https://www.jobberman.com/jobs/software-data", department: "Software Engineering & Data" },
    { slug: "admin-office", url: "https://www.jobberman.com/jobs/admin-office", department: "Administrative & Office Support" },
    { slug: "customer-service-support", url: "https://www.jobberman.com/jobs/customer-service-support", department: "Customer Service & Support" },
    { slug: "sales", url: "https://www.jobberman.com/jobs/sales", department: "Sales & Commercial" },
    { slug: "accounting-auditing-finance", url: "https://www.jobberman.com/jobs/accounting-auditing-finance", department: "Banking & Finance" },
    { slug: "engineering", url: "https://www.jobberman.com/jobs/engineering", department: "Engineering & Energy" },
    { slug: "product-project-management", url: "https://www.jobberman.com/jobs/product-project-management", department: "Product Management" },
    { slug: "marketing-communications", url: "https://www.jobberman.com/jobs/marketing-communications", department: "Product Marketing" },
    { slug: "information-technology-telecoms", url: "https://www.jobberman.com/jobs/information-technology-telecoms", department: "IT & Telecommunications" },
];

export async function scrapeJobbermanJobs(url: string, companyName: string): Promise<ScrapeResult> {
    // If query in URL, scrape that search URL directly; otherwise match category or scrape all
    let targetCategories: JobbermanCategory[];
    if (url.includes("q=") || url.includes("?")) {
        const qMatch = url.match(/[?&]q=([^&]+)/);
        const queryLabel = qMatch ? decodeURIComponent(qMatch[1]) : "Search";
        targetCategories = [{
            slug: "search",
            url: url,
            department: queryLabel.toLowerCase().includes("devops") || queryLabel.toLowerCase().includes("cloud") || queryLabel.toLowerCase().includes("sre")
                ? "DevOps & Infrastructure"
                : "Technology & Services",
        }];
    } else {
        targetCategories = JOBBERMAN_CATEGORIES.filter((c) => url.includes(c.slug));
        if (targetCategories.length === 0) {
            targetCategories = JOBBERMAN_CATEGORIES;
        }
    }

    const jobs: ScrapedJob[] = [];
    const seen = new Set<string>();

    for (const cat of targetCategories) {
        try {
            const res = await fetch(cat.url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
                signal: AbortSignal.timeout(12000),
                cache: "no-store" as RequestCache,
            });

            if (!res.ok) continue;

            const html = await res.text();
            // Primary parse: match listing-title-link anchors and trailing card context
            const cardRegex = /<a[^>]*href="(https:\/\/www\.jobberman\.com\/listings\/[^"]+)"[^>]*data-cy="listing-title-link"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/a>([\s\S]*?)(?=<a[^>]*data-cy="listing-title-link"|$)/gi;
            let match: RegExpExecArray | null;
            let foundInCat = 0;

            while ((match = cardRegex.exec(html)) !== null) {
                const jobUrl = match[1];
                const rawTitle = match[2];
                const cardBody = match[3];

                if (!jobUrl || seen.has(jobUrl)) continue;
                const cleanTitle = decodeHtmlEntities(rawTitle.replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " "));
                if (!cleanTitle || cleanTitle.length < 3 || cleanTitle.includes("Jobberman") || cleanTitle.includes("View details")) continue;

                seen.add(jobUrl);

                // Extract company name if present in card
                const compMatch = cardBody.match(/<p[^>]*class="[^"]*text-blue-700[^"]*"[^>]*>([\s\S]*?)<\/p>/);
                let company = compMatch ? decodeHtmlEntities(compMatch[1].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ")) : "";
                if (!company || company.toLowerCase().includes("anonymous")) {
                    company = "Jobberman Verified Employer";
                }

                // Extract location if present in card
                const locMatch = cardBody.match(/<span[^>]*class="[^"]*bg-brand-secondary-100[^"]*"[^>]*>([\s\S]*?)<\/span>/);
                let location = locMatch ? decodeHtmlEntities(locMatch[1].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ")) : "Nigeria";
                if (location.toLowerCase().includes("remote") || html.includes("Remote (Work From Home)")) {
                    location = location.includes("Remote") ? location : `${location} (Remote)`;
                }

                jobs.push({
                    title: cleanTitle,
                    url: jobUrl,
                    company,
                    location,
                    department: cat.department,
                    backedBy: "Jobberman Nigeria",
                    salaryRange: "Competitive (₦)",
                    datePosted: new Date().toISOString().split("T")[0],
                });
                foundInCat++;
            }

            // Fallback parse: broad anchor matching if card structure slightly shifted
            if (foundInCat === 0) {
                const linkMatches = [...html.matchAll(/<a[^>]*href="(https:\/\/www\.jobberman\.com\/listings\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
                for (const m of linkMatches) {
                    const jobUrl = m[1];
                    const text = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " "));

                    if (!jobUrl || seen.has(jobUrl)) continue;
                    if (!text || text.length < 4 || text.includes("Jobberman") || text.includes("View details")) continue;

                    seen.add(jobUrl);

                    let location = "Lagos, Nigeria";
                    if (html.includes("Remote")) location = "Lagos (Remote)";

                    jobs.push({
                        title: text,
                        url: jobUrl,
                        company: "Jobberman Partner",
                        location,
                        department: cat.department,
                        backedBy: "Jobberman Nigeria",
                        salaryRange: "Competitive (₦)",
                        datePosted: new Date().toISOString().split("T")[0],
                    });
                }
            }
        } catch {
            // Ignore single page failures
        }
    }

    return { jobs, provider: "jobberman" };
}

// ─── LinkedIn Nigeria Scraper (Guest API) ─────────────────────────────

interface LinkedInRoleQuery {
    query: string;
    department: string;
}

const LINKEDIN_ROLE_QUERIES: LinkedInRoleQuery[] = [
    // Tech & Engineering
    { query: "Software Engineer", department: "Software Engineering" },
    { query: "Frontend Developer", department: "Frontend Developer" },
    { query: "Backend Engineer", department: "Backend Engineer" },
    { query: "Full Stack Developer", department: "Software Engineering" },
    { query: "DevOps Engineer", department: "DevOps / Infrastructure" },
    { query: "Site Reliability Engineer", department: "DevOps / Infrastructure" },
    { query: "Cloud Solutions Architect", department: "DevOps / Infrastructure" },
    { query: "Cloud Engineer", department: "DevOps / Infrastructure" },
    { query: "Infrastructure Engineer", department: "DevOps / Infrastructure" },
    { query: "Platform Engineer", department: "DevOps / Infrastructure" },
    { query: "Systems Administrator", department: "DevOps / Infrastructure" },

    // Product & Design
    { query: "Product Manager", department: "Product Management" },
    { query: "Product Designer", department: "Product Design" },
    { query: "UI Designer", department: "UI Design" },
    { query: "UI UX Designer", department: "UI Design" },
    { query: "Product Marketing Manager", department: "Product Marketing" },

    // Data & Operations
    { query: "Data Analyst", department: "Data & Analytics" },
    { query: "Data Scientist", department: "Data Science" },
    { query: "Business Analyst", department: "Business & Operations" },

    // Admin & Support
    { query: "Virtual Assistant", department: "Administrative & Support" },
    { query: "Executive Assistant", department: "Administrative & Support" },
    { query: "Customer Service Representative", department: "Customer Service & Support" },

    // Commercial & Finance
    { query: "Sales Representative", department: "Sales & Commercial" },
    { query: "Account Executive", department: "Sales & Commercial" },
    { query: "Financial Analyst", department: "Banking & Finance" },
    { query: "Investment Banker", department: "Banking & Finance" },

    // Energy & Safety
    { query: "Oil and Gas Engineer", department: "Engineering — Oil & Gas" },
    { query: "Petroleum Engineer", department: "Engineering — Oil & Gas" },
    { query: "Safety Officer HSE", department: "HSE / Safety Officer" },
    { query: "HSE Officer", department: "HSE / Safety Officer" },
];

export async function scrapeLinkedInNigeriaJobs(url: string, companyName: string): Promise<ScrapeResult> {
    // If a specific keyword was passed in the URL, extract it; otherwise query all role families
    const kwMatch = url.match(/keywords=([^&]+)/);
    let targetQueries: LinkedInRoleQuery[] = LINKEDIN_ROLE_QUERIES;
    if (kwMatch && kwMatch[1]) {
        const decoded = decodeURIComponent(kwMatch[1]).replace(/\+/g, " ").trim();
        // If it's not the generic default or has specific intent, filter or query that keyword
        if (decoded && decoded !== "Software Engineer" && decoded !== "jobs") {
            const found = LINKEDIN_ROLE_QUERIES.find((q) => q.query.toLowerCase() === decoded.toLowerCase());
            targetQueries = found ? [found] : [{ query: decoded, department: decoded }];
        }
    }

    const jobs: ScrapedJob[] = [];
    const seen = new Set<string>();

    // Chunk queries into concurrent groups of 4 for speed & reliability
    const chunks: LinkedInRoleQuery[][] = [];
    for (let i = 0; i < targetQueries.length; i += 4) {
        chunks.push(targetQueries.slice(i, i + 4));
    }

    for (const chunk of chunks) {
        await Promise.allSettled(
            chunk.map(async ({ query, department }) => {
                try {
                    const apiUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(query)}&location=Nigeria&f_TPR=r2592000`;
                    const res = await fetch(apiUrl, {
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        },
                        signal: AbortSignal.timeout(10000),
                        cache: "no-store" as RequestCache,
                    });

                    if (!res.ok) return;

                    const html = await res.text();
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

                        const title = decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, "").trim());
                        const comp = companyMatch ? decodeHtmlEntities(companyMatch[1].replace(/<[^>]+>/g, "").trim()) : "Tech Employer";
                        const loc = locationMatch ? decodeHtmlEntities(locationMatch[1].replace(/<[^>]+>/g, "").trim()) : "Lagos, Nigeria";
                        const datePosted = timeMatch ? timeMatch[1] : new Date().toISOString().split("T")[0];

                        jobs.push({
                            title,
                            url: jobUrl,
                            company: comp,
                            location: loc,
                            department,
                            backedBy: "LinkedIn Nigeria",
                            datePosted,
                        });
                    }
                } catch {
                    // Ignore single query failures
                }
            })
        );
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

    // 1. Oil & Gas / Energy & HSE (must be evaluated BEFORE generic "engineer")
    const isSalesOrTalentPipeline =
        text.includes("sales pipeline") ||
        text.includes("talent pipeline") ||
        text.includes("hiring pipeline") ||
        text.includes("outbound") ||
        text.includes("sales development") ||
        text.includes("sdr") ||
        text.includes("bdr");

    if (
        !isSalesOrTalentPipeline &&
        (text.includes("oil & gas") ||
        text.includes("oil and gas") ||
        text.includes("petroleum") ||
        text.includes("drilling") ||
        text.includes("reservoir") ||
        (text.includes("pipeline") && !text.includes("sales") && !text.includes("talent")) ||
        text.includes("subsea") ||
        text.includes("geoscientist") ||
        text.includes("geologist") ||
        text.includes("hse") ||
        text.includes("safety officer") ||
        text.includes("solids control") ||
        text.includes("offshore") ||
        text.includes("refinery") ||
        text.includes("upstream") ||
        text.includes("downstream") ||
        text.includes("engineering — oil") ||
        text.includes("engineering - oil"))
    ) {
        return "oil_gas";
    }

    // 2. Virtual Assistant & Administrative Support
    if (
        text.includes("virtual assistant") ||
        text.includes("executive assistant") ||
        text.includes("administrative assistant") ||
        text.includes("administrative coordinator") ||
        text.includes("administrative business partner") ||
        text.includes("administrative officer") ||
        text.includes("office assistant") ||
        text.includes("personal assistant") ||
        text.includes("admin assistant") ||
        text.includes("secretary") ||
        text.includes("office administrator") ||
        text.includes("data entry")
    ) {
        return "virtual_assistant";
    }

    // 3. Customer Service & Support
    if (
        text.includes("customer service") ||
        text.includes("customer support") ||
        text.includes("call centre") ||
        text.includes("call center") ||
        text.includes("customer experience") ||
        text.includes("client support") ||
        text.includes("client relations") ||
        text.includes("customer care") ||
        text.includes("helpdesk") ||
        text.includes("appointment setter") ||
        text.includes("cold caller")
    ) {
        return "customer_service";
    }

    // 4. Banking & Finance
    if (
        text.includes("investment banker") ||
        text.includes("investment banking") ||
        text.includes("financial analyst") ||
        text.includes("finance analyst") ||
        text.includes("fp&a") ||
        text.includes("banking & finance") ||
        text.includes("banking and finance") ||
        text.includes("banking") ||
        text.includes("accountant") ||
        text.includes("accounting") ||
        text.includes("auditor") ||
        text.includes("auditing") ||
        text.includes("treasury") ||
        text.includes("credit risk") ||
        (text.includes("finance") && !text.includes("engineer"))
    ) {
        return "banking_finance";
    }

    // 5. Sales & Business Development
    if (
        text.includes("business development") ||
        text.includes("account executive") ||
        text.includes("sales representative") ||
        text.includes("sales executive") ||
        text.includes("direct sales") ||
        text.includes("field sales") ||
        text.includes("bizdev") ||
        text.includes("biz dev") ||
        (text.includes("sales") && !text.includes("salesforce"))
    ) {
        return "sales";
    }

    // 6. Business Analyst
    if (
        text.includes("business analyst") ||
        text.includes("business analysis") ||
        text.includes("functional analyst") ||
        text.includes("business operations") ||
        text.includes("business strategy") ||
        text.includes("operations analyst") ||
        text.includes("erp specialist")
    ) {
        return "business_analyst";
    }

    // 7. Product Marketer
    if (
        text.includes("product marketer") ||
        text.includes("product marketing") ||
        text.includes("growth marketing") ||
        text.includes("growth manager") ||
        text.includes("brand and marketing") ||
        text.includes("marketing manager") ||
        text.includes("digital marketing") ||
        text.includes("marketing communication")
    ) {
        return "product_marketer";
    }

    // 8a. UI Designer (visual UI, design systems, interface design)
    const isNonDigitalDesign =
        text.includes("food designer") ||
        text.includes("fashion designer") ||
        text.includes("interior designer") ||
        text.includes("floral designer");

    if (
        !isNonDigitalDesign &&
        (text.includes("ui designer") ||
        text.includes("ui design") ||
        text.includes("ui/ux designer") ||
        text.includes("ui-ux designer") ||
        text.includes("ui / ux designer") ||
        text.includes("user interface designer") ||
        text.includes("visual designer") ||
        text.includes("design system") ||
        text.includes("design systems") ||
        text.includes("interaction designer"))
    ) {
        return "ui_designer";
    }

    // 8b. Product Designer & UX
    if (
        !isNonDigitalDesign &&
        (text.includes("product design") ||
        text.includes("product designer") ||
        text.includes("ux designer") ||
        text.includes("ux researcher") ||
        text.includes("ux/") ||
        text.includes("/ux") ||
        /\bux\b/i.test(text) ||
        text.includes("design"))
    ) {
        return "product_designer";
    }

    // 9. Product Manager (PM)
    const isPhysicalPM =
        text.includes("construction") ||
        text.includes("facilities") ||
        text.includes("civil") ||
        text.includes("mechanical") ||
        text.includes("hardware") ||
        text.includes("land development");

    if (
        !isPhysicalPM &&
        (text.includes("product manager") ||
        text.includes("product management") ||
        text.includes("product lead") ||
        text.includes("program manager") ||
        text.includes("product owner") ||
        text.includes("product ops") ||
        text.includes("technical product manager") ||
        text.includes("group product manager") ||
        text.includes("director of product") ||
        text.includes("head of product") ||
        text.includes("vp of product") ||
        text.includes("cpo") ||
        text.includes("scrum master") ||
        text.includes("project manager"))
    ) {
        return "product_manager";
    }

    // 10. Data Analyst & Scientist
    if (
        text.includes("data analyst") ||
        text.includes("data scientist") ||
        text.includes("analytics") ||
        text.includes("bi engineer") ||
        text.includes("machine learning") ||
        text.includes("ai engineer") ||
        text.includes("data engineer") ||
        /\bml\b/i.test(text) ||
        /\bdata\b/i.test(text)
    ) {
        return "data_analyst";
    }

    // 11. Frontend Developer & Mobile
    if (
        text.includes("frontend") ||
        text.includes("front-end") ||
        text.includes("react") ||
        text.includes("vue") ||
        text.includes("angular") ||
        text.includes("web developer") ||
        text.includes("javascript developer") ||
        text.includes("android") ||
        text.includes("ios") ||
        text.includes("mobile developer") ||
        text.includes("mobile engineer") ||
        text.includes("flutter") ||
        text.includes("swift") ||
        text.includes("kotlin") ||
        text.includes("ui engineer")
    ) {
        return "frontend_developer";
    }

    // 12. DevOps, SRE, Cloud & Platform Infrastructure (must be evaluated BEFORE generic backend_engineer)
    const isPhysicalInfra =
        text.includes("civil") ||
        text.includes("construction") ||
        text.includes("facilities") ||
        text.includes("structural") ||
        text.includes("mechanical") ||
        text.includes("land development") ||
        text.includes("hardware");

    if (
        !isPhysicalInfra &&
        (text.includes("devops") ||
        text.includes("sre") ||
        text.includes("site reliability") ||
        text.includes("cloud") ||
        text.includes("infrastructure") ||
        text.includes("platform engineer") ||
        text.includes("kubernetes") ||
        text.includes("system administrator") ||
        text.includes("systems administrator") ||
        text.includes("linux administrator") ||
        text.includes("server administrator") ||
        text.includes("devsecops") ||
        text.includes("ci/cd") ||
        text.includes("reliability engineer") ||
        text.includes("release engineer") ||
        text.includes("solutions architect"))
    ) {
        return "devops_sre";
    }

    // 13. Backend & Systems Infrastructure
    if (
        text.includes("backend") ||
        text.includes("back-end") ||
        text.includes("fullstack") ||
        text.includes("full-stack") ||
        text.includes("full stack") ||
        text.includes("server") ||
        text.includes("golang") ||
        text.includes("python") ||
        text.includes("java") ||
        text.includes("rust") ||
        text.includes("node") ||
        text.includes("software engineer") ||
        text.includes("systems engineer") ||
        text.includes("programmer") ||
        text.includes("architect") ||
        text.includes("developer") ||
        text.includes("engineer")
    ) {
        return "backend_engineer";
    }

    return "general";
}
