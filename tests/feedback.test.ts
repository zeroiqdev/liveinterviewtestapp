import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAttendanceRemark, stripAttendanceSentences } from "../src/engine/evaluationScope";
import { sanitizeReportData } from "../src/lib/feedbackSanitizer";
import type { FeedbackReportData } from "../src/app/api/feedback/generate/route";

function report(overrides: Partial<FeedbackReportData> = {}): FeedbackReportData {
    return {
        overallScore: 60,
        summary: "",
        verdict: "Average",
        metrics: { vocabulary: 60, technicalDepth: 60, pace: 60, fillerWords: 60, clarity: 60, structureStar: 60 },
        strengths: [],
        improvements: [],
        quickTips: [],
        qaBreakdown: [],
        ...overrides,
    };
}

describe("isAttendanceRemark", () => {
    it("flags attendance, punctuality and participation remarks", () => {
        for (const text of [
            "You showed up on time and were ready.",
            "Great punctuality.",
            "You completed the entire interview session.",
            "Active Session Engagement",
            "Thanks for joining the call promptly.",
            "Professional engagement throughout",
            "Strong attendance",
        ]) {
            assert.equal(isAttendanceRemark(text), true, text);
        }
    });

    it("leaves answer-based feedback alone", () => {
        for (const text of [
            "You quantified the latency drop from 800ms to 120ms.",
            "Your STAR structure was clear, but the result was vague.",
            "You explained the trade-off between caching and consistency.",
            "You attended to edge cases in the retry logic.",
        ]) {
            assert.equal(isAttendanceRemark(text), false, text);
        }
    });
});

describe("stripAttendanceSentences", () => {
    it("removes only the offending sentence", () => {
        assert.equal(
            stripAttendanceSentences("You completed the session. Your examples lacked metrics."),
            "Your examples lacked metrics."
        );
        assert.equal(stripAttendanceSentences("Your examples lacked metrics."), "Your examples lacked metrics.");
    });
});

describe("sanitizeReportData", () => {
    it("drops attendance-based strengths, improvements and tips", () => {
        const clean = sanitizeReportData(
            report({
                summary: "You showed up prepared. You explained trade-offs clearly.",
                strengths: [
                    { title: "Punctuality", detail: "You joined the interview on time." },
                    { title: "Clear trade-offs", detail: "You weighed caching against consistency." },
                    { title: "Depth", detail: "You walked through the rollback plan." },
                ],
                improvements: [
                    { title: "Be on time", detail: "Arrive on time for the call.", recommendation: "Join early." },
                    { title: "Metrics", detail: "No numbers.", recommendation: "Quantify impact." },
                    { title: "Structure", detail: "Result was unclear.", recommendation: "State the outcome." },
                ],
                quickTips: ["Stay for the whole session.", "Lead with the result.", "Name one metric.", "Pause instead of um."],
            })
        );
        assert.equal(clean.summary, "You explained trade-offs clearly.");
        assert.deepEqual(clean.strengths.map((s) => s.title), ["Clear trade-offs", "Depth"]);
        assert.deepEqual(clean.improvements.map((i) => i.title), ["Metrics", "Structure"]);
        assert.ok(!clean.quickTips.some((t) => /session/i.test(t)));
    });

    it("never pads strengths with participation filler", () => {
        const clean = sanitizeReportData(report());
        assert.equal(clean.strengths.length, 1);
        assert.equal(isAttendanceRemark(`${clean.strengths[0].title} ${clean.strengths[0].detail}`), false);
        assert.match(clean.strengths[0].title, /not enough/i);
    });
});

