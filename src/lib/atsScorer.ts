// src/lib/atsScorer.ts
// Accurate Industry-Standard ATS Scoring Engine & Seniority Depth Evaluator

import { StructuredResume, normalizeStructuredForDisplay, parseResumeTextToStructured, structuredToText } from "./resumeParser";
import { isJobRoleMatch, normalizeUserRoleFamily } from "@/utils/locationDetector";

export type SeniorityTier = "junior" | "mid" | "senior" | "lead";

export interface SeniorityInfo {
    tier: SeniorityTier;
    label: string;
    totalMonths: number;
    totalYears: number;
    expectedScope: string;
}

export interface AtsMetrics {
    impactScore: number; // 0-100%
    roleAlignmentScore: number; // 0-100%
    brevityScore: number; // 0-100%
    structureScore: number; // 0-100%
    contactScore: number; // 0-100%

    // Raw points (sum up to 100)
    impactPoints: number; // max 25
    roleAlignmentPoints: number; // max 30
    brevityPoints: number; // max 20
    structurePoints: number; // max 15
    contactPoints: number; // max 10

    // Diagnostic counts
    totalBullets: number;
    quantifiedBullets: number;
    quantifiedPercentage: number;
    strongVerbBullets: number;
    weakPhraseBullets: number;
    averageWordsPerBullet: number;
    matchedKeywords: string[];
    missingKeywords: string[];
    sectionsFound: string[];
    missingSections: string[];
}

export interface ExtraBulletSuggestion {
    id: string;
    targetJobId?: string;
    targetCompany: string;
    type: "addition";
    category: "Impact & Metrics" | "Role Alignment & Keywords" | "Structure & Clarity" | "Action Verbs & Brevity";
    feedback: string;
    recommendation: string;
    targetSnippet: string; // Placeholder or job title context
    proposedText: string;
    scoreLift: number;
}

export interface AtsScoreResult {
    overallScore: number; // 0-100
    grade: "A+" | "A" | "B" | "C" | "D" | "F";
    verdict: string;
    seniority: SeniorityInfo;
    metrics: AtsMetrics;
    summary: string;
    strengths: string[];
    depthGaps: string[];
    extraBulletSuggestions: ExtraBulletSuggestion[];
}

// ─── 1. Role Keyword Taxonomies ──────────────────────────────────────────────

