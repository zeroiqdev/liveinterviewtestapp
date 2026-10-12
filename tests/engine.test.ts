import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectVoiceCommand } from "../src/engine/voiceCommands";
import { decideProbe, probeLimits } from "../src/engine/probePolicy";
import { computePacing } from "../src/engine/timeGovernor";
import type { AnswerAssessment, Blueprint, PacingDirective, SessionDoc } from "../src/engine/types";

const NORMAL: PacingDirective = {
    mode: "normal",
    followUpAllowanceMultiplier: 1,
    skipOptional: false,
    anchorOnly: false,
    secondsRemaining: 1200,
    estimatedSecondsNeeded: 600,
    reason: "",
};

function session(overrides: Partial<SessionDoc> = {}): SessionDoc {
    return {
        sessionId: "s1",
        candidateId: "c1",
        blueprintId: "b1",
        hasProfile: { resume: false, linkedin: false, portfolio: false },
        phase: "competency",
        currentCompetencyIndex: 0,
        topicProgress: [],
        generalAsked: { questionIds: [], categories: [] },
        runningNotes: [],
        parkingLot: [],
        probeThread: { rootQuestion: "Tell me about a launch", competencyId: "comp1", followUps: 0, lastVerdict: null },
        elapsedSeconds: 0,
        startedAt: 0,
        lastTurnAt: 0,
        turnCount: 3,
        transcript: [],
        auditLog: [],
        pendingQuestion: { text: "Tell me about a launch", competencyId: "comp1", kind: "scripted", questionId: "q1" },
        complete: false,
        ...overrides,
    } as SessionDoc;
}

function assessment(overrides: Partial<AnswerAssessment> = {}): AnswerAssessment {
    return {
        specificity: 1,
        ownership: 1,
        depth: 1,
        evidence: 1,
        verdict: "vague",
        weakestDimension: "evidence",
        saidDontKnow: false,
        contradiction: false,
        ...overrides,
    } as AnswerAssessment;
}

describe("detectVoiceCommand", () => {
    it("recognises direct commands", () => {
        assert.equal(detectVoiceCommand("Can we end the interview?"), "end_call");
        assert.equal(detectVoiceCommand("Could you repeat the question?"), "repeat_question");
        assert.equal(detectVoiceCommand("Can we skip this one"), "skip_question");
        assert.equal(detectVoiceCommand("Pardon"), "repeat_question");
    });

    it("ignores command-like words inside an answer", () => {
        assert.equal(detectVoiceCommand("We had a lot of repeat customers last quarter"), null);
        assert.equal(
            detectVoiceCommand(
                "Once I was done with the migration we decided to end the call with the vendor and move to a new provider entirely"
            ),
            null
        );
        assert.equal(detectVoiceCommand(""), null);
    });
});

describe("probeLimits", () => {
    it("scales with pacing", () => {
        assert.deepEqual(probeLimits("standard", NORMAL), { perQuestion: 2, perSection: 4 });
        assert.deepEqual(probeLimits("deep", NORMAL), { perQuestion: 4, perSection: 8 });
        assert.deepEqual(probeLimits("standard", { ...NORMAL, followUpAllowanceMultiplier: 0.5 }), {
            perQuestion: 1,
            perSection: 2,
        });
        assert.deepEqual(probeLimits("standard", { ...NORMAL, followUpAllowanceMultiplier: 0 }), {
            perQuestion: 0,
            perSection: 0,
        });
    });
});

