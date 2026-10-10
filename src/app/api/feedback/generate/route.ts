import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/engine/sessionStore";
import type { ProbeFinding } from "@/engine/types";
import { callJSON } from "@/engine/llm";
import { blueprintForRole } from "@/engine/roleMapping";
import { getBlueprint } from "@/engine/data";
import { isAdminSession, requireAuth } from "@/lib/session";

export interface FeedbackMetric {
    label: string;
    value: number;
    feedback: string;
}

export interface ResponsibilityAlignment {
    targetCompany?: string;
    keyResponsibilitiesEvaluated: string[];
    alignmentScore: number;
    summary: string;
    demonstratedCompetencies: string[];
    underrepresentedAreas: string[];
    recommendationsForRole: string[];
}

export interface FeedbackReportData {
    overallScore: number;
    summary: string;
    verdict: "Strong Candidate" | "Above Average" | "Average" | "Needs Improvement";
    metrics: {
        vocabulary: number;
        technicalDepth: number;
        pace: number;
        fillerWords: number;
        clarity: number;
        structureStar: number;
    };
    strengths: Array<{
        title: string;
        detail: string;
        quote?: string;
    }>;
    improvements: Array<{
        title: string;
        detail: string;
        recommendation: string;
    }>;
    quickTips: string[];
    qaBreakdown: Array<{
        question: string;
        candidateAnswer: string;
        rating: "Strong" | "Average" | "Needs Work";
        feedback: string;
        modelAnswer: string;
    }>;
    responsibilityAlignment?: ResponsibilityAlignment;
}
import { sanitizeReportData } from "@/lib/feedbackSanitizer";
import { EVALUATION_SCOPE_RULES } from "@/engine/evaluationScope";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";


const SYSTEM_PROMPT_BASE = `You are an elite, objective technical interview evaluator and executive hiring coach.
Your task is to thoroughly analyze an interview transcript where an interviewer asked questions and the user answered.

CRITICAL COMMUNICATION STYLE REQUIREMENT:
You MUST address the user DIRECTLY in the SECOND PERSON ("You", "Your", "You completed", "You demonstrated", "You should focus on").
NEVER refer to the user in the third person. DO NOT write "the candidate", "the applicant", "they", "their", "he", or "she".
- Write "You explained..." instead of "The candidate explained..."
- Write "Your answers demonstrated..." instead of "The candidate demonstrated..." or "Their answers demonstrated..."
- Write "As a software engineer, you should..." instead of "A software engineering candidate must..."
- Write "Your technical depth..." instead of "Their technical depth..."

CRITICAL QA BREAKDOWN REQUIREMENT:
For "qaBreakdown", you MUST evaluate EVERY SINGLE question that was asked by the interviewer in the interview transcript.
If 3 questions were asked, qaBreakdown MUST contain 3 entries. If 5 questions were asked, qaBreakdown MUST contain 5 entries.
DO NOT omit, skip, or group questions together. Evaluate each question in chronological order.
If the user did not give a verbal answer to a question or gave a short response, still include the question in qaBreakdown:
- "candidateAnswer": Set to what was recorded or "No spoken response recorded".
- "rating": "Needs Work" or "Average".
- "feedback": Address the user directly: "You did not provide a recorded response to this question during the session..." or "You touched on this briefly, but should expand on..."
- "modelAnswer": Provide a concise, high-impact model answer showing how an elite candidate would answer.

CRITICAL TAB DATA COMPLETENESS:
1. "strengths": 2 to 3 distinct strengths drawn from what you actually said in your answers (e.g. a clear example, a relevant metric, sound reasoning, good structure, precise terminology). If the answers are too thin to support that many, return fewer rather than inventing generic praise.
2. "improvements": MUST contain at least 2 to 3 distinct, actionable areas for improvement with practical recommendations.
3. "quickTips": MUST contain 3 to 4 punchy, high-impact coaching tips addressing the user directly ("You should...", "Practice...", "Focus on...").
4. "qaBreakdown": MUST contain an entry for EVERY question asked.

Evaluate and return a JSON object with this exact structure:
{
  "overallScore": <number 0-100>,
  "verdict": <"Strong Candidate" | "Above Average" | "Average" | "Needs Improvement">,
  "summary": "<2-3 sentences assessing your overall performance, role readiness, and communication style addressed directly to you>",
  "metrics": {
    "vocabulary": <number 0-100 representing role-specific terminology and domain precision>,
    "technicalDepth": <number 0-100 representing technical accuracy, trade-off analysis, and substance>,
    "pace": <number 0-100 representing cadence, delivery, and conciseness>,
    "fillerWords": <number 0-100 where 100 means zero filler words and 40 means frequent hesitation>,
    "clarity": <number 0-100 representing how direct and articulated the responses were>,
    "structureStar": <number 0-100 representing use of Situation, Task, Action, Result structured storytelling>
  },
  "strengths": [
    {
      "title": "<Short headline>",
      "detail": "<Explanation citing what you demonstrated effectively>",
      "quote": "<Exact or paraphrased quote of something impressive you said, or null>"
    }
  ],
  "improvements": [
    {
      "title": "<Short headline>",
      "detail": "<Specific weak point in your answers — e.g. vague metrics, missed trade-offs, lack of depth>",
      "recommendation": "<Actionable advice on how you should have framed or answered it>"
    }
  ],
  "quickTips": [
    "<3-4 brief, punchy coaching tips tailored to your specific interview performance>"
  ],
  "qaBreakdown": [
    {
      "question": "<The question asked>",
      "candidateAnswer": "<Summary or transcription of what you answered>",
      "rating": <"Strong" | "Average" | "Needs Work">,
      "feedback": "<Specific feedback on this particular answer relative to role expectations, addressed to you>",
      "modelAnswer": "<A concise, high-impact example of how an elite candidate would answer this question>"
    }
  ],
  "responsibilityAlignment": {
    "targetCompany": "<Target Company Name or 'Industry Benchmark'>",
    "keyResponsibilitiesEvaluated": [
      "<Core responsibility 1>",
      "<Core responsibility 2>",
      "<Core responsibility 3>"
    ],
    "alignmentScore": <number 0-100 measuring how well your answers aligned with these specific duties>,
    "summary": "<2-3 sentences evaluating how directly your answers addressed the target responsibilities and company context, addressed to you in second person>",
    "demonstratedCompetencies": [
      "<Key duty or skill you demonstrated strongly>"
    ],
    "underrepresentedAreas": [
      "<Area or responsibility where your answers lacked depth or concrete evidence>"
    ],
    "recommendationsForRole": [
      "<Actionable advice on how to align future answers with these specific responsibilities>"
    ]
  }
}

If the answers were short or low-effort, score realistically (e.g. 30-55) and provide clear constructive advice on how to expand.
If the answers were articulate and structured with metrics and depth, score appropriately high (e.g. 80-95).`;

