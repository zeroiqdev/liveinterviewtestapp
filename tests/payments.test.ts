import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { FREE_INTERVIEWS, decideStart, offerFor, priceForPasses } from "../src/lib/passes";
import { baseUrlFor, isPaidInFull, verifyWebhook } from "../src/lib/bachs";
import { formatNaira, pricePerPass, receiptDate, receiptEmail, receiptNumber } from "../src/lib/receipts";

describe("pass prices", () => {
    it("match the pricing page", () => {
        assert.equal(priceForPasses(1), 1500);
        assert.equal(priceForPasses(4), 4000);
        assert.equal(priceForPasses(5), 4800);
        assert.equal(priceForPasses(6), 5700);
        assert.equal(priceForPasses(7), 6500);
        assert.equal(priceForPasses(30), 18000);
        assert.equal(priceForPasses(40), 24000);
    });

    it("are set by the product asked for, never by an amount sent in", () => {
        assert.deepEqual(offerFor({ product: "day" }), { passes: 1, amount: 1500, label: "Day Pass" });
        assert.equal(offerFor({ product: "week" })!.amount, 6500);
        assert.equal(offerFor({ product: "flexible", passes: 10 })!.passes, 10);
        // Things that aren't on sale.
        for (const bad of [{ product: "free" }, { product: "flexible", passes: 1 }, { product: "flexible", passes: 9999 }, { product: "flexible", passes: 2.5 }, { amount: 1 }, {}]) {
            assert.equal(offerFor(bad as never), null, JSON.stringify(bad));
        }
    });
});

describe("starting an interview", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    const wallet = (over: Partial<{ unused: number; activeUntil: Date | null; freeInterviewsUsed: number }> = {}) => ({ unused: 0, activeUntil: null, freeInterviewsUsed: 0, ...over });

    it("is free the first time", () => {
        assert.equal(FREE_INTERVIEWS, 1);
        assert.deepEqual(decideStart(wallet(), now), { allowed: true, using: "free" });
    });

    it("needs a pass after that", () => {
        assert.deepEqual(decideStart(wallet({ freeInterviewsUsed: 1 }), now), { allowed: false, reason: "pass_required" });
    });

    it("runs on a pass that is still within its 24 hours, without using another", () => {
        const running = wallet({ freeInterviewsUsed: 1, unused: 3, activeUntil: new Date(now.getTime() + 3600_000) });
        assert.deepEqual(decideStart(running, now), { allowed: true, using: "active-pass" });
    });

    it("starts a new pass when the last one has run out", () => {
        const expired = wallet({ freeInterviewsUsed: 1, unused: 2, activeUntil: new Date(now.getTime() - 1000) });
        assert.deepEqual(decideStart(expired, now), { allowed: true, using: "new-pass" });
    });

    it("keeps the free interview for someone who has bought a pass", () => {
        // A buyer's first interview starts their pass; the free one isn't spent on top.
        assert.deepEqual(decideStart(wallet({ unused: 1 }), now), { allowed: true, using: "new-pass" });
    });

    it("always lets an admin in", () => {
        assert.deepEqual(decideStart(wallet({ freeInterviewsUsed: 5 }), now, true), { allowed: true, using: "admin" });
    });
});

describe("Bachs", () => {
    const secret = "whsec_test_secret";
    const body = JSON.stringify({ id: "evt_1", type: "collection.succeeded", data: { checkout_id: "chk_1" } });
    const now = 1_800_000_000;
    const sign = (timestamp: number, payload = body, key = secret) => createHmac("sha256", key).update(`${timestamp}.${payload}`).digest("hex");
    const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });

    it("sends sandbox keys to the sandbox and live keys to production", () => {
        assert.equal(baseUrlFor("sk_sandbox_abc"), "https://sandbox-api.bachs.io");
        assert.equal(baseUrlFor("sk_live_abc"), "https://api.bachs.io");
    });

    it("accepts a correctly signed webhook, in either header form", () => {
        assert.equal(verifyWebhook(body, headers({ "x-bachs-timestamp": String(now), "x-bachs-signature": sign(now) }), secret, now), true);
        assert.equal(verifyWebhook(body, headers({ "x-bachs-signature-v2": `t=${now},v1=${sign(now)}` }), secret, now), true);
    });

    it("accepts any one matching signature while a secret is being rotated", () => {
        const header = `t=${now},v1=${sign(now, body, "an-old-secret")},v1=${sign(now)}`;
        assert.equal(verifyWebhook(body, headers({ "x-bachs-signature-v2": header }), secret, now), true);
    });

    it("refuses a forged, altered, stale or unsigned webhook", () => {
        const good = sign(now);
        assert.equal(verifyWebhook(body, headers({ "x-bachs-timestamp": String(now), "x-bachs-signature": sign(now, body, "wrong") }), secret, now), false);
        assert.equal(verifyWebhook(body.replace("chk_1", "chk_2"), headers({ "x-bachs-timestamp": String(now), "x-bachs-signature": good }), secret, now), false);
        assert.equal(verifyWebhook(body, headers({ "x-bachs-timestamp": String(now), "x-bachs-signature": good }), secret, now + 3600), false);
        assert.equal(verifyWebhook(body, headers({}), secret, now), false);
        assert.equal(verifyWebhook(body, headers({ "x-bachs-timestamp": String(now), "x-bachs-signature": good }), "", now), false);
    });

    it("counts a checkout as paid only when Bachs says so, in naira, for the full price", () => {
        const session = { checkout_id: "chk_1", status: "completed", payment_status: "succeeded", amount: "1500.00", currency: "NGN" };
        assert.equal(isPaidInFull(session, 1500), true);
        assert.equal(isPaidInFull({ ...session, status: "open", payment_status: "processing" }, 1500), false);
        assert.equal(isPaidInFull({ ...session, amount: "150.00" }, 1500), false);
        assert.equal(isPaidInFull({ ...session, currency: "USD", amount: "1500.00" }, 1500), false);
        assert.equal(isPaidInFull({ ...session, status: "expired" }, 1500), false);
    });
});

describe("receipts", () => {
    
    it("receipt numbers are short, readable and come from the payment reference", () => {
        assert.equal(receiptNumber("gp_m2x9k1_a1b2c3d4e5f6"), "GP-M2X9K1-A1B2C3");
        assert.notEqual(receiptNumber("gp_m2x9k1_a1b2c3d4e5f6"), receiptNumber("gp_m2x9k1_ffb2c3d4e5f6"));
    });
    
    it("receipt amounts are whole naira, per pass and in total", () => {
        assert.equal(formatNaira(6500), "₦6,500");
        assert.equal(pricePerPass(6500, 7), 929);
        assert.equal(pricePerPass(1500, 1), 1500);
        assert.equal(receiptDate("2026-10-14T23:30:00Z"), "15 October 2026");
    });
    
    it("the receipt email carries the details and a link, and escapes what it shows", () => {
        const email = receiptEmail(
            { reference: "gp_m2x9k1_a1b2c3d4e5f6", label: "1-Week Bundle (7 passes)", passes: 7, amount: 6500, currency: "NGN", paidAt: "2026-10-14T10:00:00Z", name: "Amara <b>Okafor</b>", email: "amara@example.test" },
            "https://getprepped.example/payment/receipt/gp_m2x9k1_a1b2c3d4e5f6"
        );
        assert.match(email.subject, /GP-M2X9K1-A1B2C3/);
        assert.match(email.text, /Total paid: ₦6,500/);
        assert.match(email.html, /payment\/receipt\/gp_m2x9k1_a1b2c3d4e5f6/);
        assert.ok(!email.html.includes("<b>Okafor</b>"));
    });
});
