import { NextRequest, NextResponse } from "next/server";
import { callJSON } from "@/engine/llm";
import dbConnect from "@/lib/mongodb";
import User, { type IResume, type IUser } from "@/models/User";
import { extractDocumentText } from "@/lib/documentParser";
import { calculateAtsScore, scoreGaps } from "@/lib/atsScorer";
import { requireAuth } from "@/lib/session";
import { RESUME_REVIEW_VERSION } from "@/lib/resumeReviewVersion";
import { saveResumeFile } from "@/lib/resumeFiles";
import { plainWords } from "@/lib/plainWords";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

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

const SCAN_SYSTEM_PROMPT = `You are an experienced recruiter reviewing a candidate's resume for the role they are applying to. Many candidates are early in their careers and work outside the tech industry (customer service, sales, banking, administration, oil and gas), mostly in Nigeria and elsewhere in Africa.
Your job is to review the resume against the TARGET ROLE with BULLET-LEVEL precision, judging it by what a hiring manager for THAT role and level expects.

TONE — applies to "summary", "feedback" and "recommendation":
- Write to the candidate as "you", in plain, direct English. Be honest and useful, never harsh or grand.
- Never mention FAANG, big tech, fintech standards, "executive", "elite", "top-tier" or "world-class". Compare the resume only with what the target role needs.
- No jargon: do not say "X-Y-Z formula", "ATS", "leverage", "synergy" or "stakeholder alignment". Say what to change in ordinary words.
- Use the vocabulary of the candidate's own field. A customer service line is about customers, calls and complaints, not "product ownership" or "user validation".
- Never mention AI or that this was generated.
- Use standard professional resume language: open lines with common, strong verbs such as Led, Built, Launched, Delivered, Managed, Designed, Defined, Wrote, Drove, Grew, Increased, Reduced, Improved, Introduced, Analysed, Negotiated. Avoid unusual or inflated words: not "Authored", "Spearheaded", "Orchestrated", "Championed", "Pioneered", "Utilized", "Leveraged", "Facilitated", "Synergized", "Helmed".

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
    - Rewrites MUST reuse numbers/metrics already in the original bullet (e.g. keep "250 billion Naira", "30%", "99.99%", "100M transactions", "80% volume", "92.23% reduction").
    - Where a result needs a number the bullet doesn't give, suggest a realistic, conservative estimate the person can confirm: base it on figures and scale elsewhere in the resume (team size, partners, users, timeframes), prefer modest round numbers, and never anything extreme (e.g. "cutting response time by 20%"). The person is shown it as a suggestion to confirm. Never add a result or claim the bullet doesn't state.
    - Where it helps, say what was achieved, how it was measured and how it was done, keeping to the original story.
    - Never write placeholders such as [X], [Y] or [number]: every rewrite must read as a finished line.
    - Keep the candidate's voice and technology domain; don't switch product-manager context to frontend components.

 5. AVOID REPETITIVE TEMPLATES:
    - Do NOT start any feedback with "The description starts with" / "The bullet starts with" / "The text starts with" / "This bullet starts with". Never use that template.
    - Start directly with the weakness: e.g. "Vague build claim — no audience size, adoption, or business metric" / "Passive verb + missing scale — 'Built' understates ownership and impact" / "No measurable outcome — add users, revenue, or latency delta".
    - Each bullet's feedback must be distinct and specific to that bullet's verb/metric gap. Do NOT repeat the same opening clause across bullets.

4. RETURN FORMAT — you MUST return valid JSON with this exact structure:
{
  "score": <number 0-100 overall ATS + role readiness>,
  "summary": "<2-3 plain sentences to the candidate: what is working, the main thing holding the resume back for this role, and what to do first>",
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
- suggestions array MUST be exactly the subset of bulletReviews where score <7 and isCompanyDescription=false (0 to 4 items — if all bullets are 7+, return empty suggestions array, that is correct). EXCEPTION: when the RESUME SCORE given with the resume is below 75, always return the 2 to 4 weakest achievement lines as suggestions, scoring them 6 in bulletReviews.
- The summary MUST agree with the RESUME SCORE given with the resume: never call a resume strong when its score is below 70.
- strengths MUST call out the strong bullets you scored 7+.
- Be precise and concise; do not generate generic template suggestions like "Engineered modular component design system" unless the original bullet was actually about frontend components.`;