const SYSTEM_PROMPT = `${SYSTEM_PROMPT_BASE}\n\n${EVALUATION_SCOPE_RULES}`;

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAuth(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }
        const limited = await rateLimit(LIMITS.llm, `user:${authResult.session.email}`);
        if (limited) return limited;

        const body = await req.json();
        const {
            sessionId,
            transcript: directTranscript,
            role,
            experience,
            domain,
            companyName,
            responsibilities,
        } = body;

        // 1. In-memory session doc
        let sessionBlueprintId: string | null = null;
        let sessionTranscript: Array<{ role: string; text: string }> = [];
        let probeFindings: ProbeFinding[] = [];
        if (sessionId) {
            const session = await getSession(sessionId);
            const owner = authResult.session.userId || authResult.session.email;
            // Only use the server transcript when it belongs to this user.
            if (session && (!session.ownerId || session.ownerId === owner || (await isAdminSession(authResult.session)))) {
                sessionBlueprintId = session.blueprintId;
                probeFindings = session.probeFindings ?? [];
                if (Array.isArray(session.transcript) && session.transcript.length > 0) {
                    sessionTranscript = session.transcript.map((t) => ({
                        role: t.role,
                        text: t.text,
                    }));
                }
            }
        }

        // 2. Client direct transcript
        let clientTranscript: Array<{ role: string; text: string }> = [];
        if (Array.isArray(directTranscript) && directTranscript.length > 0) {
            clientTranscript = directTranscript
                .filter((t: { text?: unknown }) => Boolean(t && typeof t.text === "string" && t.text.trim()))
                .map((t: { text: string; sender?: unknown; role?: unknown }) => ({
                    role: t.sender === "AI" || t.role === "interviewer" ? "interviewer" : "candidate",
                    text: t.text.trim(),
                }));
        }

        // Merge or pick whichever transcript is more complete so turns are never lost
        let transcriptTurns: Array<{ role: string; text: string }> = [];
        if (sessionTranscript.length >= clientTranscript.length && sessionTranscript.length > 0) {
            transcriptTurns = sessionTranscript;
        } else if (clientTranscript.length > 0) {
            transcriptTurns = clientTranscript;
        } else {
            transcriptTurns = sessionTranscript;
        }

        // Extract every distinct interviewer question and its corresponding answer
        const extractedQuestions: Array<{ question: string; candidateAnswer: string }> = [];
        for (let i = 0; i < transcriptTurns.length; i++) {
            const turn = transcriptTurns[i];
            if (turn.role === "interviewer" && turn.text.trim()) {
                let ans = "";
                let j = i + 1;
                while (j < transcriptTurns.length && transcriptTurns[j].role === "candidate") {
                    if (transcriptTurns[j].text.trim()) {
                        ans += (ans ? " " : "") + transcriptTurns[j].text.trim();
                    }
                    j++;
                }
                extractedQuestions.push({
                    question: turn.text.trim(),
                    candidateAnswer: ans || "(No spoken response recorded)",
                });
            }
        }

        // 3. Resolve role blueprint for accurate competency evaluation
        const resolvedBlueprintId = sessionBlueprintId || blueprintForRole(role, experience);
        const blueprint = resolvedBlueprintId ? getBlueprint(resolvedBlueprintId) : null;

        const rubricBlock = blueprint
            ? `\n\nTARGET ROLE & RUBRIC CRITERIA:
Role: ${blueprint.role} (${blueprint.level})
Domain Judgment Criteria: ${blueprint.persona.domainJudgmentNotes}
Core Role Competencies:
${blueprint.competencies.map((c) => `- ${c.label}: ${c.id}`).join("\n")}`
            : "";

        const effectiveCompany = companyName || "Target Company / Industry Benchmark";
        const respText = Array.isArray(responsibilities) && responsibilities.length > 0
            ? responsibilities.join("\n• ")
            : typeof responsibilities === "string" && responsibilities.trim()
                ? responsibilities.trim()
                : `Core execution, cross-functional alignment, and domain problem solving for ${role || "Software Engineer"}`;

        const companyContextBlock = `\n\nTARGET COMPANY & CORE RESPONSIBILITIES EVALUATION:
Target Company: ${effectiveCompany}
Key Job Responsibilities:
• ${respText}
Carefully evaluate how directly the candidate's answers demonstrated readiness to fulfill these responsibilities, and populate the 'responsibilityAlignment' section.`;

        // Format conversation transcript into a readable dialog
        let conversationText = "";
        if (transcriptTurns.length > 0) {
            conversationText = transcriptTurns
                .map((t) => `${t.role === "interviewer" ? "Interviewer" : "You (Candidate)"}: ${t.text}`)
                .join("\n\n");
        } else {
            conversationText = "No spoken answers were captured in this interview.";
        }

        const questionsPromptBlock = extractedQuestions.length > 0
            ? `\n\nALL QUESTIONS ASKED IN THIS INTERVIEW (${extractedQuestions.length} Total — Every single one MUST have an evaluation entry in qaBreakdown):\n` +
              extractedQuestions
                  .map(
                      (q, idx) =>
                          `Question ${idx + 1}: "${q.question}"\nCandidate Answer: "${q.candidateAnswer}"`
                  )
                  .join("\n\n")
            : "";

        // What live follow-up probing established about each claim. Weigh
        // unproven claims in the scores and name them in improvement areas.
        const outcomeLabel: Record<ProbeFinding["outcome"], string> = {
            verified: "demonstrated under follow-up",
            unresolved: "NOT demonstrated after follow-up",
            budget_exhausted: "still vague when follow-ups ran out",
            said_dont_know: "candidate said they did not know / had not done it",
        };
        const probeBlock = probeFindings.length > 0
            ? `\n\nDEPTH PROBING RESULTS (the interviewer followed up live to test whether claims were real). Treat claims marked NOT demonstrated or still vague as unproven: lower the related scores, call them out specifically in weaknesses/improvement areas, and suggest what concrete detail would have proven them. Credit honest "I don't know" answers over bluffing:\n` +
              probeFindings
                  .map((f) => `- "${f.claimSummary || f.question.slice(0, 100)}" — ${outcomeLabel[f.outcome]} (${f.followUps} follow-up${f.followUps === 1 ? "" : "s"}, final answer: ${f.verdict})`)
                  .join("\n")
            : "";

        const userContext = `Role: ${role || blueprint?.role || "Software Engineer"}\nExperience Level: ${experience || "Mid-Level"}\nDomain: ${domain || "General Tech"}${rubricBlock}${companyContextBlock}${probeBlock}\n\nTRANSCRIPT:\n${conversationText}${questionsPromptBlock}`;

        const report = await callJSON<FeedbackReportData>({
            system: SYSTEM_PROMPT,
            user: userContext,
            maxTokens: 3500,
            timeoutMs: 40000,
        });

        // ── Post-processing guarantees ──

        // 1. Ensure all extracted questions are in qaBreakdown
        if (!Array.isArray(report.qaBreakdown)) {
            report.qaBreakdown = [];
        }
        for (const eq of extractedQuestions) {
            const exists = report.qaBreakdown.some(
                (item) =>
                    item.question.toLowerCase().trim() === eq.question.toLowerCase().trim() ||
                    item.question.toLowerCase().includes(eq.question.toLowerCase().slice(0, 30))
            );
            if (!exists) {
                const hadAnswer = eq.candidateAnswer && !eq.candidateAnswer.includes("No spoken response");
                report.qaBreakdown.push({
                    question: eq.question,
                    candidateAnswer: eq.candidateAnswer,
                    rating: hadAnswer ? "Average" : "Needs Work",
                    feedback: hadAnswer
                        ? "You addressed this question during your interview session. To elevate your answer, quantify your impact with specific metrics and explain trade-offs."
                        : "You did not provide a recorded response to this question during the session. Practice answering this topic using structured STAR framing.",
                    modelAnswer:
                        "Lead with a concise executive summary, detail the technical and architectural trade-offs, and conclude with measurable business outcomes.",
                });
            }
        }

        // 2. Run full sanitizeReportData pass to ensure second-person tone & tab completeness
        const finalReport = sanitizeReportData(report, transcriptTurns);

        return NextResponse.json(finalReport);
    } catch (err) {
        return serverError("api/feedback/generate", err, "Failed to generate feedback");
    }
}


