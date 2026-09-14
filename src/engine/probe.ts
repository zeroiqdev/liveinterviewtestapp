/* ══════════════════════════════════════
   Probe Timing Evaluator — the
   natural-feel judgment call, run after
   every answer. Combined with the Running
   Notes Updater (one call, per spec).

   Budget Enforcer — pure logic, runs
   after a probe_now decision.
   ══════════════════════════════════════ */

import { callJSON } from "./llm";
import { MAX_BUDGET_OVERRIDES_PER_SESSION, NOTES_WINDOW } from "./constants";
import type {
    Blueprint,
    CandidateProfile,
    Competency,
    PacingDirective,
    ProbeDecision,
    SessionDoc,
} from "./types";

const SYSTEM = `You judge how to handle a candidate's answer in a live interview. 
Your goal is to preserve the structured interview flow so that all required role competencies and scripted questions are covered.

A disciplined interviewer does NOT jump down an immediate rabbit hole every time past experience is mentioned:
- park: If the candidate mentions specific past projects, achievements, metrics, technical tools, or experiences that relate to an upcoming competency section, PARK IT! Parking ensures the topic is probed at the right time in the appropriate section without derailing the interview script.
- probe_now: ONLY use probe_now if the answer directly addresses the CURRENT section being assessed AND an immediate follow-up clarifies their specific contribution without derailing the section's pacing. Never probe immediately if the topic belongs to an upcoming section.
- let_go: If the answer is broad, introductory, sufficiently clear, or not worth an immediate interruption, let it go.

Output ONLY:
{
  "noteworthy": true/false,
  "immediacy": "probe_now" | "park" | "let_go",
  "reason": "<one sentence>",
  "best_fit_competency_if_parked": "<exact competency_id from the 'Sections still ahead' list, or null>",
  "topic_summary": "<short phrase summarizing the experience/topic to revisit, or null>",
  "contradiction": true/false,
  "note_summary": "<1-2 line running-notes summary of the answer>"
}

Guidance:
- If in the opening or general section: the candidate will naturally summarize their career journey. DO NOT derail the opening with immediate technical deep-dives! PARK their specific projects/claims to the relevant upcoming role sections (e.g. system design, execution, strategy, analytics) so they can be explored at the right time.
- If an upcoming section covers the topic (see 'Sections still ahead' below): PARK IT! Select that section's ID for best_fit_competency_if_parked.
- If the live answer CONTRADICTS a resume/profile claim, that is probe_now with contradiction=true.`;

function matchingClaim(
    profile: CandidateProfile | null,
    answerText: string
): string {
    if (!profile || profile.claims.length === 0) {
        return "Profile claim: none provided.";
    }
    // Cheap relevance: longest claims containing any content word from the answer.
    const words = new Set(
        answerText
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, "")
            .split(/\s+/)
            .filter((w) => w.length > 4)
    );
    const scored = profile.claims
        .map((c) => {
            const cwords = c.text.toLowerCase().split(/\s+/);
            const overlap = cwords.filter((w) => words.has(w)).length;
            return { c, overlap };
        })
        .sort((a, b) => b.overlap - a.overlap);
    const best = scored[0];
    if (!best || best.overlap === 0) {
        const vague = profile.claims.find((c) => c.specificity === "vague");
        if (vague)
            return `Profile claim (${vague.sourceLocation}): "${vague.text}" (specificity: ${vague.specificity})`;
        return "Profile claim: none clearly relevant.";
    }
    return `Profile claim (${best.c.sourceLocation}): "${best.c.text}" (specificity: ${best.c.specificity})`;
}

