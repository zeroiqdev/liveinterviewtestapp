/* ══════════════════════════════════════════════════════════════════════
   Question Synthesizer Engine — Dynamic LLM Generation & Anti-Repetition
   Ensures questions strictly match the interview type (System Design,
   SQL & Analytics, Technical Coding, Behavioral) and company context.
   ══════════════════════════════════════════════════════════════════════ */

import { callJSON } from "./llm";
import { QUESTION_BANK } from "./data";
import type { BankQuestion } from "./types";
import fs from "fs";
import path from "path";

// In-memory cache for fast retrieval during session turns
const dynamicQuestionCache = new Map<string, BankQuestion[]>();

/**
 * Normalizes an interview type into a canonical bucket
 */
export function canonicalInterviewType(raw?: string | null): "system_design" | "sql_analytics" | "technical" | "behavioral" | "product_sense" | "devops" | "general" {
    if (!raw) return "general";
    const t = raw.toLowerCase();
    if (t.includes("system design") || t.includes("architecture & scale") || t.includes("system architecture")) {
        return "system_design";
    }
    if (t.includes("sql") || t.includes("analytics technical drill") || t.includes("analytics drill") || t.includes("sql & analytics")) {
        return "sql_analytics";
    }
    if (t.includes("technical") || t.includes("live coding") || t.includes("problem solving") || t.includes("coding")) {
        return "technical";
    }
    if (t.includes("behavioral") || t.includes("leadership") || t.includes("star method") || t.includes("culture")) {
        return "behavioral";
    }
    if (t.includes("product sense") || t.includes("execution & metrics") || t.includes("user journey")) {
        return "product_sense";
    }
    if (t.includes("cloud") || t.includes("devops") || t.includes("kubernetes") || t.includes("sre") || t.includes("incident")) {
        return "devops";
    }
    return "general";
}

/**
 * Checks whether a question is truly relevant to the requested interview type.
 * Eliminates generic behavioral questions when the user is in a Technical, System Design, or SQL drill.
 */
export function isQuestionRelevantToType(questionText: string, interviewType?: string | null): boolean {
    const canonical = canonicalInterviewType(interviewType);
    if (canonical === "general") return true;

    const lower = questionText.toLowerCase();

    // Check for clearly unrelated generic behavioral questions in technical drills
    const isGenericBehavioralOpener =
        lower.includes("tell me about yourself") ||
        lower.includes("walk me through your resume") ||
        lower.includes("why are you interested in this position") ||
        lower.includes("conflict with a colleague") ||
        lower.includes("disagreement with your manager") ||
        lower.includes("underperforming team member") ||
        lower.includes("miss its hard deadline");

    if (canonical === "system_design") {
        if (isGenericBehavioralOpener) return false;
        const systemKeywords = [
            "system", "architecture", "scale", "distributed", "database", "sharding",
            "caching", "cache", "latency", "throughput", "rate limit", "load balancer",
            "microservice", "message queue", "kafka", "redis", "idempotent", "ledger",
            "geospatial", "webhook", "failover", "api design", "storage", "streaming"
        ];
        return systemKeywords.some((kw) => lower.includes(kw));
    }

    if (canonical === "sql_analytics") {
        if (isGenericBehavioralOpener) return false;
        const sqlKeywords = [
            "sql", "query", "queries", "window function", "join", "joins", "aggregate",
            "cte", "table", "schema", "metrics", "dau", "mau", "retention", "cohort",
            "churn", "index", "execution plan", "data warehouse", "analytics", "group by"
        ];
        return sqlKeywords.some((kw) => lower.includes(kw));
    }

    if (canonical === "technical") {
        if (isGenericBehavioralOpener) return false;
        const techKeywords = [
            "code", "coding", "algorithm", "data structure", "concurrency", "async",
            "thread", "function", "array", "react", "hook", "component", "api", "memory",
            "complexity", "o(n)", "runtime", "race condition", "lock", "database", "event loop"
        ];
        return techKeywords.some((kw) => lower.includes(kw));
    }

    if (canonical === "behavioral") {
        return (
            lower.includes("tell me about a time") ||
            lower.includes("describe a situation") ||
            lower.includes("walk me through") ||
            lower.includes("how do you handle") ||
            lower.includes("conflict") ||
            lower.includes("leadership") ||
            lower.includes("failure") ||
            lower.includes("feedback") ||
            lower.includes("deadline") ||
            lower.includes("prioritize")
        );
    }

    return true;
}

