import type { JobItem } from "@/app/api/jobs/route";

export function formatShortLocation(loc: string): string {
    if (!loc || loc.toLowerCase() === "not specified") return "Remote";
    let cleaned = loc.trim();
    const isRemote = cleaned.toLowerCase().includes("remote");

    // Remove verbose country and filler words
    cleaned = cleaned
        .replace(/,\s*(United States|Nigeria|United Kingdom|Poland|Canada|Germany|South Africa|Kenya|Ghana|India|Australia)/gi, "")
        .replace(/\(remote\)/gi, "")
        .replace(/remote/gi, "")
        .replace(/hybrid/gi, "")
        .replace(/onsite/gi, "")
        .replace(/^[,\s·|/-]+|[,\s·|/-]+$/g, "")
        .trim();

    if (!cleaned) {
        return "Remote";
    }

    const parts = cleaned.split(/[,/·|]/).map(p => p.trim()).filter(Boolean);
    let result = parts.slice(0, 2).join(", ");

    if (isRemote && !result.toLowerCase().includes("remote")) {
        result = `${result} (Remote)`;
    }
    return result;
}

export function getDomainForCompany(company: string, url?: string): string {
    const c = (company || "").trim().toLowerCase();
    const knownDomains: Record<string, string> = {
        piggyvest: "piggyvest.com",
        bamboo: "investbamboo.com",
        spacex: "spacex.com",
        paystack: "paystack.com",
        moniepoint: "moniepoint.com",
        flutterwave: "flutterwave.com",
        kuda: "kudabank.com",
        interswitch: "interswitchgroup.com",
        andela: "andela.com",
        nomba: "nomba.com",
        jumia: "jumia.com",
        helium: "heliumhealth.com",
        stripe: "stripe.com",
        openai: "openai.com",
        notion: "notion.so",
        linear: "linear.app",
        vercel: "vercel.com",
        anthropic: "anthropic.com",
        google: "google.com",
        microsoft: "microsoft.com",
        apple: "apple.com",
        scale: "scale.com",
        flexport: "flexport.com",
        retool: "retool.com",
        figma: "figma.com",
        canva: "canva.com",
        spotify: "spotify.com",
        netflix: "netflix.com",
        airbnb: "airbnb.com",
        uber: "uber.com",
    };
    for (const [k, d] of Object.entries(knownDomains)) {
        if (c.includes(k)) return d;
    }
    if (url) {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
            if (!host.includes("greenhouse.io") && !host.includes("lever.co") && !host.includes("ashbyhq.com") && !host.includes("workable.com") && !host.includes("seamlesshiring.com")) {
                return host;
            }
            const parts = parsed.pathname.split("/").filter(Boolean);
            if (parts[0] && (host.includes("greenhouse") || host.includes("lever") || host.includes("ashby"))) {
                return `${parts[0]}.com`;
            }
        } catch {
            // Ignore
        }
    }
    return c.replace(/[^a-z0-9]/g, "") + ".com";
}

export function formatJobMeta(job: JobItem) {
    let timeString = "2 days ago";
    if (job.datePosted) {
        const posted = new Date(job.datePosted).getTime();
        const now = Date.now();
        const diffMinutes = Math.max(1, Math.floor((now - posted) / (1000 * 60)));
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMinutes < 60) {
            timeString = `${diffMinutes} minutes ago`;
        } else if (diffHours < 24) {
            timeString = `${diffHours} hours ago`;
        } else if (diffDays === 1) {
            timeString = "1 day ago";
        } else if (diffDays < 30) {
            timeString = `${diffDays} days ago`;
        } else {
            timeString = `${Math.floor(diffDays / 30)} months ago`;
        }
    }
    const shortLocation = formatShortLocation(job.location);
    return `${job.company} · ${shortLocation} · ${timeString}`;
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

/**
 * Strips verbose extensions after a dash from job titles and decodes any HTML entities.
 * e.g., "Head of Growth &amp; Strategy" -> "Head of Growth & Strategy"
 *       "Product Manager - Payments & Growth" -> "Product Manager"
 *       "Country Manager - Nigeria" -> "Country Manager"
 * Preserves compound words like "Full-stack".
 */
