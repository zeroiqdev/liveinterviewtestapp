/* ══════════════════════════════════════
   Turn Controller — the FSM itself.
   One shared engine; per-role behavior is
   data (blueprint + pool + persona).

   Turn sequence:
     1. candidate's answer comes in
     2. sections advance if their planned depth is covered
     3. IN PARALLEL: selector picks the next planned question,
        conversational engine assesses the answer + drafts a probe
     4. probe policy decides: follow up (bounded) or move on
     5. all coverage complete → finalize
   ══════════════════════════════════════ */

import { randomUUID } from "crypto";
import { computePacing } from "./timeGovernor";
import { selectQuestion, type SelectionResult } from "./selector";
import { generalPool, getBlueprint, queryPool } from "./data";
import {
    clearPreparedTurns,
    draftKey,
    getSession,
    saveSession,
    savePreparedTurn,
    takeBestPreparedTurn,
    takePreparedTurn,
} from "./sessionStore";
import { draftCovers } from "./utterance";
import { RESUME_QUESTION_ID, pickResumeQuestion, resumeQuestionDue } from "./resumeQuestion";
import { questionsForCompany, realCompanyName } from "./company";
import {
    executeConversationalTurn,
    fallbackProbe,
    type ConversationalTurnOutput,
    type InterviewToolCall,
} from "./conversationalEngine";
import { decideProbe, probeLimits, type ProbeVerdict } from "./probePolicy";
import { detectVoiceCommand } from "./voiceCommands";
import { traceTurn } from "./turnTrace";
import type {
    AuditEntry,
    Blueprint,
    CandidateProfile,
    Competency,
    EnginePrompt,
    PacingDirective,
    ProbeDepth,
    ProbeFinding,
    PublicSessionState,
    SessionDoc,
} from "./types";

export const GENERAL_ID = "general_behavioral";
export const GENERAL_LABEL = "General behavioral";

// A preview is created while endpointing is still deciding whether the
// candidate has finished. It is keyed to the exact transcript and turn and
// expires quickly, so it can only accelerate the identical, subsequently
// submitted answer; it can never advance a live session on its own.
// Holds the in-flight promise, so a submit that lands while preparation is
// still running joins it instead of repeating both LLM calls.
type Decision = { conv: ConversationalTurnOutput; selection: SelectionResult };
type DraftEntry = { answerText: string; turnCount: number; decision: Promise<Decision>; expiresAt: number };
/** Drafts on this instance, keyed by draftKey(sessionId, answer snapshot). */
const preparedTurns = new Map<string, DraftEntry>();
/** Most recently started draft per session (the one a submit can join while it runs). */
const latestDraft = new Map<string, string>();
/** Drafts stay usable this long — long enough for the client to speak one and commit it. */
const DRAFT_TTL_MS = 120_000;

/** The client spoke a draft that no longer exists here or in storage. */
export class DraftUnavailableError extends Error {
    constructor() {
        super("drafted reply is no longer available");
    }
}

function forgetDrafts(sessionId: string) {
    latestDraft.delete(sessionId);
    for (const key of preparedTurns.keys()) if (key.startsWith(`${sessionId}:`)) preparedTurns.delete(key);
    clearPreparedTurns(sessionId);
}

const EMPTY_SELECTION: SelectionResult = {
    choice: "question_id",
    questionId: null,
    parkedIndex: null,
    questionText: null,
    bridge: null,
    reason: "not needed for this turn",
};

/* ── helpers ── */

/**
 * The client says a short acknowledgement ("Got it.") the instant the
 * candidate stops talking, so the reply must not open with another one.
 */
const LEADING_ACK =
    /^\s*(?:(?:got it|okay|ok|alright|all right|right|i see|understood|great|thanks?(?: you)?(?: for sharing(?: that)?)?|thank you(?: for sharing(?: that)?)?)[,.!]\s+)+/i;

/**
 * Separates a next-question line into its spoken lead-in and the question
 * itself, so the question's (pre-recorded) audio can be played on its own.
 */
function splitBridge(fullText: string, rawBridge: string | null): { text: string; bridge: string | null; question: string } {
    const text = stripLeadingAcknowledgement(fullText);
    const question = rawBridge && fullText.startsWith(rawBridge) ? fullText.slice(rawBridge.length).trim() : "";
    if (!question || !text.endsWith(question)) return { text, bridge: null, question: text };
    const bridge = text.slice(0, text.length - question.length).trim();
    return { text, bridge: bridge || null, question };
}

export function stripLeadingAcknowledgement(text: string): string {
    const stripped = text.replace(LEADING_ACK, "");
    if (!stripped || stripped === text) return text;
    return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/** If a joined warm-up hasn't answered by then, start a fresh decision too. */
export const PREPARE_HEDGE_MS = 2500;

/**
 * Resolve with the warm-up's decision, unless it fails or is still running
 * after PREPARE_HEDGE_MS; then a fresh decision races it and the first
 * successful one wins.
 */
export function joinOrHedge<T>(joined: Promise<T>, fresh: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        let pending = 1;
        let freshStarted = false;
        const win = (value: T) => {
            if (settled) return;
            settled = true;
            clearTimeout(hedgeTimer);
            resolve(value);
        };
        const lose = (err: unknown) => {
            pending -= 1;
            if (!freshStarted) startFresh();
            else if (pending === 0 && !settled) reject(err);
        };
        const startFresh = () => {
            if (freshStarted || settled) return;
            freshStarted = true;
            pending += 1;
            fresh().then(win, lose);
        };
        const hedgeTimer = setTimeout(startFresh, PREPARE_HEDGE_MS);
        joined.then(win, lose);
    });
}

