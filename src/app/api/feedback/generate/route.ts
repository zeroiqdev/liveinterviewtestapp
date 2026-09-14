import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/engine/sessionStore";
import { callJSON } from "@/engine/llm";
import { blueprintForRole } from "@/engine/roleMapping";
import { getBlueprint } from "@/engine/data";

export interface FeedbackMetric {
    label: string;
    value: number;
    feedback: string;
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
}

const SYSTEM_PROMPT = `You are an elite, objective technical interview evaluator and executive hiring coach.
Your task is to thoroughly analyze an interview transcript where an AI interviewer asked questions and a candidate spoke their answers.

You must judge the candidate's actual words, claims, depth, relevance, and communication quality against the hiring rubric and competencies of the target role.
DO NOT give generic platitudes. Reference what the candidate actually said in their responses.

Evaluate and return a JSON object with this exact structure:
{
  "overallScore": <number 0-100>,
  "verdict": <"Strong Candidate" | "Above Average" | "Average" | "Needs Improvement">,
  "summary": "<2-3 sentences assessing their overall performance, role readiness, and communication style>",
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
      "detail": "<Explanation citing what they demonstrated effectively>",
      "quote": "<Exact or paraphrased quote of something impressive they said, or null>"
    }
  ],
  "improvements": [
    {
      "title": "<Short headline>",
      "detail": "<Specific weak point in their answers — e.g. vague metrics, missed trade-offs, lack of depth>",
      "recommendation": "<Actionable advice on how they should have framed or answered it>"
    }
  ],
  "quickTips": [
    "<3-4 brief, punchy coaching tips tailored to their specific interview performance>"
  ],
  "qaBreakdown": [
    {
      "question": "<The question asked>",
      "candidateAnswer": "<Summary or transcription of what the candidate answered>",
      "rating": <"Strong" | "Average" | "Needs Work">,
      "feedback": "<Specific feedback on this particular answer relative to role expectations>",
      "modelAnswer": "<A concise, high-impact example of how an elite candidate would answer this question>"
    }
  ]
}

If the candidate gave short, blank, or low-effort answers, score them realistically (e.g. 30-55) and provide clear constructive advice on how to expand.
If the candidate gave articulate, structured answers with metrics and depth, score them appropriately high (e.g. 80-95).`;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { sessionId, transcript: directTranscript, role, experience, domain } = body;

        let transcriptTurns: Array<{ role: string; text: string }> = [];

        // 1. Check direct client transcript first (most resilient to server restarts)
        if (Array.isArray(directTranscript) && directTranscript.length > 0) {
            transcriptTurns = directTranscript
                .filter((t: any) => t && typeof t.text === "string" && t.text.trim())
                .map((t: any) => ({
                    role: t.sender === "AI" || t.role === "interviewer" ? "interviewer" : "candidate",
                    text: t.text.trim(),
                }));
        }

        // 2. Fall back or enrich from in-memory session doc if available
        let sessionBlueprintId: string | null = null;
        if (sessionId) {
            const session = getSession(sessionId);
            if (session) {
                sessionBlueprintId = session.blueprintId;
                if (transcriptTurns.length === 0 && session.transcript?.length > 0) {
                    transcriptTurns = session.transcript.map((t) => ({
                        role: t.role,
                        text: t.text,
                    }));
                }
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

        // Format conversation transcript into a readable dialog
        let conversationText = "";
        if (transcriptTurns.length > 0) {
            conversationText = transcriptTurns
                .map((t) => `${t.role === "interviewer" ? "Interviewer" : "Candidate"}: ${t.text}`)
                .join("\n\n");
        } else {
            conversationText = "Candidate completed the interview session, but minimal speech transcript was captured.";
        }

        const userContext = `Role: ${role || blueprint?.role || "Software Engineer"}\nExperience Level: ${experience || "Mid-Level"}\nDomain: ${domain || "General Tech"}${rubricBlock}\n\nTRANSCRIPT:\n${conversationText}`;

        const report = await callJSON<FeedbackReportData>({
            system: SYSTEM_PROMPT,
            user: userContext,
            maxTokens: 3000,
            timeoutMs: 40000,
        });

        return NextResponse.json(report);
    } catch (err) {
        console.error("[api/feedback/generate] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to generate feedback" },
            { status: 500 }
        );
    }
}