interface SynthesizeOptions {
    role?: string | null;
    seniority?: string | null;
    company?: string | null;
    interviewType?: string | null;
    isSpecificJob?: boolean;
    jobDescription?: string;
    jobResponsibilities?: string[];
    resumeText?: string;
    excludeQuestionIds?: string[];
    excludeQuestionTexts?: string[];
    count?: number;
}

/**
 * Dynamically synthesizes tailored interview questions via LLM.
 * Strictly adheres to interview type (System Design, SQL, Technical, Behavioral)
 * and incorporates company-specific products and engineering challenges.
 */
export async function synthesizeQuestionsForSession(opts: SynthesizeOptions): Promise<BankQuestion[]> {
    const role = opts.role || "Software Engineer";
    const seniority = opts.seniority || "Mid-to-Senior";
    const company = (opts.company && opts.company !== "General" && opts.company !== "General Industry Benchmark" && opts.company !== "Target Role")
        ? opts.company
        : null;
    const interviewType = opts.interviewType || "Technical Interview";
    const canonical = canonicalInterviewType(interviewType);
    const count = opts.count || 4;

    const excludeTexts = (opts.excludeQuestionTexts || []).slice(0, 15);
    const excludeBlock = excludeTexts.length > 0
        ? `DO NOT ASK OR REPEAT ANY OF THESE PREVIOUSLY ASKED QUESTIONS:\n${excludeTexts.map((t) => `- "${t}"`).join("\n")}`
        : "Ensure all questions are fresh, realistic, and distinct.";

    const companyDirective = company
        ? `COMPANY FOCUS: The candidate is practicing specifically for ${company}.
Every question MUST be tailored to ${company}'s actual business, products, scale, and technical domain (e.g. if Paystack/Stripe: payment gateways, webhook delivery, transaction idempotency, ledger; if Uber: geospatial matching, surge dispatch; if Google: global distributed storage, P99 latency; if Amazon: high-scale logistics, Bar Raiser standards).`
        : `GENERAL BENCHMARK: The candidate is practicing for a top-tier industry benchmark role without a specific company constraint. Questions should test core industry-standard depth.`;

    let typeGuideline = "";
    if (canonical === "system_design") {
        typeGuideline = `CRITICAL INTERVIEW TYPE REQUIREMENT: SYSTEM DESIGN
The candidate explicitly chose SYSTEM DESIGN.
Every single question MUST be an architectural system design scenario involving data flows, scale estimation, database choices (SQL vs NoSQL, sharding, replication), caching strategies, message queues, API contracts, latency trade-offs, and failure recovery.
DO NOT provide generic behavioral questions. DO NOT provide simple LeetCode algorithm puzzles.`;
    } else if (canonical === "sql_analytics") {
        typeGuideline = `CRITICAL INTERVIEW TYPE REQUIREMENT: SQL & ANALYTICS
The candidate explicitly chose SQL & ANALYTICS.
Every single question MUST present concrete analytical scenarios, schema definitions, multi-table joins, window functions (ROW_NUMBER, DENSE_RANK, LEAD, LAG), cohort retention analysis, metric calculations (DAU, churn, LTV), query optimization, or indexing.
DO NOT provide generic behavioral questions. DO NOT ask front-end or general software questions.`;
    } else if (canonical === "technical") {
        typeGuideline = `CRITICAL INTERVIEW TYPE REQUIREMENT: TECHNICAL IMPLEMENTATION & CODING
The candidate explicitly chose TECHNICAL / LIVE CODING.
Every single question MUST drill into technical programming, algorithmic trade-offs, data structures, concurrency handling, async state management, or architecture implementation tailored to the role (${role}).
DO NOT ask general behavioral questions like "Tell me about a time you had a conflict".`;
    } else if (canonical === "behavioral") {
        typeGuideline = `CRITICAL INTERVIEW TYPE REQUIREMENT: BEHAVIORAL & LEADERSHIP (STAR METHOD)
Every question MUST evaluate past behavior, conflict resolution, dealing with ambiguous requirements, cross-functional pushback, technical disagreements, and ownership using the STAR method.`;
    } else {
        typeGuideline = `INTERVIEW TYPE: ${interviewType}. Align questions directly to the technical and operational responsibilities of ${role}.`;
    }

    const systemPrompt = `You are a Principal Interview Architect at Get Prepped. Your job is to generate rigorous, authentic, deeply realistic interview questions.

Rules:
1. STRICT TYPE ALIGNMENT: Questions must perfectly match the requested interview type (${interviewType}).
2. NO GENERIC REPETITION: Every question must be non-generic, challenging, and detailed.
3. COMPANY CONTEXT: If a company is provided (${company || "None"}), anchor questions in that company's real-world engineering challenges and products.
4. Output strictly valid JSON matching the schema below:
{
  "questions": [
    {
      "id": "string (unique prefixed id e.g. gen_sys_01)",
      "question": "string (the exact question as the interviewer would say it, clear and realistic)",
      "category": "string (matching category e.g. System Design, SQL & Analytics, Technical Implementation, Behavioral)",
      "difficulty": "Easy" | "Medium" | "Hard",
      "expected_points": ["string (key points candidate must cover)"]
    }
  ]
}`;

    const userPrompt = `Generate ${count} distinct, high-caliber interview questions.

Role: ${role} (${seniority})
Interview Type: ${interviewType}
${companyDirective}
${typeGuideline}

${opts.jobResponsibilities && opts.jobResponsibilities.length > 0 ? `Target Job Responsibilities:\n${opts.jobResponsibilities.slice(0, 4).map((r) => `- ${r}`).join("\n")}` : ""}

${opts.resumeText ? `Candidate Resume Highlight: ${opts.resumeText.slice(0, 500)}...` : ""}

${excludeBlock}

Output only JSON with ${count} questions.`;

    try {
        const response = await callJSON<{
            questions?: Array<{
                id?: string;
                question: string;
                category?: string;
                difficulty?: string;
                expected_points?: string[];
            }>;
        }>({
            system: systemPrompt,
            user: userPrompt,
            maxTokens: 1400,
            temperature: 0.35, // Slightly higher temperature for diverse questions
        });

        const rawList = response.questions || [];
        if (rawList.length === 0) throw new Error("Empty questions returned by LLM");

        const roleFamily = determineRoleFamily(role);
        const category = determineCategory(canonical, rawList[0]?.category);

        const bankQuestions: BankQuestion[] = rawList.map((item, idx) => ({
            id: item.id || `synth_${canonical}_${Date.now()}_${idx}`,
            role_family: roleFamily,
            sub_type: item.difficulty?.toLowerCase() || "medium",
            question: item.question.replace(/\*\*(.*?)\*\*/g, "$1").trim(),
            category,
            applies_to_all: canonical === "behavioral",
            source: company ? `llm_tailored_${company.toLowerCase()}` : "llm_synthesized",
        }));

        // Cache in memory
        const cacheKey = `${roleFamily}_${canonical}_${company || "general"}`;
        const existing = dynamicQuestionCache.get(cacheKey) || [];
        dynamicQuestionCache.set(cacheKey, [...bankQuestions, ...existing].slice(0, 30));

        // Background asynchronous persistence to permanent question bank
        persistQuestionsSafely(bankQuestions).catch(() => {});

        return bankQuestions;
    } catch (err) {
        console.error("Failed to synthesize questions via LLM:", err);
        // Return fallback questions relevant to the requested type
        return getFallbackQuestionsForType(canonical, role, company);
    }
}

