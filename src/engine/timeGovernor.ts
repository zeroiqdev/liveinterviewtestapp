/* ══════════════════════════════════════
   Time Governor — the interviewer is
   timed, not the candidate.

   Recalculated every turn. Compares
   elapsed time against remaining REQUIRED
   coverage, never a naive countdown.
   The candidate is never interrupted —
   pacing only changes what gets asked next.
   ══════════════════════════════════════ */

import {
    AVG_SECONDS_PER_FOLLOWUP,
    AVG_SECONDS_PER_SCRIPTED_QUESTION,
    COMPRESSED_RATIO,
    TIGHTENING_RATIO,
} from "./constants";
import type { Blueprint, PacingDirective, PacingMode, SessionDoc } from "./types";

/** Questions still owed per section to satisfy minimum coverage. */
function minQuestionsOwed(session: SessionDoc, blueprint: Blueprint): number {
    let owed = 0;

    // General behavioral minimum (first section, index -1)
    const generalMin = blueprint.generalBehavioral.targetQuestionRange.min;
    owed += Math.max(0, generalMin - session.generalAsked.questionIds.length);

    session.topicProgress.forEach((tp, i) => {
        if (tp.status === "complete" || tp.status === "skipped") return;
        const comp = blueprint.competencies[i];
        if (!comp || comp.priority === "optional") return; // optional drops first
        owed += Math.max(0, comp.targetQuestionRange.min - tp.askedQuestionIds.length);
    });

    return owed;
}

export function computePacing(
    session: SessionDoc,
    blueprint: Blueprint
): PacingDirective {
    const secondsRemaining = Math.max(
        0,
        blueprint.totalTimeBudgetSeconds - session.elapsedSeconds
    );

    const owed = minQuestionsOwed(session, blueprint);
    // Follow-up allowance is folded into the estimate at the current mode's
    // multiplier; base estimate assumes a light follow-up load.
    const estimatedSecondsNeeded =
        owed * AVG_SECONDS_PER_SCRIPTED_QUESTION +
        owed * 0.5 * AVG_SECONDS_PER_FOLLOWUP;

    const ratio =
        estimatedSecondsNeeded <= 0
            ? Infinity
            : secondsRemaining / estimatedSecondsNeeded;

    let mode: PacingMode = "normal";
    if (ratio < COMPRESSED_RATIO) mode = "compressed";
    else if (ratio < TIGHTENING_RATIO) mode = "tightening";

    const directive: PacingDirective = {
        mode,
        followUpAllowanceMultiplier:
            mode === "normal" ? 1 : mode === "tightening" ? 0.5 : 0,
        skipOptional: mode === "compressed",
        anchorOnly: mode === "compressed",
        secondsRemaining,
        estimatedSecondsNeeded: Math.round(estimatedSecondsNeeded),
        reason:
            mode === "normal"
                ? `${Math.round(secondsRemaining / 60)}min left, coverage on track`
                : mode === "tightening"
                  ? `${Math.round(secondsRemaining / 60)}min left vs ~${Math.round(estimatedSecondsNeeded / 60)}min needed — halving follow-up budget, preferring dense questions`
                  : `${Math.round(secondsRemaining / 60)}min left vs ~${Math.round(estimatedSecondsNeeded / 60)}min needed — follow-ups off, optional sections skipped, anchor questions only`,
    };

    return directive;
}
