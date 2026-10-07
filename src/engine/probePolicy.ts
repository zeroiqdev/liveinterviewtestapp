/* ══════════════════════════════════════
   Probe policy — decides whether the
   interviewer follows up on an answer.

   The conversational model scores every
   answer (specificity / ownership / depth /
   evidence). This module turns that score
   into a deterministic decision bounded by
   per-question and per-section limits, the
   candidate's chosen probe depth, and the
   time governor. The model suggests; the
   controller decides.
   ══════════════════════════════════════ */

import { MAX_BUDGET_OVERRIDES_PER_SESSION, PROBE_LIMITS } from "./constants";
import type { AnswerAssessment, PacingDirective, ProbeDepth, SessionDoc } from "./types";

export interface ProbeLimits {
    perQuestion: number;
    perSection: number;
}

export interface ProbeVerdict {
    allow: boolean;
    /** Probing was warranted by the answer (vague/evasive/contradiction). */
    wanted: boolean;
    /** Allowed past normal limits because of a contradiction. */
    override: boolean;
    reason: string;
}

/** Limits for this session, scaled by pacing (tightening halves, compressed = 0). */
export function probeLimits(depth: ProbeDepth | undefined, pacing: PacingDirective): ProbeLimits {
    const base = PROBE_LIMITS[depth ?? "standard"];
    const mult = pacing.followUpAllowanceMultiplier;
    if (mult <= 0) return { perQuestion: 0, perSection: 0 };
    return {
        perQuestion: Math.max(1, Math.floor(base.perQuestion * mult)),
        perSection: Math.max(1, Math.floor(base.perSection * mult)),
    };
}

/** Follow-ups already asked in a section (general section included). */
export function followUpsInSection(session: SessionDoc, competencyId: string): number {
    return session.transcript.filter(
        (t) => t.role === "interviewer" && t.kind === "follow_up" && t.competencyId === competencyId
    ).length;
}

export function decideProbe(opts: {
    session: SessionDoc;
    pacing: PacingDirective;
    assessment: AnswerAssessment | null;
    /** The model explicitly asked to push back. */
    modelWantsProbe: boolean;
    hasProbeText: boolean;
}): ProbeVerdict {
    const { session, pacing, assessment, modelWantsProbe, hasProbeText } = opts;
    const thread = session.probeThread;

    if (!assessment) {
        return { allow: false, wanted: false, override: false, reason: "no assessment available" };
    }
    if (!thread || session.pendingQuestion?.kind === "opening") {
        return { allow: false, wanted: false, override: false, reason: "opening answer sets context — not probed" };
    }
    if (assessment.saidDontKnow) {
        return { allow: false, wanted: false, override: false, reason: "candidate said they don't know — moving on" };
    }
    if (assessment.verdict === "verified") {
        return { allow: false, wanted: false, override: false, reason: "answer verified" };
    }

    const wanted =
        assessment.verdict === "vague" ||
        assessment.verdict === "evasive" ||
        assessment.contradiction ||
        (assessment.verdict === "partial" && modelWantsProbe);
    if (!wanted) {
        return { allow: false, wanted: false, override: false, reason: "partial answer, good enough to move on" };
    }
    if (!hasProbeText) {
        return { allow: false, wanted, override: false, reason: "no follow-up question produced" };
    }

    const limits = probeLimits(session.probeDepth, pacing);
    const usedInSection = followUpsInSection(session, thread.competencyId);
    const withinLimits = thread.followUps < limits.perQuestion && usedInSection < limits.perSection;

    if (withinLimits) {
        return {
            allow: true,
            wanted,
            override: false,
            reason: `${assessment.verdict} answer (weakest: ${assessment.weakestDimension ?? "n/a"}) — follow-up ${thread.followUps + 1}/${limits.perQuestion}`,
        };
    }

    // Contradictions outrank limits, bounded by a session-wide cap.
    if (assessment.contradiction) {
        const overrides = session.auditLog.filter((a) => a.module === "budget" && a.decision === "override").length;
        if (overrides < MAX_BUDGET_OVERRIDES_PER_SESSION) {
            return { allow: true, wanted, override: true, reason: "contradiction — probing past normal limits" };
        }
    }

    const reason =
        limits.perQuestion === 0
            ? "compressed pacing — follow-ups off"
            : thread.followUps >= limits.perQuestion
              ? `depth limit reached for this question (${thread.followUps}/${limits.perQuestion})`
              : `follow-up limit reached for this section (${usedInSection}/${limits.perSection})`;
    return { allow: false, wanted, override: false, reason };
}