describe("decideProbe", () => {
    const base = { pacing: NORMAL, modelWantsProbe: false, hasProbeText: true };

    it("probes a vague answer within limits", () => {
        const verdict = decideProbe({ ...base, session: session(), assessment: assessment() });
        assert.equal(verdict.allow, true);
        assert.equal(verdict.override, false);
    });

    it("never probes the opening answer, a verified answer, or 'I don't know'", () => {
        const opening = session({
            pendingQuestion: { text: "Intro", competencyId: "general", kind: "opening", questionId: null },
        });
        assert.equal(decideProbe({ ...base, session: opening, assessment: assessment() }).allow, false);
        assert.equal(
            decideProbe({ ...base, session: session(), assessment: assessment({ verdict: "verified" }) }).allow,
            false
        );
        assert.equal(
            decideProbe({ ...base, session: session(), assessment: assessment({ saidDontKnow: true }) }).allow,
            false
        );
    });

    it("only probes a partial answer when the model asks to", () => {
        const partial = assessment({ verdict: "partial" });
        assert.equal(decideProbe({ ...base, session: session(), assessment: partial }).allow, false);
        assert.equal(
            decideProbe({ ...base, modelWantsProbe: true, session: session(), assessment: partial }).allow,
            true
        );
    });

    it("stops at the per-question limit", () => {
        const s = session({
            probeThread: { rootQuestion: "q", competencyId: "comp1", followUps: 2, lastVerdict: "vague" },
        });
        const verdict = decideProbe({ ...base, session: s, assessment: assessment() });
        assert.equal(verdict.allow, false);
        assert.match(verdict.reason, /depth limit/);
    });

    it("lets a contradiction override limits, up to the session cap", () => {
        const atLimit = { rootQuestion: "q", competencyId: "comp1", followUps: 2, lastVerdict: "vague" as const };
        const contradiction = assessment({ contradiction: true });

        const first = decideProbe({ ...base, session: session({ probeThread: atLimit }), assessment: contradiction });
        assert.equal(first.allow, true);
        assert.equal(first.override, true);

        const overrides = [1, 2].map((turn) => ({
            turn,
            module: "budget" as const,
            decision: "override",
            reason: "",
            timestamp: "",
        }));
        const capped = decideProbe({
            ...base,
            session: session({ probeThread: atLimit, auditLog: overrides }),
            assessment: contradiction,
        });
        assert.equal(capped.allow, false);
    });
});

describe("computePacing", () => {
    const blueprint = {
        totalTimeBudgetSeconds: 30 * 60,
        generalBehavioral: { targetQuestionRange: { min: 2, max: 3 } },
        competencies: [
            { priority: "required", targetQuestionRange: { min: 2, max: 3 } },
            { priority: "optional", targetQuestionRange: { min: 2, max: 3 } },
        ],
    } as unknown as Blueprint;
    const progress = [
        { status: "pending", askedQuestionIds: [] },
        { status: "pending", askedQuestionIds: [] },
    ] as unknown as SessionDoc["topicProgress"];

    it("is normal with plenty of time", () => {
        const pacing = computePacing(session({ elapsedSeconds: 0, topicProgress: progress }), blueprint);
        assert.equal(pacing.mode, "normal");
        assert.equal(pacing.followUpAllowanceMultiplier, 1);
    });

    it("tightens, then compresses, as time runs out", () => {
        // 4 required questions owed ≈ 4 × (150 + 37.5) = 750s needed.
        const tight = computePacing(session({ elapsedSeconds: 30 * 60 - 1000, topicProgress: progress }), blueprint);
        assert.equal(tight.mode, "tightening");
        assert.equal(tight.followUpAllowanceMultiplier, 0.5);

        const compressed = computePacing(session({ elapsedSeconds: 30 * 60 - 500, topicProgress: progress }), blueprint);
        assert.equal(compressed.mode, "compressed");
        assert.equal(compressed.skipOptional, true);
    });
});

