/* ══════════════════════════════════════
   Follow-Up Generator — narrow, bounded.
   One follow-up, tied to THIS competency
   and THIS answer. Never free-roaming.
   ══════════════════════════════════════ */

import { callJSON } from "./llm";
import type {
    Blueprint,
    CandidateProfile,
    Competency,
    SessionDoc,
} from "./types";

function stripBold(text: string): string {
    if (!text) return text;
    return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*\*/g, "");
}

const SYSTEM = `You write ONE natural, conversational follow-up probe for a live interview.
Your goal is to build upon what the candidate just explained and probe deeper without sounding robotic.

Conversational rules:
- Begin with a brief conversational acknowledgment or lead-in that directly references the specific detail, project, metric, or trade-off the candidate just mentioned (e.g., "You highlighted reducing latency during that flash sale...", "Navigating that trade-off between speed and consistency is critical...").
- Seamlessly transition from that context into a targeted question asking for their specific contribution, thought process, or measurable outcome.
- It must stay inside the competency currently being assessed — no topic hopping.
- It should sound like an authentic, seasoned interviewer who is actively listening and curious (spoken conversational style, 1-2 sentences).
- When a source anchor is provided (resume/LinkedIn/portfolio location), ground the question in it naturally ("Your resume mentions X...").
- When the detail contradicts a profile claim, surface the gap directly but politely.
- Never stack multiple questions.
- Never use ** for bold. Plain text only, no markdown.

Output ONLY: { "followUp": "<conversational lead-in + targeted question>", "reason": "<one sentence>" }`;

export async function generateFollowUp(opts: {
    session: SessionDoc;
    blueprint: Blueprint;
    competency: Competency | null;
    answerText: string;
    topicSummary: string | null;
    contradiction: boolean;
    profile: CandidateProfile | null;
}): Promise<{ followUp: string; reason: string }> {
    const { blueprint, competency, answerText, topicSummary, contradiction, profile } =
        opts;

    const anchor = (() => {
        if (!profile || profile.claims.length === 0) return "none";
        const vague = profile.claims.find((c) => c.specificity === "vague");
        const c = vague || profile.claims[0];
        return `${c.sourceLocation}: "${c.text}" (specificity: ${c.specificity})`;
    })();

    const user = `Competency being assessed: ${competency?.label ?? "General behavioral"}
Candidate's last answer: ${answerText}
${topicSummary ? `Detail to probe: ${topicSummary}` : ""}
${contradiction ? "This answer contradicts the candidate's profile claim." : ""}
Source anchor: ${anchor}
If no profile claims are provided, ground the follow-up purely in the live answer.`;

    try {
        const raw = await callJSON<{ followUp?: string; reason?: string }>({
            system: `${SYSTEM}\n\nInterviewer persona: ${blueprint.persona.voice}`,
            user,
            maxTokens: 250,
            mock: {
                followUp: `You mentioned "${(topicSummary || answerText).slice(0, 60)}" — can you walk me through the specifics: what exactly did you do, and what was the measurable outcome?`,
                reason: "mock follow-up",
            },
        });
        if (raw.followUp && raw.followUp.trim().length > 0) {
            return { followUp: stripBold(raw.followUp.trim()), reason: raw.reason || "generated" };
        }
        throw new Error("empty follow-up");
    } catch {
        return {
            followUp: stripBold(`Can you go deeper on that — specifically what you did and what came of it?`),
            reason: "fallback follow-up",
        };
    }
}
