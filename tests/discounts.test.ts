import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeDiscount, discountProblem, discountedAmount, newCodeProblem, normalizeDiscountCode, type DiscountRule } from "../src/lib/discounts";

const rule = (over: Partial<DiscountRule> = {}): DiscountRule => ({
    code: "LAUNCH20",
    kind: "percent",
    value: 20,
    maxUses: null,
    uses: 0,
    redeemedBy: [],
    expiresAt: null,
    active: true,
    ...over,
});

describe("discount codes", () => {
    it("reads codes the way they're stored", () => {
        assert.equal(normalizeDiscountCode(" launch 20! "), "LAUNCH20");
        assert.equal(normalizeDiscountCode("campus-ng"), "CAMPUS-NG");
        assert.equal(normalizeDiscountCode(42), "");
    });

    it("takes a percentage off in whole naira, never below zero", () => {
        assert.equal(discountedAmount(1500, { kind: "percent", value: 20 }), 1200);
        assert.equal(discountedAmount(6500, { kind: "percent", value: 15 }), 5525);
        assert.equal(discountedAmount(1500, { kind: "percent", value: 100 }), 0);
        assert.equal(discountedAmount(1500, { kind: "percent", value: 150 }), 0);
        assert.equal(discountedAmount(1500, { kind: "free_passes", value: 3 }), 1500);
    });

    it("says why a code can't be used", () => {
        const now = new Date("2026-10-15T12:00:00Z");
        assert.equal(discountProblem(rule(), "a@x.test", now), null);
        assert.match(discountProblem(null, "a@x.test", now) ?? "", /isn't valid/);
        assert.match(discountProblem(rule({ active: false }), "a@x.test", now) ?? "", /isn't valid/);
        assert.match(discountProblem(rule({ expiresAt: new Date("2026-10-14T00:00:00Z") }), "a@x.test", now) ?? "", /expired/);
        assert.match(discountProblem(rule({ maxUses: 5, uses: 5 }), "a@x.test", now) ?? "", /fully used/);
        assert.match(discountProblem(rule({ redeemedBy: ["a@x.test"] }), "A@X.test", now) ?? "", /already used/);
    });

    it("checks what an admin enters", () => {
        assert.equal(newCodeProblem({ kind: "percent", value: 20, maxUses: "" }), null);
        assert.equal(newCodeProblem({ kind: "free_passes", value: 3, maxUses: 10 }), null);
        assert.match(newCodeProblem({ kind: "percent", value: 0, maxUses: null }) ?? "", /between 1 and 100/);
        assert.match(newCodeProblem({ kind: "free_passes", value: 99, maxUses: null }) ?? "", /between 1 and 50/);
        assert.match(newCodeProblem({ kind: "percent", value: 10, maxUses: 0 }) ?? "", /use limit/);
        assert.match(newCodeProblem({ kind: "cash", value: 10, maxUses: null }) ?? "", /Choose/);
    });

    it("describes codes in plain words", () => {
        assert.equal(describeDiscount({ kind: "percent", value: 20 }), "20% off");
        assert.equal(describeDiscount({ kind: "free_passes", value: 1 }), "1 free pass");
        assert.equal(describeDiscount({ kind: "free_passes", value: 3 }), "3 free passes");
    });
});