describe("joinOrHedge", () => {
    const delay = <T>(ms: number, value: T, fail = false) =>
        new Promise<T>((resolve, reject) => setTimeout(() => (fail ? reject(new Error("x")) : resolve(value)), ms));

    it("uses a warm-up that answers in time without starting a fresh call", async () => {
        const { joinOrHedge } = await import("../src/engine/orchestrator");
        let freshCalls = 0;
        const result = await joinOrHedge(delay(10, "prepared"), () => {
            freshCalls += 1;
            return delay(10, "fresh");
        });
        assert.equal(result, "prepared");
        assert.equal(freshCalls, 0);
    });

    it("falls back to a fresh decision when the warm-up fails", async () => {
        const { joinOrHedge } = await import("../src/engine/orchestrator");
        assert.equal(await joinOrHedge(delay(5, "prepared", true), () => delay(5, "fresh")), "fresh");
    });

    it("races a fresh decision against a slow warm-up", async () => {
        const { joinOrHedge, PREPARE_HEDGE_MS } = await import("../src/engine/orchestrator");
        const started = Date.now();
        const result = await joinOrHedge(delay(PREPARE_HEDGE_MS + 2000, "prepared"), () => delay(50, "fresh"));
        assert.equal(result, "fresh");
        assert.ok(Date.now() - started < PREPARE_HEDGE_MS + 1000);
    });

    it("rejects only when both fail", async () => {
        const { joinOrHedge } = await import("../src/engine/orchestrator");
        await assert.rejects(joinOrHedge(delay(5, "p", true), () => delay(5, "f", true)));
    });
});

describe("endpointDelayMs", () => {
    const opts = { minDelayMs: 2000, maxDelayMs: 3000, minWords: 5 };

    it("allows longer than a sentence-boundary pause for a normal answer", async () => {
        const { endpointDelayMs } = await import("../src/hooks/useTurnDetection");
        const delay = endpointDelayMs("I led the migration of our payments service to a new provider.", opts);
        assert.ok(delay >= 2000 && delay <= 2500, String(delay));
    });

    it("waits longest when the answer is clearly unfinished", async () => {
        const { endpointDelayMs } = await import("../src/hooks/useTurnDetection");
        assert.equal(endpointDelayMs("We moved the service over and then", opts), 3000);
        assert.equal(endpointDelayMs("The main reason was because", opts), 3000);
        assert.equal(endpointDelayMs("I worked closely with the", opts), 3000);
    });

    it("ends quickly on an explicit command", async () => {
        const { endpointDelayMs } = await import("../src/hooks/useTurnDetection");
        assert.equal(endpointDelayMs("Can we skip this one", opts), 700);
    });

    it("gives short answers a little extra time", async () => {
        const { endpointDelayMs } = await import("../src/hooks/useTurnDetection");
        assert.equal(endpointDelayMs("Yes, mostly", opts), 2400);
    });

    it("gives a long answer more room to pause and think", async () => {
        const { endpointDelayMs, readyEndpointMs } = await import("../src/hooks/useTurnDetection");
        const sentence = "We rebuilt the onboarding flow and measured the drop off at every step.";
        const long = Array(10).fill(sentence).join(" ");
        assert.equal(endpointDelayMs(long, opts), 2800);
        assert.ok(endpointDelayMs(long, opts) > endpointDelayMs(sentence, opts));
        // A ready reply comes in sooner after a short answer than mid-story.
        assert.equal(readyEndpointMs(sentence), 1200);
        assert.equal(readyEndpointMs(long), 1800);
    });
});

describe("stripLeadingAcknowledgement", () => {
    it("removes generic openers the client filler already said", async () => {
        const { stripLeadingAcknowledgement } = await import("../src/engine/orchestrator");
        assert.equal(stripLeadingAcknowledgement("Got it. But let me push back a bit."), "But let me push back a bit.");
        assert.equal(
            stripLeadingAcknowledgement("Okay, thanks for sharing that. what was the result?"),
            "What was the result?"
        );
        assert.equal(stripLeadingAcknowledgement("Thank you. Walk me through it."), "Walk me through it.");
    });

    it("keeps replies that start with substance", async () => {
        const { stripLeadingAcknowledgement } = await import("../src/engine/orchestrator");
        const text = "Writing PRDs gives us the process, but what failed?";
        assert.equal(stripLeadingAcknowledgement(text), text);
        assert.equal(stripLeadingAcknowledgement("Right now, what is your role?"), "Right now, what is your role?");
        assert.equal(stripLeadingAcknowledgement("Got it."), "Got it.");
    });
});