const ROLE_TAXONOMIES: Record<string, string[]> = {
    "product manager": [
        "Product Strategy",
        "Roadmapping",
        "PRDs",
        "User Research",
        "A/B Testing",
        "Feature Prioritization",
        "OKRs",
        "KPIs",
        "Customer Discovery",
        "Go-To-Market",
        "Agile",
        "Scrum",
        "User Stories",
        "Retention",
        "Churn",
        "Product-Led Growth",
        "Monetization",
        "Figma",
        "Jira",
        "Amplitude",
        "Mixpanel",
        "SQL",
        "Stakeholder Management",
        "Sprint Planning",
        "Cross-Functional Leadership",
        "Unit Economics",
        "MVP",
        "User Journeys",
        "Data-Driven",
        "Conversion Funnel",
    ],
    "software engineer": [
        "System Design",
        "Microservices",
        "REST APIs",
        "GraphQL",
        "CI/CD",
        "Docker",
        "Kubernetes",
        "AWS",
        "GCP",
        "PostgreSQL",
        "MongoDB",
        "Redis",
        "Distributed Systems",
        "Unit Testing",
        "TDD",
        "Git",
        "Performance Optimization",
        "Scalability",
        "High Availability",
        "Security",
        "Kafka",
        "TypeScript",
        "Python",
        "Java",
        "Golang",
        "React",
        "Node.js",
        "Code Reviews",
        "Refactoring",
        "Database Indexing",
    ],
    "data scientist": [
        "Machine Learning",
        "Deep Learning",
        "NLP",
        "Computer Vision",
        "Python",
        "R",
        "SQL",
        "Pandas",
        "NumPy",
        "Scikit-learn",
        "PyTorch",
        "TensorFlow",
        "Feature Engineering",
        "Model Deployment",
        "A/B Testing",
        "Statistical Modeling",
        "Data Pipelines",
        "ETL",
        "Snowflake",
        "BigQuery",
        "Tableau",
        "Power BI",
        "Regression",
        "Classification",
        "Predictive Modeling",
    ],
    "data analyst": [
        "SQL",
        "Data Visualization",
        "Tableau",
        "Power BI",
        "Python",
        "R",
        "Excel",
        "Business Intelligence",
        "ETL",
        "Data Modeling",
        "KPI Dashboards",
        "Cohort Analysis",
        "Funnel Analysis",
        "Statistical Testing",
        "Data Integrity",
        "Stakeholder Reporting",
    ],
    "product designer": [
        "User Research",
        "Wireframing",
        "Prototyping",
        "Usability Testing",
        "Design Systems",
        "Information Architecture",
        "Figma",
        "Adobe XD",
        "Interaction Design",
        "User Personas",
        "User Journeys",
        "Journey Mapping",
        "Mobile-First",
        "Responsive Design",
        "Accessibility",
        "WCAG",
        "Design Tokens",
        "Qualitative Testing",
    ],
    marketing: [
        "SEO",
        "SEM",
        "PPC",
        "Growth Marketing",
        "Content Strategy",
        "CRO",
        "Google Analytics",
        "CAC",
        "LTV",
        "Campaign Strategy",
        "Email Marketing",
        "Funnel Optimization",
        "Brand Strategy",
        "Performance Marketing",
        "A/B Testing",
        "Copywriting",
        "Social Media Ads",
    ],
    devops: [
        "CI/CD",
        "Kubernetes",
        "Docker",
        "Terraform",
        "AWS",
        "Azure",
        "GCP",
        "Linux",
        "Helm",
        "Prometheus",
        "Grafana",
        "Ansible",
        "Infrastructure as Code",
        "Site Reliability",
        "SRE",
        "Monitoring",
        "Observability",
        "Incident Management",
        "High Availability",
        "Disaster Recovery",
        "Bash",
        "Python",
        "GitOps",
        "Cloud Architecture",
    ],
    "ui designer": [
        "Design Systems",
        "Figma",
        "UI Components",
        "Design Tokens",
        "Typography",
        "Color Hierarchy",
        "Visual Design",
        "Responsive Design",
        "Micro-Interactions",
        "Wireframing",
        "High-Fidelity Mockups",
        "Interactive Prototyping",
        "Auto-Layout",
        "Style Guides",
        "Developer Handoff",
        "Accessibility",
        "WCAG",
        "Component Variants",
        "Iconography",
    ],
    "virtual assistant": [
        "Calendar Management",
        "Executive Support",
        "Meeting Scheduling",
        "Travel Coordination",
        "Email Management",
        "Data Entry",
        "Google Workspace",
        "Microsoft Office",
        "Task Prioritization",
        "Documentation",
        "Meeting Minutes",
        "Confidentiality",
        "Administrative Support",
        "CRM",
        "Invoicing",
        "Asana",
        "Trello",
        "Slack",
        "Workflow Organization",
    ],
    "customer service": [
        "Customer Support",
        "Zendesk",
        "Intercom",
        "Freshdesk",
        "Ticket Resolution",
        "De-escalation",
        "Customer Satisfaction",
        "CSAT",
        "NPS",
        "Active Listening",
        "Problem Solving",
        "Communication",
        "Live Chat",
        "Phone Support",
        "Client Retention",
        "SLAs",
        "Customer Care",
    ],
    sales: [
        "Lead Generation",
        "Cold Calling",
        "Pipeline Management",
        "CRM",
        "Salesforce",
        "HubSpot",
        "Negotiation",
        "Account Management",
        "Prospecting",
        "B2B Sales",
        "Outbound Sales",
        "Closing Deals",
        "Revenue Growth",
        "Quota Attainment",
        "Value Selling",
        "Client Discovery",
    ],
    "banking & finance": [
        "Financial Modeling",
        "Valuation",
        "DCF",
        "Excel",
        "Financial Analysis",
        "Corporate Finance",
        "Risk Assessment",
        "Due Diligence",
        "Financial Reporting",
        "Auditing",
        "GAAP",
        "IFRS",
        "Budgeting",
        "Forecasting",
        "Investment Banking",
        "Portfolio Management",
    ],
    "oil & gas": [
        "Petroleum Engineering",
        "Drilling",
        "HSE",
        "Safety Compliance",
        "Risk Assessment",
        "OSHA",
        "Incident Investigation",
        "Environmental Safety",
        "Production Operations",
        "Hazard Identification",
        "Emergency Response",
        "Offshore",
        "Rig Operations",
        "Well Operations",
        "Pipeline",
    ],
    "business analyst": [
        "Business Analysis",
        "Requirements Gathering",
        "User Stories",
        "Process Mapping",
        "Functional Specifications",
        "Stakeholder Management",
        "Agile",
        "Scrum",
        "Gap Analysis",
        "Jira",
        "SQL",
        "Data Modeling",
        "Workflow Optimization",
        "Operations Analysis",
    ],
    "frontend developer": [
        "React",
        "TypeScript",
        "JavaScript",
        "HTML5",
        "CSS3",
        "Next.js",
        "Tailwind CSS",
        "Redux",
        "Responsive Web Design",
        "REST APIs",
        "GraphQL",
        "State Management",
        "Frontend Performance",
        "Accessibility",
        "WCAG",
        "Jest",
        "Unit Testing",
        "Vue",
        "Angular",
        "Mobile Development",
    ],
};

function getKeywordsForRole(role: string): string[] {
    const rLower = (role || "").toLowerCase();
    for (const [key, list] of Object.entries(ROLE_TAXONOMIES)) {
        if (rLower.includes(key) || key.includes(rLower)) {
            return list;
        }
    }
    if (rLower.includes("devops") || rLower.includes("sre") || rLower.includes("cloud") || rLower.includes("infrastructure")) {
        return ROLE_TAXONOMIES["devops"];
    }
    if (rLower.includes("ui") || rLower.includes("visual")) {
        return ROLE_TAXONOMIES["ui designer"];
    }
    if (rLower.includes("assistant") || rLower.includes("admin") || rLower.includes("secretary")) {
        return ROLE_TAXONOMIES["virtual assistant"];
    }
    if (rLower.includes("customer") || rLower.includes("support")) {
        return ROLE_TAXONOMIES["customer service"];
    }
    if (rLower.includes("sales") || rLower.includes("account executive") || rLower.includes("commercial")) {
        return ROLE_TAXONOMIES["sales"];
    }
    if (rLower.includes("financ") || rLower.includes("bank") || rLower.includes("account") || rLower.includes("invest")) {
        return ROLE_TAXONOMIES["banking & finance"];
    }
    if (rLower.includes("oil") || rLower.includes("petroleum") || rLower.includes("hse") || rLower.includes("safety")) {
        return ROLE_TAXONOMIES["oil & gas"];
    }
    if (rLower.includes("business") || rLower.includes("operations")) {
        return ROLE_TAXONOMIES["business analyst"];
    }
    if (rLower.includes("frontend") || rLower.includes("react") || rLower.includes("web developer") || rLower.includes("mobile")) {
        return ROLE_TAXONOMIES["frontend developer"];
    }
    if (rLower.includes("engineer") || rLower.includes("developer") || rLower.includes("architect")) {
        return ROLE_TAXONOMIES["software engineer"];
    }
    if (rLower.includes("data") || rLower.includes("ml") || rLower.includes("ai")) {
        return ROLE_TAXONOMIES["data scientist"];
    }
    if (rLower.includes("design") || rLower.includes("ux")) {
        return ROLE_TAXONOMIES["product designer"];
    }
    if (rLower.includes("product") || rLower.includes("owner") || rLower.includes("lead")) {
        return ROLE_TAXONOMIES["product manager"];
    }
    return ROLE_TAXONOMIES["software engineer"];
}

