/* ══════════════════════════════════════
   Opening question — a warm-up that fits
   the candidate's role and the round they
   picked, asked before any bank question.
   Fixed lines, so each is recorded once
   and plays instantly; rounds with no
   fixed line get one written by the LLM,
   stored and reused from then on.
   ══════════════════════════════════════ */

import { callJSON } from "./llm";
import { normalizeUserRoleFamily } from "@/utils/locationDetector";

interface RoundOpener {
    /** The round's title as the dashboard shows it. */
    title: string;
    /** How the interviewer names the round out loud. */
    focus: string;
    opener: string;
}

interface FamilyOpeners {
    /** Role name used when the candidate's own isn't known (and for pre-recording). */
    label: string;
    /** For rounds that are just the role ("Product Manager Interview"). */
    general: string;
    rounds: RoundOpener[];
}

export const FALLBACK_OPENER = "Tell me about yourself and what drew you to this role.";

/** Engineering-style rounds, shared by every family the dashboard shows them to. */
function engineeringRounds(lines: [string, string, string, string]): RoundOpener[] {
    return [
        { title: "Technical Interview", focus: "technical skills", opener: lines[0] },
        { title: "Behavioral Interview", focus: "behavioral questions", opener: lines[1] },
        { title: "System Design", focus: "system design", opener: lines[2] },
        { title: "Skills Assessment", focus: "your core skills", opener: lines[3] },
    ];
}

