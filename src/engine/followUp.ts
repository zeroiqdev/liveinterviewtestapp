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

const SYSTEM = `You write ONE follow-up question for a live interview. Hard constraints:
- It must probe the specific detail just surfaced in the candidate's last answer.
- It must stay inside the competency currently being assessed — no topic hopping.
- It must be a single, natural, spoken-style question (one sentence preferred, two max).
- When a source anchor is provided (resume/LinkedIn/portfolio location), ground the
  question in it naturally ("Your portfolio mentions X..." / "Your resume says X...").
  This signals the material was actually read.
- When the detail contradicts a profile claim, surface the gap directly but neutrally.
- Never stack multiple questions. Never preface with praise or filler.

Output ONLY: { "followUp": "<the question>", "reason": "<one sentence>" }`;

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
            return { followUp: raw.followUp.trim(), reason: raw.reason || "generated" };
        }
        throw new Error("empty follow-up");
    } catch {
        return {
            followUp: `Can you go deeper on that — specifically what you did and what came of it?`,
            reason: "fallback follow-up",
        };
    }
}