/**
 * Speech recognition often re-finalizes the same words with different
 * casing or punctuation. A warm-up for those is still valid.
 */

export function audit(
    session: SessionDoc,
    module: AuditEntry["module"],
    decision: string,
    reason: string
) {
    session.auditLog.push({
        turn: session.turnCount,
        module,
        decision,
        reason,
        timestamp: new Date().toISOString(),
    });
}

export function touch(session: SessionDoc) {
    const now = Date.now();
    session.elapsedSeconds = Math.floor((now - session.startedAt) / 1000);
    session.lastTurnAt = now;
}

export function currentCompetency(session: SessionDoc, blueprint: Blueprint): Competency | null {
    if (session.currentCompetencyIndex < 0) return null;
    return blueprint.competencies[session.currentCompetencyIndex] ?? null;
}

export function recordAsked(session: SessionDoc, id: string) {
    if (session.currentCompetencyIndex < 0) {
        session.generalAsked.questionIds.push(id);
    } else {
        session.topicProgress[session.currentCompetencyIndex]?.askedQuestionIds.push(id);
    }
}

function nextScriptedQuestion(nextPoolQuestion: string | null): string {
    return nextPoolQuestion || "Let's move to the next area. Can you share another relevant example from your experience?";
}

/**
 * Moves past sections whose planned depth is covered. Returns true when the
 * whole blueprint is covered (caller finalizes).
 */
export function advanceCoveredSections(session: SessionDoc, blueprint: Blueprint, pacing: PacingDirective): boolean {
    // Keep the broad background stage until its planned minimum is covered.
    if (
        session.currentCompetencyIndex < 0 &&
        session.generalAsked.questionIds.length >= blueprint.generalBehavioral.targetQuestionRange.min &&
        blueprint.competencies.length > 0
    ) {
        session.currentCompetencyIndex = 0;
        session.topicProgress[0].status = "in_progress";
    }

    // A section advances only after its planned depth has been covered.
    while (session.currentCompetencyIndex >= 0 && session.currentCompetencyIndex < blueprint.competencies.length) {
        const active = blueprint.competencies[session.currentCompetencyIndex];
        const progress = session.topicProgress[session.currentCompetencyIndex];
        if (!active || !progress || progress.askedQuestionIds.length < active.targetQuestionRange.max) break;
        progress.status = "complete";
        session.currentCompetencyIndex++;
        if (session.currentCompetencyIndex >= blueprint.competencies.length) break;
        const next = blueprint.competencies[session.currentCompetencyIndex];
        if (pacing.skipOptional && next.priority === "optional") {
            session.topicProgress[session.currentCompetencyIndex].status = "skipped";
            continue;
        }
        session.topicProgress[session.currentCompetencyIndex].status = "in_progress";
    }
    return session.currentCompetencyIndex >= blueprint.competencies.length;
}

/* ── session init ── */

