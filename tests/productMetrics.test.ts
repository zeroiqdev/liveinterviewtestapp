import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeProductMetrics, weekStart } from "../src/lib/productMetrics";

const now = new Date("2026-10-14T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const user = (email: string, joinedDaysAgo: number, extra: Partial<{ provider: string; role: string; id: string }> = {}) => ({
    ids: [extra.id ?? `id-${email}`, email],
    email,
    createdAt: daysAgo(joinedDaysAgo),
    provider: extra.provider ?? "credentials",
    role: extra.role ?? "Product Manager",
});

describe("product metrics", () => {
    const data = {
        users: [user("a@x.test", 20), user("b@x.test", 20, { provider: "google" }), user("c@x.test", 3), user("d@x.test", 1, { role: "Data Scientist" })],
        interviews: [
            // a: first on joining, back 3 days later, and again in week two
            { ownerId: "id-a@x.test", startedAt: daysAgo(20) },
            { ownerId: "a@x.test", startedAt: daysAgo(17) },
            { ownerId: "id-a@x.test", startedAt: daysAgo(10) },
            // b: one interview only
            { ownerId: "id-b@x.test", startedAt: daysAgo(19) },
            // c: started yesterday
            { ownerId: "id-c@x.test", startedAt: daysAgo(1) },
            // someone not in users is ignored for activation
            { ownerId: "ghost", startedAt: daysAgo(1) },
        ],
        reports: [
            { email: "a@x.test", createdAt: daysAgo(20), mode: "Live Coaching" },
            { email: "c@x.test", createdAt: daysAgo(1), mode: "Real Interview" },
        ],
        purchases: [
            { email: "a@x.test", amount: 1500, paidAt: daysAgo(17) },
            { email: "a@x.test", amount: 6500, paidAt: daysAgo(5) },
        ],
        wallets: [
            { email: "a@x.test", freeInterviewsUsed: 1 },
            { email: "b@x.test", freeInterviewsUsed: 1 },
            { email: "c@x.test", freeInterviewsUsed: 1 },
        ],
        tries: [
            { createdAt: daysAgo(2), answers: 2, claimed: true },
            { createdAt: daysAgo(1), answers: 2, claimed: false },
            { createdAt: daysAgo(1), answers: 0, claimed: false },
        ],
    };
    const metrics = computeProductMetrics(data, now);

    it("counts who started, finished and came back", () => {
        assert.deepEqual([metrics.activation.percent, metrics.activation.of], [75, 4]);
        assert.deepEqual([metrics.completion.percent, metrics.completion.of], [67, 3]);
        // Only a and b had their first interview a week or more ago; a came back within 7 days.
        assert.deepEqual([metrics.secondInterview.percent, metrics.secondInterview.of], [50, 2]);
        // a and b joined 2+ weeks ago; only a practised in week two.
        assert.deepEqual([metrics.weekOneRetention.percent, metrics.weekOneRetention.of], [50, 2]);
    });

    it("counts who paid after the free interview, and the money", () => {
        assert.deepEqual([metrics.paywallConversion.percent, metrics.paywallConversion.of], [33, 3]);
        assert.equal(metrics.revenue.total, 8000);
        assert.equal(metrics.revenue.last30Days, 8000);
        assert.equal(metrics.revenue.payers, 1);
        assert.equal(metrics.revenue.repeatPayers, 1);
    });

    it("follows tries through to sign-up and names modes as the app does", () => {
        assert.deepEqual(metrics.trial, { started: 3, finished: 2, carriedOn: 1 });
        assert.deepEqual(
            metrics.interviewsByMode.map((r) => r.label).sort(),
            ["Interactive Practice", "Real Interview"]
        );
        assert.equal(metrics.signUpsByMethod.find((r) => r.label === "Google")?.count, 1);
    });

    it("lays the last eight weeks out from Monday, oldest first", () => {
        assert.equal(metrics.weeks.length, 8);
        assert.equal(metrics.weeks[7].week, "2026-10-12");
        assert.equal(weekStart(new Date("2026-10-18T23:00:00Z")).toISOString().slice(0, 10), "2026-10-12");
        assert.equal(metrics.weeks.reduce((sum, w) => sum + w.revenue, 0), 8000);
    });

    it("says there's nothing to measure rather than 0%", () => {
        const empty = computeProductMetrics({ users: [], interviews: [], reports: [], purchases: [], wallets: [], tries: [] }, now);
        assert.equal(empty.activation.percent, null);
        assert.equal(empty.paywallConversion.percent, null);
    });
});