export function cleanJobTitle(rawTitle: string): string {
    if (!rawTitle) return "";
    const decoded = decodeHtmlEntities(rawTitle);
    const parts = decoded.split(/\s+[-–—]\s*|\s*[-–—]\s+/);
    const cleaned = parts[0]?.trim();
    return cleaned || decoded.trim();
}

/**
 * Derives a consistent, canonical set of key responsibilities for a job item
 * so both the Job Description modal and the Interview Setup modal use the exact same rubric.
 */
export function deriveJobResponsibilities(job: {
    responsibilities?: string[];
    description?: string;
    title?: string;
    roleFamily?: string;
}): string[] {
    if (Array.isArray(job.responsibilities) && job.responsibilities.length > 0) {
        return job.responsibilities.map((r) => String(r).trim()).filter(Boolean);
    }
    if (job.description && job.description.trim().length > 20) {
        let derived = job.description.split(/\n|•/).map((s) => s.trim()).filter((s) => s.length > 14);
        if (derived.length <= 1) {
            derived = job.description.split(/\. /).map((s) => s.trim()).filter((s) => s.length > 18).slice(0, 5);
        }
        if (derived.length > 0) return derived.slice(0, 5);
    }
    const r = (job.title || "").toLowerCase();
    if (r.includes("product")) {
        return [
            "Define product strategy and roadmaps",
            "Drive feature delivery from discovery to launch",
            "Analyze user metrics and engagement",
            "Align cross-functional stakeholders",
        ];
    }
    if (r.includes("engineer") || r.includes("developer") || r.includes("swe")) {
        return [
            "Build scalable applications and services",
            "Write clean maintainable code and unit tests",
            "Optimize performance and latency",
            "Collaborate with product and design",
        ];
    }
    if (r.includes("design") || r.includes("ui") || r.includes("ux")) {
        return [
            "Design intuitive user journeys, wireframes and prototypes",
            "Maintain and scale design system components",
            "Conduct user research and usability audits",
            "Partner with engineering on design specs",
        ];
    }
    if (r.includes("devops") || r.includes("sre") || r.includes("cloud")) {
        return [
            "Build and maintain automated CI/CD pipelines",
            "Manage containerized infrastructure on Kubernetes/Cloud",
            "Ensure system reliability, uptime and monitoring",
            "Enforce infrastructure security and scalability",
        ];
    }
    return [
        "Deliver key functional objectives and projects",
        "Cross-functional collaboration and stakeholder alignment",
        "Track performance metrics and operational standards",
    ];
}

/**
 * Stable client cache key generator for Resume <-> Role match results.
 */
export function getJobMatchCacheKey(
    resumeText: string,
    jobTitle: string,
    jobCompany: string,
    responsibilities: string[]
): string {
    const textSample = (resumeText || "").trim().slice(0, 2000).replace(/\s+/g, " ");
    const t = (jobTitle || "").toLowerCase().trim();
    const c = (jobCompany || "").toLowerCase().trim();
    const r = (responsibilities || []).map((s) => s.toLowerCase().trim()).join("|");
    return `${t}:::${c}:::${r}:::${textSample.length}:::${textSample.slice(0, 80)}`;
}

// In-memory client cache shared across modals during the session
const clientMatchCache: Record<string, any> = {};

export function getCachedJobMatch(key: string): any | null {
    if (!key) return null;
    if (clientMatchCache[key]) return clientMatchCache[key];
    if (typeof window !== "undefined") {
        try {
            const stored = sessionStorage.getItem(`useladder_jm_${key}`);
            if (stored) {
                const parsed = JSON.parse(stored);
                clientMatchCache[key] = parsed;
                return parsed;
            }
        } catch {}
    }
    return null;
}

export function setCachedJobMatch(key: string, data: any): void {
    if (!key || !data) return;
    clientMatchCache[key] = data;
    if (typeof window !== "undefined") {
        try {
            sessionStorage.setItem(`useladder_jm_${key}`, JSON.stringify(data));
        } catch {}
    }
}