export const OPENERS: Record<string, FamilyOpeners> = {
    product_manager: {
        label: "Product Manager",
        general: "Tell me about yourself and what drew you to product management.",
        rounds: [
            { title: "Product Sense & Strategy", focus: "product sense and strategy", opener: "Tell me about a product you love, and one thing you'd change about it." },
            { title: "Behavioral & Leadership", focus: "behavior and leadership", opener: "Tell me about yourself and the kind of product leader you are." },
            { title: "Execution & Metrics", focus: "execution and metrics", opener: "Walk me through a product you've worked on and how you knew whether it was succeeding." },
            { title: "User Journey & Discovery", focus: "user journeys and discovery", opener: "Tell me about a time you learned something from users that changed what you built." },
        ],
    },
    product_designer: {
        label: "Product Designer",
        general: "Tell me about yourself and what drew you to product design.",
        rounds: [
            { title: "Portfolio Deep Dive & Critique", focus: "a deep dive into your portfolio", opener: "Walk me through the project in your portfolio you're proudest of, and why." },
            { title: "Design Leadership & Collaboration", focus: "design leadership and collaboration", opener: "Tell me about yourself and how you like to work with product and engineering." },
            { title: "Design Systems & Interaction", focus: "design systems and interaction", opener: "Tell me about a design system or set of patterns you've built or relied on." },
            { title: "User Research & Testing", focus: "user research and testing", opener: "Tell me about a piece of research that changed a design decision you'd made." },
        ],
    },
    ui_designer: {
        label: "UI Designer",
        general: "Tell me about yourself and what drew you to UI design.",
        rounds: [
            { title: "Visual Design & UI Critique", focus: "visual design and UI critique", opener: "Tell me about an interface you think is beautifully designed, and what makes it work." },
            { title: "Design Systems & Component Tokens", focus: "design systems and component tokens", opener: "Walk me through how you've organized components or tokens on a past project." },
            { title: "Interaction & Micro-Animations", focus: "interaction and micro-animations", opener: "Tell me about a small interaction or animation you designed that made a big difference." },
            { title: "Design-to-Code Handoff & Collab", focus: "design handoff and collaboration with engineers", opener: "Tell me about how you usually hand a design off to engineers." },
        ],
    },
    data_analyst: {
        label: "Data Analyst",
        general: "Tell me about yourself and what drew you to working with data.",
        rounds: [
            { title: "SQL & Analytics Technical Drill", focus: "SQL and analytics", opener: "Tell me about the data you've worked with most and the kinds of questions you've answered with it." },
            { title: "Behavioral & Business Impact", focus: "behavior and business impact", opener: "Tell me about yourself and an analysis that changed a business decision." },
            { title: "Statistical Modeling & Case", focus: "statistical modeling", opener: "Tell me about a model or experiment you've built, and what it was meant to answer." },
            { title: "Data Storytelling & Dashboards", focus: "data storytelling and dashboards", opener: "Tell me about a dashboard or report people actually relied on, and why it worked." },
        ],
    },
    virtual_assistant: {
        label: "Virtual Assistant",
        general: "Tell me about yourself and the kind of people you've supported.",
        rounds: [
            { title: "Administrative Support & Organization", focus: "administrative support and organization", opener: "Tell me about yourself and how you keep a busy schedule organized." },
            { title: "Behavioral & Communication", focus: "behavior and communication", opener: "Tell me about yourself and the people you've supported most closely." },
            { title: "Tools & Efficiency", focus: "tools and efficiency", opener: "Tell me which tools you rely on day to day, and how they make you faster." },
            { title: "Client Relations & Confidentiality", focus: "client relations and confidentiality", opener: "Tell me about a role where you handled sensitive information or important clients." },
        ],
    },
    customer_service: {
        label: "Customer Service Representative",
        general: "Tell me about yourself and what drew you to customer service.",
        rounds: [
            { title: "Customer Interaction & Empathy", focus: "customer interaction and empathy", opener: "Tell me about yourself and what you enjoy about helping customers." },
            { title: "Problem Resolution & De-escalation", focus: "problem resolution and de-escalation", opener: "Tell me about the toughest customer conversation you've handled." },
            { title: "Product Knowledge & Support Systems", focus: "product knowledge and support systems", opener: "Tell me how you get up to speed on a product you have to support." },
            { title: "Service Metrics & Improvement", focus: "service metrics and improvement", opener: "Tell me which support metrics you've been measured on, and how you did." },
        ],
    },
    sales: {
        label: "Sales and Business Development",
        general: "Tell me about yourself and what drew you to sales.",
        rounds: [
            { title: "Sales Discovery & Pitch", focus: "sales discovery and pitching", opener: "Tell me about yourself and the kind of products you've sold." },
            { title: "Negotiation & Objection Handling", focus: "negotiation and objection handling", opener: "Tell me about a deal you closed that almost didn't happen." },
            { title: "Account Management & Growth", focus: "account management and growth", opener: "Tell me about an account you grew, and how you did it." },
            { title: "Market & Product Knowledge", focus: "market and product knowledge", opener: "Tell me about the market you've sold into and who your typical buyer was." },
        ],
    },
    banking_finance: {
        label: "Banking and Finance",
        general: "Tell me about yourself and what drew you to finance.",
        rounds: [
            { title: "Financial Modeling & Valuation", focus: "financial modeling and valuation", opener: "Tell me about the financial models you've built most often." },
            { title: "Behavioral & Stakeholder Trust", focus: "behavior and stakeholder trust", opener: "Tell me about yourself and the stakeholders who rely on your numbers." },
            { title: "Risk & Compliance Case", focus: "risk and compliance", opener: "Tell me about a risk or compliance issue you've had to manage." },
            { title: "Market Analysis & Reporting", focus: "market analysis and reporting", opener: "Tell me about a market or company you've analyzed recently, and what you concluded." },
        ],
    },
    oil_gas: {
        label: "Oil and Gas",
        general: "Tell me about yourself and what drew you to the oil and gas industry.",
        rounds: [
            { title: "Technical Safety & Operations", focus: "technical safety and operations", opener: "Tell me about yourself and the kind of sites or systems you've worked on." },
            { title: "Behavioral & Crew Leadership", focus: "behavior and crew leadership", opener: "Tell me about a team or crew you've led, and how you kept everyone safe and on track." },
            { title: "Engineering Fundamentals", focus: "engineering fundamentals", opener: "Tell me about the engineering work you're most confident in." },
            { title: "Field Operations & Troubleshooting", focus: "field operations and troubleshooting", opener: "Tell me about a fault you diagnosed in the field that others had missed." },
        ],
    },
    business_analyst: {
        label: "Business Analyst",
        general: "Tell me about yourself and what drew you to business analysis.",
        rounds: [
            { title: "Business Analysis & Requirements", focus: "business analysis and requirements", opener: "Tell me about yourself and a project where you defined the requirements." },
            { title: "Stakeholder Management", focus: "stakeholder management", opener: "Tell me about the stakeholders you work with most, and how you keep them aligned." },
            { title: "Data Modeling & Process Mapping", focus: "data modeling and process mapping", opener: "Tell me about a process you mapped or redesigned." },
            { title: "Solution Evaluation & Impact", focus: "solution evaluation and impact", opener: "Tell me about a solution you helped choose, and how you measured whether it worked." },
        ],
    },
    operations: {
        label: "Operations",
        general: "Tell me about yourself and what drew you to operations.",
        rounds: [
            { title: "Operational Strategy & Case Study", focus: "operational strategy", opener: "Tell me about an operation you've run or improved." },
            { title: "Behavioral & Stakeholder Mgmt", focus: "behavior and stakeholder management", opener: "Tell me about yourself and the teams you've had to coordinate." },
            { title: "Commercial Acumen & Metrics", focus: "commercial acumen and metrics", opener: "Tell me which numbers you watch most closely in your work, and why." },
            { title: "Execution Drills & Root Cause", focus: "execution and root cause analysis", opener: "Tell me about a problem you traced back to its root cause." },
        ],
    },
    devops_sre: {
        label: "DevOps and Site Reliability",
        general: "Tell me about yourself and what drew you to DevOps and reliability work.",
        rounds: [
            { title: "Cloud Infrastructure & Architecture", focus: "cloud infrastructure and architecture", opener: "Walk me through the infrastructure you've worked on most recently." },
            { title: "Site Reliability & Incident Management", focus: "site reliability and incident management", opener: "Tell me about an incident you were on call for, and how it was resolved." },
            { title: "CI/CD & Release Automation", focus: "CI/CD and release automation", opener: "Walk me through how code gets to production on a team you've worked with." },
            { title: "Linux Internals & Cloud Security", focus: "Linux internals and cloud security", opener: "Tell me about the systems you've administered or secured." },
        ],
    },
    frontend_developer: {
        label: "Frontend Engineer",
        general: "Tell me about yourself and what drew you to front-end development.",
        rounds: engineeringRounds([
            "Walk me through a user interface you built that you're proud of.",
            "Tell me about yourself and how you work with designers and product managers.",
            "Walk me through how a front end you worked on was structured, from components to data fetching.",
            "Tell me which parts of front-end development you feel strongest in.",
        ]),
    },
    backend_engineer: {
        label: "Software Engineer",
        general: "Tell me about yourself and what drew you to software engineering.",
        rounds: engineeringRounds([
            "Tell me about the backend system you know best.",
            "Tell me about yourself and the engineering teams you've worked on.",
            "Walk me through the architecture of a system you've worked on.",
            "Tell me which parts of backend engineering you feel strongest in.",
        ]),
    },
    product_marketer: {
        label: "Product Marketer",
        general: "Tell me about yourself and what drew you to product marketing.",
        rounds: engineeringRounds([
            "Tell me about the tools and data you use to plan and measure a launch.",
            "Tell me about yourself and a launch you led from start to finish.",
            "Walk me through how you'd structure a go-to-market plan for a new product.",
            "Tell me which marketing skills you rely on most.",
        ]),
    },
    general: {
        label: "",
        general: FALLBACK_OPENER,
        rounds: engineeringRounds([
            "Tell me about the technical skills you use most in your work.",
            "Tell me about yourself and what you're looking for in your next role.",
            "Walk me through a process or system you designed or improved.",
            "Tell me about the skills you use most in your work today.",
        ]),
    },
};

