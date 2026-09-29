/* ══════════════════════════════════════
   Question Selector — picks the best-fit
   question from a competency's pool.

   Checks, in order:
     1. parking lot (unresolved topics for this competency)
     2. profile claims tied to this competency (ranked by role-family weights)
     3. the pool itself (diversity + pacing)

   The profile is part of the input EVERY
   time — same pool, different question
   chosen per candidate. Without a profile,
   selection runs purely on the live
   conversation. One pipeline, not two.
   ══════════════════════════════════════ */

import { callJSON } from "./llm";
import { NOTES_WINDOW, weightsFor } from "./constants";
import type {
    BankQuestion,
    Blueprint,
    CandidateProfile,
    Competency,
    PacingDirective,
    SessionDoc,
} from "./types";

function stripBold(text: string | null): string | null {
    if (!text) return text;
    return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*\*/g, "");
}

interface SelectionResult {
    choice: "question_id" | "parked_topic";
    questionId: string | null;
    /** when choice = parked_topic: index into session.parkingLot */
    parkedIndex: number | null;
    questionText: string | null;
    reason: string;
}

function profileBlock(
    profile: CandidateProfile | null,
    blueprintId: string,
    competencyId: string
): string {
    if (!profile || profile.claims.length === 0) {
        return "No profile claims provided — select based purely on the live conversation so far.";
    }
    const weights = weightsFor(blueprintId);
    const relevant = profile.claims.filter(
        (c) =>
            c.linkedCompetencies.includes(competencyId) ||
            c.tags.some((t) => weights.prioritizeClaimTags.includes(t))
    );
    const claims = (relevant.length > 0 ? relevant : profile.claims).slice(0, 8);
    return `Candidate profile claims (prioritize claims tagged: ${weights.prioritizeClaimTags.join(", ")}):
${claims
    .map(
        (c) =>
            `- "${c.text}" [specificity: ${c.specificity}; tags: ${c.tags.join(", ") || "none"}; source: ${c.sourceLocation}]`
    )
    .join("\n")}
Prefer the pool question closest to a specific claim the candidate can be checked on; steer away from questions their profile already answers generically.`;
}

