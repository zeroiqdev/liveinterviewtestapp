/* ══════════════════════════════════════
   Utterance matching — shared by the
   client (choosing fillers) and the
   server (reusing drafted replies).
   ══════════════════════════════════════ */

export function normUtterance(t: string): string {
    return t.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function sameUtterance(a: string, b: string): boolean {
    return normUtterance(a) === normUtterance(b);
}

/**
 * Drafts are made while the candidate is still talking (at natural pauses).
 * One is still a valid basis for the reply if the final answer only added a
 * short tail to it — the decision rarely changes over a few closing words,
 * and waiting to redo it is what leaves dead air.
 */
export const MAX_WORDS_AFTER_DRAFT = 8;

export function draftCovers(draftText: string, finalText: string): boolean {
    const draft = normUtterance(draftText);
    const final = normUtterance(finalText);
    if (draft === final) return true;
    if (!draft || !final.startsWith(`${draft} `)) return false;
    return final.slice(draft.length).trim().split(" ").length <= MAX_WORDS_AFTER_DRAFT;
}