export async function evaluateAnswer(opts: {
    session: SessionDoc;
    blueprint: Blueprint;
    competency: Competency | null;
    answerText: string;
    profile: CandidateProfile | null;
    remainingLabels: string[];
}): Promise<ProbeDecision> {
    const { session, blueprint, competency, answerText, profile } = opts;
    const competencyLabel = competency?.label ?? "General behavioral";

    const user = `Current section: ${competencyLabel}
${matchingClaim(profile, answerText)}
Candidate's live answer: ${answerText}
Sections still ahead: ${opts.remainingLabels.join(", ") || "none — final section"}
What's already been covered: ${
        session.runningNotes
            .slice(-NOTES_WINDOW)
            .map((n) => n.summary)
            .join(" | ") || "nothing yet"
    }`;

    const fallback: ProbeDecision = {
        noteworthy: false,
        immediacy: "let_go",
        reason: "fallback: evaluator unavailable",
        best_fit_competency_if_parked: null,
        topic_summary: null,
        contradiction: false,
        note_summary: answerText.slice(0, 140),
    };

    try {
        const raw = await callJSON<Partial<ProbeDecision>>({
            system: `${SYSTEM}\n\nInterviewer persona: ${blueprint.persona.voice}\nDomain judgment: ${blueprint.persona.domainJudgmentNotes}`,
            user,
            maxTokens: 400,
            mock: {
                noteworthy: session.turnCount % 3 === 0,
                immediacy:
                    session.turnCount % 3 === 0 ? "park" : "let_go",
                reason: "mock decision",
                best_fit_competency_if_parked:
                    session.turnCount % 3 === 0
                        ? blueprint.competencies[0]?.id ?? null
                        : null,
                topic_summary:
                    session.turnCount % 3 === 0 ? "mock parked topic" : null,
                contradiction: false,
                note_summary: `Answered: ${answerText.slice(0, 80)}`,
            },
        });

        const immediacy =
            raw.immediacy === "probe_now" ||
            raw.immediacy === "park" ||
            raw.immediacy === "let_go"
                ? raw.immediacy
                : "let_go";

        return {
            noteworthy: !!raw.noteworthy,
            immediacy,
            reason: raw.reason || "no reason given",
            best_fit_competency_if_parked:
                immediacy === "park"
                    ? raw.best_fit_competency_if_parked || null
                    : null,
            topic_summary:
                raw.topic_summary ||
                (immediacy === "probe_now" ? answerText.slice(0, 120) : null),
            contradiction: !!raw.contradiction,
            note_summary: raw.note_summary || answerText.slice(0, 140),
        };
    } catch (err: any) {
        console.warn("[probe] evaluateAnswer fallback triggered:", err?.message || err);
        return fallback;
    }
}

/* ── Budget Enforcer — pure logic ── */

export interface BudgetVerdict {
    allow: boolean;
    downgraded: boolean;
    override: boolean;
    reason: string;
}

export function enforceBudget(opts: {
    session: SessionDoc;
    competency: Competency | null;
    pacing: PacingDirective;
    decision: ProbeDecision;
}): BudgetVerdict {
    const { session, competency, pacing, decision } = opts;

    // Contradictions outrank budget pressure — bounded by a session cap.
    if (decision.contradiction) {
        const overrides = session.auditLog.filter(
            (a) => a.module === "budget" && a.decision === "override"
        ).length;
        if (overrides < MAX_BUDGET_OVERRIDES_PER_SESSION) {
            return {
                allow: true,
                downgraded: false,
                override: true,
                reason: "contradiction with profile claim — override follow-up cap",
            };
        }
        return {
            allow: false,
            downgraded: true,
            override: false,
            reason: "contradiction override cap reached",
        };
    }

    // Never stack a follow-up directly on top of another follow-up (prevent rabbit hole loops)
    if (session.phase === "follow_up") {
        return {
            allow: false,
            downgraded: true,
            override: false,
            reason: "single follow-up limit per question — returning to interview flow",
        };
    }

    // Opening / general behavioral section: cap follow-ups at 1 max across the entire intro
    if (!competency) {
        const openingFollowUps = session.auditLog.filter(
            (a) =>
                a.module === "follow_up" &&
                a.decision === "ask" &&
                session.currentCompetencyIndex < 0
        ).length;
        if (openingFollowUps >= 1) {
            return {
                allow: false,
                downgraded: true,
                override: false,
                reason: "opening section follow-up cap reached — proceeding with scripted interview",
            };
        }
    }

    if (pacing.followUpAllowanceMultiplier === 0) {
        return {
            allow: false,
            downgraded: true,
            override: false,
            reason: "compressed pacing — follow-ups off",
        };
    }

    const cap = Math.floor(
        (competency?.maxFollowUps ?? 1) * pacing.followUpAllowanceMultiplier
    );
    const used = competency
        ? (session.topicProgress[session.currentCompetencyIndex]?.followUpsUsed ?? 0)
        : 0;

    if (used >= cap) {
        return {
            allow: false,
            downgraded: true,
            override: false,
            reason: `follow-up cap reached for this section (${used}/${cap})`,
        };
    }

    return { allow: true, downgraded: false, override: false, reason: "caps clear" };
}
