import { NextRequest, NextResponse } from "next/server";
import { callJSON } from "@/engine/llm";
import { extractDocumentText } from "@/lib/documentParser";
import { matchResumeToJob } from "@/lib/atsScorer";
import { requireAuth } from "@/lib/session";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";
import { createHash } from "crypto";
import dbConnect from "@/lib/mongodb";
import JobMatchCache from "@/models/JobMatchCache";

export interface JobMatchResponsibilityScore {
    responsibility: string;
    score: number; // 0-100
    evidence: string; // which resume bullets demonstrate this, or "No clear evidence found"
    gap: string; // what's missing for this duty
    status: "strong" | "partial" | "gap";
}

export interface JobMatchResult {
    overallMatch: number; // 0-100
    summary: string; // 2-3 sentences
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
    /** True when the detailed analysis was unavailable and this is a keyword-based estimate. */
    estimated?: boolean;
}

const JOB_MATCH_SYSTEM = `You are an elite hiring manager and ATS matcher for top tech/fintech.

Given a CANDIDATE RESUME and a TARGET JOB (title, company, responsibilities, experience required), score how well the resume matches the role.

CRITICAL RULES:
- CAREER DOMAIN ALIGNMENT IS MANDATORY: If the candidate's resume or background is in an unrelated functional domain (e.g. Administrative Support / Virtual Assistant / Customer Support applying for Software Engineer / Android Developer / Data Scientist / Product Management), overallMatch MUST NOT exceed 25% (and MUST be strictly < 50%). Never award high scores or inflate matches based on generic soft skills when core technical/domain prerequisites are missing.
- Use ONLY evidence in the resume. Do not invent experience. If a responsibility has no matching bullet, score 15-35 and mark gap.
- Responsibilities are the ground truth. Each responsibility must get its own scored entry (0-100).
- Experience: compare years/seniority in resume vs job. If job says "3+ years" and resume shows ~2-3 years as Product Manager, score 65-75, etc. Extract years from resume dates. If domain is unrelated, score experience <= 20.
- OverallMatch is weighted average of responsibility scores + experience (70% responsibilities, 30% experience).
- Be honest, rigorous, and constructive.
- Return strict JSON only.

Return JSON with exact structure:
{
  "overallMatch": <number 0-100>,
  "summary": "<2-3 sentences, second person: 'Your resume shows...'>",
  "experienceMatch": {
    "required": "<e.g. 3+ years Product Management>",
    "candidate": "<e.g. ~3 years across Senior PM at Moniepoint etc.>",
    "score": <number 0-100>,
    "note": "<1 sentence>"
  },
  "responsibilityMatches": [
    {
      "responsibility": "<original responsibility text>",
      "score": <0-100>,
      "evidence": "<quote bullet that proves it or 'No clear evidence'>",
      "gap": "<what's missing or 'Well covered'>",
      "status": "<strong if >=75, partial if 45-74, gap if <45>"
    }
  ],
  "strengthsForRole": ["<1>", "<2>", "<3>"],
  "gapsForRole": ["<1>", "<2>"],
  "interviewFocusAreas": ["<1>", "<2>", "<3>"]
}`;

/**
 * One key per (user, resume, job). The whole resume and the job's details go
 * into it, so editing either gives a fresh match.
 */
