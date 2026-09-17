import { NextRequest, NextResponse } from "next/server";
import { callJSON } from "@/engine/llm";

interface InfuseResult {
    alreadyPresent: boolean;
    originalText: string;
    revisedText: string;
    explanation: string;
    targetJob?: string;
}

const INFUSE_SYSTEM = `You are an elite executive resume writer for FAANG/fintech. Your task is to fuse a missing ATS keyword into ONE existing experience bullet so that it reads as a single, grammatically flawless sentence that would raise the resume's ATS score.

STRICT RULES — the sentence must be indistinguishable from a human-written achievement:
- Do NOT create a new bullet. Pick the single most semantically relevant existing experience bullet where the keyword fits naturally (prefer the bullet whose action, domain, or outcome already implies the keyword's competency).
- Preserve all original numbers/metrics (Naira, %, transactions, users, etc.). Do NOT invent metrics. You may reuse the original metric verbatim.
- The keyword must appear verbatim (case-insensitive) inside revisedText, woven into the clause that describes the action or the outcome — never tacked on as ", demonstrating KEYWORD" or "with KEYWORD". It must read as if the experience originally involved that competency.
- The result must be a single, fluid sentence (<36 words) in Google X-Y-Z form where possible: "Accomplished [X] as measured by [Y] by doing [Z]". Subject-verb agreement, tense, and punctuation must be perfect.
- The rewrite must be strictly better for ATS and for a human reviewer for the target role (keyword adds role alignment without sounding forced). If the original bullet is already strong (7/10+), do not return it; return alreadyPresent:true only if the keyword already appears meaningfully in an experience bullet.
- Company descriptions (e.g. "Moniepoint is on a mission...") are off-limits — never pick those.
- Return strict JSON only.

Return JSON:
{
  "alreadyPresent": <true|false>,
  "originalText": "<exact original bullet text picked, or empty if alreadyPresent>",
  "revisedText": "<rewritten bullet with keyword infused neatly, or empty if alreadyPresent>",
  "explanation": "<1 sentence why this bullet was chosen and how keyword adds role alignment>",
  "targetJob": "<job title/company where bullet lives, e.g. Senior Product Manager — Moniepoint>"
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

        // Quick already-present check before calling LLM
        if (resumeText.toLowerCase().includes(keyword.toLowerCase())) {
            // Still let LLM confirm if it's a meaningful presence vs incidental; but we can fast-return
            // Let LLM decide — don't short-circuit, because keyword might be in skills but not in experience
        }

        const userPrompt = `TARGET ROLE: ${role}
DOMAIN: ${domain}
KEYWORD TO INFUSE: "${keyword.trim()}"

RESUME TEXT:
${resumeText.slice(0, 9000)}`;

        const result = await callJSON<InfuseResult>({
            system: INFUSE_SYSTEM,
            user: userPrompt,
            maxTokens: 900,
            timeoutMs: 20000,
        });

        // Normalize
        const kwLower = keyword.toLowerCase().trim();
        const alreadyPresent = Boolean(result.alreadyPresent) || (result.revisedText && result.revisedText.toLowerCase().includes(kwLower) && result.originalText && result.revisedText.toLowerCase().includes(kwLower) && resumeText.toLowerCase().includes(kwLower) && !result.originalText) || false;

        // Guard: if LLM says alreadyPresent but originalText empty, keep as is
        if (result.alreadyPresent) {
            return NextResponse.json({ success: true, result });
        }

        // Ensure keyword actually in revisedText
        if (result.revisedText && !result.revisedText.toLowerCase().includes(kwLower)) {
            // Force-append neatly
            result.revisedText = result.revisedText.replace(/\.$/, "") + `, demonstrating ${keyword.trim()} in delivery.`;
        }

        // Ensure revised is not identical to original
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        if (result.originalText && result.revisedText && norm(result.originalText) === norm(result.revisedText)) {
            // LLM returned identical — synthesize a minimal neat infusion
            const orig = result.originalText.trim().replace(/\.$/, "");
            result.revisedText = `${orig}, embedding ${keyword.trim()} to align cross-functional execution with ${role} priorities.`;
        }

        return NextResponse.json({ success: true, result });
    } catch (err) {
        console.error("[api/resume/infuse-keyword] Error:", err);
        return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to infuse keyword" }, { status: 500 });
    }
}