describe("draftCovers", () => {
    it("reuses a draft when the final answer only adds a short tail", async () => {
        const { draftCovers } = await import("../src/engine/utterance");
        const draft = "I led the payments migration and cut deploy time from two hours to ten minutes";
        assert.equal(draftCovers(draft, draft), true);
        assert.equal(draftCovers(draft, `${draft}, which the team loved.`), true);
        assert.equal(draftCovers(draft.toUpperCase(), draft), true);
    });

    it("redoes the draft when the answer changed or grew a lot", async () => {
        const { draftCovers } = await import("../src/engine/utterance");
        const draft = "I led the payments migration";
        assert.equal(
            draftCovers(draft, `${draft} and then we hit a major outage during the cutover that took three days to fix properly`),
            false
        );
        assert.equal(draftCovers("I led the billing rewrite", "I led the payments migration"), false);
        assert.equal(draftCovers("", "anything"), false);
    });
});

describe("replySegments", () => {
    it("plays a new question as lead-in sentences then the bank question as one clip", async () => {
        const { replySegments } = await import("../src/engine/conversationalEngine");
        assert.deepEqual(
            replySegments({
                text: "You've clearly built fintech products. Let's move on. Walk me through a payment flow you mapped. What broke?",
                bridge: "You've clearly built fintech products. Let's move on.",
                question: "Walk me through a payment flow you mapped. What broke?",
            }),
            [
                "You've clearly built fintech products.",
                "Let's move on.",
                "Walk me through a payment flow you mapped. What broke?",
            ]
        );
    });

    it("splits follow-ups by sentence", async () => {
        const { replySegments } = await import("../src/engine/conversationalEngine");
        assert.deepEqual(replySegments({ text: "But let me push back. What failed?" }), [
            "But let me push back.",
            "What failed?",
        ]);
        assert.deepEqual(replySegments({ text: "Question only?", question: "Question only?" }), ["Question only?"]);
    });
});

describe("resume bullet question", () => {
    const claim = (text: string, extra: Record<string, unknown> = {}) => ({
        text,
        specificity: "specific",
        linkedCompetencies: [],
        sourceLocation: "resume:experience[0]",
        tags: [],
        evidenceStrength: "moderate",
        ...extra,
    });
    const profile = (claims: unknown[], resume = true) =>
        ({
            candidateId: "c",
            roles: [],
            yearsTotal: null,
            techStack: [],
            projects: [],
            claims,
            hasProfile: { resume, linkedin: false, portfolio: false },
            createdAt: "",
        }) as never;

    it("quotes the most probe-worthy resume line", async () => {
        const { pickResumeQuestion } = await import("../src/engine/resumeQuestion");
        const q = pickResumeQuestion(
            profile([
                claim("Built internal dashboards in Looker"),
                claim("Led a cross-functional team to improve onboarding.", {
                    specificity: "vague",
                    tags: ["ownership"],
                }),
                claim("Wrote the About section", { sourceLocation: "linkedin:about", specificity: "vague", tags: ["ownership"] }),
            ])
        );
        assert.ok(q);
        assert.match(q.text, /On your resume, you mention "Led a cross-functional team to improve onboarding"/);
        assert.match(q.text, /concrete example/);
    });

    it("asks how a measurable claim was achieved", async () => {
        const { pickResumeQuestion } = await import("../src/engine/resumeQuestion");
        const q = pickResumeQuestion(profile([claim("Reduced checkout failures by 30% in Q2", { tags: ["scale_impact"] })]));
        assert.match(q!.text, /how you achieved that/);
    });

    it("is skipped without a resume", async () => {
        const { pickResumeQuestion } = await import("../src/engine/resumeQuestion");
        assert.equal(pickResumeQuestion(null), null);
        assert.equal(pickResumeQuestion(profile([claim("Led a team of five")], false)), null);
        assert.equal(pickResumeQuestion(profile([claim("Led things", { sourceLocation: "linkedin:about" })])), null);
    });

    it("is due after the opening and one main question, once, and not when time is short", async () => {
        const { resumeQuestionDue } = await import("../src/engine/resumeQuestion");
        const rq = { claim: "x", sourceLocation: "resume", text: "q", asked: false };
        assert.equal(resumeQuestionDue(session({ turnCount: 1, resumeQuestion: rq }), NORMAL), false);
        assert.equal(resumeQuestionDue(session({ turnCount: 2, resumeQuestion: rq }), NORMAL), true);
        assert.equal(resumeQuestionDue(session({ turnCount: 3, resumeQuestion: { ...rq, asked: true } }), NORMAL), false);
        assert.equal(
            resumeQuestionDue(session({ turnCount: 3, resumeQuestion: rq }), { ...NORMAL, mode: "compressed" }),
            false
        );
    });
});