export async function selectQuestion(opts: {
    session: SessionDoc;
    blueprint: Blueprint;
    competency: Competency | null; // null = general behavioral section
    pool: BankQuestion[];
    pacing: PacingDirective;
    profile: CandidateProfile | null;
    diversityNote?: string;
}): Promise<SelectionResult> {
    const { session, blueprint, competency, pool, pacing, profile } = opts;
    const competencyId = competency?.id ?? "general_behavioral";
    const competencyLabel = competency?.label ?? "General behavioral";

    const alreadyAsked = new Set(
        competency
            ? (session.topicProgress[session.currentCompetencyIndex]
                  ?.askedQuestionIds ?? [])
            : session.generalAsked.questionIds
    );
    const candidates = pool.filter((q) => !alreadyAsked.has(q.id));

    // 1. Parking lot — unresolved topics targeting this competency.
    const parkedIndexes = session.parkingLot
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => !p.resolved && p.targetCompetency === competencyId)
        .map(({ i }) => i);

    if (candidates.length === 0 && parkedIndexes.length === 0) {
        return {
            choice: "question_id",
            questionId: null,
            parkedIndex: null,
            questionText: null,
            reason: "pool exhausted",
        };
    }

    const parkedBlock =
        parkedIndexes.length > 0
            ? `Parked topics waiting for this section (from earlier answers or the candidate's profile). You may convert ONE into a question:
${parkedIndexes
    .map((i) => `- [parked:${i}] "${session.parkingLot[i].topicSummary}"`)
    .join("\n")}`
            : "No parked topics for this section.";

    const notes = session.runningNotes
        .slice(-NOTES_WINDOW)
        .map((n) => `- ${n.summary}`)
        .join("\n");

    const lastCandidateAnswer = session.transcript
        .filter((t) => t.role === "candidate")
        .slice(-1)[0]?.text;

    const pacingNote =
        pacing.mode === "compressed"
            ? "PACING: compressed — pick the single most information-dense anchor question; no frills."
            : pacing.mode === "tightening"
              ? "PACING: tightening — prefer the single most information-dense question over broad openers."
              : "PACING: normal.";

    const system = `You are the question selector and conversational interviewer for a live interview engine.
Pick the single best next question for the current section. If the candidate has already answered earlier questions, craft a natural conversational lead-in that links what they just said to the theme of the new question so the interview feels cohesive and conversational.

Output ONLY valid JSON:
{
  "choice": "question_id" | "parked_topic",
  "questionId": "<id from the pool list, or null>",
  "parkedIndex": <index from a parked:N tag, or null>,
  "conversationalBridge": "<1 spoken sentence that acknowledges what the candidate just discussed and builds a base for what will be asked next. E.g. 'That gives me good insight into your engineering background. Shifting our focus to execution under tight deadlines:'>",
  "questionText": "<the complete spoken question to ask the candidate: conversationalBridge + the question>",
  "reason": "<one sentence>"
}

Rules:
- Interviewer persona: ${blueprint.persona.voice}
- ${pacingNote}
- Conversational Bridging: If there is a last candidate answer, do not abruptly jump to a new topic. Briefly connect their previous answer (referencing a key achievement, trade-off, tool, or metric they discussed) to the core premise of the next question.
- A parked topic that fits this section well outranks a generic pool question. For parked topics, create a natural callback ("Earlier you mentioned X — let's unpack that...").
- Never pick a question id that is not in the pool list.
- Do not repeat ground already covered in the running notes.
- Never use ** for bold. Plain text only, no markdown.`;

    const user = `Current section: ${competencyLabel}

${parkedBlock}

${profileBlock(profile, blueprint.blueprintId, competencyId)}

Candidate's last answer:
${lastCandidateAnswer ? `"${lastCandidateAnswer}"` : "(Opening turn — no prior answer yet)"}

Conversation running notes so far:
${notes || "- (nothing yet)"}
${opts.diversityNote ? `\n${opts.diversityNote}` : ""}

Pool (id — question):
${candidates.map((q) => `- ${q.id} — ${q.question}`).join("\n")}`;

    try {
        const raw = await callJSON<{
            choice?: string;
            questionId?: string | null;
            parkedIndex?: number | null;
            conversationalBridge?: string;
            questionText?: string;
            reason?: string;
        }>({
            system,
            user,
            maxTokens: 400,
            mock: mockSelection(candidates, parkedIndexes, session),
        });

        if (
            raw.choice === "parked_topic" &&
            typeof raw.parkedIndex === "number" &&
            parkedIndexes.includes(raw.parkedIndex) &&
            raw.questionText
        ) {
            return {
                choice: "parked_topic",
                questionId: null,
                parkedIndex: raw.parkedIndex,
                questionText: stripBold(raw.questionText),
                reason: raw.reason || "resurfaced parked topic",
            };
        }

        const picked = candidates.find((q) => q.id === raw.questionId);
        if (picked) {
            let finalText = stripBold(raw.questionText || picked.question) || picked.question;
            if (raw.conversationalBridge && !finalText.includes(raw.conversationalBridge.slice(0, 15))) {
                finalText = `${stripBold(raw.conversationalBridge)} ${finalText}`;
            }
            return {
                choice: "question_id",
                questionId: picked.id,
                parkedIndex: null,
                questionText: finalText,
                reason: raw.reason || "selector pick with conversational bridge",
            };
        }
        throw new Error("selector returned invalid id");
    } catch {
        // Deterministic fallback: parked topic first, else first unasked.
        if (parkedIndexes.length > 0) {
            const i = parkedIndexes[0];
            return {
                choice: "parked_topic",
                questionId: null,
                parkedIndex: i,
                questionText: stripBold(`Earlier you mentioned "${session.parkingLot[i].topicSummary}" — walk me through that.`),
                reason: "fallback: parked topic",
            };
        }
        const first = candidates[0];
        const bridge = lastCandidateAnswer ? "Thanks for breaking that down. Building on that:" : "";
        const fallbackText = first?.question ? (bridge ? `${bridge} ${first.question}` : first.question) : null;
        return {
            choice: "question_id",
            questionId: first?.id ?? null,
            parkedIndex: null,
            questionText: stripBold(fallbackText),
            reason: "fallback: first unasked pool question",
        };
    }
}

function mockSelection(
    candidates: BankQuestion[],
    parkedIndexes: number[],
    session: SessionDoc
) {
    const lastAnswer = session.transcript
        .filter((t) => t.role === "candidate")
        .slice(-1)[0]?.text;

    if (parkedIndexes.length > 0) {
        const i = parkedIndexes[0];
        return {
            choice: "parked_topic",
            questionId: null,
            parkedIndex: i,
            conversationalBridge: "Earlier you touched on an interesting point.",
            questionText: stripBold(`Earlier you mentioned "${session.parkingLot[i].topicSummary}" — walk me through that.`),
            reason: "mock: parked topic",
        };
    }
    const q = candidates[0];
    const bridge = lastAnswer ? "Thanks for sharing those details. Building on that:" : "";
    return {
        choice: "question_id",
        questionId: q?.id ?? null,
        parkedIndex: null,
        conversationalBridge: bridge,
        questionText: bridge ? `${bridge} ${stripBold(q?.question ?? "")}` : stripBold(q?.question ?? null),
        reason: "mock: first pool question with bridge",
    };
}