describe("classifyAnswer", () => {
    it("treats objections, clarifications and don't-knows as objections", async () => {
        const { classifyAnswer } = await import("../src/config/fillerConfig");
        for (const text of [
            "There is no company cited",
            "there was no company mentioned, this is a general interview",
            "I don't know, I haven't worked with Kafka",
            "You didn't say which company this is for",
        ]) {
            assert.equal(classifyAnswer(text), "objection", text);
        }
    });

    it("recognises a question to the interviewer, with or without a question mark", async () => {
        const { classifyAnswer } = await import("../src/config/fillerConfig");
        for (const text of [
            "What's the team size?",
            "how many people are on the team",
            "Is this role remote or on site",
            "Can I ask what the salary range is",
            "I have a question about the company before I answer",
            "Before I answer, do you have a product in mind",
            "I led the migration at my last job and it went well. Is that the kind of example you want",
        ]) {
            assert.equal(classifyAnswer(text), "question", text);
        }
        for (const text of ["What do you mean by that?", "can you repeat the question", "Sorry, I didn't catch that"]) {
            assert.equal(classifyAnswer(text), "clarify", text);
        }
    });

    it("doesn't mistake an answer for a question", async () => {
        const { classifyAnswer } = await import("../src/config/fillerConfig");
        for (const text of [
            "What I did was rebuild the onboarding flow from scratch and measure the drop off at each step for a month.",
            "When I joined the team there was no testing at all, so I introduced unit tests and a review process first.",
            "How I approach it depends on the stakeholder, but I usually start by agreeing on the goal and the deadline.",
            "Where I worked before we shipped every two weeks and I owned the release notes and the rollout plan.",
            "I would say communication is my strongest skill because I keep everyone informed of progress and risks.",
        ]) {
            assert.equal(classifyAnswer(text), "substantive", text);
        }
    });

    it("answers a question with a fitting line, never 'Okay, I see'", async () => {
        const { pickAcknowledgement, QUESTION_ACKNOWLEDGEMENTS, CLARIFY_ACKNOWLEDGEMENTS } = await import("../src/config/fillerConfig");
        for (let i = 0; i < 20; i++) {
            assert.ok(QUESTION_ACKNOWLEDGEMENTS.includes(pickAcknowledgement("question")));
            assert.ok(CLARIFY_ACKNOWLEDGEMENTS.includes(pickAcknowledgement("clarify")));
        }
    });

    it("separates brief answers from substantive ones", async () => {
        const { classifyAnswer } = await import("../src/config/fillerConfig");
        assert.equal(classifyAnswer("Yes, mostly with Python."), "brief");
        assert.equal(
            classifyAnswer(
                "At my last company I rebuilt how we qualified leads with a scoring model, which lifted win rates by twenty percent."
            ),
            "substantive"
        );
    });

    it("only allows engaged acknowledgements after a solid, substantive answer", async () => {
        const { pickAcknowledgement, NEUTRAL_ACKNOWLEDGEMENTS, OBJECTION_ACKNOWLEDGEMENTS } = await import(
            "../src/config/fillerConfig"
        );
        for (let i = 0; i < 30; i++) {
            assert.ok(OBJECTION_ACKNOWLEDGEMENTS.includes(pickAcknowledgement("objection")));
            assert.ok(NEUTRAL_ACKNOWLEDGEMENTS.includes(pickAcknowledgement("brief")));
            assert.ok(NEUTRAL_ACKNOWLEDGEMENTS.includes(pickAcknowledgement("substantive", true)));
        }
    });
});

describe("company context", () => {
    const q = (id: string, question: string, category = "general") => ({ id, question, category }) as never;

    it("treats UI placeholders as no company", async () => {
        const { realCompanyName } = await import("../src/engine/company");
        assert.equal(realCompanyName("General Industry Benchmark"), null);
        assert.equal(realCompanyName("General"), null);
        assert.equal(realCompanyName(""), null);
        assert.equal(realCompanyName("Paystack"), "Paystack");
    });

    it("drops employer-specific questions from general interviews only", async () => {
        const { questionsForCompany } = await import("../src/engine/company");
        const pool = [
            q("gen_002", "What do you know about our company?", "company_fit"),
            q("gen_017", "If hired, how do you plan to spend your first 90 days with our company?"),
            q("sales_015", "If you had to sell our product, what two questions would you ask?"),
            q("SWE_SYS_M_134", "Case Study: To protect our backend services we need a rate limiter. How would you build it?"),
            q("PM_STRAT_H_200", "We are facing a situation where our product's primary user is being cannibalized. What do you do?"),
            q("gen_005", "Tell me about a time you failed."),
        ];
        const ids = (list: Array<{ id: string }>) => list.map((x) => x.id);
        assert.deepEqual(ids(questionsForCompany(pool, "General Industry Benchmark")), [
            "SWE_SYS_M_134",
            "PM_STRAT_H_200",
            "gen_005",
        ]);
        assert.equal(questionsForCompany(pool, "Paystack").length, pool.length);
    });

    it("tells the interviewer there is no company in general interviews", async () => {
        const { companyGuidance } = await import("../src/engine/company");
        assert.match(companyGuidance(null), /general practice interview/);
        assert.equal(companyGuidance("Paystack"), "Company: Paystack");
    });
});
