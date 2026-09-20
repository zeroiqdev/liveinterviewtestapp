import { NextRequest, NextResponse } from "next/server";
import { callJSON } from "@/engine/llm";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { extractDocumentText } from "@/lib/documentParser";
import { calculateAtsScore } from "@/lib/atsScorer";

export interface BulletReview {
    originalText: string;
    score: number; // 1-10
    isCompanyDescription: boolean;
    category?: "Impact & Metrics" | "Role Alignment & Keywords" | "Structure & Clarity" | "Action Verbs & Brevity";
    feedback?: string;
    recommendation?: string;
    rewritten?: string; // only if score < 7 and not company description
}

export interface ResumeScanResult {
    score: number;
    summary: string;
    strengths: string[];
    suggestions: Array<{
        category: "Impact & Metrics" | "Role Alignment & Keywords" | "Structure & Clarity" | "Action Verbs & Brevity";
        feedback: string;
        recommendation: string;
        targetSnippet?: string;
        proposedText?: string;
    }>;
    missingKeywords: string[];
    bulletReviews?: BulletReview[];
}

const SCAN_SYSTEM_PROMPT = `You are a top-tier executive talent scout and technical resume reviewer at FAANG / top fintechs.
Your job is to objectively analyze a candidate's resume/CV text against their targeted job role with BULLET-LEVEL precision.

CRITICAL RULES — you MUST follow these exactly:

1. DISTINGUISH COMPANY DESCRIPTIONS FROM ACHIEVEMENT BULLETS:
   - Lines like "Moniepoint is on a mission to power..." or "Norebase helps companies start..." or "Fidia offered freelancers..." are COMPANY DESCRIPTIONS — they describe the employer, not the candidate's achievements. Mark isCompanyDescription=true, give NO feedback and NO rewrite for these. Do NOT suggest improving them.
   - Only score and critique lines that describe the candidate's own actions, ownership, and impact (achievement bullets).

2. SCORING THRESHOLD — BE SELECTIVE:
   - Score EVERY achievement bullet 1-10 on: strong action verb, quantifiable business impact (numbers/%, Naira/$, users, tx volume), specificity of how it was done, and brevity.
   - If a bullet is ALREADY strong (7/10 or higher) — e.g. "Led the revamp of the Monnify Channels team onboarding flow to evade over 250 billion Naira in fines" or "Established the first growth task force ... 20% to 40% by Q1, 2025. Currently at 25%" or any bullet with clear ownership + hard metric + business risk — then mark it 7-10, leave feedback/recommendation/rewritten EMPTY, and DO NOT create a suggestion for it. Strong bullets need no rewrite.
   - ONLY for bullets scoring <7 (weak: vague verbs like "Responsible for", "Worked with", "Participated", "Helped", missing metrics, passive phrasing, or generic claims) provide feedback + recommendation + a GROUNDED rewrite.
   - DO NOT NITPICK OR GENERATE COSMETIC SUGGESTIONS: If a candidate has already revised and polished their bullets so that ownership and impact are clear, DO NOT nitpick minor stylistic word choices or synonyms. Only flag bullets with legitimate structural or metric deficiencies. If all bullets are 7+, return an empty suggestions array.

 3. GROUNDED REWRITES — NO FABRICATION:
    - Rewrites MUST reuse numbers/metrics already in the original bullet (e.g. keep "250 billion Naira", "30%", "99.99%", "100M transactions", "80% volume", "92.23% reduction"). Do NOT invent generic metrics like "35% velocity" or "95+ Lighthouse" unless they replace a vague claim and you signal they're illustrative.
    - Use Google X-Y-Z where helpful: "Accomplished [X] as measured by [Y] by doing [Z]" but keep it faithful to the original story.
    - Keep the candidate's voice and technology domain; don't switch product-manager context to frontend components.

 5. AVOID REPETITIVE TEMPLATES:
    - Do NOT start any feedback with "The description starts with" / "The bullet starts with" / "The text starts with" / "This bullet starts with". Never use that template.
    - Start directly with the weakness: e.g. "Vague build claim — no audience size, adoption, or business metric" / "Passive verb + missing scale — 'Built' understates ownership and impact" / "No measurable outcome — add users, revenue, or latency delta".
    - Each bullet's feedback must be distinct and specific to that bullet's verb/metric gap. Do NOT repeat the same opening clause across bullets.

4. RETURN FORMAT — you MUST return valid JSON with this exact structure:
{
  "score": <number 0-100 overall ATS + role readiness>,
  "summary": "<2-3 sentence executive critique>",
  "strengths": ["<cite specific strong bullets or skills>", "...", "..."],
  "suggestions": [
    {
      "category": "<Impact & Metrics | Role Alignment & Keywords | Structure & Clarity | Action Verbs & Brevity>",
      "feedback": "<why this bullet is weak>",
      "recommendation": "<how to fix>",
      "targetSnippet": "<exact original bullet text>",
      "proposedText": "<faithful rewrite with preserved metrics>"
    }
  ],
  "missingKeywords": ["<4-5 ATS keywords missing for role>"],
  "bulletReviews": [
    {
      "originalText": "<exact bullet text as in resume>",
      "score": <1-10>,
      "isCompanyDescription": <true|false>,
      "category": "<only if score <7>",
      "feedback": "<only if score <7>",
      "recommendation": "<only if score <7>",
      "rewritten": "<only if score <7, grounded rewrite>"
    }
  ]
}

- bulletReviews MUST cover every achievement bullet AND company-description line you identify (so frontend can map them 1:1 and skip 7+).
- suggestions array MUST be exactly the subset of bulletReviews where score <7 and isCompanyDescription=false (0 to 4 items — if all bullets are 7+, return empty suggestions array, that is correct).
- strengths MUST call out the strong bullets you scored 7+.
- Be precise and concise; do not generate generic template suggestions like "Engineered modular component design system" unless the original bullet was actually about frontend components.`;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            resumeText = "",
            role = "Software Engineer",
            domain = "Software & Engineering",
            email,
            resumeName = "My_Resume.pdf",
            fileData = "",
            doc: docFromClient,
            anchorMap: anchorMapFromClient,
        } = body as any;

        // If caller already has a canonical ResumeDoc (new architecture), use the structured pipeline
        if (docFromClient) {
            try {
                const { ResumeDocSchema } = await import("@/lib/resume/types");
                const parsedDoc = ResumeDocSchema.parse(docFromClient);
                const { suggestForDoc } = await import("@/lib/resume/ai/chunk");
                const { valid, dropped } = await suggestForDoc(parsedDoc);
                // Map RawSuggestion -> legacy ResumeScanResult shape for backward compat
                const { richTextToPlain } = await import("@/lib/resume/types");
                // Build legacy bulletReviews and suggestions from valid
                const flat = (await import("@/lib/resume/ai/flatten")).flattenDoc(parsedDoc);
                const nodesById = new Map(flat.map((n: any) => [n.id, n]));
                const bulletReviews: BulletReview[] = [];
                const suggestions: ResumeScanResult["suggestions"] = [];
                for (const s of valid) {
                    const node = nodesById.get(s.targetId);
                    const afterText = (s as any).after as string;
                    const catMap: Record<string, BulletReview["category"]> = {
                        impact: "Impact & Metrics",
                        clarity: "Action Verbs & Brevity",
                        keyword: "Role Alignment & Keywords",
                        grammar: "Structure & Clarity",
                        length: "Structure & Clarity",
                    };
                    const br: BulletReview = {
                        originalText: node?.text || "",
                        score: (s as any).severity === "high" ? 5 : (s as any).severity === "medium" ? 6 : 6,
                        isCompanyDescription: false,
                        category: catMap[(s as any).category] || "Impact & Metrics",
                        feedback: (s as any).rationale || "",
                        recommendation: `Apply: ${afterText.slice(0, 80)}`,
                        rewritten: afterText,
                    };
                    bulletReviews.push(br);
                    suggestions.push({
                        category: br.category!,
                        feedback: br.feedback!,
                        recommendation: br.recommendation!,
                        targetSnippet: br.originalText,
                        proposedText: afterText,
                    });
                }
                // Also include non-suggested nodes as 8/10 to satisfy UI's 7+ skip
                for (const n of flat) {
                    if (n.kind === "bullet" && !valid.some((v) => v.targetId === n.id)) {
                        bulletReviews.push({ originalText: n.text, score: 8, isCompanyDescription: false });
                    }
                }
                const extractedText = flat.map((n) => n.text).join("\n");
                const ats = calculateAtsScore(extractedText, role);
                const score = ats.overallScore;

                for (const extra of ats.extraBulletSuggestions) {
                    suggestions.push({
                        category: extra.category,
                        feedback: extra.feedback,
                        recommendation: extra.recommendation,
                        targetSnippet: extra.targetSnippet,
                        proposedText: extra.proposedText,
                    });
                }

                const result: ResumeScanResult = {
                    score,
                    summary: ats.summary || `Reviewed ${flat.filter((n) => n.kind === "bullet").length} bullets via canonical model against ${ats.seniority.label} standards.`,
                    strengths: ats.strengths.length > 0 ? ats.strengths : (valid.length ? [] : ["Strong, well-quantified bullets."]),
                    suggestions,
                    missingKeywords: ats.metrics.missingKeywords,
                    bulletReviews,
                };
                // Persist if email
                if (email) {
                    try {
                        await dbConnect();
                        const user = await User.findOne({ email: email.toLowerCase().trim() });
                        if (user) {
                            const resumeId = `cv_${Date.now()}`;
                            user.resumes.push({
                                id: resumeId,
                                name: resumeName,
                                rawText: flat.map((n) => n.text).join("\n"),
                                score: result.score,
                                summary: result.summary,
                                strengths: result.strengths,
                                suggestions: result.suggestions,
                                missingKeywords: result.missingKeywords,
                                improvedDoc: "",
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            } as any);
                            await user.save();
                        }
                    } catch {}
                }
                return NextResponse.json({ success: true, result, extractedText: flat.map((n) => n.text).join("\n"), usedNewPipeline: true, dropped });
            } catch (e) {
                console.warn("[api/resume/scan] new pipeline fallback to legacy:", (e as Error).message);
            }
        }

        const inputToExtract = fileData || resumeText;
        let parsedText = await extractDocumentText(inputToExtract, resumeName);

        if (!parsedText || parsedText.length < 30) {
            if (typeof resumeText === "string" && resumeText.trim().length >= 30 && !resumeText.startsWith("PK") && !resumeText.startsWith("%PDF")) {
                parsedText = resumeText.trim();
            }
        }

        if (!parsedText || parsedText.length < 30) {
            return NextResponse.json(
                { error: "Could not extract readable text from the uploaded file. Please ensure the file contains selectable text or upload a plain text / Markdown resume." },
                { status: 400 }
            );
        }

        const userPrompt = `TARGET ROLE: ${role}\nDOMAIN: ${domain}\n\nRESUME CONTENT:\n${parsedText.slice(0, 10000)}`;

        const result = await callJSON<ResumeScanResult>({
            system: SCAN_SYSTEM_PROMPT,
            user: userPrompt,
            maxTokens: 2500,
            timeoutMs: 35000,
        });

        const ats = calculateAtsScore(parsedText, role);
        result.score = ats.overallScore;
        if (ats.metrics.missingKeywords.length > 0) {
            result.missingKeywords = Array.from(new Set([...(result.missingKeywords || []), ...ats.metrics.missingKeywords]));
        }
        if (ats.strengths.length > 0) {
            result.strengths = Array.from(new Set([...(result.strengths || []), ...ats.strengths]));
        }
        for (const extra of ats.extraBulletSuggestions) {
            result.suggestions.push({
                category: extra.category,
                feedback: extra.feedback,
                recommendation: extra.recommendation,
                targetSnippet: extra.targetSnippet,
                proposedText: extra.proposedText,
            });
        }

        // Optionally persist scan to user record if email is provided
        if (email) {
            try {
                await dbConnect();
                const user = await User.findOne({ email: email.toLowerCase().trim() });
                if (user) {
                    const resumeId = `cv_${Date.now()}`;
                    user.resumes.push({
                        id: resumeId,
                        name: resumeName,
                        rawText: parsedText,
                        score: result.score,
                        summary: result.summary,
                        strengths: result.strengths,
                        suggestions: result.suggestions,
                        missingKeywords: result.missingKeywords,
                        improvedDoc: "",
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    });
                    await user.save();
                }
            } catch (dbErr) {
                console.warn("[api/resume/scan] Failed to persist scan to DB:", dbErr);
            }
        }

        return NextResponse.json({
            success: true,
            result,
            extractedText: parsedText,
        });
    } catch (err) {
        console.error("[api/resume/scan] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to scan resume" },
            { status: 500 }
        );
    }
}
