/**
 * What the question card shows, and when.
 *
 * The card shows what the interviewer says — the welcome, a lead-in about the
 * last answer, the question — except the short acknowledgement they open with
 * ("Okay.", "Thanks for that."). It switches to the new text once that
 * acknowledgement has been said, not the moment they start talking.
 */

import { ACKNOWLEDGEMENTS, CLARIFY_ACKNOWLEDGEMENTS, OBJECTION_ACKNOWLEDGEMENTS, QUESTION_ACKNOWLEDGEMENTS } from "@/config/fillerConfig";

interface PromptLike {
    text: string | null;
}

const normalise = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

// Longest first, so "Okay, thank you." is removed whole rather than as "Okay".
const SPOKEN_ACKNOWLEDGEMENTS = [...ACKNOWLEDGEMENTS, ...OBJECTION_ACKNOWLEDGEMENTS, ...QUESTION_ACKNOWLEDGEMENTS, ...CLARIFY_ACKNOWLEDGEMENTS]
    .map((line) => normalise(line).replace(/[.!]+$/, ""))
    .sort((x, y) => y.length - x.length);

/** Removes acknowledgements the reply opens with; the rest is untouched. */
export function withoutAcknowledgement(text: string): string {
    let rest = text.trim();
    for (let pass = 0; pass < 3; pass++) {
        const lower = rest.toLowerCase();
        const ack = SPOKEN_ACKNOWLEDGEMENTS.find((line) => lower.startsWith(line) && /^[.!,]\s+\S/.test(rest.slice(line.length)));
        if (!ack) break;
        rest = rest.slice(ack.length).replace(/^[.!,]\s+/, "");
    }
    return rest === text.trim() ? rest : rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** The text for the question card. */
export function displayQuestion(prompt: PromptLike | null | undefined): string {
    return prompt?.text ? withoutAcknowledgement(prompt.text) : "";
}

/** About how fast the interviewer speaks, and the pause after a sentence. */
const WORDS_PER_SECOND = 2.8;
const SENTENCE_PAUSE_MS = 250;

/**
 * Where in the spoken clips the shown text begins: which clip, and how long
 * into it (an acknowledgement can share the first clip, spoken first).
 */
export function revealPoint(clips: Array<{ text: string }>, question: string): { index: number; delayMs: number } {
    const start = normalise(question).slice(0, 28);
    if (!start) return { index: 0, delayMs: 0 };
    for (let index = 0; index < clips.length; index++) {
        const clip = normalise(clips[index].text);
        const at = clip.indexOf(start);
        if (at < 0) continue;
        const wordsBefore = clip.slice(0, at).split(" ").filter(Boolean).length;
        const delayMs = wordsBefore ? Math.round((wordsBefore / WORDS_PER_SECOND) * 1000) + SENTENCE_PAUSE_MS : 0;
        return { index, delayMs };
    }
    // The question begins mid-clip somewhere we can't match (e.g. a split clause): don't hold it back.
    return { index: 0, delayMs: 0 };
}
