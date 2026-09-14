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

    const pacingNote =
        pacing.mode === "compressed"
            ? "PACING: compressed — pick the single most information-dense anchor question; no frills."
            : pacing.mode === "tightening"
              ? "PACING: tightening — prefer the single most information-dense question over broad openers."
              : "PACING: normal.";

    const system = `You are the question selector for a live interview engine. Pick the single best next question for the current section. Output ONLY valid JSON:
{
  "choice": "question_id" | "parked_topic",
  "questionId": "<id from the pool list, or null>",
  "parkedIndex": <index from a parked:N tag, or null>,
  "questionText": "<the exact question to ask; for parked_topic, phrase it naturally as a callback>",
  "reason": "<one sentence>"
}

Rules:
- Interviewer persona: ${blueprint.persona.voice}
- ${pacingNote}
- A parked topic that fits this section well outranks a generic pool question.
- Otherwise pick from the pool list using the candidate's profile and the conversation so far — same pool, different question per candidate.
- Never pick a question id that is not in the pool list. For parked_topic, questionText must be your own natural phrasing anchored to the topic.
- Do not repeat ground already covered in the running notes.`;

    const user = `Current section: ${competencyLabel}

${parkedBlock}

${profileBlock(profile, blueprint.blueprintId, competencyId)}

Conversation so far:
${notes || "- (nothing yet)"}
${opts.diversityNote ? `\n${opts.diversityNote}` : ""}

Pool (id — question):
${candidates.map((q) => `- ${q.id} — ${q.question}`).join("\n")}`;

    try {
        const raw = await callJSON<{
            choice?: string;
            questionId?: string | null;
            parkedIndex?: number | null;
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
                questionText: raw.questionText,
                reason: raw.reason || "resurfaced parked topic",
            };
        }

        const picked = candidates.find((q) => q.id === raw.questionId);
        if (picked) {
            return {
                choice: "question_id",
                questionId: picked.id,
                parkedIndex: null,
                questionText: picked.question,
                reason: raw.reason || "selector pick",
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
                questionText: `Earlier you mentioned "${session.parkingLot[i].topicSummary}" — walk me through that.`,
                reason: "fallback: parked topic",
            };
        }
        const first = candidates[0];
        return {
            choice: "question_id",
            questionId: first?.id ?? null,
            parkedIndex: null,
            questionText: first?.question ?? null,
            reason: "fallback: first unasked pool question",
        };
    }
}

function mockSelection(
    candidates: BankQuestion[],
    parkedIndexes: number[],
    session: SessionDoc
) {
    if (parkedIndexes.length > 0) {
        const i = parkedIndexes[0];
        return {
            choice: "parked_topic",
            questionId: null,
            parkedIndex: i,
            questionText: `Earlier you mentioned "${session.parkingLot[i].topicSummary}" — walk me through that.`,
            reason: "mock: parked topic",
        };
    }
    return {
        choice: "question_id",
        questionId: candidates[0]?.id ?? null,
        parkedIndex: null,
        questionText: candidates[0]?.question ?? null,
        reason: "mock: first pool question",
    };
}
