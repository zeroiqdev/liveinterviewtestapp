import { NextRequest, NextResponse } from "next/server";
import { callJSON } from "@/engine/llm";

interface InfuseResult {
    alreadyPresent: boolean;
    originalText: string;
    revisedText: string;
    explanation: string;
    targetJob?: string;
}

const INFUSE_SYSTEM = `You are a world-class executive resume writer and career strategist for premier technology and high-growth companies. Your objective is to infuse a critical missing ATS keyword into ONE existing experience bullet so that it forms a natural, grammatically impeccable sentence that maximizes both ATS parsing and human recruiter evaluation.

GRAMMATICAL & EDITORIAL STANDARDS:
1. NO CLUNKY APPENDAGES: Never append tacky trailer phrases like ", demonstrating KEYWORD" or ", with KEYWORD in delivery". The keyword must be an organic, grammatical part of the sentence (e.g. as the direct object, active participle phrase, or method: "orchestrated user research across 40+ cohorts", "integrated rigorous A/B testing into sprint cycles", "spearheaded stakeholder management across 5 engineering squads").
2. DO NOT CREATE A NEW BULLET: Identify the single most relevant existing experience bullet whose context naturally aligns with the keyword competency.
3. PRESERVE ORIGINAL METRICS & FACTS: Keep all existing quantitative data (percentages, revenue, dollar/naira figures, headcount, latencies). Do NOT fabricate new metrics; carry over the candidate's authentic metrics.
4. GOOGLE X-Y-Z SENTENCE STRUCTURE: Frame the sentence cleanly as "Accomplished [X], measured by [Y], by doing [Z]" or standard high-impact resume past-tense active voice ("Led...", "Architected...", "Executed...", "Streamlined...").
5. TENSE & AGREEMENT: Match the tense of the job (past tense for past roles, present tense for current roles). Ensure flawless subject-verb agreement and punctuation.
6. LENGTH & CRISPNESS: Keep the final sentence concise, readable, and under 38 words.
7. NEVER MODIFY COMPANY DESCRIPTIONS: Skip boilerplate employer overview lines. Target candidate action bullets only.
8. PRESERVE PREVIOUS KEYWORDS & ENHANCEMENTS: The bullet text may already contain previously infused keywords, tools, or technical frameworks. Under NO circumstances should you delete, overwrite, or strip any existing keywords, technologies, or achievements already present in the bullet. Preserve them entirely while weaving in the new keyword. If incorporating the new keyword would overcrowd this bullet, choose a different candidate experience bullet instead.

Return strict JSON:
{
  "alreadyPresent": <true|false>,
  "originalText": "<verbatim original bullet text chosen, or empty if already present>",
  "revisedText": "<cohesively rewritten sentence with keyword woven in seamlessly, or empty if already present>",
  "explanation": "<1 crisp sentence explaining why this bullet was chosen and how the revised phrasing strengthens role alignment>",
  "targetJob": "<job title and company, e.g. Senior Product Manager — Paystack>"
}`;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            resumeText = "",
            keyword = "",
            role = "Product Manager",
            domain = "Product & Design",
        } = body as { resumeText?: string; keyword?: string; role?: string; domain?: string };

        if (!keyword.trim()) return NextResponse.json({ error: "keyword is required" }, { status: 400 });
        if (!resumeText || resumeText.trim().length < 30) return NextResponse.json({ error: "resumeText is required (30+ chars)" }, { status: 400 });

        const userPrompt = `TARGET ROLE: ${role}
DOMAIN: ${domain}
KEYWORD TO INFUSE: "${keyword.trim()}"

RESUME TEXT:
${resumeText.slice(0, 9000)}

Compose a grammatically complete, natural sentence that weaves "${keyword.trim()}" into the best matching bullet.`;

        const result = await callJSON<InfuseResult>({
            system: INFUSE_SYSTEM,
            user: userPrompt,
            maxTokens: 900,
            timeoutMs: 20000,
        });

        // Normalize
        const kwLower = keyword.toLowerCase().trim();
        const alreadyPresent = Boolean(result.alreadyPresent) || (result.revisedText && result.revisedText.toLowerCase().includes(kwLower) && result.originalText && result.revisedText.toLowerCase().includes(kwLower) && resumeText.toLowerCase().includes(kwLower) && !result.originalText) || false;

        // Guard: if LLM says alreadyPresent, return directly
        if (result.alreadyPresent || alreadyPresent) {
            return NextResponse.json({ success: true, result: { ...result, alreadyPresent: true } });
        }

        // Ensure keyword actually in revisedText
        if (result.revisedText && !result.revisedText.toLowerCase().includes(kwLower)) {
            const cleanOrig = (result.originalText || result.revisedText).trim().replace(/\.+$/, "");
            // Grammatically integrate based on keyword phrasing
            if (/^(agile|scrum|kanban|lean)/i.test(keyword)) {
                result.revisedText = `${cleanOrig} by applying ${keyword.trim()} methodologies across cross-functional team sprints.`;
            } else if (/^(user research|market research|data analysis|a\/b testing|testing)/i.test(keyword)) {
                result.revisedText = `${cleanOrig}, leveraging ${keyword.trim()} to validate product hypotheses and optimize conversion.`;
            } else {
                result.revisedText = `${cleanOrig}, utilizing ${keyword.trim()} to accelerate roadmap delivery and cross-team execution.`;
            }
        }

        // Ensure revised is not identical to original
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        if (result.originalText && result.revisedText && norm(result.originalText) === norm(result.revisedText)) {
            const orig = result.originalText.trim().replace(/\.+$/, "");
            result.revisedText = `${orig}, leveraging ${keyword.trim()} to strengthen end-to-end ${role.toLowerCase()} outcomes.`;
        }

        return NextResponse.json({ success: true, result });
    } catch (err) {
        console.error("[api/resume/infuse-keyword] Error:", err);
        return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to infuse keyword" }, { status: 500 });
    }
}
