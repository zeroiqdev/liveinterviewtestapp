import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emailFromOptOut, optOutUrl } from "../src/lib/emailOptOut";
import { resumeNudgeEmail, resumeReviewEmail, weeklyTipEmail } from "../src/lib/emailTemplates";
import { resumeStanding } from "../src/lib/onboardingEmails";

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-that-is-at-least-32-characters-long";

describe("first-days emails", () => {
    it("signs opt-out links so one address can't turn off another's emails", () => {
        const url = new URL(optOutUrl("Ada@Example.test"));
        assert.equal(emailFromOptOut(url.searchParams.get("e"), url.searchParams.get("t")), "ada@example.test");
        const other = new URL(optOutUrl("someone@example.test"));
        assert.equal(emailFromOptOut(url.searchParams.get("e"), other.searchParams.get("t")), null);
        assert.equal(emailFromOptOut(url.searchParams.get("e"), "x"), null);
    });

    it("gives each email a way to stop them, and the right button", () => {
        const u = "https://example.test/api/email/stop?e=x&t=y";
        const nudge = resumeNudgeEmail({ name: "Ada Obi", role: "Product Manager", siteUrl: "https://example.test", unsubscribeUrl: u });
        const review = resumeReviewEmail({ name: "Ada Obi", role: "Product Manager", score: 59, topFix: "use the words employers look for.", siteUrl: "https://example.test", unsubscribeUrl: u });
        const tip = weeklyTipEmail({ name: "Ada Obi", tip: { topic: "Interviews", title: "Have three stories ready", body: "Body.", tryThis: "Write them down." }, siteUrl: "https://example.test", unsubscribeUrl: u });
        for (const email of [nudge, review, tip]) {
            assert.match(email.text, /Stop these emails: https:\/\/example\.test\/api\/email\/stop/);
            assert.match(email.html, /Stop these emails/);
            assert.doesNotMatch(`${email.subject} ${email.text}`, /\bAI\b/);
        }
        assert.match(review.subject, /59\/100/);
        assert.match(review.text, /Improve my resume: https:\/\/example\.test\/resume-feedback/);
        assert.match(nudge.text, /Add my resume: https:\/\/example\.test\/dashboard/);
        assert.match(tip.subject, /This week's tip: Have three stories ready/);
    });

    it("scores the newest resume they added", () => {
        const text = `Ada Obi\nada@example.test\n\nEXPERIENCE\nProduct Manager, Kora, Lagos (Jan 2022 to Present)\n- Led a checkout redesign that raised conversion by 12%\n- Wrote requirement documents for the payouts team\n\nEDUCATION\nBSc Computer Science, University of Lagos, 2019`;
        const standing = resumeStanding({ email: "a@example.test", role: "Product Manager", resumes: [{ rawText: "too short", updatedAt: new Date("2026-01-01") }, { rawText: text, updatedAt: new Date("2026-02-01") }] });
        assert.ok(standing && standing.score > 0 && standing.score <= 100);
        assert.ok(standing?.topFix);
        assert.equal(resumeStanding({ email: "a@example.test", resumes: [] }), null);
    });
});
