import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WEEKLY_TIPS, actionForTopic, tipForWeek, weekNumber } from "../src/lib/weeklyTips";
import { cleanTip, tipFamily } from "../src/lib/weeklyTipDrafts";

describe("weekly tips", () => {
    it("gives the same tip all week and a new one on Monday", () => {
        const monday = new Date(Date.UTC(2026, 9, 12, 0, 5));
        const sunday = new Date(Date.UTC(2026, 9, 18, 23, 50));
        const nextMonday = new Date(Date.UTC(2026, 9, 19, 0, 5));
        assert.equal(tipForWeek(monday).title, tipForWeek(sunday).title);
        assert.notEqual(tipForWeek(monday).title, tipForWeek(nextMonday).title);
        assert.equal(weekNumber(nextMonday), weekNumber(monday) + 1);
    });

    it("last week's tip is the one before this week's", () => {
        const now = new Date(Date.UTC(2026, 9, 14));
        const lastWeek = new Date(Date.UTC(2026, 9, 7));
        assert.equal(tipForWeek(now, 1).title, tipForWeek(lastWeek).title);
    });

    it("goes through every tip before repeating", () => {
        const start = new Date(Date.UTC(2026, 0, 5));
        const titles = WEEKLY_TIPS.map((_, i) => tipForWeek(new Date(start.getTime() + i * 7 * 86400000)).title);
        assert.equal(new Set(titles).size, WEEKLY_TIPS.length);
    });

    it("keeps every tip short, plain and free of the word AI", () => {
        for (const tip of WEEKLY_TIPS) {
            assert.ok(tip.body.length <= 330, tip.title);
            assert.doesNotMatch(`${tip.title} ${tip.body} ${tip.tryThis}`, /\bAI\b|leverage|utilize|synerg/i, tip.title);
        }
    });

    it("gives every tip a button that does what the tip asks", () => {
        assert.equal(actionForTopic("Job search"), "jobs");
        assert.equal(actionForTopic("Your CV"), "resume");
        assert.equal(actionForTopic("Interviews"), "practice");
        assert.equal(actionForTopic("Career growth"), "none");
        // A tip done outside the app has no button, whatever its topic.
        const followUp = WEEKLY_TIPS.find((tip) => tip.title.startsWith("Follow up once"))!;
        assert.equal(followUp.topic, "Job search");
        assert.equal(followUp.action, "none");
        for (let i = 0; i < WEEKLY_TIPS.length; i++) {
            assert.ok(["jobs", "practice", "resume", "none"].includes(tipForWeek(new Date(Date.UTC(2026, 0, 5) + i * 7 * 86400000)).action));
        }
    });
});

describe("weekly tip drafts", () => {
    const draft = { topic: "your cv", title: "List your sales results as numbers", body: "Use percentages or revenue to show how you beat your targets. Sales managers hire on track record.", tryThis: "Add one number to your last role." };

    it("tidies what the model writes and rejects what is too thin", () => {
        const clean = cleanTip({ ...draft, action: "resume", title: `  ${draft.title}  ` })!;
        assert.equal(clean.topic, "Your CV");
        assert.equal(clean.title, draft.title);
        assert.equal(clean.action, "resume");
        assert.equal(cleanTip({ ...draft, body: "Too short." }), null);
        assert.equal(cleanTip({ ...draft, title: "" }), null);
        assert.equal(cleanTip(null), null);
    });

    it("falls back to the topic's button when the model names none or an unknown one", () => {
        assert.equal(cleanTip(draft)!.action, "resume");
        assert.equal(cleanTip({ ...draft, action: "email" as never })!.action, "resume");
        assert.equal(cleanTip({ ...draft, action: "none" })!.action, "none");
    });

    it("maps every role to a tip group", () => {
        assert.equal(tipFamily("sales"), "sales");
        assert.equal(tipFamily("product"), "product_manager");
        assert.equal(tipFamily("operations"), "business_analyst");
        assert.equal(tipFamily("something_new"), "general");
        assert.equal(tipFamily(null), "general");
    });
});
