import { NextRequest, NextResponse } from "next/server";
import { callJSON } from "@/engine/llm";

export interface InstantQuestionFeedback {
    rating: "Strong" | "Average" | "Needs Work";
    score: number; // 0-100
    headline: string;
    strengths: string[];
    coachingTip: string;
    modelAnswer: string;
    star: {
        overallScore: number;
        situation: number;
        task: number;
        action: number;
        result: number;
        summary: string;
        nextFocus: string;
    };
}

const INSTANT_FEEDBACK_SYSTEM_PROMPT = `You are an elite live technical interview coach sitting beside a candidate in real time.
Your task is to give immediate, constructive, high-impact coaching feedback right after the candidate answers a single interview question.

CRITICAL COMMUNICATION STYLE:
- Address the candidate directly in the SECOND PERSON ("You", "Your", "You effectively explained", "You should quantify").
- Be concise, direct, and encouraging yet rigorous.
- Never write "The candidate", "They", or "The applicant".

MODEL ANSWER STYLE – SIMPLE CONVERSATIONAL TONE (STRICT):
- modelAnswer MUST sound like a real human speaking out loud in an interview, not an essay or LLM.
- Use first-person natural speech: "I...", "In my last role...", "We had this problem where..."
- Keep it 2-3 short sentences, 40-60 words total. Plain English, no buzzword stuffing, no jargon overload, no markdown, no bullet points, no corporate fluff.
- It should be something a candidate could literally say verbatim and sound confident and human.
- BAD (LLM gibberish): "Leveraging synergistic paradigm shifts to architect scalable, robust, high-throughput distributed ecosystems..."
- GOOD (conversational): "In my last role we had a checkout that kept failing under load. I broke it into smaller services and added a queue, which cut errors by about 30% and made releases much smoother."

APOSTROPHE RULE (STRICT):
- Do NOT use apostrophes (') anywhere – not in headline, not in modelAnswer, not in strengths or coachingTip.
- Write out contractions: do not instead of don't, did not instead of didn't, I am instead of I am with apostrophe, cannot instead of can't, will not instead of won't.
- This applies to every field you return.

Return a JSON object with this exact structure:
{
  "rating": "<'Strong' | 'Average' | 'Needs Work'>",
  "score": <number 0-100 representing readiness on this specific answer>,
  "headline": "<1-sentence punchy assessment of their answer – no apostrophes>",
  "strengths": [
    "<1-2 specific points they articulated well or good structural choices – no apostrophes>"
  ],
  "coachingTip": "<1-2 sentences of actionable advice: what was missing, what trade-off or metric they should have mentioned – no apostrophes>",
  "modelAnswer": "<2-3 sentence FIRST-PERSON spoken answer in simple conversational tone as described above – no apostrophes>",
  "star": {
    "overallScore": "<number 0-100>",
    "situation": "<number 0-25>",
    "task": "<number 0-25>",
    "action": "<number 0-25>",
    "result": "<number 0-25>",
    "summary": "<one concise assessment of the STAR structure – no apostrophes>",
    "nextFocus": "<the single missing STAR element to strengthen next – no apostrophes>"
  }
}`;

function getFallbackInstantFeedback(question: string, answer: string): InstantQuestionFeedback {
    const isShort = !answer || answer.trim().length < 40;
    if (isShort) {
        return {
            rating: "Needs Work",
            score: 48,
            headline: "Your response touched on the basics but lacked specific detail.",
            strengths: ["You got straight to the point without rambling."],
            coachingTip: "Use STAR: say what the situation was, what you actually did, and what changed. Add one number if you can.",
            modelAnswer: "In my last role we had a similar issue where the feature was slow to ship. I talked to the users, picked the simplest fix that unblocked us, and got it out in a week — that lifted activation by about 20%.",
            star: { overallScore: 48, situation: 12, task: 9, action: 15, result: 12, summary: "The answer needs clearer context, ownership, and a measurable outcome.", nextFocus: "Add the specific action you personally took and what changed." },
        };
    }
    return {
        rating: "Strong",
        score: 86,
        headline: "Clear structure and good reasoning.",
        strengths: [
            "You walked through the problem and your steps in order.",
            "You showed you weighed options instead of jumping to one answer.",
        ],
        coachingTip: "Add one real number — like 'cut load time by a third' or 'saved us two weeks' — so the impact lands.",
        modelAnswer: "We had a service that was slow at peak. I checked where time was spent, added a cache for the hot path and tightened the queries. It cut response time roughly in half and made on-call much quieter.",
        star: { overallScore: 86, situation: 22, task: 20, action: 23, result: 21, summary: "A clear, credible answer with an understandable sequence and outcome.", nextFocus: "Add one sharper metric or trade-off to make the impact even stronger." },
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

        const rawFeedback = await callJSON<InstantQuestionFeedback>({
            system: INSTANT_FEEDBACK_SYSTEM_PROMPT,
            user: prompt,
            maxTokens: 1200,
            timeoutMs: 15000,
            mock: fallback,
        });

        // Enforce no apostrophes in any field – fallback sanitization
        const stripApostrophe = (s: string) => (s ? s.replace(/[‘’'`]/g, "").replace(/'/g, "") : s);
        const feedback: InstantQuestionFeedback = {
            rating: rawFeedback.rating,
            score: rawFeedback.score,
            headline: stripApostrophe(rawFeedback.headline),
            strengths: (rawFeedback.strengths || []).map(stripApostrophe),
            coachingTip: stripApostrophe(rawFeedback.coachingTip),
            modelAnswer: stripApostrophe(rawFeedback.modelAnswer),
            star: {
                overallScore: Number(rawFeedback.star?.overallScore) || fallback.star.overallScore,
                situation: Number(rawFeedback.star?.situation) || fallback.star.situation,
                task: Number(rawFeedback.star?.task) || fallback.star.task,
                action: Number(rawFeedback.star?.action) || fallback.star.action,
                result: Number(rawFeedback.star?.result) || fallback.star.result,
                summary: stripApostrophe(rawFeedback.star?.summary || fallback.star.summary),
                nextFocus: stripApostrophe(rawFeedback.star?.nextFocus || fallback.star.nextFocus),
            },
        };

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
