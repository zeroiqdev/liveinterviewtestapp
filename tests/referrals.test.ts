import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeReferralCode, normalizeReferralCode, referralsToNextPass, rewardsEarned } from "../src/lib/referralRules";
import { buildNotifications } from "../src/lib/notifications";
import { referralRewardEmail } from "../src/lib/emailTemplates";

describe("referrals", () => {
    it("gives one free pass for every three friends who buy", () => {
        assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(rewardsEarned), [0, 0, 0, 1, 1, 1, 2, 2]);
        assert.deepEqual([0, 1, 2, 3, 4].map(referralsToNextPass), [3, 2, 1, 3, 2]);
    });

    it("makes six-character codes without look-alike letters, and reads them back loosely", () => {
        let i = 0;
        const code = makeReferralCode(() => i++ % 32);
        assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
        assert.equal(normalizeReferralCode(" k7q2mx "), "K7Q2MX");
        for (const bad of ["", "K7Q2M", "K7Q2MXX", "K0Q2MX", "K1Q2MX", "<script>", null, 123456]) assert.equal(normalizeReferralCode(bad), null, String(bad));
    });

    it("shows a reward in the bell as a free pass, not a discount code", () => {
        const now = new Date("2026-10-20T12:00:00Z");
        const [item] = buildNotifications({ purchases: [{ reference: "gp_ref_1", passes: 1, amount: 0, label: "Referral reward", paidAt: new Date("2026-10-20T11:00:00Z") }], reports: [], resumes: [] }, now);
        assert.equal(item.title, "You earned a free pass");
        assert.equal(item.href, "/profile#invite");
        assert.doesNotMatch(item.detail, /code/);
    });

    it("thanks the inviter by first name and links to the dashboard", () => {
        const email = referralRewardEmail({ name: "Ada Obi", friends: 3, siteUrl: "https://example.test" });
        assert.match(email.text, /^Hi Ada,/);
        assert.match(email.text, /3 people you invited have bought a pass/);
        assert.match(email.text, /https:\/\/example\.test\/dashboard/);
    });
});
