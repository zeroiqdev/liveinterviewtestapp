import { NextRequest, NextResponse } from "next/server";
import { callJSON } from "@/engine/llm";
import { requireAuth } from "@/lib/session";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";
import { plainWords } from "@/lib/plainWords";

export const dynamic = "force-dynamic";

/**
 * POST /api/resume/improve — the fixes behind "What's lowering your score",
 * written from the resume itself:
 *   { kind: "summary", resumeText, role }          → { summary }
 *   { kind: "skills", resumeText, role }           → { skills: [{ category, items }] }
 *   { kind: "lines", resumeText, role, lines[] }   → { rewrites: [{ original, rewritten, reason }] }
 *   { kind: "plan", resumeText, role, weakLines[{ text, issues[] }], otherLines[], missingKeywords[], needSummary, needSkills }
 *       → everything at once: { rewrites: [{ original, rewritten, reason, keyword? }], summary?, skills? }
 * Nothing is invented: where a line needs a number the person hasn't given,
 * the rewrite suggests a conservative estimate, which the person confirms
 * before it counts.
 */

const RULES = `You help someone improve their own resume for a target role.
- Use only facts that are in the resume. Never invent employers, tools, results, numbers or dates.
- Write in plain, direct English. No buzzwords ("results-driven", "proven track record", "synergy", "leverage", "passionate", "dynamic", "spearheaded"), no "I", no exaggeration.
- Never add a result, claim or outcome the resume doesn't state (not "meeting all milestones", not "improving user satisfaction"). Where a result belongs but its amount isn't given, say what was measured and suggest a realistic, conservative estimate the person can confirm: base it on figures and scale elsewhere in the resume (team size, partners, users, timeframes), prefer modest round numbers, and never anything extreme.
- Never mention AI or that this was generated.
- Use standard professional resume language: open lines with common, strong verbs such as Led, Built, Launched, Delivered, Managed, Designed, Defined, Wrote, Drove, Grew, Increased, Reduced, Improved, Introduced, Analysed, Negotiated. Avoid unusual or inflated words: not "Authored", "Spearheaded", "Orchestrated", "Championed", "Pioneered", "Utilized", "Leveraged", "Facilitated", "Synergized", "Helmed".
- Never write placeholders such as [X], [Y] or [number]: every line must read as finished.
- Return valid JSON only, in exactly the shape asked for.`;

const SUMMARY_PROMPT = `${RULES}
Write a short professional summary for the top of this resume: 2 or 3 sentences, at most 55 words. Say what the person does, for how long if the dates show it, the kind of work and industries, and their strongest results from the resume. Aim it at the target role.
Return: { "summary": "..." }`;

const SKILLS_PROMPT = `${RULES}
Write a skills section from tools, methods and areas the resume already shows. 2 to 4 groups such as "Product", "Tools", "Technical". Only list things the resume gives evidence for.
Return: { "skills": [{ "category": "...", "items": "item, item, item" }] }`;

const LINES_PROMPT = `${RULES}
Rewrite each listed resume line so it starts with a strong verb saying what the person did, says how, and ends with the result.
- Keep every fact and number already in the line. Keep the line under 35 words.
- If the line has no number and a result needs one, suggest a realistic, conservative estimate the person can confirm: base it on figures and scale elsewhere in the resume (team size, partners, users, timeframes), prefer modest round numbers, and never anything extreme (for example "cutting response time by 20%").
- "reason" is one short sentence to the person on what the rewrite fixes, starting with the problem (for example "No result: says what you did but not what changed.").
- Return the lines in the same order, with "original" copied exactly.
Return: { "rewrites": [{ "original": "...", "rewritten": "...", "reason": "..." }] }`;

const PLAN_PROMPT = `${RULES}
You are given lines from the resume that are costing it points, the other lines, and words employers look for in this role that the resume doesn't use yet.
1. Rewrite every WEAK LINE to fix its listed issues:
   - "number": the line shows no result with a number. Add the result with a suggested amount, as above.
   - "verb": the line doesn't start with a strong verb saying what the person did. Start it with one.
2. Work the MISSING WORDS into lines where they are true to what the line already describes (a line about writing requirement documents can say "PRDs"; one about planning releases can say "roadmapping"). Prefer weak lines; otherwise rewrite one of the OTHER LINES. Use each word at most once and only where it honestly fits; skip words that fit nowhere. Set "keyword" to the word you added.
3. Each line appears at most once in "rewrites"; if a line both needs fixing and takes a word, do both in one rewrite. Keep every fact and number already in the line, and keep it under 35 words.
4. If NEED SUMMARY is yes, write "summary": 2 or 3 sentences, at most 55 words, on what the person does, for how long if the dates show it, and their strongest results. If NEED SKILLS is yes, write "skills" from tools and methods the resume shows.
"reason" is one short sentence to the person on what the rewrite fixes, starting with the problem (for example "No result: says what you did but not what changed." or "Uses 'PRDs', a word employers search for.").
Return: { "rewrites": [{ "original": "...", "rewritten": "...", "reason": "...", "keyword": "..." }], "summary": "...", "skills": [{ "category": "...", "items": "..." }] }`;

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");