function matchKey(email: string, parsedText: string, jobTitle: string, jobCompany: string, responsibilities: string[], jobDescription: string): string {
    return createHash("sha256")
        .update([email, parsedText.replace(/\s+/g, " ").trim(), jobTitle.toLowerCase().trim(), jobCompany.toLowerCase().trim(), responsibilities.join("|").toLowerCase(), jobDescription.slice(0, 6000)].join("\u0000"))
        .digest("hex");
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
            fileData = "",
            resumeName = "Resume.pdf",
            jobTitle = "Unknown Role",
            jobCompany = "Target Company",
            jobDescription = "",
            jobResponsibilities = [],
            requiredExperience = "",
            userRole = "",
            candidateRole = "",
        } = body as {
            resumeText?: string;
            fileData?: string;
            resumeName?: string;
            jobTitle?: string;
            jobCompany?: string;
            jobDescription?: string;
            jobResponsibilities?: string[] | string;
            requiredExperience?: string;
            userRole?: string;
            candidateRole?: string;
        };

        const effectiveUserRole = candidateRole || userRole || "";

        const inputToExtract = fileData || resumeText;
        let parsedText = await extractDocumentText(inputToExtract, resumeName);
        if (!parsedText || parsedText.length < 30) {
            if (typeof resumeText === "string" && resumeText.trim().length >= 30 && !resumeText.startsWith("PK") && !resumeText.startsWith("%PDF")) {
                parsedText = resumeText.trim();
            }
        }
        if (!parsedText || parsedText.length < 30) {
            return NextResponse.json({ error: "Could not extract readable text from resume. Upload selectable PDF/DOCX or paste plain text." }, { status: 400 });
        }

        let responsibilities: string[] = [];
        if (Array.isArray(jobResponsibilities) && jobResponsibilities.length > 0) {
            responsibilities = jobResponsibilities.filter(Boolean).map((r) => String(r).trim()).filter(Boolean);
        } else if (typeof jobResponsibilities === "string" && jobResponsibilities.trim()) {
            responsibilities = jobResponsibilities.split(/\n|•|\. /).map((r) => r.trim()).filter((r) => r.length > 12);
        }
        if (responsibilities.length === 0 && jobDescription && jobDescription.trim()) {
            // Split description into 3-5 pseudo-responsibilities if none supplied
            const parts = jobDescription.split(/\. |\n|•/).map((p) => p.trim()).filter((p) => p.length > 20);
            responsibilities = parts.slice(0, 5);
        }
        if (responsibilities.length === 0) {
            responsibilities = [`Core execution and delivery for ${jobTitle}`, `Cross-functional collaboration and stakeholder management`, `Domain problem solving and metrics ownership for ${jobTitle}`];
        }
        // cap 6
        responsibilities = responsibilities.slice(0, 6);

        // Check server-side cache first to guarantee identical score on re-open or across modals
        // Kept in the database, not in this server's memory or the browser: a
        // match worked out once is the same on every device and survives restarts.
        const cacheKey = matchKey(authResult.session.email, parsedText, jobTitle, jobCompany, responsibilities, jobDescription);
        try {
            await dbConnect();
            const cached = await JobMatchCache.findById(cacheKey).lean();
            if (cached) {
                return NextResponse.json({ success: true, result: cached.result, responsibilities: cached.responsibilities, extractedText: parsedText, cached: true });
            }
        } catch (cacheErr) {
            console.warn("[api/resume/job-match] saved match not read:", cacheErr);
        }

        const userPrompt = `TARGET JOB:
Title: ${jobTitle}
Company: ${jobCompany}
Candidate Role/Domain: ${effectiveUserRole || "Inferred from resume"}
Required experience: ${requiredExperience || "Not specified; infer from seniority"}
Responsibilities (${responsibilities.length}):
${responsibilities.map((r, i) => `${i + 1}. ${r}`).join("\n")}
Full description: ${jobDescription.slice(0, 6000) || "(none)"}

CANDIDATE RESUME:
${parsedText.slice(0, 10000)}`;

        let result: JobMatchResult;
        let estimated = false;
        try {
            result = await callJSON<JobMatchResult>({
                system: JOB_MATCH_SYSTEM,
                user: userPrompt,
                maxTokens: 2200,
                timeoutMs: 30000,
                temperature: 0, // Deterministic matching
            });
        } catch (llmErr) {
            console.warn("[api/resume/job-match] LLM call failed or quota exceeded, falling back to ATS match:", llmErr);
            result = matchResumeToJob(
                parsedText,
                {
                    title: jobTitle,
                    company: jobCompany,
                    description: jobDescription,
                    responsibilities,
                },
                effectiveUserRole
            );
            // A keyword count, not a reading of the resume: say so.
            estimated = true;
            result.estimated = true;
            result.summary = `Quick estimate (the detailed analysis is unavailable right now, try again shortly). ${result.summary}`;
        }

        // Post-process guard: clamp scores and derive status if LLM missed it
        result.overallMatch = Math.max(0, Math.min(100, Math.round(result.overallMatch ?? 25)));
        result.experienceMatch.score = Math.max(0, Math.min(100, Math.round(result.experienceMatch?.score ?? 60)));
        result.responsibilityMatches = (result.responsibilityMatches || []).slice(0, 6).map((r) => ({
            responsibility: r.responsibility,
            score: Math.max(0, Math.min(100, Math.round(r.score))),
            evidence: r.evidence || "No clear evidence found in resume",
            gap: r.gap || "Add a bullet proving ownership of this duty",
            status: r.status || (r.score >= 75 ? "strong" : r.score >= 45 ? "partial" : "gap"),
        }));
        if (result.responsibilityMatches.length === 0) {
            result.responsibilityMatches = responsibilities.map((r) => ({
                responsibility: r,
                score: 55,
                evidence: "Limited direct evidence in resume",
                gap: "Add quantified bullet targeting this responsibility",
                status: "partial" as const,
            }));
        }

        // Cache real analyses so a re-open shows the same score. An estimate
        // isn't cached: the next request should try the real analysis again.
        if (!estimated) {
            await JobMatchCache.updateOne(
                { _id: cacheKey },
                { $set: { email: authResult.session.email, jobTitle: jobTitle.slice(0, 160), jobCompany: jobCompany.slice(0, 160), overallMatch: result.overallMatch, result, responsibilities, createdAt: new Date() } },
                { upsert: true }
            ).catch((cacheErr) => console.warn("[api/resume/job-match] match not saved:", cacheErr));
        }

        return NextResponse.json({ success: true, result, responsibilities, extractedText: parsedText, estimated });
    } catch (err) {
        return serverError("api/resume/job-match", err, "Failed to compute job match");
    }
}
