import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderEmail } from "../src/lib/emailLayout";
import { codeEmail } from "../src/lib/emailTemplates";
import { receiptEmail } from "../src/lib/receipts";
import { roleAddedEmail } from "../src/lib/roleRequests";

const all = () => [
    codeEmail("verify", "483920", 10),
    codeEmail("reset", "483920", 10),
    codeEmail("change-email", "483920", 10),
    receiptEmail({ reference: "gp_ref", label: "Day Pass", passes: 1, amount: 1500, currency: "NGN", paidAt: new Date("2026-10-01T10:00:00Z"), name: "Ada Obi", email: "ada@example.test" }, "https://example.test/payment/receipt/gp_ref"),
    roleAddedEmail({ requested: "Supply chain analyst", role: "Supply Chain Analyst", siteUrl: "https://example.test" }),
];

describe("emails", () => {
    it("escapes anything a person typed", () => {
        const { html } = renderEmail({ preheader: "x", title: "<b>Hi</b>", paragraphs: ['Role "<script>"'], reason: "r" });
        assert.doesNotMatch(html, /<script>|<b>Hi/);
        assert.match(html, /&lt;script&gt;/);
    });

    it("keeps codes out of subject lines, but in the email and its plain-text version", () => {
        for (const purpose of ["verify", "reset", "change-email"] as const) {
            const email = codeEmail(purpose, "483920", 10);
            assert.doesNotMatch(email.subject, /483920/);
            assert.match(email.html, /483920/);
            assert.match(email.text, /483920/);
            assert.match(email.text, /10 minutes/);
        }
    });

    it("gives every email a plain-text version with its link, and a reason it was sent", () => {
        for (const email of all()) {
            assert.ok(email.text.length > 60);
            assert.match(email.html, /You're getting this|Sent to|You&#39;re getting this/);
        }
        const receipt = all()[3];
        assert.match(receipt.text, /https:\/\/example\.test\/payment\/receipt\/gp_ref/);
        assert.match(receipt.text, /Total paid: ₦1,500/);
    });

    it("never says AI", () => {
        for (const email of all()) assert.doesNotMatch(`${email.subject} ${email.text}`, /\bAI\b/);
    });
});