/**
 * Pre-synthesizes and caches questions when a role is applied to the account.
 * "better still as soon as that role is applied to the account"
 */
export async function synthesizeQuestionsForRole(role: string, domain?: string): Promise<void> {
    const roleFamily = determineRoleFamily(role);
    const typesToSeed: Array<"system_design" | "sql_analytics" | "technical" | "behavioral"> = [];

    if (roleFamily === "software_tech") {
        typesToSeed.push("system_design", "technical", "behavioral");
    } else if (roleFamily === "data_science") {
        typesToSeed.push("sql_analytics", "technical", "behavioral");
    } else if (roleFamily === "devops_sre") {
        typesToSeed.push("system_design", "technical", "behavioral");
    } else {
        typesToSeed.push("technical", "behavioral");
    }

    for (const type of typesToSeed) {
        const cacheKey = `${roleFamily}_${type}_general`;
        if (!dynamicQuestionCache.has(cacheKey) || (dynamicQuestionCache.get(cacheKey)?.length || 0) < 3) {
            try {
                await synthesizeQuestionsForSession({
                    role,
                    interviewType: type === "system_design" ? "System Design" : type === "sql_analytics" ? "SQL & Analytics" : type === "technical" ? "Technical Interview" : "Behavioral Interview",
                    count: 4,
                });
            } catch {
                // Ignore background error
            }
        }
    }
}

