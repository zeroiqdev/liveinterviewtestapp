import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCharactersForUser } from "../src/components/dashboard/constants";

const coach = (opts: Parameters<typeof buildCharactersForUser>[0]) => buildCharactersForUser(opts).find((c) => c.id === "coach")!;
const ids = (opts: Parameters<typeof buildCharactersForUser>[0]) => coach(opts).items.map((i) => i.id);
const resume = { id: "cv1", resumeName: "cv.pdf", score: 60 };

describe("coach messages over a new account's first days", () => {
    it("day 0: just the welcome", () => {
        const items = coach({ userRole: "Product Manager", accountAgeDays: 0 }).items;
        assert.deepEqual(items.map((i) => i.id), ["coach-welcome"]);
        assert.deepEqual(items[0].actions?.map((a) => a.label), ["Start my first interview"]);
    });

    it("day 1: a nudge to add a resume, or the review of the one they added", () => {
        assert.deepEqual(ids({ userRole: "Product Manager", accountAgeDays: 1 }), ["coach-welcome", "coach-resume-audit-prompt"]);
        const withResume = coach({ userRole: "Product Manager", accountAgeDays: 1, lastResumeFeedback: resume }).items;
        assert.deepEqual(withResume.map((i) => i.id), ["coach-welcome", "coach-resume-feedback-cv1"]);
        assert.equal(withResume[1].actions?.[0].label, "Improve my resume");
    });

    it("day 0 with a resume already added: still only the welcome until day 1", () => {
        assert.deepEqual(ids({ userRole: "Product Manager", accountAgeDays: 0, lastResumeFeedback: resume }), ["coach-welcome"]);
    });

    it("day 2: this week's tip follows", () => {
        const day2 = ids({ userRole: "Product Manager", accountAgeDays: 2 });
        assert.equal(day2.length, 3);
        assert.match(day2[2], /^coach-tip-week-/);
    });

    it("leaves existing accounts (age unknown) as they were", () => {
        const existing = ids({ userRole: "Product Manager" });
        assert.ok(existing.includes("coach-resume-audit-prompt"));
        assert.ok(existing.some((id) => id.startsWith("coach-tip-week-")));
    });
});