export async function startSession(opts: {
    candidateId: string;
    ownerId?: string | null;
    blueprintId: string;
    profile: CandidateProfile | null;
    interviewType?: string | null;
    candidateName?: string | null;
    companyName?: string | null;
    probeDepth?: ProbeDepth | null;
    voiceRegion?: string;
}): Promise<{ session: SessionDoc; prompt: EnginePrompt }> {
    const blueprint = getBlueprint(opts.blueprintId);
    if (!blueprint) throw new Error(`unknown blueprintId: ${opts.blueprintId}`);

    const { candidateId, profile } = opts;
    const now = Date.now();

    // If a specific interview type was chosen (e.g. "Execution & Metrics"), align initial section directly
    let initialCompIndex = -1; // general behavioral first by default
    if (opts.interviewType) {
        const typeLower = opts.interviewType.toLowerCase();
        if (typeLower.includes("behavioral") || typeLower.includes("leadership")) {
            initialCompIndex = -1;
        } else {
            const words = typeLower
                .replace(/interview/g, "")
                .split(/[\s&/+,]+/)
                .map((w) => w.trim())
                .filter((w) => w.length > 3);

            const matchIndex = blueprint.competencies.findIndex((c) => {
                const label = c.label.toLowerCase();
                const id = c.id.toLowerCase();
                return words.some((w) => label.includes(w) || id.includes(w));
            });
            if (matchIndex >= 0) {
                initialCompIndex = matchIndex;
            }
        }
    }

    const session: SessionDoc = {
        sessionId: randomUUID(),
        candidateId,
        ownerId: opts.ownerId ?? null,
        candidateName: opts.candidateName ?? null,
        // Placeholder names ("General Industry Benchmark") mean no company.
        company: realCompanyName(opts.companyName),
        interviewType: opts.interviewType ?? null,
        blueprintId: blueprint.blueprintId,
        hasProfile: profile?.hasProfile ?? {
            resume: false,
            linkedin: false,
            portfolio: false,
        },
        phase: "ask_scripted",
        currentCompetencyIndex: initialCompIndex,
        topicProgress: blueprint.competencies.map((c, i) => ({
            competencyId: c.id,
            askedQuestionIds: [],
            followUpsUsed: 0,
            timeSpentSeconds: 0,
            status: i === initialCompIndex ? "in_progress" : "pending",
        })),
        generalAsked: { questionIds: [], categories: [] },
        runningNotes: [],
        parkingLot: [],
        probeDepth: opts.probeDepth === "deep" ? "deep" : "standard",
        voiceRegion: opts.voiceRegion,
        probeThread: null,
        probeFindings: [],
        elapsedSeconds: 0,
        startedAt: now,
        lastTurnAt: now,
        turnCount: 0,
        transcript: [],
        auditLog: [],
        pendingQuestion: null,
        complete: false,
    };

    // One resume line is always asked about directly (when a resume exists).
    session.resumeQuestion = pickResumeQuestion(profile);
    if (session.resumeQuestion) {
        audit(session, "initializer", "resume_question", `Will ask about: ${session.resumeQuestion.claim}`);
    }

    // Pre-seed parking lot from vague profile claims — a vague resume claim is
    // treated exactly like something the candidate said live. Same mechanism.
    if (profile) {
        const competencyIds = new Set(blueprint.competencies.map((c) => c.id));
        for (const claim of profile.claims) {
            if (claim.specificity !== "vague") continue;
            // Already covered by the dedicated resume question.
            if (claim.text === session.resumeQuestion?.claim) continue;
            const target = claim.linkedCompetencies.find((id) =>
                competencyIds.has(id)
            );
            if (!target) continue;
            session.parkingLot.push({
                topicSummary: `Profile states "${claim.text}" with no concrete detail (${claim.sourceLocation})`,
                sourceCompetency: null,
                targetCompetency: target,
                turnParked: 0,
                resolved: false,
            });
        }
        if (session.parkingLot.length > 0) {
            audit(
                session,
                "initializer",
                "preseed",
                `${session.parkingLot.length} vague claim(s) seeded into parking lot`
            );
        }
    }

    await saveSession(session);

    const pacing = computePacing(session, blueprint);
    const prompt = await askNextQuestion(session, blueprint, pacing, profile);
    return { session, prompt };
}

/* ── asking ── */

async function askNextQuestion(
    session: SessionDoc,
    blueprint: Blueprint,
    pacing: PacingDirective,
    profile: CandidateProfile | null
): Promise<EnginePrompt> {
    const comp = currentCompetency(session, blueprint);
    const pool = questionsForCompany(comp ? queryPool(comp.questionPoolFilter) : generalPool(), session.company);

    const selection = await selectQuestion({
        session,
        blueprint,
        competency: comp,
        pool,
        pacing,
        profile,
        diversityNote: comp
            ? undefined
            : "Diversity rule: prefer covering distinct sub-categories (motivation, accountability, work_style, closing) over repeating one.",
    });

    if (!selection.questionText) {
        // Pool exhausted — treat section as complete and advance.
        audit(session, "selector", "pool_exhausted", comp?.id ?? GENERAL_ID);
        return advance(session, blueprint, pacing, profile);
    }

    if (selection.choice === "parked_topic" && selection.parkedIndex !== null) {
        session.parkingLot[selection.parkedIndex].resolved = true;
        recordAsked(session, `parked_${selection.parkedIndex}`);
        audit(
            session,
            "selector",
            "resurface",
            `"${session.parkingLot[selection.parkedIndex].topicSummary}" — ${selection.reason}`
        );
    } else if (selection.questionId) {
        recordAsked(session, selection.questionId);
        audit(session, "selector", "pick", `${selection.questionId} — ${selection.reason}`);
    }

    session.turnCount++;
    session.phase = "awaiting_answer";

    let questionText = selection.questionText;
    const isOpening = session.turnCount === 1;

    if (isOpening) {
        const candidateGreeting = session.candidateName ? `Hello ${session.candidateName},` : "Hello,";
        const roleLabel = session.interviewType || blueprint.role || "this role";
        const company = realCompanyName(session.company);
        const companySegment = company ? ` with ${company}` : "";

        const firstQuestion = selection.questionText || "could you share a bit about your background and what excites you about this role?";
        questionText = `${candidateGreeting} welcome! I'll be your interviewer today for the ${roleLabel} position${companySegment}. Over the next 20 to 30 minutes, we'll dive into your background and key competencies for the position. Take all the time you need to think through your answers. To get us started: ${firstQuestion.replace(/^[A-Z]/, (c) => c.toLowerCase())}`;
    }

    session.pendingQuestion = {
        text: questionText,
        competencyId: comp?.id ?? GENERAL_ID,
        kind: isOpening ? "opening" : "scripted",
        questionId: selection.questionId,
    };
    session.probeThread = {
        rootQuestion: questionText,
        competencyId: comp?.id ?? GENERAL_ID,
        followUps: 0,
        lastVerdict: null,
    };
    session.transcript.push({
        role: "interviewer",
        text: questionText,
        competencyId: comp?.id ?? GENERAL_ID,
        kind: isOpening ? "opening" : "scripted",
        timestamp: new Date().toISOString(),
    });
    await saveSession(session);

    return {
        type: "question",
        text: questionText,
        competencyId: comp?.id ?? GENERAL_ID,
        competencyLabel: comp?.label ?? GENERAL_LABEL,
        kind: session.pendingQuestion.kind,
        questionId: selection.questionId,
    };
}

