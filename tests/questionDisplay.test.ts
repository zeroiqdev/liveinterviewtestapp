import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { displayQuestion, revealPoint, withoutAcknowledgement } from "../src/lib/questionDisplay";

describe("question card text", () => {
    it("shows the lead-in with the question", () => {
        const text = "That's a strong result, but it raises a harder problem. How do you define done for a feature?";
        assert.equal(displayQuestion({ text }), text);
    });

    it("shows the whole welcome", () => {
        const text = "Hello Kemi, welcome! I'll be your interviewer today for the Product Manager position. Let's get started: walk me through a product.";
        assert.equal(displayQuestion({ text }), text);
    });

    it("hides only the acknowledgement it opens with", () => {
        assert.equal(withoutAcknowledgement("Okay. How did you measure it?"), "How did you measure it?");
        assert.equal(withoutAcknowledgement("Thanks for that. You mentioned a pilot, how did it go?"), "You mentioned a pilot, how did it go?");
        assert.equal(withoutAcknowledgement("Okay, thank you. Right, okay. tell me more."), "Tell me more.");
        assert.equal(withoutAcknowledgement("Fair point. Let's take a different example."), "Let's take a different example.");
        // Words that merely start the same way are part of the sentence.
        assert.equal(withoutAcknowledgement("Okay so walk me through it."), "Okay so walk me through it.");
        assert.equal(withoutAcknowledgement("That makes sense for a small team, but what about scale?"), "That makes sense for a small team, but what about scale?");
        // An acknowledgement on its own is left alone rather than shown as nothing.
        assert.equal(withoutAcknowledgement("Okay."), "Okay.");
    });
});

describe("when the new text appears", () => {
    it("waits out an acknowledgement that shares the first clip", () => {
        const point = revealPoint([{ text: "Fair enough. By how much did activation go up?" }], "By how much did activation go up?");
        assert.equal(point.index, 0);
        assert.ok(point.delayMs > 500 && point.delayMs < 1500, `delay ${point.delayMs}`);
    });

    it("shows straight away when there is no acknowledgement", () => {
        const clips = [{ text: "That's a strong result," }, { text: "but it raises a harder problem." }, { text: "How do you define done?" }];
        assert.deepEqual(revealPoint(clips, "That's a strong result, but it raises a harder problem. How do you define done?"), { index: 0, delayMs: 0 });
    });

    it("doesn't hold the text back when it can't be placed", () => {
        assert.deepEqual(revealPoint([{ text: "Something else entirely." }], "How would you decide?"), { index: 0, delayMs: 0 });
    });
});
