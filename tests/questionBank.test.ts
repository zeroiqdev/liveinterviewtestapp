import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QUESTION_BANK } from "../src/engine/data";
import { SPOKEN_ONLY_RULE } from "../src/engine/constants";

describe("question bank", () => {
    it("never asks the candidate to write something: answers are spoken", () => {
        const asksToWrite = /\b(write|code up|draw|sketch)\b[^.?]*\b(query|queries|sql|code|function|program|script|diagram|formula)\b/i;
        const offenders = QUESTION_BANK.filter((q) => asksToWrite.test(q.question)).map((q) => `${q.id}: ${q.question.slice(0, 80)}`);
        assert.deepEqual(offenders, []);
    });

    it("the spoken-only rule tells question writers what to do instead", () => {
        assert.match(SPOKEN_ONLY_RULE, /talk you through/);
    });
});
