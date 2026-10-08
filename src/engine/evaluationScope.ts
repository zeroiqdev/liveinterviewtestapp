/* ══════════════════════════════════════
   Evaluation scope — what feedback may
   and may not judge.

   Candidates are assessed only on what
   they said. Turning up, being on time,
   finishing the session or how long the
   call lasted are not skills, so they are
   never praised, criticised or scored.
   ══════════════════════════════════════ */

/** Appended to every prompt that scores or comments on a candidate. */
export const EVALUATION_SCOPE_RULES = `EVALUATION SCOPE (STRICT):
- Judge ONLY the content and delivery of the spoken answers: substance, relevance, structure (STAR), technical depth, specificity, evidence, clarity, vocabulary, pace and filler words.
- NEVER evaluate, praise, criticise or score attendance, punctuality, showing up, joining or being on time, completing or finishing the session, session length, number of questions reached, effort to attend, or connection/audio/technical issues.
- Do NOT use these as strengths (e.g. "You showed up", "You completed the interview", "Professional engagement", "Active participation") or as improvements (e.g. "Be on time", "Stay for the whole session").
- If there is too little answer content to find a genuine strength, say so plainly instead of inventing one.`;

/**
 * Matches remarks about attendance or participation rather than answers.
 * Used to drop such items if a model produces them despite the rules.
 */
const ATTENDANCE_PATTERNS: RegExp[] = [
    /\bpunctual(ity)?\b/i,
    /\b(on time|tardy|tardiness|late (to|for) the)\b/i,
    /\bshow(ed|ing)? up\b/i,
    /\battendance\b/i,
    /\battend(ed|ing)? (the |this |your )?(call|session|interview)\b/i,
    /\b(joined|joining) (the |this |your )?(call|session|interview)\b/i,
    /\b(complete[ds]?|finish(ed|es)?|completing|finishing|stay(ed|ing|s)? (for|through)) (the |this |your )?(entire |whole |full )?(interview|session|call)\b/i,
    /\bstepped through the (technical )?(evaluation )?questions\b/i,
    /\b(active )?session engagement\b/i,
    /\b(active|professional) (participation|engagement)\b/i,
    /\btook the time to\b/i,
];

export function isAttendanceRemark(text: string | undefined | null): boolean {
    if (!text) return false;
    return ATTENDANCE_PATTERNS.some((re) => re.test(text));
}

/** Removes sentences that comment on attendance, keeping the rest of the text. */
export function stripAttendanceSentences(text: string): string {
    if (!isAttendanceRemark(text)) return text;
    const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
    return sentences
        .filter((sentence) => !isAttendanceRemark(sentence))
        .join("")
        .trim();
}
