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

/* ── session init ── */

export async function startSession(opts: {
    candidateId: string;
    blueprintId: string;
    profile: CandidateProfile | null;
}): Promise<{ session: SessionDoc; prompt: EnginePrompt }> {
    const blueprint = getBlueprint(opts.blueprintId);
    if (!blueprint) throw new Error(`unknown blueprintId: ${opts.blueprintId}`);

    const { candidateId, profile } = opts;
    const now = Date.now();

    const session: SessionDoc = {
        sessionId: randomUUID(),
        candidateId,
        blueprintId: blueprint.blueprintId,
        hasProfile: profile?.hasProfile ?? {
            resume: false,
            linkedin: false,
            portfolio: false,
        },
        phase: "ask_scripted",
        currentCompetencyIndex: -1, // general behavioral first
        topicProgress: blueprint.competencies.map((c) => ({
            competencyId: c.id,
            askedQuestionIds: [],
            followUpsUsed: 0,
            timeSpentSeconds: 0,
            status: "pending",
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
    session.pendingQuestion = {
        text: selection.questionText,
        competencyId: comp?.id ?? GENERAL_ID,
        kind: session.turnCount === 1 ? "opening" : "scripted",
        questionId: selection.questionId,
    };
    session.transcript.push({
        role: "interviewer",
        text: selection.questionText,
        competencyId: comp?.id ?? GENERAL_ID,
        kind: session.turnCount === 1 ? "opening" : "scripted",
        timestamp: new Date().toISOString(),
    });
    saveSession(session);

    return {
        type: "question",
        text: selection.questionText,
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
}): Promise<{ session: SessionDoc; prompt: EnginePrompt; pacing: PacingDirective }> {
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

    // Running Notes + Probe Timing (combined call)
    const remainingLabels = blueprint.competencies
        .slice(session.currentCompetencyIndex + 1)
        .map((c) => `${c.label} (id: "${c.id}")`);
    const decision = await evaluateAnswer({
        session,
        blueprint,
        competency: comp,
        answerText,
        profile: opts.profile,
        remainingLabels,
    });

    session.runningNotes.push({
        turn: session.turnCount,
        competencyId: comp?.id ?? GENERAL_ID,
        summary: decision.note_summary,
    });
    audit(session, "probe", decision.immediacy, decision.reason);

    const parkIt = () => {
        if (!decision.topic_summary) return;
        let target: string;
        if (
            decision.best_fit_competency_if_parked &&
            blueprint.competencies.some((c) => c.id === decision.best_fit_competency_if_parked)
        ) {
            target = decision.best_fit_competency_if_parked;
        } else if (comp) {
            target = comp.id;
        } else if (blueprint.competencies.length > 0) {
            target = blueprint.competencies[0].id;
        } else {
            target = GENERAL_ID;
        }

        session.parkingLot.push({
            topicSummary: decision.topic_summary,
            sourceCompetency: comp?.id ?? GENERAL_ID,
            targetCompetency: target,
            turnParked: session.turnCount,
            resolved: false,
        });
        audit(session, "probe", "parked", `"${decision.topic_summary}" → ${target}`);
    };

    let moveOn: "continue" | "advance" = "continue";

    if (decision.immediacy === "park") {
        parkIt();
    } else if (decision.immediacy === "probe_now") {
        const verdict = enforceBudget({ session, competency: comp, pacing, decision });
        if (verdict.allow) {
            audit(
                session,
                "budget",
                verdict.override ? "override" : "allow",
                verdict.reason
            );
            const fu = await generateFollowUp({
                session,
                blueprint,
                competency: comp,
                answerText,
                topicSummary: decision.topic_summary,
                contradiction: !!decision.contradiction,
                profile: opts.profile,
            });
            if (session.currentCompetencyIndex >= 0) {
                const tp = session.topicProgress[session.currentCompetencyIndex];
                if (tp) tp.followUpsUsed++;
            }
            session.turnCount++;
            session.phase = "follow_up";
            session.pendingQuestion = {
                text: fu.followUp,
                competencyId: comp?.id ?? GENERAL_ID,
                kind: "follow_up",
                questionId: null,
            };
            session.transcript.push({
                role: "interviewer",
                text: fu.followUp,
                competencyId: comp?.id ?? GENERAL_ID,
                kind: "follow_up",
                timestamp: new Date().toISOString(),
            });
            audit(session, "follow_up", "ask", fu.reason);
            saveSession(session);
            return {
                session,
                prompt: {
                    type: "follow_up",
                    text: fu.followUp,
                    competencyId: comp?.id ?? GENERAL_ID,
                    competencyLabel: comp?.label ?? GENERAL_LABEL,
                    kind: "follow_up",
                    questionId: null,
                },
                pacing,
            };
        }
        // Caps spent — downgrade to park
        audit(session, "budget", "downgrade", verdict.reason);
        parkIt();
    }

    // Continue current section or advance, based on target coverage
    const asked = sectionAskedCount(session);
    const range = sectionRange(session, blueprint);
    moveOn = asked >= range.min ? "advance" : "continue";

    const prompt =
        moveOn === "advance"
            ? await advance(session, blueprint, pacing, opts.profile)
            : await askNextQuestion(session, blueprint, pacing, opts.profile);

    saveSession(session);
    return { session, prompt, pacing };
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
