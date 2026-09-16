import { NextRequest, NextResponse } from "next/server";
import { callJSON } from "@/engine/llm";

export interface InstantQuestionFeedback {
    rating: "Strong" | "Average" | "Needs Work";
    score: number; // 0-100
    headline: string;
    strengths: string[];
    coachingTip: string;
    modelAnswer: string;
}

const INSTANT_FEEDBACK_SYSTEM_PROMPT = `You are an elite live technical interview coach sitting beside a candidate in real time.
Your task is to give immediate, constructive, high-impact coaching feedback right after the candidate answers a single interview question.

CRITICAL COMMUNICATION STYLE:
- Address the candidate directly in the SECOND PERSON ("You", "Your", "You effectively explained", "You should quantify").
- Be concise, direct, and encouraging yet rigorous.
- Never write "The candidate", "They", or "The applicant".

Return a JSON object with this exact structure:
{
  "rating": "<'Strong' | 'Average' | 'Needs Work'>",
  "score": <number 0-100 representing readiness on this specific answer>,
  "headline": "<1-sentence punchy assessment of their answer>",
  "strengths": [
    "<1-2 specific points they articulated well or good structural choices>"
  ],
  "coachingTip": "<1-2 sentences of actionable advice: what was missing, what trade-off or metric they should have mentioned>",
  "modelAnswer": "<A concise 2-3 sentence example of how a top 1% candidate answers this question>"
}`;

function getFallbackInstantFeedback(question: string, answer: string): InstantQuestionFeedback {
    const isShort = !answer || answer.trim().length < 40;
    if (isShort) {
        return {
            rating: "Needs Work",
            score: 48,
            headline: "Your response touched on the basics but lacked specific technical depth and concrete metrics.",
            strengths: ["You addressed the core question promptly without excessive hesitation."],
            coachingTip: "Structure your answer with the STAR framework. State the technical constraint, what decision you made, and quantify the resulting outcome.",
            modelAnswer: "Lead with a direct executive summary of your approach, explain the architectural or prioritization trade-offs, and conclude with measurable impact (e.g. latency, users, or revenue).",
        };
    }
    return {
        rating: "Strong",
        score: 86,
        headline: "Structured answer with clear technical reasoning and domain awareness.",
        strengths: [
            "Clear logical progression from problem discovery to execution.",
            "Demonstrated good trade-off awareness rather than picking a solution reflexively.",
        ],
        coachingTip: "To make this answer exceptional, add one concrete metric (e.g. 'reduced latency by 35%' or 'saved 4 weeks of engineering effort') to anchor your impact.",
        modelAnswer: "Articulate the system constraints upfront, state the alternative solutions evaluated, and conclude with the business outcome achieved.",
    };
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            question,
            answer,
            role = "Software Engineer",
            companyName = "Top Tech",
            category = "General Interview",
        } = body;

        if (!question || typeof question !== "string") {
            return NextResponse.json({ error: "Question is required" }, { status: 400 });
        }

        const fallback = getFallbackInstantFeedback(question, answer || "");

        const prompt = `TARGET ROLE: ${role}
TARGET COMPANY: ${companyName}
INTERVIEW CATEGORY: ${category}

QUESTION ASKED BY INTERVIEWER:
"${question}"

CANDIDATE'S SPOKEN RESPONSE:
"${answer || "(No spoken response captured)"}"

Evaluate this answer and provide instantaneous, high-impact live coaching feedback addressed directly to the candidate.`;

        const feedback = await callJSON<InstantQuestionFeedback>({
            system: INSTANT_FEEDBACK_SYSTEM_PROMPT,
            user: prompt,
            maxTokens: 1200,
            timeoutMs: 15000,
            mock: fallback,
        });

        return NextResponse.json({
            success: true,
            feedback,
        });
    } catch (err) {
        console.error("[api/interview/instant-feedback] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to generate instant feedback" },
            { status: 500 }
        );
    }
}
