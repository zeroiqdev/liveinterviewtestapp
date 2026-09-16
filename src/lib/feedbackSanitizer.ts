import type { FeedbackReportData } from "@/app/api/feedback/generate/route";

/**
 * Transforms third-person candidate phrasing into direct second-person address ("You", "Your").
 * Example: "The candidate completed the session..." -> "You completed the session..."
 */
export function sanitizeToSecondPerson(text: string): string {
    if (!text || typeof text !== "string") return text;
    let s = text;

    // Multi-word phrase conversions
    s = s.replace(/\bthe candidate completed the session\b/gi, "you completed the session");
    s = s.replace(/\bthe candidate completed\b/gi, "you completed");
    s = s.replace(/\bcandidate completed the session\b/gi, "you completed the session");
    s = s.replace(/\bcandidate completed\b/gi, "you completed");
    s = s.replace(/\bthe candidate was\b/gi, "you were");
    s = s.replace(/\bcandidate was\b/gi, "you were");
    s = s.replace(/\bthe candidate has\b/gi, "you have");
    s = s.replace(/\bcandidate has\b/gi, "you have");
    s = s.replace(/\bthe candidate did not\b/gi, "you did not");
    s = s.replace(/\bcandidate did not\b/gi, "you did not");
    s = s.replace(/\bthe candidate did\b/gi, "you did");
    s = s.replace(/\bcandidate did\b/gi, "you did");
    s = s.replace(/\bthe candidate is\b/gi, "you are");
    s = s.replace(/\bcandidate is\b/gi, "you are");
    s = s.replace(/\bthe candidate demonstrated\b/gi, "you demonstrated");
    s = s.replace(/\bcandidate demonstrated\b/gi, "you demonstrated");
    s = s.replace(/\bthe candidate articulated\b/gi, "you articulated");
    s = s.replace(/\bcandidate articulated\b/gi, "you articulated");
    s = s.replace(/\bthe candidate focused\b/gi, "you focused");
    s = s.replace(/\bcandidate focused\b/gi, "you focused");
    s = s.replace(/\bthe candidate provided\b/gi, "you provided");
    s = s.replace(/\bcandidate provided\b/gi, "you provided");
    s = s.replace(/\bthe candidate gave\b/gi, "you gave");
    s = s.replace(/\bcandidate gave\b/gi, "you gave");
    s = s.replace(/\bthe candidate showed\b/gi, "you showed");
    s = s.replace(/\bcandidate showed\b/gi, "you showed");
    s = s.replace(/\bthe candidate answered\b/gi, "you answered");
    s = s.replace(/\bcandidate answered\b/gi, "you answered");
    s = s.replace(/\bthe candidate spoke\b/gi, "you spoke");
    s = s.replace(/\bcandidate spoke\b/gi, "you spoke");
    s = s.replace(/\bthe candidate failed to\b/gi, "you did not");
    s = s.replace(/\bcandidate failed to\b/gi, "you did not");
    s = s.replace(/\bthe candidate's\b/gi, "your");
    s = s.replace(/\bcandidate's\b/gi, "your");
    s = s.replace(/\ba mid-level ([^,.]+) candidate must\b/gi, "as a mid-level $1, you should");
    s = s.replace(/\ba senior ([^,.]+) candidate must\b/gi, "as a senior $1, you should");
    s = s.replace(/\ba ([^,.]+) candidate must\b/gi, "as an aspiring $1, you should");
    s = s.replace(/\ba candidate\b/gi, "an interviewee");
    s = s.replace(/\bthe candidate\b/gi, "you");

    // Possessives & pronouns in performance context
    s = s.replace(/\btheir technical depth\b/gi, "your technical depth");
    s = s.replace(/\btheir system design capabilities\b/gi, "your system design capabilities");
    s = s.replace(/\btheir algorithmic problem-solving\b/gi, "your algorithmic problem-solving");
    s = s.replace(/\btheir answers\b/gi, "your answers");
    s = s.replace(/\btheir responses\b/gi, "your responses");
    s = s.replace(/\btheir communication\b/gi, "your communication");
    s = s.replace(/\btheir delivery\b/gi, "your delivery");
    s = s.replace(/\btheir performance\b/gi, "your performance");
    s = s.replace(/\btheir overall performance\b/gi, "your overall performance");
    s = s.replace(/\btheir background\b/gi, "your background");
    s = s.replace(/\btheir understanding\b/gi, "your understanding");
    s = s.replace(/\bthey should have\b/gi, "you should have");
    s = s.replace(/\bthey could have\b/gi, "you could have");
    s = s.replace(/\bthey need to\b/gi, "you need to");
    s = s.replace(/\bthey demonstrated\b/gi, "you demonstrated");
    s = s.replace(/\bthey articulated\b/gi, "you articulated");
    s = s.replace(/\bthey focused\b/gi, "you focused");

    // Sentence start capitalizations
    s = s.replace(/(^\s*|[.!?]\s+)you completed/g, "$1You completed");
    s = s.replace(/(^\s*|[.!?]\s+)you were/g, "$1You were");
    s = s.replace(/(^\s*|[.!?]\s+)you have/g, "$1You have");
    s = s.replace(/(^\s*|[.!?]\s+)you did/g, "$1You did");
    s = s.replace(/(^\s*|[.!?]\s+)you are/g, "$1You are");
    s = s.replace(/(^\s*|[.!?]\s+)you demonstrated/g, "$1You demonstrated");
    s = s.replace(/(^\s*|[.!?]\s+)you articulated/g, "$1You articulated");
    s = s.replace(/(^\s*|[.!?]\s+)you focused/g, "$1You focused");
    s = s.replace(/(^\s*|[.!?]\s+)you provided/g, "$1You provided");
    s = s.replace(/(^\s*|[.!?]\s+)you gave/g, "$1You gave");
    s = s.replace(/(^\s*|[.!?]\s+)you showed/g, "$1You showed");
    s = s.replace(/(^\s*|[.!?]\s+)your /g, "$1Your ");
    s = s.replace(/(^\s*|[.!?]\s+)you /g, "$1You ");

    return s;
}

/**
 * Sanitizes all fields of FeedbackReportData to second person and guarantees tab completeness.
 * If rawTranscript turns are provided, recovers any questions asked in the interview that are missing from qaBreakdown.
 */
export function sanitizeReportData(
    report: FeedbackReportData,
    rawTranscript?: Array<{ role?: string; sender?: string; text?: string }>
): FeedbackReportData {
    if (!report) return report;

    const sanitized: FeedbackReportData = {
        ...report,
        summary: sanitizeToSecondPerson(report.summary || ""),
        strengths: (report.strengths || []).map((s) => ({
            ...s,
            title: sanitizeToSecondPerson(s.title),
            detail: sanitizeToSecondPerson(s.detail),
            quote: s.quote ? sanitizeToSecondPerson(s.quote) : undefined,
        })),
        improvements: (report.improvements || []).map((imp) => ({
            ...imp,
            title: sanitizeToSecondPerson(imp.title),
            detail: sanitizeToSecondPerson(imp.detail),
            recommendation: sanitizeToSecondPerson(imp.recommendation),
        })),
        quickTips: (report.quickTips || []).map((tip) => sanitizeToSecondPerson(tip)),
        qaBreakdown: (report.qaBreakdown || []).map((qa) => ({
            ...qa,
            question: qa.question,
            candidateAnswer: sanitizeToSecondPerson(qa.candidateAnswer),
            feedback: sanitizeToSecondPerson(qa.feedback),
            modelAnswer: sanitizeToSecondPerson(qa.modelAnswer),
        })),
        responsibilityAlignment: report.responsibilityAlignment
            ? {
                  targetCompany: report.responsibilityAlignment.targetCompany,
                  keyResponsibilitiesEvaluated: report.responsibilityAlignment.keyResponsibilitiesEvaluated || [],
                  alignmentScore: report.responsibilityAlignment.alignmentScore ?? 80,
                  summary: sanitizeToSecondPerson(report.responsibilityAlignment.summary || ""),
                  demonstratedCompetencies: (report.responsibilityAlignment.demonstratedCompetencies || []).map(sanitizeToSecondPerson),
                  underrepresentedAreas: (report.responsibilityAlignment.underrepresentedAreas || []).map(sanitizeToSecondPerson),
                  recommendationsForRole: (report.responsibilityAlignment.recommendationsForRole || []).map(sanitizeToSecondPerson),
              }
            : undefined,
    };

    // Recover any questions asked by interviewer from rawTranscript if omitted from qaBreakdown
    if (Array.isArray(rawTranscript) && rawTranscript.length > 0) {
        const transcriptQuestions: Array<{ question: string; answer: string }> = [];
        for (let i = 0; i < rawTranscript.length; i++) {
            const turn = rawTranscript[i];
            const isInterviewer =
                turn.role === "interviewer" || turn.sender === "AI" || turn.role === "assistant";
            if (isInterviewer && turn.text && turn.text.trim()) {
                let ans = "";
                let j = i + 1;
                while (j < rawTranscript.length) {
                    const next = rawTranscript[j];
                    const isCandidate =
                        next.role === "candidate" || next.sender === "User" || next.role === "user";
                    if (isCandidate && next.text && next.text.trim()) {
                        ans += (ans ? " " : "") + next.text.trim();
                    } else if (!isCandidate) {
                        break;
                    }
                    j++;
                }
                transcriptQuestions.push({
                    question: turn.text.trim(),
                    answer: ans,
                });
            }
        }

        for (const tq of transcriptQuestions) {
            const exists = sanitized.qaBreakdown.some(
                (item) =>
                    item.question.toLowerCase().trim() === tq.question.toLowerCase().trim() ||
                    item.question.toLowerCase().includes(tq.question.toLowerCase().slice(0, 30)) ||
                    tq.question.toLowerCase().includes(item.question.toLowerCase().slice(0, 30))
            );
            if (!exists) {
                const hadAns = Boolean(tq.answer && tq.answer.trim());
                sanitized.qaBreakdown.push({
                    question: tq.question,
                    candidateAnswer: hadAns ? tq.answer : "(No spoken answer recorded)",
                    rating: hadAns ? "Average" : "Needs Work",
                    feedback: hadAns
                        ? "You responded to this question during your interview. Expand on concrete trade-offs, architecture decisions, and measurable outcomes to stand out."
                        : "You did not provide a recorded response to this question during the session. Practice answering this topic using structured STAR framing.",
                    modelAnswer:
                        "Lead with a direct executive summary, explain the underlying technical tradeoffs, and conclude with quantifiable results.",
                });
            }
        }
    }

    // Tab content completeness guarantees
    if (sanitized.strengths.length < 2) {
        sanitized.strengths.push(
            {
                title: "Active Session Engagement",
                detail: "You completed the interview session and stepped through the technical evaluation questions.",
            },
            {
                title: "Role Alignment Baseline",
                detail: "Your background matches the target role requirements and technical expectations for this position.",
            }
        );
    }

    if (sanitized.improvements.length < 2) {
        sanitized.improvements.push(
            {
                title: "Structure Responses with STAR",
                detail: "Lead with the bottom-line result first, then unpack your technical methodology and quantified business impact.",
                recommendation: "Frame every scenario around Situation, Task, Action, and Result with concrete metrics.",
            },
            {
                title: "Proactive Trade-Off Discussion",
                detail: "Explicitly discuss time vs. space complexity, maintainability, and architectural trade-offs.",
                recommendation: "Dedicate the final 30 seconds of your answer to edge cases, rate limits, and recovery procedures.",
            }
        );
    }

    if (sanitized.quickTips.length < 3) {
        sanitized.quickTips.push(
            "Use deliberate 1-2 second pauses instead of filler words when digesting complex questions.",
            "Conclude your answers with a crisp summary sentence to signal you have finished speaking.",
            "Quantify your achievements with concrete metrics like latency reductions, uptime, or business impact."
        );
    }

    return sanitized;
}