/* ── advancing ── */

async function advance(
    session: SessionDoc,
    blueprint: Blueprint,
    pacing: PacingDirective,
    profile: CandidateProfile | null
): Promise<EnginePrompt> {
    // Mark current section complete
    if (session.currentCompetencyIndex >= 0) {
        const tp = session.topicProgress[session.currentCompetencyIndex];
        if (tp) tp.status = "complete";
    }

    // Find next competency, skipping optional ones when compressed
    let next = session.currentCompetencyIndex + 1;
    while (next < blueprint.competencies.length) {
        const comp = blueprint.competencies[next];
        if (pacing.skipOptional && comp.priority === "optional") {
            session.topicProgress[next].status = "skipped";
            audit(
                session,
                "governor",
                "skip",
                `${comp.id} skipped (optional, compressed pacing)`
            );
            next++;
            continue;
        }
        break;
    }

    if (next >= blueprint.competencies.length) {
        return finalize(session);
    }

    session.currentCompetencyIndex = next;
    session.topicProgress[next].status = "in_progress";
    session.phase = "ask_scripted";
    await saveSession(session);
    return askNextQuestion(session, blueprint, pacing, profile);
}

export async function finalize(session: SessionDoc): Promise<EnginePrompt> {
    session.phase = "complete";
    session.complete = true;
    session.pendingQuestion = null;
    closeProbeThread(session, null, null);
    audit(
        session,
        "finalizer",
        "complete",
        `all required coverage met in ${Math.round(session.elapsedSeconds / 60)}min`
    );
    await saveSession(session);
    return {
        type: "complete",
        text: "That's everything I needed — thank you for walking me through all of that. We'll be in touch soon.",
        competencyId: null,
        competencyLabel: null,
        kind: null,
        questionId: null,
    };
}

/* ── probing ── */

/**
 * Ends the follow-up chain on the current question. Records a finding when
 * the topic was probed or left unproven, and parks unproven claims so a later
 * section can return to them.
 */
export function closeProbeThread(
    session: SessionDoc,
    conv: ConversationalTurnOutput | null,
    verdict: ProbeVerdict | null
) {
    const thread = session.probeThread;
    session.probeThread = null;
    if (!thread) return;
    // The opening sets context and is never probed — nothing to report.
    if (session.pendingQuestion?.kind === "opening") return;

    const assessment = conv?.assessment ?? null;
    const unproven = assessment && (assessment.verdict === "vague" || assessment.verdict === "evasive");
    if (thread.followUps === 0 && !unproven && !assessment?.saidDontKnow) return;
    if (!assessment && thread.followUps === 0) return;

    const outcome: ProbeFinding["outcome"] = assessment?.saidDontKnow
        ? "said_dont_know"
        : assessment?.verdict === "verified" || assessment?.verdict === "partial"
          ? "verified"
          : verdict?.wanted && !verdict.allow
            ? "budget_exhausted"
            : "unresolved";

    session.probeFindings = session.probeFindings ?? [];
    session.probeFindings.push({
        turn: session.turnCount,
        competencyId: thread.competencyId,
        question: thread.rootQuestion,
        claimSummary: assessment?.claimSummary || conv?.cleanExtraction || "",
        verdict: assessment?.verdict ?? thread.lastVerdict ?? "vague",
        followUps: thread.followUps,
        outcome,
    });
    audit(session, "probe", `close_${outcome}`, `${thread.followUps} follow-up(s) on "${thread.rootQuestion.slice(0, 80)}"`);

    // Park unproven claims for a later section to revisit.
    if ((outcome === "unresolved" || outcome === "budget_exhausted") && assessment?.claimSummary) {
        const blueprint = getBlueprint(session.blueprintId);
        const nextPending = blueprint?.competencies.find(
            (c, i) => i > session.currentCompetencyIndex && session.topicProgress[i]?.status === "pending"
        );
        if (nextPending) {
            session.parkingLot.push({
                topicSummary: `Earlier answer left unproven: ${assessment.claimSummary}`,
                sourceCompetency: thread.competencyId,
                targetCompetency: nextPending.id,
                turnParked: session.turnCount,
                resolved: false,
            });
        }
    }
}

type TurnPlan =
    | { kind: "end"; conv: ConversationalTurnOutput }
    | { kind: "repeat"; conv: ConversationalTurnOutput }
    | { kind: "probe"; conv: ConversationalTurnOutput; text: string; verdict: ProbeVerdict }
    | {
          kind: "next";
          conv: ConversationalTurnOutput;
          text: string;
          /** Spoken parts of text: lead-in (may be null) and the question itself. */
          bridge: string | null;
          question: string;
          verdict: ProbeVerdict | null;
          skipped: boolean;
      };