describe("callJSON model racing", () => {
    const okBody = (value: unknown) =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }), {
            status: 200,
        });
    const hang = (signal?: AbortSignal | null) =>
        new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

    it("starts the next model when the first hangs, and returns the first answer", async () => {
        const { callJSON } = await import("../src/engine/llm");
        process.env.GEMINI_API_KEY = "test";
        process.env.GEMINI_MODELS = "hung-model,fast-model";
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async (url: string, init?: RequestInit) =>
            String(url).includes("hung-model") ? hang(init?.signal) : okBody({ pick: "fast" })) as typeof fetch;
        try {
            const started = Date.now();
            const result = await callJSON<{ pick: string }>({ system: "s", user: "u", timeoutMs: 3000, hedgeMs: 100 });
            assert.equal(result.pick, "fast");
            assert.ok(Date.now() - started < 1000);
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    it("moves on immediately when a model fails, and gives up within the budget", async () => {
        const { callJSON } = await import("../src/engine/llm");
        process.env.GEMINI_API_KEY = "test";
        process.env.GEMINI_MODELS = "quota-model,hung-model-2";
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async (url: string, init?: RequestInit) =>
            String(url).includes("quota-model")
                ? new Response("quota", { status: 429 })
                : hang(init?.signal)) as typeof fetch;
        try {
            const started = Date.now();
            await assert.rejects(callJSON({ system: "s", user: "u", timeoutMs: 400, hedgeMs: 5000 }));
            assert.ok(Date.now() - started < 1200);
        } finally {
            globalThis.fetch = realFetch;
            delete process.env.GEMINI_MODELS;
        }
    });
});

describe("spoken drafts commit what was said", () => {
    it("keeps a drafted follow-up even when pacing now says to move on", async () => {
        const { planTurnForTest } = await import("../src/engine/orchestrator");
        const conv = {
            intent: "answer",
            suggestedTool: "push_back",
            spokenText: "",
            probeText: "What was your personal part in that?",
            assessment: assessment(),
            noteSummary: "",
        } as never;
        const selection = { choice: "question_id", questionId: "q2", parkedIndex: null, questionText: "Tell me about a conflict.", bridge: null, reason: "" } as never;
        const compressed = { ...NORMAL, mode: "compressed" as const, followUpAllowanceMultiplier: 0 };
        // Live decision under compressed pacing: no follow-ups allowed.
        assert.equal(planTurnForTest(session(), compressed, conv, selection).kind, "next");
        // The draft that was spoken was a follow-up: commit exactly that.
        const forced = planTurnForTest(session(), compressed, conv, selection, "probe");
        assert.equal(forced.kind, "probe");
        assert.equal((forced as { text: string }).text, "What was your personal part in that?");
        // And a spoken "next" stays next even when a probe is now allowed.
        assert.equal(planTurnForTest(session(), NORMAL, conv, selection, "next").kind, "next");
    });
});