/**
 * Retrieves unasked candidate questions for a given session.
 * Excludes previously asked IDs, filters for interview type relevance,
 * and falls back to dynamic LLM synthesis if the pool is depleted.
 */
export async function getFreshQuestionsForSession(opts: {
    role: string;
    interviewType?: string | null;
    company?: string | null;
    alreadyAskedIds: Set<string>;
    resumeText?: string;
}): Promise<BankQuestion[]> {
    const { role, interviewType, company, alreadyAskedIds } = opts;
    const canonical = canonicalInterviewType(interviewType);
    const roleFamily = determineRoleFamily(role);

    // 1. Gather matching questions from static bank + in-memory cache
    const cacheKey = `${roleFamily}_${canonical}_${company || "general"}`;
    const cached = dynamicQuestionCache.get(cacheKey) || [];

    const allPool: BankQuestion[] = [...cached, ...QUESTION_BANK];

    // Filter strictly:
    // a. Must not have been asked before
    // b. Must be relevant to the requested interview type
    // c. If company practice is specified, prefer company-tagged questions
    let candidates = allPool.filter((q) => {
        if (alreadyAskedIds.has(q.id)) return false;
        if (!isQuestionRelevantToType(q.question, interviewType)) return false;

        if (company) {
            // If company-specific question exists, keep it
            if (q.source?.includes(company.toLowerCase()) || q.question.toLowerCase().includes(company.toLowerCase())) {
                return true;
            }
        }

        // Check category / role family match
        if (canonical === "system_design") {
            return q.category === "System Design" || q.question.toLowerCase().includes("system");
        }
        if (canonical === "sql_analytics") {
            return q.category.includes("SQL") || q.category.includes("Analytics");
        }
        if (canonical === "technical") {
            return q.role_family === roleFamily && (q.category.includes("Algorithm") || q.category.includes("Technical"));
        }
        if (canonical === "behavioral") {
            return q.role_family === "general" || q.category.includes("conflict") || q.category.includes("growth");
        }

        return q.role_family === roleFamily || q.applies_to_all;
    });

    // 2. If candidates are sparse (< 3) or if practicing for a specific company with no company questions yet:
    // Dynamically synthesize fresh questions on the spot!
    const needsSynthesis =
        candidates.length < 3 ||
        (company && !candidates.some((c) => c.question.toLowerCase().includes(company.toLowerCase())));

    if (needsSynthesis) {
        const synthesized = await synthesizeQuestionsForSession({
            role,
            company,
            interviewType,
            excludeQuestionIds: Array.from(alreadyAskedIds),
            excludeQuestionTexts: candidates.map((c) => c.question),
            resumeText: opts.resumeText,
            count: 4,
        });

        // Prepend fresh synthesized questions
        candidates = [...synthesized, ...candidates];
    }

    // Shuffle candidates so the candidate does not get the same deterministic order
    return shuffleArray(candidates);
}