/** Pure: decides what the interviewer does next from both model outputs. */
function planTurn(
    session: SessionDoc,
    pacing: PacingDirective,
    conv: ConversationalTurnOutput,
    selection: SelectionResult
): TurnPlan {
    if (conv.intent === "end_interview") return { kind: "end", conv };
    if (conv.intent === "repeat_question") return { kind: "repeat", conv };

    const nextQuestion = nextScriptedQuestion(selection.questionText);

    if (conv.intent === "skip_question") {
        // The selector's bridge references the answer; drop it after a skip.
        const bare =
            selection.bridge && nextQuestion.startsWith(selection.bridge)
                ? nextQuestion.slice(selection.bridge.length).trim()
                : nextQuestion;
        const bridge = "No problem, let's move right along.";
        return { kind: "next", conv, text: `${bridge} ${bare}`, bridge, question: bare, verdict: null, skipped: true };
    }

    const thread = session.probeThread;
    const probeText =
        conv.probeText ||
        (conv.assessment ? fallbackProbe(conv.assessment.weakestDimension, thread?.followUps ?? 0) : "");
    const verdict = decideProbe({
        session,
        pacing,
        assessment: conv.assessment,
        modelWantsProbe: conv.suggestedTool === "push_back",
        hasProbeText: Boolean(probeText),
    });
    if (verdict.allow) return { kind: "probe", conv, text: stripLeadingAcknowledgement(probeText), verdict };
    return { kind: "next", conv, ...splitBridge(nextQuestion, selection.bridge), verdict, skipped: false };
}

/** Runs the selector and the conversational engine in parallel. */
async function decideTurn(opts: {
    session: SessionDoc;
    blueprint: Blueprint;
    pacing: PacingDirective;
    answerText: string;
    profile: CandidateProfile | null;
    turnId?: string;
    mode: "prepare" | "submit";
    /** No next question exists (coverage complete) — only assess the answer. */
    skipSelection?: boolean;
}): Promise<{ conv: ConversationalTurnOutput; selection: SelectionResult }> {
    const { session, blueprint, pacing, answerText, profile, turnId, mode } = opts;
    const competency = currentCompetency(session, blueprint);
    const pool = questionsForCompany(
        competency ? queryPool(competency.questionPoolFilter) : generalPool(),
        session.company
    );
    const thread = session.probeThread;
    const limits = probeLimits(session.probeDepth, pacing);

    // "Repeat" and "end" never move on, so they don't need a next question.
    const command = detectVoiceCommand(answerText);
    const needsSelection = !opts.skipSelection && command !== "end_call" && command !== "repeat_question";
    // When the resume question is due it is the next question; no selector call.
    const resumeQuestion = needsSelection && resumeQuestionDue(session, pacing) ? session.resumeQuestion! : null;

    traceTurn(turnId, "decide_started", { mode, parallel: needsSelection });
    const [selection, conv] = await Promise.all([
        resumeQuestion
            ? Promise.resolve<SelectionResult>({
                  choice: "question_id",
                  questionId: RESUME_QUESTION_ID,
                  parkedIndex: null,
                  questionText: resumeQuestion.text,
                  bridge: null,
                  reason: `resume line: ${resumeQuestion.sourceLocation}`,
              })
            : needsSelection
            ? selectQuestion({
                  session,
                  blueprint,
                  competency,
                  pool,
                  pacing,
                  profile,
                  diversityNote: competency
                      ? undefined
                      : "Interview arc: establish background and motivation first, then values or work style. Do not use salary or closing questions at this stage.",
              })
            : Promise.resolve(EMPTY_SELECTION),
        executeConversationalTurn({
            session,
            blueprint,
            competency,
            answerText,
            profile,
            probe:
                thread && session.pendingQuestion?.kind !== "opening"
                    ? {
                          rootQuestion: thread.rootQuestion,
                          followUpsSoFar: thread.followUps,
                          maxFollowUps: limits.perQuestion,
                          depth: session.probeDepth ?? "standard",
                      }
                    : null,
        }),
    ]);
    traceTurn(turnId, "decide_completed", { mode, tool: conv.suggestedTool, verdict: conv.assessment?.verdict });
    return { conv, selection };
}

/* ── the turn itself ── */