/** Dashboard aliases → the family whose rounds it shows. */
const FAMILY_ALIASES: Record<string, string> = {
    product: "product_manager",
    design: "product_designer",
    data: "data_analyst",
    data_science: "data_analyst",
    business: "operations",
    engineering: "backend_engineer",
};

export function openerFamily(roleFamily?: string | null, role?: string | null): string {
    const raw = (roleFamily || "").trim().toLowerCase();
    const family = FAMILY_ALIASES[raw] ?? raw;
    if (OPENERS[family]) return family;
    const fromRole = normalizeUserRoleFamily(role || "");
    return OPENERS[fromRole] ? fromRole : "general";
}

/** "Execution & Metrics Interview" → "execution metrics" */
function roundKey(text: string): string {
    return text
        .toLowerCase()
        .replace(/\binterview\b/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

export interface OpeningPlan {
    family: string;
    /** The matched round, when the type is one of the dashboard's rounds. */
    round: RoundOpener | null;
    /** A fixed line, or null when one has to be written for this type. */
    opener: string | null;
    /** Key under which a written line is stored. */
    key: string;
}

/**
 * The opener for a role + round: the family's own line first, then any family
 * with that round title, then the family's general line when the round is just
 * the role ("Stripe Software Engineer Interview"). Otherwise null — write one.
 */
export function planOpening(opts: {
    roleFamily?: string | null;
    role?: string | null;
    interviewType?: string | null;
    company?: string | null;
}): OpeningPlan {
    const family = openerFamily(opts.roleFamily, opts.role);
    const typeKey = roundKey(opts.interviewType || "");
    const key = `${family}:${typeKey}`;
    const table = OPENERS[family];

    const own = table.rounds.find((r) => roundKey(r.title) === typeKey);
    if (own) return { family, round: own, opener: own.opener, key };
    for (const other of Object.values(OPENERS)) {
        const match = other.rounds.find((r) => roundKey(r.title) === typeKey);
        if (match) return { family, round: match, opener: match.opener, key };
    }

    const companyKey = roundKey(opts.company || "");
    const withoutCompany = companyKey && typeKey.startsWith(companyKey) ? typeKey.slice(companyKey.length).trim() : typeKey;
    const roleKeys = [roundKey(opts.role || ""), roundKey(table.label)].filter(Boolean);
    if (!withoutCompany || withoutCompany === "role" || roleKeys.includes(withoutCompany)) {
        return { family, round: null, opener: table.general, key };
    }
    return { family, round: null, opener: null, key };
}

/* ── written openers, for rounds with no fixed line ── */

const OPENER_BUDGET_MS = 4000;
const writtenOpeners = new Map<string, string>();

function acceptable(line: unknown): line is string {
    return typeof line === "string" && line.trim().length >= 20 && line.trim().length <= 180 && /[.?]$/.test(line.trim());
}

async function storedOpener(key: string): Promise<string | null> {
    try {
        const { default: dbConnect } = await import("@/lib/mongodb");
        const { default: AppConfig } = await import("@/models/AppConfig");
        await dbConnect();
        const doc = await AppConfig.findOne({ key: `opener:${key}` }).lean<{ value?: unknown }>();
        return acceptable(doc?.value) ? doc.value : null;
    } catch {
        return null;
    }
}

async function storeOpener(key: string, line: string): Promise<void> {
    try {
        const { default: dbConnect } = await import("@/lib/mongodb");
        const { default: AppConfig } = await import("@/models/AppConfig");
        await dbConnect();
        await AppConfig.updateOne({ key: `opener:${key}` }, { $set: { value: line } }, { upsert: true });
    } catch {
        // Not stored: it's written again next time.
    }
}

/** Resolves the opener, writing and storing one when there's no fixed line. */
export async function resolveOpener(
    plan: OpeningPlan,
    context: { role: string; interviewType: string }
): Promise<string> {
    if (plan.opener) return plan.opener;
    const fallback = OPENERS[plan.family]?.general ?? FALLBACK_OPENER;

    const cached = writtenOpeners.get(plan.key) ?? (await storedOpener(plan.key));
    if (cached) {
        writtenOpeners.set(plan.key, cached);
        return cached;
    }

    try {
        const raw = await callJSON<{ opener?: string }>({
            system:
                "You write the first question of a mock job interview: one short, warm, open question (one sentence, under 25 words) " +
                "that eases the candidate into the round's topic by asking about their own experience. " +
                "Never mention a specific employer, never ask about the candidate's knowledge of a company, and never combine two questions. " +
                'Return JSON: {"opener": "..."}',
            user: `Role: ${context.role || "not specified"}\nInterview round: ${context.interviewType}`,
            maxTokens: 120,
            timeoutMs: OPENER_BUDGET_MS,
            hedgeMs: 1600,
            mock: { opener: fallback },
        });
        const line = raw.opener?.trim().replace(/\*\*/g, "");
        if (acceptable(line)) {
            writtenOpeners.set(plan.key, line);
            void storeOpener(plan.key, line);
            return line;
        }
    } catch (err) {
        console.warn("[openers] writing an opener failed:", (err as Error).message);
    }
    return fallback;
}

/* ── the spoken welcome ── */

export function openingGreeting(candidateName?: string | null): string {
    const name = candidateName?.trim();
    return name ? `Hello ${name}, welcome!` : "Hello, welcome!";
}

export function openingIntro(opts: { role: string; company?: string | null; focus?: string | null }): string {
    const position = opts.role ? `the ${opts.role} position` : "this position";
    const company = opts.company ? ` with ${opts.company}` : "";
    const round = opts.focus
        ? ` This round is about ${opts.focus}, and it should take 20 to 30 minutes.`
        : " This should take 20 to 30 minutes.";
    return (
        `I'll be your interviewer today for ${position}${company}.${round} ` +
        "Take your time with each answer. Let's get started:"
    );
}
