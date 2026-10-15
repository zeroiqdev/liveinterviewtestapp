import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildNotifications } from "../src/lib/notifications";

const now = new Date("2026-10-15T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("notifications", () => {
    const sources = {
        accountCreatedAt: hoursAgo(24 * 10),
        purchases: [
            { reference: "ref-1", passes: 7, amount: 6500, paidAt: hoursAgo(5) },
            { reference: "ref-2", passes: 2, amount: 0, discountCode: "FRIENDS", paidAt: hoursAgo(30) },
            { reference: "old", passes: 1, amount: 1500, paidAt: hoursAgo(24 * 40) },
        ],
        reports: [{ sessionId: "s1", overallScore: 72.4, interviewType: "Customer Interaction & Empathy Interview", createdAt: hoursAgo(2) }],
        resumes: [
            { id: "cv1", name: "Amara.pdf", score: 59, createdAt: hoursAgo(48) },
            { id: "cv2", name: "Unscored.pdf", score: 0, createdAt: hoursAgo(1) },
        ],
        activeUntil: new Date(now.getTime() + 20 * 3_600_000),
        seenAt: hoursAgo(10),
    };

    it("lists purchases and events newest first, from the last 30 days", () => {
        const list = buildNotifications(sources, now);
        assert.deepEqual(list.map((n) => n.id), ["report:s1", "pass:" + sources.activeUntil.getTime(), "purchase:ref-1", "purchase:ref-2", "resume:cv1", "welcome"]);
        assert.ok(!list.some((n) => n.id === "purchase:old"));
        assert.ok(!list.some((n) => n.id === "resume:cv2"));
    });

    it("describes payments and free passes plainly, with a receipt link", () => {
        const list = buildNotifications(sources, now);
        const paid = list.find((n) => n.id === "purchase:ref-1")!;
        assert.equal(paid.title, "Payment received for 7 passes");
        assert.match(paid.detail, /₦6,500/);
        assert.equal(paid.href, "/payment/receipt/ref-1");
        assert.equal(list.find((n) => n.id === "purchase:ref-2")!.title, "2 passes added to your account");
        assert.match(list.find((n) => n.id === "report:s1")!.detail, /72 out of 100/);
    });

    it("marks only what came after the list was last opened as unread", () => {
        const list = buildNotifications(sources, now);
        assert.deepEqual(list.filter((n) => n.unread).map((n) => n.id), ["report:s1", "pass:" + sources.activeUntil.getTime(), "purchase:ref-1"]);
        assert.equal(buildNotifications({ ...sources, seenAt: now }, now).filter((n) => n.unread).length, 0);
    });

    it("never says AI", () => {
        const text = buildNotifications(sources, now).map((n) => `${n.title} ${n.detail}`).join(" ");
        assert.doesNotMatch(text, /\bAI\b/);
    });
});