// ─── 2. Metrics & Strong Action Verbs Patterns ───────────────────────────────

const METRIC_PATTERNS = [
    /\d+(?:\.\d+)?%/,                                          // 35%, 99.9%
    /[\$£€¥₦]\s*\d+(?:,\d{3})*(?:\.\d+)?(?:\s*[kmb]|thousand|million|billion)?/i, // $250k, ₦250 billion
    /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:k|m|b|million|billion|thousand|users|customers|clients|transactions|requests|tps|dau|mau|qps|downloads|subscribers)\b/i,
    /\b\d+x\b/i,                                               // 2x, 5x
    /\b\d+\s*(?:ms|milliseconds|seconds|mins|minutes|hours|days|weeks|months)\b/i, // 180ms, 4 weeks
    /\b(?:reduced|increased|decreased|cut|boosted|grew|accelerated|improved|saved)\s+[^.]+?\b\d+/i,
    /\b\d+\+?\s*(?:engineers|developers|squads|team members|designers|stakeholders|direct reports)\b/i,
];

export function hasMetric(text: string): boolean {
    return METRIC_PATTERNS.some((re) => re.test(text));
}

const STRONG_ACTION_VERBS = new Set([
    "spearheaded", "architected", "engineered", "orchestrated", "led", "directed",
    "founded", "championed", "governed", "steered", "established", "owned",
    "designed", "developed", "built", "formulated", "authored", "conceptualized",
    "devised", "launched", "pioneered", "optimized", "accelerated", "scaled",
    "streamlined", "automated", "reduced", "maximized", "transformed", "overhauled",
    "amplified", "enhanced", "delivered", "executed", "implemented", "deployed",
    "produced", "resolved", "negotiated", "partnered", "mentored", "standardized",
    "drove", "curated", "generated", "centralized", "restructured", "eliminated",
    // Everyday verbs from customer service, sales, banking and admin work,
    // which were scored as weak because the list above was written for tech.
    "managed", "coordinated", "organised", "organized", "supervised", "trained",
    "coached", "onboarded", "increased", "improved", "grew", "cut", "lowered",
    "raised", "achieved", "exceeded", "closed", "sold", "secured", "won",
    "settled", "recovered", "retained", "reconciled", "audited", "processed",
    "prepared", "planned", "introduced", "created", "analysed", "analyzed",
    "converted", "expanded", "saved", "solved", "fixed"
]);

const WEAK_PASSIVE_PHRASES = [
    /\bresponsible for\b/i,
    /\btasked with\b/i,
    /\bhelped (?:with|to)?\b/i,
    /\bassisted (?:in|with)?\b/i,
    /\bworked on\b/i,
    /\bparticipated in\b/i,
    /\bduties included\b/i,
    /\binvolved in\b/i,
    /\bhandled\b/i,
    /\bsupported the\b/i,
];

export function startsWithStrongActionVerb(text: string): boolean {
    const cleaned = text.replace(/^[•·\-\*\—\–●\u25CF\s]+/, "").trim();
    const firstWord = cleaned.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "");
    return firstWord ? STRONG_ACTION_VERBS.has(firstWord) : false;
}

export function hasWeakPhrase(text: string): boolean {
    return WEAK_PASSIVE_PHRASES.some((re) => re.test(text));
}

// ─── 3. Tenure & Seniority Calculation ───────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
};