export async function prepareAnswer(opts: {
    sessionId: string;
    answerText: string;
    profile: CandidateProfile | null;
    turnId?: string;
    /** Already-loaded session (saves a database read). */
    session?: SessionDoc;
}): Promise<{
    spokenText: string;
    action: TurnPlan["kind"];
    questionId: string | null;
    bridge: string | null;
    question: string | null;
    /** How the draft judged the answer (null for commands / no assessment). */
    verdict: string | null;
} | null> {
    const source = opts.session ?? (await getSession(opts.sessionId));
    if (!source || source.complete) return null;
    const blueprint = getBlueprint(source.blueprintId);
    if (!blueprint) return null;

    const answerText = opts.answerText.trim();
    if (!answerText) return null;

    // The engine only reads the session here. Clone anyway to make the
    // non-mutating contract explicit.
    const preview = structuredClone(source);
    const pacing = computePacing(preview, blueprint);
    if (advanceCoveredSections(preview, blueprint, pacing)) return null;
    // Mirror submitAnswer's read context so the warm result is coherent.
    preview.transcript.push({
        role: "candidate",
        text: answerText,
        competencyId: currentCompetency(preview, blueprint)?.id ?? GENERAL_ID,
        kind: "answer",
        timestamp: new Date().toISOString(),
    });

    const key = draftKey(opts.sessionId, answerText);
    let cached = preparedTurns.get(key);
    if (!cached || cached.turnCount !== source.turnCount || cached.expiresAt <= Date.now()) {
        traceTurn(opts.turnId, "prepare_started");
        const decision = decideTurn({
            session: preview,
            blueprint,
            pacing,
            answerText,
            profile: opts.profile,
            turnId: opts.turnId,
            mode: "prepare",
        });
        const now = Date.now();
        for (const [k, entry] of preparedTurns) if (entry.expiresAt <= now) preparedTurns.delete(k);
        const entry = { answerText, turnCount: source.turnCount, decision, expiresAt: now + DRAFT_TTL_MS };
        preparedTurns.set(key, entry);
        // Never let a failed warm-up be reused.
        decision.catch(() => {
            if (preparedTurns.get(key) === entry) preparedTurns.delete(key);
        });
        cached = entry;
    }
    latestDraft.set(opts.sessionId, key);

    const resolved = await cached.decision;
    // Stored before the client hears about it: a draft the client may speak
    // must be committable from any instance.
    await savePreparedTurn(opts.sessionId, {
        answerText,
        turnCount: cached.turnCount,
        decision: resolved,
        expiresAt: cached.expiresAt,
    });

    const { conv, selection } = resolved;
    const plan = planTurn(preview, pacing, conv, selection);
    traceTurn(opts.turnId, "prepare_completed", { action: plan.kind });
    const spokenText = plan.kind === "probe" || plan.kind === "next" ? plan.text : conv.spokenText;
    return {
        spokenText,
        action: plan.kind,
        questionId: plan.kind === "next" ? selection.questionId : null,
        bridge: plan.kind === "next" ? plan.bridge : null,
        question: plan.kind === "next" ? plan.question : null,
        verdict: conv.assessment?.verdict ?? null,
    };
}

