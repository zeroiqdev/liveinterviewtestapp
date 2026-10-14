import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HISTORY_INTERVIEWS, heardBefore, historyFromSessions } from "../src/engine/history";

const session = (startedAt: number, ids: string[], general: string[], turns: Array<{ kind: "opening" | "scripted" | "follow_up"; text: string }>) => ({
    startedAt,
    topicProgress: [{ competencyId: "c1", askedQuestionIds: ids, followUpsUsed: 0, timeSpentSeconds: 0, status: "complete" as const }],
    generalAsked: { questionIds: general, categories: [] },
    transcript: turns.map((t) => ({ role: "interviewer" as const, competencyId: null, timestamp: "", ...t })),
});

describe("interview history", () => {
    it("collects asked questions and openings from recent interviews", () => {
        const history = historyFromSessions([
            session(1, ["q1", "q2"], ["g1"], [
                { kind: "opening", text: "Hello Amara, welcome! Tell me about a product you shipped recently." },
                { kind: "scripted", text: "How do you prioritise a roadmap?" },
                { kind: "follow_up", text: "Why that order?" },
            ]),
            session(2, ["q2", "q3"], [], [{ kind: "scripted", text: "How do you prioritise a roadmap?" }]),
        ]);
        assert.deepEqual(history.questionIds.sort(), ["g1", "q1", "q2", "q3"]);
        // Follow-ups are about their answers, not topics to avoid; repeats appear once.
        assert.deepEqual(history.questions, ["How do you prioritise a roadmap?"]);
        assert.equal(history.openings.length, 1);
    });

    it("only counts the most recent interviews", () => {
        const sessions = Array.from({ length: HISTORY_INTERVIEWS + 2 }, (_, i) => session(i, [`q${i}`], [], []));
        const history = historyFromSessions(sessions);
        assert.equal(history.questionIds.length, HISTORY_INTERVIEWS);
        assert.ok(!history.questionIds.includes("q0"), "the oldest can come round again");
    });

    it("recognises an opening line heard before, inside the spoken welcome", () => {
        const openings = ["Hello Amara, welcome! I'll be interviewing you today. Tell me about a product you shipped recently."];
        assert.equal(heardBefore("Tell me about a product you shipped recently.", openings), true);
        assert.equal(heardBefore("Walk me through a launch that didn't go to plan.", openings), false);
        assert.equal(heardBefore("", openings), false);
    });
});
