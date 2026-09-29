/* ══════════════════════════════════════
   Turn Controller — the FSM itself.
   One shared engine; per-role behavior is
   data (blueprint + pool + persona).

   Turn sequence (per spec):
     1. candidate's answer comes in
     2. running notes + probe evaluation
     3. park / let_go / probe_now (+budget)
     4. continue section or advance
     5. all coverage complete → finalize
   ══════════════════════════════════════ */

import { randomUUID } from "crypto";
import { computePacing } from "./timeGovernor";
import { selectQuestion } from "./selector";
import { enforceBudget, evaluateAnswer } from "./probe";
import { generateFollowUp } from "./followUp";
import { generalPool, getBlueprint, queryPool } from "./data";
import { getSession, saveSession } from "./sessionStore";
import { executeConversationalTurn, type InterviewToolCall } from "./conversationalEngine";
import type {
    AuditEntry,
    Blueprint,
    CandidateProfile,
    Competency,
    EnginePrompt,
    PacingDirective,
    PublicSessionState,
    SessionDoc,
} from "./types";

const GENERAL_ID = "general_behavioral";
const GENERAL_LABEL = "General behavioral";

/* ── helpers ── */

function audit(
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

function touch(session: SessionDoc) {
    const now = Date.now();
    session.elapsedSeconds = Math.floor((now - session.startedAt) / 1000);
    session.lastTurnAt = now;
}

function currentCompetency(session: SessionDoc, blueprint: Blueprint): Competency | null {
    if (session.currentCompetencyIndex < 0) return null;
    return blueprint.competencies[session.currentCompetencyIndex] ?? null;
}

function sectionAskedCount(session: SessionDoc): number {
    if (session.currentCompetencyIndex < 0)
        return session.generalAsked.questionIds.length;
    return (
        session.topicProgress[session.currentCompetencyIndex]?.askedQuestionIds
            .length ?? 0
    );
}

function sectionRange(session: SessionDoc, blueprint: Blueprint) {
    const comp = currentCompetency(session, blueprint);
    return comp
        ? comp.targetQuestionRange
        : blueprint.generalBehavioral.targetQuestionRange;
}

function recordAsked(session: SessionDoc, id: string) {
    if (session.currentCompetencyIndex < 0) {
        session.generalAsked.questionIds.push(id);
    } else {
        session.topicProgress[session.currentCompetencyIndex]?.askedQuestionIds.push(id);
    }
}

function nextScriptedQuestion(nextPoolQuestion: string | null): string {
    return nextPoolQuestion || "Let's move to the next area. Can you share another relevant example from your experience?";
}

/* ── session init ── */

export async function startSession(opts: {
    candidateId: string;
    blueprintId: string;
    profile: CandidateProfile | null;
    interviewType?: string | null;
    candidateName?: string | null;
    companyName?: string | null;
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
        candidateName: opts.candidateName ?? null,
        company: opts.companyName ?? null,
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
        elapsedSeconds: 0,
        startedAt: now,
        lastTurnAt: now,
        turnCount: 0,
        transcript: [],
        auditLog: [],
        pendingQuestion: null,
        complete: false,
    };

    // Pre-seed parking lot from vague profile claims — a vague resume claim is
    // treated exactly like something the candidate said live. Same mechanism.
    if (profile) {
        const competencyIds = new Set(blueprint.competencies.map((c) => c.id));
        for (const claim of profile.claims) {
            if (claim.specificity !== "vague") continue;
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

    saveSession(session);

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
    const pool = comp ? queryPool(comp.questionPoolFilter) : generalPool();

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
        const companySegment = session.company && session.company !== "General" && session.company !== "General Industry Benchmark"
            ? ` with ${session.company}`
            : "";

        const firstQuestion = selection.questionText || "could you share a bit about your background and what excites you about this role?";
        questionText = `${candidateGreeting} welcome! I'll be your interviewer today for the ${roleLabel} position${companySegment}. Over the next 20 to 30 minutes, we'll dive into your background and key competencies for the position. Take all the time you need to think through your answers. To get us started: ${firstQuestion.replace(/^[A-Z]/, (c) => c.toLowerCase())}`;
    }

    session.pendingQuestion = {
        text: questionText,
        competencyId: comp?.id ?? GENERAL_ID,
        kind: isOpening ? "opening" : "scripted",
        questionId: selection.questionId,
    };
    session.transcript.push({
        role: "interviewer",
        text: questionText,
        competencyId: comp?.id ?? GENERAL_ID,
        kind: isOpening ? "opening" : "scripted",
        timestamp: new Date().toISOString(),
    });
    saveSession(session);

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
        return finalize(session, blueprint);
    }

    session.currentCompetencyIndex = next;
    session.topicProgress[next].status = "in_progress";
    session.phase = "ask_scripted";
    saveSession(session);
    return askNextQuestion(session, blueprint, pacing, profile);
}

function finalize(session: SessionDoc, blueprint: Blueprint): EnginePrompt {
    session.phase = "complete";
    session.complete = true;
    session.pendingQuestion = null;
    audit(
        session,
        "finalizer",
        "complete",
        `all required coverage met in ${Math.round(session.elapsedSeconds / 60)}min`
    );
    saveSession(session);
    return {
        type: "complete",
        text: "That's everything I needed — thank you for walking me through all of that. We'll be in touch soon.",
        competencyId: null,
        competencyLabel: null,
        kind: null,
        questionId: null,
    };
}

/* ── the turn itself ── */

export async function submitAnswer(opts: {
    sessionId: string;
    answerText: string;
    profile: CandidateProfile | null;
}): Promise<{ session: SessionDoc; prompt: EnginePrompt; pacing: PacingDirective; toolCall?: InterviewToolCall }> {
    const session = getSession(opts.sessionId);
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
    const comp = currentCompetency(session, blueprint);
    touch(session);

    // Record the answer
    session.transcript.push({
        role: "candidate",
        text: answerText,
        competencyId: comp?.id ?? GENERAL_ID,
        kind: "answer",
        timestamp: new Date().toISOString(),
    });
    if (session.currentCompetencyIndex >= 0) {
        const tp = session.topicProgress[session.currentCompetencyIndex];
        if (tp) tp.timeSpentSeconds += 0; // time tracked at session level
    }

    // Time Governor — every turn, never on a fixed schedule
    const pacing = computePacing(session, blueprint);

    // Initialize competency progress if starting interview
    if (session.currentCompetencyIndex < 0 && blueprint.competencies.length > 0) {
        session.currentCompetencyIndex = 0;
        session.topicProgress[0].status = "in_progress";
    }

    const currentComp = currentCompetency(session, blueprint);
    const pool = currentComp ? queryPool(currentComp.questionPoolFilter) : generalPool();
    const askedIds = new Set(
        currentComp
            ? (session.topicProgress[session.currentCompetencyIndex]?.askedQuestionIds ?? [])
            : session.generalAsked.questionIds
    );
    const unaskedPool = pool.filter((q) => !askedIds.has(q.id));
    const nextPoolQuestion = unaskedPool[0]?.question || null;

    let convResult = await executeConversationalTurn({
        session,
        blueprint,
        competency: currentComp,
        answerText,
        profile: opts.profile,
        nextPoolQuestion,
    });

    // The conversational model can suggest a clarification, but it cannot
    // replace the interview plan. A probe is allowed only within the explicit
    // section budget and never immediately after another probe.
    if (convResult.action === "push_back" || convResult.action === "follow_up") {
        const budget = enforceBudget({
            session,
            competency: currentComp,
            pacing,
            decision: {
                noteworthy: true,
                immediacy: "probe_now",
                reason: "conversational engine requested a clarification",
                best_fit_competency_if_parked: null,
                topic_summary: convResult.cleanExtraction || null,
                contradiction: false,
                note_summary: convResult.noteSummary,
            },
        });
        const previousQuestionWasFollowUp = session.pendingQuestion?.kind === "follow_up";
        const hasScriptedCoverage = sectionAskedCount(session) > 0;

        if (!budget.allow || previousQuestionWasFollowUp || !hasScriptedCoverage) {
            const reason = previousQuestionWasFollowUp
                ? "follow-up already asked — returning to the scripted plan"
                : !hasScriptedCoverage
                    ? "no scripted question covered yet — returning to the planned question"
                : budget.reason;
            audit(session, "budget", "suppress_follow_up", reason);
            convResult = {
                ...convResult,
                action: "next_question",
                spokenText: nextScriptedQuestion(nextPoolQuestion),
                advanceSection: false,
                toolCall: {
                    tool: "ask_question",
                    reason,
                    systemMessage: nextScriptedQuestion(nextPoolQuestion),
                    cleanExtraction: convResult.cleanExtraction,
                    noteSummary: convResult.noteSummary,
                },
            };
        }
    }

    // 1. Handle end_interview intent
    if (convResult.intent === "end_interview") {
        session.phase = "complete";
        session.complete = true;
        session.pendingQuestion = null;
        session.transcript.push({
            role: "interviewer",
            text: convResult.spokenText,
            competencyId: null,
            kind: "scripted",
            timestamp: new Date().toISOString(),
        });
        audit(session, "finalizer", "end_call", convResult.endCallReason || "Candidate ended call");
        saveSession(session);
        return {
            session,
            prompt: {
                type: "complete",
                text: convResult.spokenText,
                competencyId: null,
                competencyLabel: null,
                kind: null,
                questionId: null,
            },
            toolCall: convResult.toolCall,
            pacing,
        };
    }

    // 2. Handle repeat_question intent
    if (convResult.intent === "repeat_question") {
        session.transcript.push({
            role: "interviewer",
            text: convResult.spokenText,
            competencyId: currentComp?.id ?? GENERAL_ID,
            kind: "scripted",
            timestamp: new Date().toISOString(),
        });
        audit(session, "selector", "repeat", "Candidate requested question repeat");
        saveSession(session);
        return {
            session,
            prompt: {
                type: "question",
                text: convResult.spokenText,
                competencyId: currentComp?.id ?? GENERAL_ID,
                competencyLabel: currentComp?.label ?? GENERAL_LABEL,
                kind: "scripted",
                questionId: session.pendingQuestion?.questionId ?? null,
            },
            toolCall: convResult.toolCall,
            pacing,
        };
    }

    // 3. Handle push_back / follow_up action
    if (convResult.action === "push_back" || convResult.action === "follow_up") {
        session.turnCount++;
        session.phase = "follow_up";
        if (session.currentCompetencyIndex >= 0) {
            const tp = session.topicProgress[session.currentCompetencyIndex];
            if (tp) tp.followUpsUsed++;
        }
        session.pendingQuestion = {
            text: convResult.spokenText,
            competencyId: currentComp?.id ?? GENERAL_ID,
            kind: "follow_up",
            questionId: null,
        };
        session.transcript.push({
            role: "interviewer",
            text: convResult.spokenText,
            competencyId: currentComp?.id ?? GENERAL_ID,
            kind: "follow_up",
            timestamp: new Date().toISOString(),
        });
        session.runningNotes.push({
            turn: session.turnCount,
            competencyId: currentComp?.id ?? GENERAL_ID,
            summary: convResult.noteSummary,
        });
        audit(session, "follow_up", convResult.action, convResult.cleanExtraction || "pushback probe");
        saveSession(session);
        return {
            session,
            prompt: {
                type: "follow_up",
                text: convResult.spokenText,
                competencyId: currentComp?.id ?? GENERAL_ID,
                competencyLabel: currentComp?.label ?? GENERAL_LABEL,
                kind: "follow_up",
                questionId: null,
            },
            toolCall: convResult.toolCall,
            pacing,
        };
    }

    // 4. Handle next_question action with clean extraction
    session.turnCount++;
    session.phase = "awaiting_answer";
    if (unaskedPool[0]) {
        recordAsked(session, unaskedPool[0].id);
    }
    if (convResult.advanceSection && session.currentCompetencyIndex < blueprint.competencies.length - 1) {
        if (session.currentCompetencyIndex >= 0) {
            const tp = session.topicProgress[session.currentCompetencyIndex];
            if (tp) tp.status = "complete";
        }
        session.currentCompetencyIndex++;
        session.topicProgress[session.currentCompetencyIndex].status = "in_progress";
    }
    session.pendingQuestion = {
        text: convResult.spokenText,
        competencyId: currentComp?.id ?? GENERAL_ID,
        kind: "scripted",
        questionId: unaskedPool[0]?.id ?? null,
    };
    session.transcript.push({
        role: "interviewer",
        text: convResult.spokenText,
        competencyId: currentComp?.id ?? GENERAL_ID,
        kind: "scripted",
        timestamp: new Date().toISOString(),
    });
    session.runningNotes.push({
        turn: session.turnCount,
        competencyId: currentComp?.id ?? GENERAL_ID,
        summary: convResult.noteSummary,
    });
    audit(session, "selector", "next_question", convResult.cleanExtraction || "bridged to next question");
    saveSession(session);
    return {
        session,
        prompt: {
            type: "question",
            text: convResult.spokenText,
            competencyId: currentComp?.id ?? GENERAL_ID,
            competencyLabel: currentComp?.label ?? GENERAL_LABEL,
            kind: "scripted",
            questionId: unaskedPool[0]?.id ?? null,
        },
        toolCall: convResult.toolCall,
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
        const remaining = generalPool().filter((q) => !asked.has(q.id));
        for (const q of remaining.slice(0, 2)) {
            if (q.question) upcoming.push(q.question);
        }
    } else {
        const comp = blueprint.competencies[session.currentCompetencyIndex];
        if (comp) {
            const tp = session.topicProgress[session.currentCompetencyIndex];
            const asked = new Set(tp?.askedQuestionIds ?? []);
            const remaining = queryPool(comp.questionPoolFilter).filter((q) => !asked.has(q.id));
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
            const nextPool = queryPool(nextComp.questionPoolFilter);
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