export async function submitAnswer(opts: {
    sessionId: string;
    answerText: string;
    profile: CandidateProfile | null;
    turnId?: string;
    /** Already-loaded session (saves a database read). */
    session?: SessionDoc;
    /**
     * The answer snapshot of a draft the client has already started speaking.
     * That exact draft must be committed (so what was said is what is
     * recorded); if it can't be found, nothing is changed.
     */
    spokenDraft?: string;
}): Promise<{ session: SessionDoc; prompt: EnginePrompt; pacing: PacingDirective; toolCall?: InterviewToolCall }> {
    const session = opts.session ?? (await getSession(opts.sessionId));
    if (!session) throw new Error(`unknown sessionId: ${opts.sessionId}`);
    const blueprint = getBlueprint(session.blueprintId);
    if (!blueprint) throw new Error(`unknown blueprintId: ${session.blueprintId}`);
    if (session.complete) {
        return {
            session,
            prompt: {
                type: "complete",
                text: null,
                competencyId: null,
                competencyLabel: null,
                kind: null,
                questionId: null,
            },
            pacing: computePacing(session, blueprint),
        };
    }

    const answerText = opts.answerText.trim() || "(no answer given)";
    const turnCountAtStart = session.turnCount;

    // A spoken draft is resolved before anything changes, so a missing one
    // leaves the session untouched for the client to resubmit.
    let spoken: DraftEntry | undefined;
    if (opts.spokenDraft) {
        const key = draftKey(opts.sessionId, opts.spokenDraft);
        spoken =
            preparedTurns.get(key) ??
            (await takePreparedTurn<Decision>(opts.sessionId, opts.spokenDraft).then((row) =>
                row ? { ...row, decision: Promise.resolve(row.decision) } : undefined
            ));
        const usable =
            spoken !== undefined &&
            spoken.turnCount === turnCountAtStart &&
            spoken.expiresAt > Date.now() &&
            draftCovers(spoken.answerText, answerText);
        if (!usable) throw new DraftUnavailableError();
    }
    touch(session);

    session.transcript.push({
        role: "candidate",
        text: answerText,
        competencyId: currentCompetency(session, blueprint)?.id ?? GENERAL_ID,
        kind: "answer",
        timestamp: new Date().toISOString(),
    });

    // Time Governor — every turn, never on a fixed schedule
    const pacing = computePacing(session, blueprint);

    // When this answer completes the last section there is no next question,
    // but the answer is still assessed: a vague final answer can be probed
    // before the interview wraps up.
    const coverageComplete = advanceCoveredSections(session, blueprint, pacing);

    // A spoken draft is used as-is. Otherwise prefer this instance's latest
    // warm-up (it may still be running and can be joined), else the longest
    // stored draft the final answer still matches.
    const latestKey = latestDraft.get(opts.sessionId);
    const local = spoken ?? (coverageComplete || !latestKey ? undefined : preparedTurns.get(latestKey));
    const prepared: DraftEntry | undefined =
        local ??
        (coverageComplete
            ? undefined
            : await takeBestPreparedTurn<Decision>(opts.sessionId, turnCountAtStart, (draft) =>
                  draftCovers(draft, answerText)
              ).then((row) => (row ? { ...row, decision: Promise.resolve(row.decision) } : undefined)));
    const canUsePrepared =
        prepared !== undefined &&
        draftCovers(prepared.answerText, answerText) &&
        prepared.turnCount === turnCountAtStart &&
        prepared.expiresAt > Date.now();
    traceTurn(
        opts.turnId,
        spoken ? "draft_spoken" : canUsePrepared ? (local ? "prepare_reused" : "prepare_reused_shared") : "prepare_discarded"
    );
    // This turn is decided; its other drafts are now stale.
    forgetDrafts(opts.sessionId);

    const fresh = () =>
        decideTurn({
            session,
            blueprint,
            pacing,
            answerText,
            profile: opts.profile,
            turnId: opts.turnId,
            mode: "submit",
            skipSelection: coverageComplete,
        });
    // Join the warm-up (finished or still running); recompute if it failed,
    // and hedge with a fresh decision if it is running unusually long.
    // A spoken draft is never swapped for a fresh decision.
    const { conv, selection } = spoken
        ? await spoken.decision
        : canUsePrepared
          ? await joinOrHedge(prepared!.decision, fresh)
          : await fresh();

    const plan = planTurn(session, pacing, conv, selection);
    const currentComp = currentCompetency(session, blueprint);

    if (coverageComplete && plan.kind === "next") {
        closeProbeThread(session, conv, plan.verdict);
        return { session, prompt: await finalize(session), pacing };
    }

    // 1. End the interview
    if (plan.kind === "end") {
        closeProbeThread(session, null, null);
        session.phase = "complete";
        session.complete = true;
        session.pendingQuestion = null;
        session.transcript.push({
            role: "interviewer",
            text: conv.spokenText,
            competencyId: null,
            kind: "scripted",
            timestamp: new Date().toISOString(),
        });
        audit(session, "finalizer", "end_call", conv.endCallReason || "Candidate ended call");
        await saveSession(session);
        return {
            session,
            prompt: {
                type: "complete",
                text: conv.spokenText,
                competencyId: null,
                competencyLabel: null,
                kind: null,
                questionId: null,
            },
            toolCall: { tool: "end_call", reason: conv.endCallReason, systemMessage: conv.spokenText },
            pacing,
        };
    }

    // 2. Repeat the question (no state change beyond the transcript)
    if (plan.kind === "repeat") {
        session.transcript.push({
            role: "interviewer",
            text: conv.spokenText,
            competencyId: session.pendingQuestion?.competencyId ?? currentComp?.id ?? GENERAL_ID,
            kind: "scripted",
            timestamp: new Date().toISOString(),
        });
        audit(session, "selector", "repeat", "Candidate requested question repeat");
        await saveSession(session);
        return {
            session,
            prompt: {
                type: "question",
                text: conv.spokenText,
                competencyId: currentComp?.id ?? GENERAL_ID,
                competencyLabel: currentComp?.label ?? GENERAL_LABEL,
                kind: "scripted",
                questionId: session.pendingQuestion?.questionId ?? null,
            },
            toolCall: { tool: "repeat_question", reason: "Candidate asked for question repetition", systemMessage: conv.spokenText },
            pacing,
        };
    }

    // 3. Follow up on the same question
    if (plan.kind === "probe") {
        const thread = session.probeThread!;
        thread.followUps++;
        thread.lastVerdict = conv.assessment?.verdict ?? null;
        session.turnCount++;
        session.phase = "follow_up";
        const sectionIndex = blueprint.competencies.findIndex((c) => c.id === thread.competencyId);
        if (sectionIndex >= 0 && session.topicProgress[sectionIndex]) {
            session.topicProgress[sectionIndex].followUpsUsed++;
        }
        session.pendingQuestion = {
            text: plan.text,
            competencyId: thread.competencyId,
            kind: "follow_up",
            questionId: null,
        };
        session.transcript.push({
            role: "interviewer",
            text: plan.text,
            competencyId: thread.competencyId,
            kind: "follow_up",
            timestamp: new Date().toISOString(),
        });
        session.runningNotes.push({
            turn: session.turnCount,
            competencyId: thread.competencyId,
            summary: conv.noteSummary,
        });
        if (plan.verdict.override) audit(session, "budget", "override", plan.verdict.reason);
        audit(session, "probe", "follow_up", plan.verdict.reason);
        await saveSession(session);
        return {
            session,
            prompt: {
                type: "follow_up",
                text: plan.text,
                competencyId: thread.competencyId,
                competencyLabel: currentComp?.label ?? GENERAL_LABEL,
                kind: "follow_up",
                questionId: null,
            },
            toolCall: {
                tool: "push_back",
                reason: plan.verdict.reason,
                systemMessage: plan.text,
                cleanExtraction: conv.cleanExtraction,
                noteSummary: conv.noteSummary,
            },
            pacing,
        };
    }

    // 4. Move on to the next planned question
    closeProbeThread(session, conv, plan.verdict);
    if (plan.verdict && !plan.verdict.allow && plan.verdict.wanted) {
        audit(session, "budget", "suppress_follow_up", plan.verdict.reason);
    }
    session.turnCount++;
    session.phase = "awaiting_answer";
    if (selection.choice === "parked_topic" && selection.parkedIndex !== null) {
        session.parkingLot[selection.parkedIndex].resolved = true;
        recordAsked(session, `parked_${selection.parkedIndex}`);
    } else if (selection.questionId) {
        recordAsked(session, selection.questionId);
        if (selection.questionId === RESUME_QUESTION_ID && session.resumeQuestion) {
            session.resumeQuestion.asked = true;
        }
    }
    session.pendingQuestion = {
        text: plan.text,
        competencyId: currentComp?.id ?? GENERAL_ID,
        kind: "scripted",
        questionId: selection.questionId,
    };
    session.probeThread = {
        rootQuestion: plan.text,
        competencyId: currentComp?.id ?? GENERAL_ID,
        followUps: 0,
        lastVerdict: null,
    };
    session.transcript.push({
        role: "interviewer",
        text: plan.text,
        competencyId: currentComp?.id ?? GENERAL_ID,
        kind: "scripted",
        timestamp: new Date().toISOString(),
    });
    session.runningNotes.push({
        turn: session.turnCount,
        competencyId: currentComp?.id ?? GENERAL_ID,
        summary: conv.noteSummary,
    });
    audit(session, "selector", plan.skipped ? "skip" : "next_question", conv.cleanExtraction || selection.reason);
    await saveSession(session);
    return {
        session,
        prompt: {
            type: "question",
            text: plan.text,
            competencyId: currentComp?.id ?? GENERAL_ID,
            competencyLabel: currentComp?.label ?? GENERAL_LABEL,
            kind: "scripted",
            questionId: selection.questionId,
            bridge: plan.bridge,
            question: plan.question,
        },
        toolCall: {
            tool: plan.skipped ? "skip_question" : "ask_question",
            reason: plan.skipped ? "Candidate skipped the question" : selection.reason,
            systemMessage: plan.text,
            cleanExtraction: conv.cleanExtraction,
            noteSummary: conv.noteSummary,
        },
        pacing,
    };
}