function parseDateSegment(seg: string): { year: number; month: number } | null {
    const s = seg.toLowerCase().trim();
    if (s.includes("present") || s.includes("current") || s.includes("now")) {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    }
    const ym = s.match(/(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[,\s]+(20\d\d|19\d\d)/i);
    if (ym) {
        return { year: parseInt(ym[2], 10), month: MONTH_MAP[ym[1].toLowerCase()] ?? 0 };
    }
    const yOnly = s.match(/\b(20\d\d|19\d\d)\b/);
    if (yOnly) {
        return { year: parseInt(yOnly[1], 10), month: 5 }; // default mid-year
    }
    return null;
}

export function calculateTenure(jobs: Array<{ date?: string }>): SeniorityInfo {
    let totalMonths = 0;
    const intervals: Array<{ start: number; end: number }> = [];

    for (const job of jobs) {
        const d = job.date || "";
        if (!d) continue;
        const parts = d.split(/\s*[-–—to]+\s*/i);
        if (parts.length >= 2) {
            const start = parseDateSegment(parts[0]);
            const end = parseDateSegment(parts[1]);
            if (start && end) {
                const sMonth = start.year * 12 + start.month;
                const eMonth = end.year * 12 + end.month;
                if (eMonth >= sMonth) {
                    intervals.push({ start: sMonth, end: eMonth });
                }
            }
        } else if (parts.length === 1) {
            const single = parseDateSegment(parts[0]);
            if (single) {
                intervals.push({ start: single.year * 12 + single.month, end: single.year * 12 + single.month + 6 });
            }
        }
    }

    if (intervals.length > 0) {
        intervals.sort((a, b) => a.start - b.start);
        let mergedStart = intervals[0].start;
        let mergedEnd = intervals[0].end;

        for (let i = 1; i < intervals.length; i++) {
            const cur = intervals[i];
            if (cur.start <= mergedEnd) {
                mergedEnd = Math.max(mergedEnd, cur.end);
            } else {
                totalMonths += (mergedEnd - mergedStart);
                mergedStart = cur.start;
                mergedEnd = cur.end;
            }
        }
        totalMonths += (mergedEnd - mergedStart);
    }

    // Default to at least 2.5 years if jobs exist but dates are missing
    if (totalMonths < 12 && jobs.length > 0) {
        totalMonths = Math.max(18, jobs.length * 16);
    }

    const totalYears = Math.round((totalMonths / 12) * 10) / 10;

    let tier: SeniorityTier = "junior";
    let label = "Junior / Associate";
    let expectedScope = "Execution rigor, feature ownership, and reliable task delivery.";

    if (totalYears >= 7.5) {
        tier = "lead";
        label = "Lead / Principal / Director";
        expectedScope = "Organizational strategy, executive alignment, multi-squad leadership, and high-stakes P&L ownership.";
    } else if (totalYears >= 4.5) {
        tier = "senior";
        label = "Senior";
        expectedScope = "End-to-end domain ownership, cross-functional leadership, trade-off decisions, and measurable business impact.";
    } else if (totalYears >= 2.0) {
        tier = "mid";
        label = "Mid-Level";
        expectedScope = "Independent feature ownership, customer discovery, roadmapping, and data-informed decision making.";
    }

    return {
        tier,
        label,
        totalMonths,
        totalYears,
        expectedScope,
    };
}

// ─── 4. Cross-Experience Substance & Extra Bullet Suggester ──────────────────

export function calculateStructuredAtsScore(
    structured: StructuredResume,
    role: string = "Product Manager",
    rawText?: string
): AtsScoreResult {
    const seniority = calculateTenure(structured.jobs || []);
    const targetKeywords = getKeywordsForRole(role);

    // Aggregate all bullets
    const allAchievementBullets: string[] = [];
    // Lines whose numbers came from a suggested rewrite, not from the person.
    const exampleNumberLines = new Set<string>();
    (structured.jobs || []).forEach((j) => {
        (j.bullets || []).forEach((b) => {
            const txt = b.text.trim();
            if (!txt) return;
            // Ignore company descriptions & headers
            if (b.projectHeader || /mission to power|helps companies|offered freelancers/i.test(txt)) return;
            allAchievementBullets.push(txt);
            if (b.exampleNumbers) exampleNumberLines.add(txt);
        });
    });

    const totalBullets = allAchievementBullets.length;

    // 1. Quantified Metrics Evaluation (Max 25 pts)
    let quantifiedCount = 0;
    allAchievementBullets.forEach((b) => {
        // A number a rewrite made up is a placeholder until the person makes it
        // theirs: it earns nothing, so the score can't be raised by accepting
        // invented figures.
        if (hasMetric(b) && !exampleNumberLines.has(b)) quantifiedCount++;
    });

    const quantifiedRatio = totalBullets > 0 ? quantifiedCount / totalBullets : 0;
    const quantifiedPercentage = Math.round(quantifiedRatio * 100);

    let impactPoints = 0;
    if (quantifiedRatio >= 0.65) impactPoints = 25;
    else if (quantifiedRatio >= 0.50) impactPoints = 21;
    else if (quantifiedRatio >= 0.35) impactPoints = 17;
    else if (quantifiedRatio >= 0.20) impactPoints = 12;
    else if (quantifiedRatio > 0) impactPoints = 7;
    else impactPoints = 3;

    // 2. Role Keywords & Alignment Evaluation (Max 30 pts)
    const fullCvText = [
        rawText || "",
        structured.headline,
        structured.summary,
        ...allAchievementBullets,
        ...(structured.skills || []).map((s) => `${s.category} ${s.items}`),
        ...(structured.education || []).map((e) => `${e.degree} ${e.institution}`),
    ].join(" ").toLowerCase();

    const matchedKeywords: string[] = [];
    const missingKeywords: string[] = [];

    targetKeywords.forEach((kw) => {
        const base = kw.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
        const re = new RegExp(`\\b${base}(?:s|ing|ed|ers|er)?\\b`, "i");
        if (re.test(fullCvText)) {
            matchedKeywords.push(kw);
        } else {
            missingKeywords.push(kw);
        }
    });

    const keywordCoverage = matchedKeywords.length / Math.min(25, targetKeywords.length);
    let roleAlignmentPoints = 0;
    if (keywordCoverage >= 0.70) roleAlignmentPoints = 30;
    else if (keywordCoverage >= 0.55) roleAlignmentPoints = 26;
    else if (keywordCoverage >= 0.40) roleAlignmentPoints = 21;
    else if (keywordCoverage >= 0.25) roleAlignmentPoints = 15;
    else if (keywordCoverage >= 0.12) roleAlignmentPoints = 10;
    else roleAlignmentPoints = 5;

    // 3. Action Verbs & Brevity Evaluation (Max 20 pts)
    let strongVerbCount = 0;
    let weakPhraseCount = 0;
    let totalWords = 0;

    allAchievementBullets.forEach((b) => {
        if (startsWithStrongActionVerb(b)) strongVerbCount++;
        if (hasWeakPhrase(b)) weakPhraseCount++;
        totalWords += b.split(/\s+/).length;
    });

    const strongVerbRatio = totalBullets > 0 ? strongVerbCount / totalBullets : 0;
    const avgWords = totalBullets > 0 ? Math.round(totalWords / totalBullets) : 0;

    let verbPoints = 0;
    if (strongVerbRatio >= 0.70) verbPoints = 12;
    else if (strongVerbRatio >= 0.50) verbPoints = 9;
    else if (strongVerbRatio >= 0.30) verbPoints = 6;
    else verbPoints = 3;

    // Deduct for weak phrases
    verbPoints = Math.max(0, verbPoints - weakPhraseCount * 2);

    // Brevity scoring (ideal is 14 - 36 words per bullet)
    let brevitySubPoints = 0;
    if (avgWords >= 12 && avgWords <= 38) brevitySubPoints = 8;
    else if (avgWords >= 8 && avgWords <= 48) brevitySubPoints = 5;
    else brevitySubPoints = 3;

    const brevityPoints = Math.min(20, verbPoints + brevitySubPoints);

    // 4. Section Structure & Depth Evaluation (Max 15 pts)
    const sectionsFound: string[] = [];
    const missingSections: string[] = [];

    if (structured.jobs && structured.jobs.length > 0) sectionsFound.push("Work Experience");
    else missingSections.push("Work Experience");

    if (structured.skills && structured.skills.length > 0) sectionsFound.push("Skills & Tools");
    else missingSections.push("Skills & Tools");

    if (structured.education && structured.education.length > 0) sectionsFound.push("Education");
    else missingSections.push("Education");

    if (structured.summary && structured.summary.length > 30) sectionsFound.push("Summary");
    else missingSections.push("Summary");

    let structurePoints = 0;
    if (sectionsFound.includes("Work Experience")) structurePoints += 5;
    if (sectionsFound.includes("Skills & Tools")) structurePoints += 4;
    if (sectionsFound.includes("Education")) structurePoints += 3;
    if (sectionsFound.includes("Summary")) structurePoints += 3;

    // Seniority Depth Calibration Check:
    // If mid/senior candidate has < 4 total bullets or 0 metrics, apply a calibrated depth penalty
    const depthGaps: string[] = [];
    if (seniority.totalYears >= 3.0 && totalBullets < 5) {
        structurePoints = Math.max(4, structurePoints - 3);
        depthGaps.push(`At ${seniority.label} level (${seniority.totalYears} years), your CV lacks sufficient bullet density to substantiate your career achievements.`);
    }
    if (seniority.totalYears >= 3.0 && quantifiedPercentage < 30) {
        depthGaps.push(`Recruiters evaluating ${seniority.label} candidates expect hard commercial metrics in 50%+ of bullets, but only ${quantifiedPercentage}% are quantified.`);
    }

    // 5. Contact & Parseability Completeness (Max 10 pts)
    let contactPoints = 0;
    if (structured.name && structured.name !== "Candidate Name" && structured.name.length > 2) contactPoints += 3;
    if (structured.contact && structured.contact.includes("@")) contactPoints += 3;
    if (structured.contact && (/\b\d{3}[-\s]?\d{3}\b/.test(structured.contact) || /linkedin|github|portfolio|http/i.test(structured.contact))) {
        contactPoints += 4;
    } else if (structured.contact && structured.contact.length > 5) {
        contactPoints += 2;
    }

    // Overall Score
    const overallScore = Math.min(100, Math.max(25, impactPoints + roleAlignmentPoints + brevityPoints + structurePoints + contactPoints));

    // Grade & Verdict
    let grade: "A+" | "A" | "B" | "C" | "D" | "F" = "C";
    let verdict = "Getting there";

    if (overallScore >= 90) {
        grade = "A+";
        verdict = "Ready to send";
    } else if (overallScore >= 82) {
        grade = "A";
        verdict = "Strong resume";
    } else if (overallScore >= 70) {
        grade = "B";
        verdict = "Good, with room to improve";
    } else if (overallScore >= 55) {
        grade = "C";
        verdict = "Getting there";
    } else {
        grade = "D";
        verdict = "Needs work";
    }

    const strengths: string[] = [];
    if (quantifiedRatio >= 0.5) strengths.push(`${quantifiedCount} of your ${totalBullets} lines show a result with a number.`);
    if (matchedKeywords.length >= 10) strengths.push(`You use ${matchedKeywords.length} of the words employers look for in ${role} resumes.`);
    if (strongVerbRatio >= 0.6) strengths.push(`Most of your lines start by saying what you did.`);
    if (sectionsFound.length >= 4) strengths.push(`Your resume is laid out clearly, with every section easy to find.`);

    // Cross-experience extra bullet suggestions
    // Rewrites come only from the scan's reading of this resume. (This used to
    // add fill-in lines such as "improving 99th percentile response latency
    // by 140ms" to any resume, whatever the job.)
    const extraBulletSuggestions: ExtraBulletSuggestion[] = [];

    // What a person would want to know first, in the order they'd act on it.
    const summary = totalBullets === 0
        ? `We couldn't find any lines describing your work. Add what you did in each job and we'll review it.`
        : `Your resume scores ${overallScore} out of 100 for ${role}. ${
              quantifiedCount === 0
                  ? "None of your lines show a result with a number yet, which is the quickest thing to improve."
                  : `${quantifiedCount} of your ${totalBullets} lines show a result with a number.`
          } It uses ${matchedKeywords.length} of the words employers look for in this role.`;

    const impactScore = Math.min(100, Math.round((impactPoints / 25) * 100));
    const roleAlignmentScore = Math.min(100, Math.round((roleAlignmentPoints / 30) * 100));
    const brevityScore = Math.min(100, Math.round((brevityPoints / 20) * 100));
    const structureScore = Math.min(100, Math.round((structurePoints / 15) * 100));
    const contactScore = Math.min(100, Math.round((contactPoints / 10) * 100));

    return {
        overallScore,
        grade,
        verdict,
        seniority,
        metrics: {
            impactScore,
            roleAlignmentScore,
            brevityScore,
            structureScore,
            contactScore,
            impactPoints,
            roleAlignmentPoints,
            brevityPoints,
            structurePoints,
            contactPoints,
            totalBullets,
            quantifiedBullets: quantifiedCount,
            quantifiedPercentage,
            strongVerbBullets: strongVerbCount,
            weakPhraseBullets: weakPhraseCount,
            averageWordsPerBullet: avgWords,
            matchedKeywords,
            missingKeywords: missingKeywords.slice(0, 5),
            sectionsFound,
            missingSections,
        },
        summary,
        strengths,
        depthGaps,
        extraBulletSuggestions,
    };
}

export interface ScoreGap {
    area: "impact" | "keywords" | "verbs" | "layout" | "contact";
    title: string;
    detail: string;
    /** Points the score can gain by fixing this. */
    points: number;
}

/**
 * What is holding the score back, biggest first, in plain words. Built from
 * the score itself, so every point lost has a fix listed, even when no
 * single line needs rewriting.
 */
export function scoreGaps(result: AtsScoreResult): ScoreGap[] {
    const m = result.metrics;
    const gaps: ScoreGap[] = [];
    const lines = (n: number) => `${n} ${n === 1 ? "line" : "lines"}`;

    if (m.impactPoints < 25) {
        gaps.push({
            area: "impact",
            title: m.totalBullets === 0 ? "Add what you did in each job" : "Show results with numbers",
            detail:
                m.totalBullets === 0
                    ? "Under each job, add a few lines about what you did and what came of it."
                    : `${m.quantifiedBullets} of your ${lines(m.totalBullets)} show a result with a number. Add how many, how much or how fast to the others, using your real figures.`,
            points: 25 - m.impactPoints,
        });
    }
    if (m.roleAlignmentPoints < 30) {
        const examples = m.missingKeywords.slice(0, 3).join(", ");
        gaps.push({
            area: "keywords",
            title: "Use the words employers look for",
            detail: `Your resume uses ${m.matchedKeywords.length} of the words employers search for in this role.${examples ? ` Add the ones that are true for you, such as ${examples}.` : ""}`,
            points: 30 - m.roleAlignmentPoints,
        });
    }
    if (m.brevityPoints < 20 && m.totalBullets > 0) {
        const notStrong = m.totalBullets - m.strongVerbBullets;
        const parts: string[] = [];
        if (notStrong > 0) parts.push(`${notStrong} of your ${lines(m.totalBullets)} don't start with what you did. Start each one with a word like Resolved, Trained or Increased.`);
        if (m.weakPhraseBullets > 0) parts.push(`Replace phrases like "responsible for" or "helped with" in ${lines(m.weakPhraseBullets)}.`);
        if (m.averageWordsPerBullet > 38) parts.push(`Your lines average ${m.averageWordsPerBullet} words; keep each one under about 35.`);
        else if (m.averageWordsPerBullet > 0 && m.averageWordsPerBullet < 12) parts.push(`Your lines average ${m.averageWordsPerBullet} words; add how you did it and what came of it.`);
        if (parts.length > 0) {
            gaps.push({ area: "verbs", title: "Start lines with what you did", detail: parts.join(" "), points: 20 - m.brevityPoints });
        }
    }
    if (m.structurePoints < 15) {
        const missing = m.missingSections.map((section) => (section === "Summary" ? "a short Summary at the top" : section === "Skills & Tools" ? "a Skills section" : `a ${section} section`));
        gaps.push({
            area: "layout",
            title: missing.length > 0 ? "Add the missing sections" : "Add more detail to your jobs",
            detail: missing.length > 0 ? `Add ${missing.join(" and ")}.` : "Add a few more lines under your recent jobs about what you achieved.",
            points: 15 - m.structurePoints,
        });
    }
    if (m.contactPoints < 10) {
        gaps.push({
            area: "contact",
            title: "Complete your contact details",
            detail: "Put your full name, email and phone number or LinkedIn link at the top.",
            points: 10 - m.contactPoints,
        });
    }
    return gaps.filter((gap) => gap.points > 0).sort((a, b) => b.points - a.points);
}

/**
 * The one way a resume is scored, used by the scan and by the editor, so the
 * number a scan reports is the number the page shows.
 */
export function scoreStructuredResume(structured: StructuredResume, role: string): AtsScoreResult {
    const shown = normalizeStructuredForDisplay(structured);
    return calculateStructuredAtsScore(shown, role, structuredToText(shown));
}

/** Whether a rewrite contains figures the original line didn't have. */
export function introducesNumbers(original: string, rewrite: string): boolean {
    const numbers = (text: string) => new Set((text.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(/,/g, "")));
    const had = numbers(original);
    return [...numbers(rewrite)].some((n) => !had.has(n));
}

export function calculateAtsScore(
    rawText: string,
    role: string = "Product Manager",
    candidateName?: string
): AtsScoreResult {
    const { structured } = parseResumeTextToStructured(rawText, candidateName || "Candidate", role, "");
    return scoreStructuredResume(structured, role);
}

export interface JobMatchResponsibilityScore {
    responsibility: string;
    score: number; // 0-100
    evidence: string;
    gap: string;
    status: "strong" | "partial" | "gap";
}

export interface JobMatchResult {
    overallMatch: number; // 0-100
    summary: string;
    experienceMatch: {
        required: string;
        candidate: string;
        score: number;
        note: string;
    };
    responsibilityMatches: JobMatchResponsibilityScore[];
    strengthsForRole: string[];
    gapsForRole: string[];
    interviewFocusAreas: string[];
}

export function matchResumeToJob(
    resumeText: string,
    job: { title: string; company?: string; description?: string; responsibilities?: string[]; roleFamily?: string },
    userRole?: string
): JobMatchResult {
    const rawCv = (resumeText || "").toLowerCase();
    const titleLower = (job.title || "").toLowerCase();
    const roleLower = (userRole || "").toLowerCase();

    // 1. Role and family alignment check
    const candidateFamily = userRole ? normalizeUserRoleFamily(userRole) : "";
    const jobFamily = (job.roleFamily && job.roleFamily !== "general")
        ? normalizeUserRoleFamily(job.roleFamily)
        : normalizeUserRoleFamily(job.title);

    const isDomainMatch = userRole
        ? isJobRoleMatch(jobFamily, job.title, userRole)
        : (
            (titleLower.includes("engineer") || titleLower.includes("developer") || titleLower.includes("software"))
                ? (rawCv.includes("developer") || rawCv.includes("engineer") || rawCv.includes("software") || rawCv.includes("code") || rawCv.includes("api"))
                : true
        );

    const isDirectRoleMatch = isDomainMatch && (
        (Boolean(candidateFamily) && candidateFamily !== "general" && candidateFamily === jobFamily) ||
        (candidateFamily === "ui_designer" && (jobFamily === "ui_designer" || jobFamily === "product_designer" || /ui|design/i.test(titleLower))) ||
        (candidateFamily === "product_designer" && (jobFamily === "product_designer" || jobFamily === "ui_designer" || /design|ux/i.test(titleLower))) ||
        (candidateFamily === "devops_sre" && (jobFamily === "devops_sre" || /devops|sre|cloud|infrastructure|platform/i.test(titleLower))) ||
        (candidateFamily === "oil_gas" && (jobFamily === "oil_gas" || /oil|petroleum|drilling|hse|safety/i.test(titleLower))) ||
        (candidateFamily === "virtual_assistant" && (jobFamily === "virtual_assistant" || /assistant|secretary|admin/i.test(titleLower))) ||
        (candidateFamily === "customer_service" && (jobFamily === "customer_service" || /customer|support|client/i.test(titleLower))) ||
        (candidateFamily === "banking_finance" && (jobFamily === "banking_finance" || /financ|bank|invest|account/i.test(titleLower))) ||
        (candidateFamily === "sales" && (jobFamily === "sales" || /sales|business dev|account exec/i.test(titleLower))) ||
        (candidateFamily === "product_marketer" && (jobFamily === "product_marketer" || /market/i.test(titleLower))) ||
        (candidateFamily === "business_analyst" && (jobFamily === "business_analyst" || /business analy|operations/i.test(titleLower))) ||
        (candidateFamily === "data_analyst" && (jobFamily === "data_analyst" || /data|analyst|analytics/i.test(titleLower))) ||
        (candidateFamily === "frontend_developer" && (jobFamily === "frontend_developer" || /frontend|react|web developer|mobile/i.test(titleLower))) ||
        (candidateFamily === "backend_engineer" && (jobFamily === "backend_engineer" || /software|backend|fullstack|developer/i.test(titleLower))) ||
        (!candidateFamily && (
            (titleLower.includes("product") && roleLower.includes("product")) ||
            ((titleLower.includes("engineer") || titleLower.includes("developer") || titleLower.includes("architect")) &&
             (roleLower.includes("engineer") || roleLower.includes("developer") || roleLower.includes("software"))) ||
            (titleLower.includes("design") && roleLower.includes("design")) ||
            (titleLower.includes("data") && roleLower.includes("data"))
        ))
    );

    // 2. Check keyword presence
    const targetRole = job.title || userRole || "Product Manager";
    const targetKeywords = getKeywordsForRole(targetRole);

    const matchedKeywords: string[] = [];
    const missingKeywords: string[] = [];
    targetKeywords.forEach((kw) => {
        const re = new RegExp(`\\b${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
        if (re.test(rawCv)) matchedKeywords.push(kw);
        else missingKeywords.push(kw);
    });

    const kwRatio = targetKeywords.length > 0 ? matchedKeywords.length / Math.min(20, targetKeywords.length) : 0.2;

    // 3. Check responsibilities
    const rawResponsibilities = Array.isArray(job.responsibilities) && job.responsibilities.length > 0
        ? job.responsibilities
        : (job.description ? job.description.split(/\n|•|\. /).map(s => s.trim()).filter((s) => s.length > 14).slice(0, 4) : []);

    const responsibilities = rawResponsibilities.length > 0
        ? rawResponsibilities
        : [`Core execution and delivery for ${job.title}`, "Cross-functional collaboration and stakeholder alignment", "Domain problem solving and performance metrics"];

    const responsibilityMatches: JobMatchResponsibilityScore[] = responsibilities.map((resp) => {
        const words = resp.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((w) => w.length > 3);
        const matchedCount = words.filter((w) => rawCv.includes(w)).length;
        const ratio = words.length > 0 ? matchedCount / words.length : 0.2;

        let score = 0;
        if (!isDomainMatch) {
            // Completely different functional field: score 10-25%
            score = Math.min(25, Math.max(10, Math.round(ratio * 20 + 8)));
        } else if (!isDirectRoleMatch) {
            score = Math.min(65, Math.max(25, Math.round(ratio * 45 + 18)));
        } else {
            score = Math.min(100, Math.max(35, Math.round(ratio * 60 + 30)));
        }

        return {
            responsibility: resp,
            score,
            evidence: score >= 70
                ? "Relevant experience and keywords identified in your resume."
                : score >= 40
                    ? "Partial conceptual overlap found in resume."
                    : "No clear evidence found in resume for this duty.",
            gap: score >= 70
                ? "Well covered"
                : score >= 40
                    ? "Add quantified achievements directly addressing this responsibility."
                    : `Lacks direct domain experience required for ${job.title}.`,
            status: score >= 75 ? "strong" : score >= 50 ? "partial" : "gap",
        };
    });

    let overallScore = 0;
    const company = job.company || "Target Company";

    if (!isDomainMatch) {
        // Different domain: honest, genuine score well below 50% threshold
        overallScore = Math.min(25, Math.max(10, Math.round(10 + kwRatio * 20)));
    } else if (!isDirectRoleMatch) {
        // Related but not exact role: honest 35-65%
        const respAvg = responsibilityMatches.reduce((a, b) => a + b.score, 0) / (responsibilityMatches.length || 1);
        const kwScore = Math.min(20, Math.round(kwRatio * 30));
        const respScore = Math.min(15, Math.round((respAvg / 100) * 15));
        overallScore = Math.min(65, Math.max(30, 35 + kwScore + respScore));
    } else {
        // Direct role match. This is a keyword count: it can tell the role fits,
        // not how well the resume fits this particular job, so it stays in a
        // modest band (50–80). The old formula (55 + up to 25 + up to 20) put
        // almost every same-role resume at about 92%.
        const respAvg = responsibilityMatches.reduce((a, b) => a + b.score, 0) / (responsibilityMatches.length || 1);
        const kwScore = Math.round(Math.min(1, kwRatio) * 15);
        const respScore = Math.round((respAvg / 100) * 15);
        overallScore = Math.min(80, Math.max(50, 50 + kwScore + respScore));
    }

    let summary = "";
    if (!isDomainMatch) {
        summary = `Your profile shows background in ${userRole || "another field"}, which does not align with the core technical requirements for ${job.title} at ${company}.`;
    } else if (overallScore >= 80) {
        summary = `Strong match: Your resume demonstrates high alignment for ${job.title} at ${company}, particularly in ${matchedKeywords.slice(0, 3).join(", ") || "core domain competencies"}. Your background strongly satisfies their primary requirements.`;
    } else if (overallScore >= 65) {
        summary = `Good alignment: Your resume covers key foundations for ${job.title} at ${company}, with proven background in ${matchedKeywords.slice(0, 2).join(", ") || "core skills"}. Incorporate target skills like ${missingKeywords.slice(0, 2).join(", ")} to maximize interview conversion.`;
    } else {
        summary = `Moderate alignment: You possess relevant transferable experience for ${job.title} at ${company}. Bridge key ATS gaps by incorporating quantified bullet points addressing ${missingKeywords.slice(0, 3).join(", ")}.`;
    }

    return {
        overallMatch: overallScore,
        summary,
        experienceMatch: {
            required: `${job.title} experience`,
            candidate: isDirectRoleMatch ? "Direct role match" : isDomainMatch ? "Transferable experience" : "Unrelated domain",
            score: isDirectRoleMatch ? 80 : isDomainMatch ? 45 : 15,
            note: isDirectRoleMatch
                ? "Strong background for target seniority"
                : isDomainMatch
                    ? "Related technical or business background"
                    : `Candidate background is in ${userRole || "a different domain"} without required ${job.title} background`,
        },
        responsibilityMatches,
        strengthsForRole: matchedKeywords.slice(0, 3).length ? matchedKeywords.slice(0, 3) : ["General professional experience"],
        gapsForRole: missingKeywords.slice(0, 3).length ? missingKeywords.slice(0, 3) : [`Core ${job.title} competencies`],
        interviewFocusAreas: [`Live problem solving for ${job.title}`, "Behavioral STAR impact stories", "Domain trade-offs"],
    };
}

