/* ══════════════════════════════════════
   Resume bullet question — when a resume
   was provided, the interview always asks
   about one specific line from it, quoted
   back to the candidate, and follows up
   through the normal probe policy if the
   answer doesn't back the claim up.
   ══════════════════════════════════════ */

import type { CandidateProfile, PacingDirective, ProfileClaim, SessionDoc } from "./types";

export const RESUME_QUESTION_ID = "resume_bullet";

export interface ResumeQuestion {
    claim: string;
    sourceLocation: string;
    text: string;
    asked: boolean;
}

/** Vague ownership/impact claims are the best to test; measurable ones next. */
function claimScore(claim: ProfileClaim): number {
    let score = claim.specificity === "vague" ? 3 : 1;
    if (claim.tags.includes("ownership") || claim.tags.includes("scale_impact")) score += 2;
    if (claim.tags.includes("technical_depth")) score += 1;
    if (claim.evidenceStrength === "weak") score += 1;
    return score;
}

function quoteable(text: string): string {
    let claim = text.trim().replace(/^[•\-–*]\s*/, "").replace(/[.;:,\s]+$/, "");
    if (claim.length > 160) claim = `${claim.slice(0, 160).replace(/\s+\S*$/, "")}…`;
    return claim;
}

/** Picks the resume line to ask about, or null when there's no resume content. */
export function pickResumeQuestion(profile: CandidateProfile | null): ResumeQuestion | null {
    if (!profile?.hasProfile.resume) return null;
    const claims = profile.claims.filter((c) => c.sourceLocation.startsWith("resume") && c.text.trim().length >= 12);
    if (claims.length === 0) return null;

    // Highest score wins; ties keep resume order (most recent role first).
    const best = claims.reduce((top, c) => (claimScore(c) > claimScore(top) ? c : top), claims[0]);
    const claim = quoteable(best.text);
    const text =
        best.specificity === "vague"
            ? `On your resume, you mention "${claim}". Can you give me a concrete example of that? What exactly did you do, and what changed as a result?`
            : `On your resume, you mention "${claim}". Walk me through how you achieved that. What was your personal role, and how was the result measured?`;
    return { claim: best.text, sourceLocation: best.sourceLocation, text, asked: false };
}

/**
 * Asked once the opening and at least one main question are done, unless the
 * interview is so short on time that only anchor questions remain.
 */
export function resumeQuestionDue(session: SessionDoc, pacing: PacingDirective): boolean {
    const question = session.resumeQuestion;
    if (!question || question.asked) return false;
    if (pacing.mode === "compressed") return false;
    return session.turnCount >= 2;
}