/* ── public state ── */

export function getUpcomingQuestionTexts(
    session: SessionDoc,
    blueprint: Blueprint | null
): string[] {
    if (!blueprint || session.complete) return [];
    const upcoming: string[] = [];

    // 1. Current section questions remaining
    if (session.currentCompetencyIndex < 0) {
        const asked = new Set(session.generalAsked.questionIds);
        const remaining = questionsForCompany(generalPool(), session.company).filter((q) => !asked.has(q.id));
        for (const q of remaining.slice(0, 2)) {
            if (q.question) upcoming.push(q.question);
        }
    } else {
        const comp = blueprint.competencies[session.currentCompetencyIndex];
        if (comp) {
            const tp = session.topicProgress[session.currentCompetencyIndex];
            const asked = new Set(tp?.askedQuestionIds ?? []);
            const remaining = questionsForCompany(queryPool(comp.questionPoolFilter), session.company).filter(
                (q) => !asked.has(q.id)
            );
            for (const q of remaining.slice(0, 2)) {
                if (q.question) upcoming.push(q.question);
            }
        }
    }

    // 2. Next section questions (for smooth competency transitions)
    const nextIdx = session.currentCompetencyIndex + 1;
    if (nextIdx < blueprint.competencies.length) {
        const nextComp = blueprint.competencies[nextIdx];
        if (nextComp) {
            const nextPool = questionsForCompany(queryPool(nextComp.questionPoolFilter), session.company);
            for (const q of nextPool.slice(0, 1)) {
                if (q.question && !upcoming.includes(q.question)) {
                    upcoming.push(q.question);
                }
            }
        }
    }

    return upcoming.slice(0, 3);
}

export function toPublicState(
    session: SessionDoc,
    pacingMode?: PacingDirective["mode"]
): PublicSessionState {
    const blueprint = getBlueprint(session.blueprintId);
    const pacing = pacingMode ?? (blueprint ? computePacing(session, blueprint).mode : "normal");
    const comp = blueprint ? currentCompetency(session, blueprint) : null;

    return {
        sessionId: session.sessionId,
        blueprintId: session.blueprintId,
        role: blueprint?.role ?? session.blueprintId,
        phase: session.phase,
        complete: session.complete,
        elapsedSeconds: session.elapsedSeconds,
        totalTimeBudgetSeconds: blueprint?.totalTimeBudgetSeconds ?? 2700,
        pacing,
        currentSectionLabel: comp?.label ?? GENERAL_LABEL,
        sectionIndex: session.currentCompetencyIndex + 1,
        sectionCount: (blueprint?.competencies.length ?? 0) + 1,
        sections: [
            {
                competencyId: GENERAL_ID,
                label: GENERAL_LABEL,
                priority: "required" as const,
                status:
                    session.currentCompetencyIndex < 0
                        ? ("in_progress" as const)
                        : ("complete" as const),
                asked: session.generalAsked.questionIds.length,
                targetMin: blueprint?.generalBehavioral.targetQuestionRange.min ?? 4,
                targetMax: blueprint?.generalBehavioral.targetQuestionRange.max ?? 6,
            },
            ...(blueprint?.competencies ?? []).map((c, i) => ({
                competencyId: c.id,
                label: c.label,
                priority: c.priority,
                status: session.topicProgress[i]?.status ?? "pending",
                asked: session.topicProgress[i]?.askedQuestionIds.length ?? 0,
                targetMin: c.targetQuestionRange.min,
                targetMax: c.targetQuestionRange.max,
            })),
        ],
        pendingQuestion: session.pendingQuestion,
        turnCount: session.turnCount,
        upcomingQuestions: getUpcomingQuestionTexts(session, blueprint),
    };
}
