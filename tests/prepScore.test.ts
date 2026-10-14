import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prepScore, sessionsFromTotals } from "../src/lib/prepScore";

const day = (n: number) => new Date(Date.UTC(2026, 9, n)).toISOString();
const session = (score: number, n: number, minutes = 20) => ({ score, minutes, at: day(n) });

describe("Prep Score", () => {
    it("is zero before any practice", () => {
        assert.deepEqual(prepScore([]), { score: 0, answerQuality: 0, practiceDone: 0, sessionsToFull: 5 });
    });

    it("holds back a single good interview until there is more practice behind it", () => {
        const one = prepScore([session(80, 1)]);
        assert.equal(one.answerQuality, 80);
        assert.equal(one.score, 48);
        assert.equal(one.sessionsToFull, 4);
    });

    it("counts in full after five full interviews", () => {
        const five = prepScore([1, 2, 3, 4, 5].map((n) => session(80, n)));
        assert.equal(five.score, 80);
        assert.equal(five.sessionsToFull, 0);
    });

    it("rises with practice at the same answer quality", () => {
        const scores = [1, 2, 3, 4, 5].map((count) => prepScore(Array.from({ length: count }, (_, i) => session(70, i + 1))).score);
        assert.deepEqual(scores, [...scores].sort((a, b) => a - b));
        assert.ok(scores[0] < scores[4]);
    });

    it("weights recent interviews most, and only looks at the last five", () => {
        const improving = prepScore([session(40, 1), session(50, 2), session(60, 3), session(70, 4), session(90, 5)]);
        const declining = prepScore([session(90, 1), session(70, 2), session(60, 3), session(50, 4), session(40, 5)]);
        assert.ok(improving.score > declining.score);
        // An old poor run falls out once five newer interviews exist.
        const recovered = prepScore([session(10, 1), session(10, 2), ...[3, 4, 5, 6, 7].map((n) => session(85, n))]);
        assert.equal(recovered.score, 85);
    });

    it("gives an interview abandoned early little weight", () => {
        const full = prepScore([session(90, 1, 20)]);
        const abandoned = prepScore([session(90, 1, 1)]);
        assert.ok(abandoned.score < full.score);
        // A quick lucky minute doesn't outweigh a full, weaker interview.
        const mixed = prepScore([session(50, 1, 20), session(100, 2, 1)]);
        assert.ok(mixed.answerQuality < 60, String(mixed.answerQuality));
    });

    it("carries over accounts that only have a count and an average", () => {
        assert.equal(prepScore(sessionsFromTotals(12, 70)).score, 70);
        assert.equal(prepScore(sessionsFromTotals(1, 70)).score, 42);
        assert.equal(prepScore(sessionsFromTotals(0, 0)).score, 0);
    });
});
