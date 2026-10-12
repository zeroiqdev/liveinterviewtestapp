import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    FALLBACK_OPENER,
    OPENERS,
    openerFamily,
    openingGreeting,
    openingIntro,
    planOpening,
} from "../src/engine/openers";

describe("opening question", () => {
    it("fits the role and the round", () => {
        const plan = planOpening({ roleFamily: "product_manager", role: "Product Manager", interviewType: "Execution & Metrics Interview" });
        assert.equal(plan.round?.focus, "execution and metrics");
        assert.match(plan.opener!, /how you knew whether it was succeeding/);

        const va = planOpening({ roleFamily: "virtual_assistant", role: "Virtual Assistant", interviewType: "Tools & Efficiency Interview" });
        assert.match(va.opener!, /tools you rely on/);
    });

    it("gives each role its own line for rounds that share a title", () => {
        const opener = (roleFamily: string) =>
            planOpening({ roleFamily, interviewType: "Technical Interview" }).opener;
        assert.notEqual(opener("frontend_developer"), opener("backend_engineer"));
        assert.notEqual(opener("backend_engineer"), opener("product_marketer"));
        assert.equal(opener("engineering"), opener("backend_engineer"));
    });

    it("finds the round even when the family is off", () => {
        const plan = planOpening({ roleFamily: "general", interviewType: "Negotiation & Objection Handling Interview" });
        assert.match(plan.opener!, /deal you closed/);
    });

    it("uses the role's general line when the round is just the role", () => {
        const company = planOpening({ role: "Product Manager", interviewType: "Stripe Product Manager Interview", company: "Stripe" });
        assert.equal(company.opener, OPENERS.product_manager.general);
        assert.equal(company.round, null);
        const generic = planOpening({ role: "Sales Representative", interviewType: "Role Interview" });
        assert.equal(generic.opener, OPENERS.sales.general);
        assert.equal(planOpening({ interviewType: "" }).opener, FALLBACK_OPENER);
    });

    it("leaves unknown rounds to be written", () => {
        const plan = planOpening({ roleFamily: "product_manager", interviewType: "Pricing Strategy Interview" });
        assert.equal(plan.opener, null);
        assert.equal(plan.key, "product_manager:pricing strategy");
    });

    it("maps dashboard family aliases", () => {
        assert.equal(openerFamily("product"), "product_manager");
        assert.equal(openerFamily("unknown", "Customer Support"), "customer_service");
        assert.equal(openerFamily(null, null), "general");
    });

    it("every fixed line is one spoken question", () => {
        for (const family of Object.values(OPENERS)) {
            for (const line of [family.general, ...family.rounds.map((r) => r.opener)]) {
                assert.match(line, /^[A-Z].{15,140}[.?]$/, line);
            }
        }
    });
});

describe("welcome", () => {
    it("names the candidate, role, company and round", () => {
        assert.equal(openingGreeting("Kemi"), "Hello Kemi, welcome!");
        assert.equal(openingGreeting(""), "Hello, welcome!");
        const intro = openingIntro({ role: "Product Manager", company: "Target", focus: "execution and metrics" });
        assert.match(intro, /^I'll be your interviewer today for the Product Manager position with Target\. This round is about execution and metrics, and it should take 20 to 30 minutes\./);
        assert.match(intro, /Let's get started:$/);
        const plain = openingIntro({ role: "Product Manager" });
        assert.doesNotMatch(plain, /position with|This round is about/);
        assert.match(plain, /position\. This should take 20 to 30 minutes\./);
    });
});