/** Adds a scanned resume to the account, or updates it if that id is already saved. */
function saveScannedResume(user: IUser, resume: Omit<IResume, "createdAt" | "updatedAt">) {
    const existing = user.resumes.find((r) => r.id === resume.id);
    const saved = { ...resume, reviewVersion: RESUME_REVIEW_VERSION };
    if (existing) Object.assign(existing, saved, { updatedAt: new Date() });
    else user.resumes.push({ ...saved, createdAt: new Date(), updatedAt: new Date() } as IResume);
}

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAuth(req);
        if ("errorResponse" in authResult) return authResult.errorResponse;
        const limited = await rateLimit(LIMITS.llm, `user:${authResult.session.email}`);
        if (limited) return limited;

        const body = await req.json();
        const {
            resumeText = "",
            role = "Software Engineer",
            domain = "Software & Engineering",
            resumeName = "My_Resume.pdf",
            fileData = "",
            doc: docFromClient,
            anchorMap: anchorMapFromClient,
            resumeId: resumeIdFromClient,
        } = body as any;
        // The id the browser gave this resume, so the scan updates that entry
        // instead of saving the same file a second time under a new id.
        const resumeId = typeof resumeIdFromClient === "string" && /^[\w-]{1,80}$/.test(resumeIdFromClient) ? resumeIdFromClient : `cv_${Date.now()}`;
        // Saved results always go to the signed-in user, never an email from the body.
        const email = authResult.session.email;

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
                            saveScannedResume(user, {
                                id: resumeId,
                                name: resumeName,
                                rawText: flat.map((n) => n.text).join("\n"),
                                score: result.score,
                                summary: result.summary,
                                strengths: result.strengths,
                                suggestions: result.suggestions,
                                missingKeywords: result.missingKeywords,
                                improvedDoc: "",
                            });
                            await user.save();
                        }
                    } catch {}
                }
                return NextResponse.json({ success: true, result, extractedText: flat.map((n) => n.text).join("\n"), usedNewPipeline: true, dropped, reviewVersion: RESUME_REVIEW_VERSION });
            } catch (e) {
                console.warn("[api/resume/scan] new pipeline fallback to legacy:", (e as Error).message);
            }
        }

        // Keep the Word file itself, so the editor's download keeps its formatting.
        if (email && fileData) await saveResumeFile(email, resumeId, resumeName, fileData).catch(() => false);

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

        // The score is worked out first and given to the reviewer, so the
        // summary agrees with it and a low score always comes with lines to fix.
        const ats = calculateAtsScore(parsedText, role);
        const gaps = scoreGaps(ats);
        const scoreContext = `RESUME SCORE: ${ats.overallScore} out of 100 (${ats.verdict}).\nWHAT IS LOWERING IT:\n${
            gaps.length > 0 ? gaps.map((gap) => `- ${gap.title}: ${gap.detail}`).join("\n") : "- Nothing significant."
        }\n${
            ats.overallScore < 75
                ? "Because the score is below 75, return the 2 to 4 weakest achievement lines as suggestions even if none is below 7, each with a grounded rewrite. Your summary must match the score: do not call the resume strong."
                : ""
        }`;
        const userPrompt = `TARGET ROLE: ${role}\nDOMAIN: ${domain}\n\n${scoreContext}\n\nRESUME CONTENT:\n${parsedText.slice(0, 10000)}`;

        const result = await callJSON<ResumeScanResult>({
            system: SCAN_SYSTEM_PROMPT,
            user: userPrompt,
            maxTokens: 2500,
            timeoutMs: 35000,
        });

        result.score = ats.overallScore;
        // Standard resume wording, whatever the model reached for.
        result.suggestions = (result.suggestions || []).map((sug) => ({ ...sug, proposedText: sug.proposedText ? plainWords(sug.proposedText) : sug.proposedText }));
        result.bulletReviews = (result.bulletReviews || []).map((b) => ({ ...b, rewritten: b.rewritten ? plainWords(b.rewritten) : b.rewritten }));
        if (ats.metrics.missingKeywords.length > 0) {
            result.missingKeywords = Array.from(new Set([...(result.missingKeywords || []), ...ats.metrics.missingKeywords]));
        }
        if (ats.strengths.length > 0) {
            result.strengths = Array.from(new Set([...(result.strengths || []), ...ats.strengths]));
        }
        // A low score always comes with lines to fix: if the reviewer listed
        // none, use its weakest reviewed lines that have a rewrite.
        if (ats.overallScore < 75 && (!result.suggestions || result.suggestions.length === 0)) {
            result.suggestions = (result.bulletReviews || [])
                .filter((b) => !b.isCompanyDescription && b.rewritten && b.rewritten.trim() !== b.originalText.trim())
                .sort((a, b) => a.score - b.score)
                .slice(0, 4)
                .map((b) => ({
                    category: b.category || "Impact & Metrics",
                    feedback: b.feedback || "This line could show more clearly what you did and what came of it.",
                    recommendation: b.recommendation || "Say what you did and the result, with a number if you have one.",
                    targetSnippet: b.originalText,
                    proposedText: b.rewritten!,
                }));
        }

        // Optionally persist scan to user record if email is provided
        if (email) {
            try {
                await dbConnect();
                const user = await User.findOne({ email: email.toLowerCase().trim() });
                if (user) {
                    saveScannedResume(user, {
                        id: resumeId,
                        name: resumeName,
                        rawText: parsedText,
                        score: result.score,
                        summary: result.summary,
                        strengths: result.strengths,
                        suggestions: result.suggestions,
                        missingKeywords: result.missingKeywords,
                        improvedDoc: "",
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
            reviewVersion: RESUME_REVIEW_VERSION,
        });
    } catch (err) {
        return serverError("api/resume/scan", err, "Failed to scan resume");
    }
}