function determineRoleFamily(role: string): string {
    const r = (role || "").toLowerCase();
    if (r.includes("data") || r.includes("analyst") || r.includes("machine learning") || r.includes("ai")) return "data_science";
    if (r.includes("product manager") || r.includes("pm")) return "product_management";
    if (r.includes("devops") || r.includes("sre") || r.includes("cloud")) return "devops_sre";
    if (r.includes("sales") || r.includes("bizdev")) return "sales_bizdev";
    if (r.includes("bank") || r.includes("finance")) return "banking_finance";
    if (r.includes("customer")) return "customer_service";
    if (r.includes("virtual")) return "virtual_assistant";
    if (r.includes("oil") || r.includes("gas")) return "oil_gas";
    return "software_tech";
}

function determineCategory(canonical: string, fallbackCategory?: string): string {
    if (canonical === "system_design") return "System Design";
    if (canonical === "sql_analytics") return "SQL & Analytics";
    if (canonical === "technical") return "Technical Implementation";
    if (canonical === "behavioral") return "conflict_resolution";
    return fallbackCategory || "general";
}

function shuffleArray<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

async function persistQuestionsSafely(newQuestions: BankQuestion[]): Promise<void> {
    try {
        const { saveQuestion } = await import("@/lib/adminStorage");
        for (const q of newQuestions) {
            await saveQuestion(q as any);
        }
    } catch {
        // Safe failover
    }
}

function getFallbackQuestionsForType(canonical: string, role: string, company?: string | null): BankQuestion[] {
    if (canonical === "system_design") {
        return [
            {
                id: `fallback_sys_${Date.now()}_1`,
                role_family: "software_tech",
                sub_type: "hard",
                question: company
                    ? `How would you design the core transactional processing system for ${company}, ensuring strict idempotency and zero duplicate transactions during network partitions?`
                    : "How would you design a distributed, highly available payment processing system that guarantees idempotency and zero duplicate charges during network partitions?",
                category: "System Design",
                applies_to_all: false,
                source: "fallback",
            },
            {
                id: `fallback_sys_${Date.now()}_2`,
                role_family: "software_tech",
                sub_type: "medium",
                question: company
                    ? `At ${company}, services handle rapid traffic spikes. How would you design a distributed rate limiter that coordinates across multiple regional clusters with sub-millisecond overhead?`
                    : "Design a distributed rate limiter supporting both IP-based and token-bucket algorithms that works across multiple data centers with low latency using Redis and local caches.",
                category: "System Design",
                applies_to_all: false,
                source: "fallback",
            },
        ];
    }

    if (canonical === "sql_analytics") {
        return [
            {
                id: `fallback_sql_${Date.now()}_1`,
                role_family: "data_science",
                sub_type: "medium",
                question: "Write a SQL query using window functions (e.g. DENSE_RANK() or ROW_NUMBER()) to find the top 3 highest spending customers in each geographic region from a transactions table, handling ties gracefully.",
                category: "SQL & Analytics",
                applies_to_all: false,
                source: "fallback",
            },
            {
                id: `fallback_sql_${Date.now()}_2`,
                role_family: "data_science",
                sub_type: "hard",
                question: "How would you write a query to calculate month-over-month user retention cohorts? Walk me through the CTE logic and how you compute cohort active percentages across consecutive months.",
                category: "SQL & Analytics",
                applies_to_all: false,
                source: "fallback",
            },
        ];
    }

    return [
        {
            id: `fallback_tech_${Date.now()}_1`,
            role_family: "software_tech",
            sub_type: "medium",
            question: `For a ${role} role, walk me through how you would implement a concurrency-safe in-memory cache with LRU eviction policy and thread safety in your primary language.`,
            category: "Technical Implementation",
            applies_to_all: false,
            source: "fallback",
        },
    ];
}
