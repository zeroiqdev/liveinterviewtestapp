/* ══════════════════════════════════════
   Voice commands — deterministic detection
   of "end the interview" / "repeat that" /
   "skip this one" in a candidate turn.

   Shared by the client (fast endpointing)
   and the server (speech-to-action fast
   path). Matching is deliberately strict:
   a command must be the point of the
   utterance, not a phrase inside an answer
   ("we had repeat customers", "once I'm
   done with the migration"). Anything
   ambiguous falls through to the LLM, which
   sees the full conversation.
   ══════════════════════════════════════ */

export type VoiceCommand = "end_call" | "repeat_question" | "skip_question";

/** Commands longer than this are treated as part of an answer. */
const MAX_COMMAND_WORDS = 14;

const END_CALL = [
    /\b(end|stop|finish|terminate|wrap up|close) (the|this|our) (interview|call|session)\b/,
    /\b(i'?m|i am|we'?re|we are) done with (the|this) (interview|call|session)\b/,
    /\bi('?d| would| want to| wanna) (like to )?(end|stop|finish|leave|quit) (the|this|now|here)\b/,
    /\b(let'?s|can we|could we) (end|stop|finish) (here|now|the interview|the call|this interview)\b/,
    /\bi (have|need|gotta|got) to (go|leave|drop off|stop) now\b/,
];

const REPEAT = [
    /\b(can|could|would|will) you (please )?(repeat|rephrase|restate|say) (that|the question|it|this|the last question)( again| one more time)?\b/,
    /\b(please )?(repeat|rephrase) (that|the question|it|the last question)\b/,
    /\bwhat was the question( again)?\b/,
    /\b(i )?(didn'?t|did not) (catch|hear|get|understand) (that|the question|what you said)\b/,
    /\bsay (that|it) (again|one more time)\b/,
    /^(sorry|pardon|pardon me|come again|excuse me)$/,
];

const SKIP = [
    /\b(can|could|may) (we|i) (please )?(skip|pass on) (this|that|the) (one|question)\b/,
    /\b(can|could|may) (we|i) (please )?(skip|pass)( it)?$/,
    /\bskip (this|the|that) question\b/,
    /\b(i'?d|i would) (like to|rather) (skip|pass)( on)?( this| that)?( one| question)?\b/,
    /\b(let'?s )?move on to the next question\b/,
    /\bnext question,? please\b/,
];

function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[’‘`]/g, "'")
        .replace(/[^a-z0-9' ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function detectVoiceCommand(text: string): VoiceCommand | null {
    const normalized = normalize(text);
    if (!normalized) return null;
    if (normalized.split(" ").length > MAX_COMMAND_WORDS) return null;

    if (END_CALL.some((re) => re.test(normalized))) return "end_call";
    if (REPEAT.some((re) => re.test(normalized))) return "repeat_question";
    if (SKIP.some((re) => re.test(normalized))) return "skip_question";
    return null;
}
