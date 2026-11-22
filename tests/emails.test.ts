import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderEmail } from "../src/lib/emailLayout";
import { codeEmail, welcomeEmail } from "../src/lib/emailTemplates";
import { receiptEmail } from "../src/lib/receipts";
import { roleAddedEmail } from "../src/lib/roleRequests";
import { fromAddress, replyToAddress } from "../src/lib/email";

const all = () => [
    codeEmail("verify", "483920", 10),
    codeEmail("reset", "483920", 10),
    codeEmail("change-email", "483920", 10),
    receiptEmail({ reference: "gp_ref", label: "Day Pass", passes: 1, amount: 1500, currency: "NGN", paidAt: new Date("2026-10-01T10:00:00Z"), name: "Ada Obi", email: "ada@example.test" }, "https://example.test/payment/receipt/gp_ref"),
    roleAddedEmail({ requested: "Supply chain analyst", role: "Supply Chain Analyst", siteUrl: "https://example.test" }),
    welcomeEmail({ name: "Ada Obi", role: "Product Manager", siteUrl: "https://example.test" }),
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

    it("welcomes by first name, with numbered steps and a link to start", () => {
        const email = welcomeEmail({ name: "Ada Obi", role: "Product Manager", siteUrl: "https://example.test/" });
        assert.equal(email.subject, "Welcome to get prepped");
        assert.match(email.text, /^Hi Ada,/);
        assert.match(email.text, /Product Manager interview/);
        assert.match(email.text, /1\. Practise a real interview/);
        assert.match(email.text, /https:\/\/example\.test\/dashboard/);
    });

    it("never says AI", () => {
        for (const email of all()) assert.doesNotMatch(`${email.subject} ${email.text}`, /\bAI\b/);
    });
});

describe("email senders", () => {
    const KEYS = ["EMAIL_FROM", "EMAIL_FROM_ACCOUNT", "EMAIL_FROM_BILLING", "NEXT_PUBLIC_CONTACT_EMAIL"] as const;
    function withEnv(values: Partial<Record<(typeof KEYS)[number], string>>, run: () => void) {
        const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
        for (const k of KEYS) delete process.env[k];
        Object.assign(process.env, values);
        try {
            run();
        } finally {
            for (const k of KEYS) {
                if (saved[k] === undefined) delete process.env[k];
                else process.env[k] = saved[k];
            }
        }
    }

    it("sends each kind of email from its own address", () => {
        withEnv(
            {
                EMAIL_FROM: "get prepped <hello@getprepped.test>",
                EMAIL_FROM_ACCOUNT: "get prepped <login@getprepped.test>",
                EMAIL_FROM_BILLING: "get prepped <billing@getprepped.test>",
            },
            () => {
                assert.equal(fromAddress("hello"), "get prepped <hello@getprepped.test>");
                assert.equal(fromAddress("account"), "get prepped <login@getprepped.test>");
                assert.equal(fromAddress("billing"), "get prepped <billing@getprepped.test>");
            }
        );
    });

    it("falls back to EMAIL_FROM when a sender isn't set", () => {
        withEnv({ EMAIL_FROM: "get prepped <hello@getprepped.test>" }, () => {
            assert.equal(fromAddress("account"), "get prepped <hello@getprepped.test>");
            assert.equal(fromAddress("billing"), "get prepped <hello@getprepped.test>");
        });
        withEnv({}, () => assert.equal(fromAddress("hello"), ""));
    });

    it("tolerates quote marks pasted into the hosting dashboard", () => {
        withEnv({ EMAIL_FROM_BILLING: '"get prepped <billing@getprepped.test>"' }, () => {
            assert.equal(fromAddress("billing"), "get prepped <billing@getprepped.test>");
        });
    });

    it("sends replies to account emails to the contact inbox, and leaves the rest alone", () => {
        withEnv({ NEXT_PUBLIC_CONTACT_EMAIL: "support@getprepped.test" }, () => {
            assert.equal(replyToAddress("account"), "support@getprepped.test");
            assert.equal(replyToAddress("billing"), undefined);
            assert.equal(replyToAddress("hello"), undefined);
        });
        withEnv({}, () => assert.equal(replyToAddress("account"), undefined));
    });
});