export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const limited = await rateLimit(LIMITS.llm, `user:${auth.session.email}`);
        if (limited) return limited;

        const body = await req.json().catch(() => ({}));
        const resumeText = clip(body.resumeText, 10000).trim();
        const role = clip(body.role, 120) || "the role they want";
        if (resumeText.length < 50) return NextResponse.json({ error: "There isn't enough of your resume to work from." }, { status: 400 });
        const context = `TARGET ROLE: ${role}\n\nRESUME:\n${resumeText}`;

        if (body.kind === "summary") {
            const out = await callJSON<{ summary?: string }>({ system: SUMMARY_PROMPT, user: context, maxTokens: 400, timeoutMs: 25000 });
            const summary = plainWords(clip(out?.summary, 600).trim());
            if (!summary) throw new Error("No summary came back");
            return NextResponse.json({ summary });
        }

        if (body.kind === "skills") {
            const out = await callJSON<{ skills?: Array<{ category?: string; items?: string }> }>({ system: SKILLS_PROMPT, user: context, maxTokens: 500, timeoutMs: 25000 });
            const skills = (out?.skills || [])
                .map((s) => ({ category: clip(s.category, 40).trim(), items: clip(s.items, 300).trim() }))
                .filter((s) => s.category && s.items)
                .slice(0, 5);
            if (skills.length === 0) throw new Error("No skills came back");
            return NextResponse.json({ skills });
        }

        if (body.kind === "lines") {
            const lines: string[] = (Array.isArray(body.lines) ? body.lines : [])
                .map((l: unknown) => clip(l, 400).trim())
                .filter(Boolean)
                .slice(0, 10);
            if (lines.length === 0) return NextResponse.json({ rewrites: [] });
            const out = await callJSON<{ rewrites?: Array<{ original?: string; rewritten?: string; reason?: string }> }>({
                system: LINES_PROMPT,
                user: `${context}\n\nLINES TO REWRITE:\n${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`,
                maxTokens: 2000,
                timeoutMs: 35000,
            });
            // Each rewrite goes back to the line it was written for, by position if the copy drifted.
            const rewrites = lines
                .map((original, i) => {
                    const found = (out?.rewrites || []).find((r) => r.original?.trim() === original) || out?.rewrites?.[i];
                    const rewritten = clip(found?.rewritten, 400).trim();
                    return { original, rewritten, reason: clip(found?.reason, 200).trim() || "This line can show more clearly what you did and what came of it." };
                })
                .filter((r) => r.rewritten && r.rewritten !== r.original);
            return NextResponse.json({ rewrites });
        }

        if (body.kind === "plan") {
            const weak: Array<{ text: string; issues: string[] }> = (Array.isArray(body.weakLines) ? body.weakLines : [])
                .map((l: { text?: unknown; issues?: unknown }) => ({
                    text: clip(l?.text, 400).trim(),
                    issues: (Array.isArray(l?.issues) ? l.issues : []).filter((i: unknown) => i === "number" || i === "verb"),
                }))
                .filter((l: { text: string }) => l.text)
                .slice(0, 14);
            const other: string[] = (Array.isArray(body.otherLines) ? body.otherLines : []).map((l: unknown) => clip(l, 400).trim()).filter(Boolean).slice(0, 20);
            const keywords: string[] = (Array.isArray(body.missingKeywords) ? body.missingKeywords : []).map((k: unknown) => clip(k, 40).trim()).filter(Boolean).slice(0, 12);
            const needSummary = body.needSummary === true;
            const needSkills = body.needSkills === true;
            if (weak.length === 0 && keywords.length === 0 && !needSummary && !needSkills) return NextResponse.json({ rewrites: [] });

            const out = await callJSON<{ rewrites?: Array<{ original?: string; rewritten?: string; reason?: string; keyword?: string }>; summary?: string; skills?: Array<{ category?: string; items?: string }> }>({
                system: PLAN_PROMPT,
                user: [
                    context,
                    `WEAK LINES:\n${weak.map((l, i) => `${i + 1}. [${l.issues.join(", ")}] ${l.text}`).join("\n") || "(none)"}`,
                    `OTHER LINES:\n${other.map((l) => `- ${l}`).join("\n") || "(none)"}`,
                    `MISSING WORDS: ${keywords.join(", ") || "(none)"}`,
                    `NEED SUMMARY: ${needSummary ? "yes" : "no"}`,
                    `NEED SKILLS: ${needSkills ? "yes" : "no"}`,
                ].join("\n\n"),
                maxTokens: 3500,
                timeoutMs: 45000,
            });

            // Only rewrites of lines that were sent, one per line, that actually change it.
            const known = new Set([...weak.map((l) => l.text), ...other]);
            const seen = new Set<string>();
            const rewrites = (out?.rewrites || [])
                .map((r) => {
                    const original = clip(r.original, 400).trim();
                    const rewritten = plainWords(clip(r.rewritten, 400).trim());
                    let keyword = clip(r.keyword, 40).trim();
                    // A word the rewrite doesn't contain wasn't really added.
                    if (keyword && !rewritten.toLowerCase().includes(keyword.toLowerCase())) keyword = "";
                    return { original, rewritten, keyword, reason: clip(r.reason, 200).trim() || "This line can show more clearly what you did and what came of it." };
                })
                .filter((r) => {
                    if (!known.has(r.original) || !r.rewritten || r.rewritten === r.original || seen.has(r.original)) return false;
                    // A line that was fine is only rewritten to add a word.
                    if (other.includes(r.original) && !r.keyword) return false;
                    seen.add(r.original);
                    return true;
                });
            const summary = needSummary ? plainWords(clip(out?.summary, 600).trim()) : "";
            const skills = needSkills
                ? (out?.skills || []).map((s) => ({ category: clip(s.category, 40).trim(), items: clip(s.items, 300).trim() })).filter((s) => s.category && s.items).slice(0, 5)
                : [];
            return NextResponse.json({ rewrites, ...(summary ? { summary } : {}), ...(skills.length ? { skills } : {}) });
        }

        return NextResponse.json({ error: "Unknown request." }, { status: 400 });
    } catch (err) {
        return serverError("api/resume/improve", err, "We couldn't write that just now. Please try again.");
    }
}
