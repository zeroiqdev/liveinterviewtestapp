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

import { LIVE_TURN_HEDGE_MS, LIVE_TURN_TIMEOUT_MS, callJSON } from "./llm";
import { NOTES_WINDOW, weightsFor } from "./constants";
import type {
    BankQuestion,
    Blueprint,
    CandidateProfile,
    Competency,
    PacingDirective,
    SessionDoc,
} from "./types";
import { companyGuidance } from "./company";

function stripBold(text: string | null): string | null {
    if (!text) return text;
    return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*\*/g, "");
}

export interface SelectionResult {
    choice: "question_id" | "parked_topic";
    questionId: string | null;
    /** when choice = parked_topic: index into session.parkingLot */
    parkedIndex: number | null;
    questionText: string | null;
    /** Short, answer-grounded lead-in. Kept separately so the exact spoken
     * bank transition can be cached and reused as one immutable plan. */
    bridge: string | null;
    reason: string;
}

function fallbackQuestion(candidates: BankQuestion[], session: SessionDoc, competency: Competency | null): BankQuestion | undefined {
    if (candidates.length === 0) return undefined;
    const asked = competency
        ? session.topicProgress[session.currentCompetencyIndex]?.askedQuestionIds.length ?? 0
        : session.generalAsked.questionIds.length;
    const preferredGeneralCategories = asked <= 1
        ? ["motivation", "company_fit", "background"]
        : asked <= 3
            ? ["initiative", "values", "growth_mindset", "self_assessment"]
            : ["accountability", "work_style", "conflict_resolution", "coachability", "resilience"];
    const preferred = competency
        ? candidates
        : candidates.filter((q) => preferredGeneralCategories.includes(q.category) && q.category !== "closing" && q.category !== "logistics");
    const viable = preferred.length > 0 ? preferred : candidates.filter((q) => q.category !== "closing" && q.category !== "logistics");
    const pool = viable.length > 0 ? viable : candidates;
    // A stable session-derived offset makes two interviews cover the same
    // progression but not recite the same prompt sequence when running in
    // mock/offline mode.
    const seed = [...session.sessionId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return pool[(seed + asked) % pool.length];
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
            bridge: null,
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
    const sectionProgress = competency
        ? `${session.topicProgress[session.currentCompetencyIndex]?.askedQuestionIds.length ?? 0} of ${competency.targetQuestionRange.max} planned questions covered`
        : `${session.generalAsked.questionIds.length} of ${blueprint.generalBehavioral.targetQuestionRange.min} background questions covered`;

    const system = `You are the question selector and conversational interviewer for a live interview engine.
Pick the single best next question for the current section. If the candidate has already answered earlier questions, craft a natural conversational lead-in that links what they just said to the theme of the new question so the interview feels cohesive and conversational.

Output ONLY valid JSON:
{
  "choice": "question_id" | "parked_topic",
  "questionId": "<id from the pool list, or null>",
  "parkedIndex": <index from a parked:N tag, or null>,
  "conversationalBridge": "<1 spoken sentence that acknowledges what the candidate just discussed and builds a base for what will be asked next. E.g. 'That gives me good insight into your engineering background. Shifting our focus to execution under tight deadlines:'>",
  "questionText": "<only for parked_topic: the complete question>",
  "reason": "<one sentence>"
}

Rules:
- Interviewer persona: ${blueprint.persona.voice}
- ${pacingNote}
- Conversational Bridging: If there is a last candidate answer, do not abruptly jump to a new topic. Briefly connect it using only a detail the candidate actually said. It must be one concise, legible sentence; omit it rather than use generic thanks, acknowledgements, or filler. Never start it with "Got it", "Okay" or "Thanks" — a short acknowledgement has already been spoken; begin with the substance (e.g. "You've clearly worked across some interesting fintech products. Let's move into our first main question."). For question_id, do not put the bank question in conversationalBridge or questionText.
- A parked topic that fits this section well outranks a generic pool question. For parked topics, create a natural callback ("Earlier you mentioned X — let's unpack that...").
- Never pick a question id that is not in the pool list.
- Do not repeat ground already covered in the running notes.
- Interview progression matters more than novelty: use the broad stage for background, motivation and fit; use the first question in a competency for a concrete anchor example; use later questions to test a complementary dimension, trade-off or result. Do not use a closing or logistics question until the interview is actually winding down.
- If the candidate's last answer was not a real answer — they objected, said the question doesn't apply to them (e.g. no company was given), asked for clarification, or said they don't know — do not praise it or call it useful/helpful context. Briefly acknowledge their point honestly ("Fair point — this is a general practice interview.") or omit the bridge.
- Never use ** for bold. Plain text only, no markdown.`;

    const user = `${companyGuidance(session.company)}
Current section: ${competencyLabel} (${sectionProgress})

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
            timeoutMs: LIVE_TURN_TIMEOUT_MS,
            hedgeMs: LIVE_TURN_HEDGE_MS,
            maxTokens: 400,
            mock: mockSelection(candidates, parkedIndexes, session, competency),
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
                bridge: stripBold(raw.conversationalBridge || "")?.trim() || null,
                reason: raw.reason || "resurfaced parked topic",
            };
        }

        const picked = candidates.find((q) => q.id === raw.questionId);
        if (picked) {
            // The classified bank question is authoritative. The model may
            // add a bridge, but cannot silently replace the planned question.
            const bridge = stripBold(raw.conversationalBridge || "")?.trim();
            const finalText = bridge ? `${bridge} ${picked.question}` : picked.question;
            return {
                choice: "question_id",
                questionId: picked.id,
                parkedIndex: null,
                questionText: finalText,
                bridge: bridge || null,
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
                bridge: null,
                reason: "fallback: parked topic",
            };
        }
        const first = fallbackQuestion(candidates, session, competency);
        const fallbackText = first?.question ?? null;
        return {
            choice: "question_id",
            questionId: first?.id ?? null,
            parkedIndex: null,
            questionText: stripBold(fallbackText),
            bridge: null,
            reason: "fallback: first unasked pool question",
        };
    }
}

function mockSelection(
    candidates: BankQuestion[],
    parkedIndexes: number[],
    session: SessionDoc,
    competency: Competency | null
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
    const q = fallbackQuestion(candidates, session, competency);
    const bridge = lastAnswer ? `You mentioned ${lastAnswer.split(/[,.;!?]/)[0].slice(0, 80)}. ` : "";
    return {
        choice: "question_id",
        questionId: q?.id ?? null,
        parkedIndex: null,
        conversationalBridge: bridge,
        questionText: bridge ? `${bridge} ${stripBold(q?.question ?? "")}` : stripBold(q?.question ?? null),
        reason: "mock: first pool question with bridge",
    };
}
