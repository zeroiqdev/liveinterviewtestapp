/* ══════════════════════════════════════
   UseLadder Engine — shared types
   One engine, data-driven per role family.
   ══════════════════════════════════════ */

/* ── Blueprints ── */

export interface QuestionPoolFilter {
    role_family: string;
    category_in: string[];
}

export interface QuestionRange {
    min: number;
    max: number;
}

export type Priority = "required" | "important" | "optional";

export interface Competency {
    id: string;
    label: string;
    priority: Priority;
    questionPoolFilter: QuestionPoolFilter;
    targetQuestionRange: QuestionRange;
    maxFollowUps: number;
    minTimeSeconds: number;
    maxTimeSeconds: number;
}

export interface Persona {
    voice: string;
    domainJudgmentNotes: string;
}

export interface Blueprint {
    blueprintId: string;
    role: string;
    level: string;
    totalTimeBudgetSeconds: number;
    generalBehavioral: { targetQuestionRange: QuestionRange };
    persona: Persona;
    competencies: Competency[];
}

export interface GeneralBehavioralPool {
    poolId: string;
    description: string;
    roleFamily: string;
    targetQuestionRange: QuestionRange;
    diversityRule: string;
}

export interface BlueprintFile {
    generalBehavioralPool: GeneralBehavioralPool;
    blueprints: Record<string, Blueprint>;
}

/* ── Question Bank ── */

export interface BankQuestion {
    id: string;
    role_family: string;
    sub_type: string;
    question: string;
    category: string;
    applies_to_all: boolean;
    source: string;
}

/* ── Candidate Profile (extraction output) ── */

export type Specificity = "vague" | "specific";

export interface ProfileClaim {
    text: string;
    specificity: Specificity;
    /** competency ids this claim is evidence for (blueprint-relative) */
    linkedCompetencies: string[];
    /** e.g. "resume:experience[1]", "linkedin:about", "portfolio" */
    sourceLocation: string;
    /** scale_impact | ownership | technical_depth | ambiguous_scope */
    tags: string[];
    evidenceStrength: "strong" | "moderate" | "weak";
}

export interface ProfileRole {
    title: string;
    company: string;
    years: number | null;
}

export interface ProfileProject {
    name: string;
    summary: string;
    linkedRole: string | null;
}

export interface CandidateProfile {
    candidateId: string;
    roles: ProfileRole[];
    yearsTotal: number | null;
    techStack: string[];
    projects: ProfileProject[];
    claims: ProfileClaim[];
    hasProfile: { resume: boolean; linkedin: boolean; portfolio: boolean };
    createdAt: string;
}

/* ── Session (the live mutable doc) ── */

export type SessionPhase =
    | "ask_scripted"
    | "awaiting_answer"
    | "evaluating"
    | "follow_up"
    | "advance"
    | "complete";

export interface TopicProgress {
    competencyId: string;
    askedQuestionIds: string[];
    followUpsUsed: number;
    timeSpentSeconds: number;
    status: "pending" | "in_progress" | "complete" | "skipped";
}

export interface RunningNote {
    turn: number;
    competencyId: string;
    summary: string;
}

export interface ParkingLotEntry {
    topicSummary: string;
    /** competency where the detail surfaced; null = came from profile */
    sourceCompetency: string | null;
    targetCompetency: string;
    turnParked: number;
    resolved: boolean;
}

/* ── Depth probing ── */

/** How hard the interviewer pushes on vague answers. */
export type ProbeDepth = "standard" | "deep";

export type AnswerVerdict = "verified" | "partial" | "vague" | "evasive";

export type ProbeDimension = "specificity" | "ownership" | "depth" | "evidence";

/** Per-answer rubric, 0–3 per dimension. */
export interface AnswerAssessment {
    specificity: number;
    ownership: number;
    depth: number;
    evidence: number;
    verdict: AnswerVerdict;
    weakestDimension: ProbeDimension | null;
    /** Candidate said they don't know / haven't done it — stop probing. */
    saidDontKnow: boolean;
    /** Answer conflicts with an earlier answer or a profile claim. */
    contradiction: boolean;
    /** Short description of what the answer claimed, for notes/feedback. */
    claimSummary: string;
}

/** The chain of follow-ups on one scripted question. */
export interface ProbeThread {
    rootQuestion: string;
    competencyId: string;
    followUps: number;
    lastVerdict: AnswerVerdict | null;
}

/** Outcome of one probed topic, surfaced in the feedback report. */
export interface ProbeFinding {
    turn: number;
    competencyId: string;
    question: string;
    claimSummary: string;
    verdict: AnswerVerdict;
    followUps: number;
    outcome: "verified" | "unresolved" | "said_dont_know" | "budget_exhausted";
}

export interface TranscriptTurn {
    role: "interviewer" | "candidate";
    text: string;
    competencyId: string | null;
    kind: "scripted" | "follow_up" | "answer" | "opening";
    timestamp: string;
}

export interface AuditEntry {
    turn: number;
    module: "selector" | "probe" | "budget" | "governor" | "follow_up" | "initializer" | "finalizer";
    decision: string;
    reason: string;
    timestamp: string;
}

export interface SessionDoc {
    sessionId: string;
    candidateId: string;
    /** Authenticated user that started the session; only they may drive it. */
    ownerId?: string | null;
    blueprintId: string;
    hasProfile: { resume: boolean; linkedin: boolean; portfolio: boolean };
    phase: SessionPhase;
    /** -1 = still in general behavioral section */
    currentCompetencyIndex: number;
    topicProgress: TopicProgress[];
    generalAsked: { questionIds: string[]; categories: string[] };
    runningNotes: RunningNote[];
    parkingLot: ParkingLotEntry[];
    /** Probing intensity chosen at setup (default "standard"). */
    probeDepth?: ProbeDepth;
    /** Follow-up chain for the question currently being answered. */
    probeThread?: ProbeThread | null;
    /** Per-topic probing outcomes for the feedback report. */
    probeFindings?: ProbeFinding[];
    elapsedSeconds: number;
    startedAt: number;
    lastTurnAt: number;
    turnCount: number;
    transcript: TranscriptTurn[];
    auditLog: AuditEntry[];
    /** the last question the interviewer asked (awaiting answer for) */
    pendingQuestion: {
        text: string;
        competencyId: string;
        kind: "scripted" | "follow_up" | "opening";
        questionId: string | null;
    } | null;
    complete: boolean;
    candidateName?: string | null;
    company?: string | null;
    interviewType?: string | null;
    /** The role being practised, as the candidate named it. */
    candidateRole?: string | null;
    roleFamily?: string | null;
    isSpecificJob?: boolean;
    dedicatedInterviewType?: string | null;
    customQuestionPool?: BankQuestion[];
    alreadyAskedQuestionIds?: string[];
    /** Response to the most recent /turn, so a client retry with the same
     *  turn id gets the same result instead of submitting the answer twice. */
    lastTurn?: { turnId: string; response: Record<string, unknown> } | null;
    /** Interviewer voice region, fixed at session start so every line of the
     *  interview is spoken by the same voice. */
    voiceRegion?: string;
    /** Question about one resume line, asked once (see resumeQuestion.ts). */
    resumeQuestion?: { claim: string; sourceLocation: string; text: string; asked: boolean } | null;
}

/* ── Engine I/O ── */

export type PacingMode = "normal" | "tightening" | "compressed";

export interface PacingDirective {
    mode: PacingMode;
    followUpAllowanceMultiplier: number;
    skipOptional: boolean;
    anchorOnly: boolean;
    secondsRemaining: number;
    estimatedSecondsNeeded: number;
    reason: string;
}

export interface ProbeDecision {
    noteworthy: boolean;
    immediacy: "probe_now" | "park" | "let_go";
    reason: string;
    best_fit_competency_if_parked: string | null;
    topic_summary: string | null;
    /** evaluator flags a resume/live contradiction — overrides follow-up caps */
    contradiction?: boolean;
    note_summary: string;
}

export interface EnginePrompt {
    type: "question" | "follow_up" | "complete";
    text: string | null;
    competencyId: string | null;
    competencyLabel: string | null;
    kind: "scripted" | "follow_up" | "opening" | null;
    questionId: string | null;
    /** For a new question: the answer-grounded lead-in, spoken before it. */
    bridge?: string | null;
    /** For a new question: the bank question itself (pre-recorded audio). */
    question?: string | null;
    /** For the opening: greeting, intro and first question, each its own clip. */
    openingParts?: string[];
}

export interface PublicSessionState {
    sessionId: string;
    blueprintId: string;
    role: string;
    phase: SessionPhase;
    complete: boolean;
    elapsedSeconds: number;
    totalTimeBudgetSeconds: number;
    pacing: PacingMode;
    currentSectionLabel: string;
    sectionIndex: number;
    sectionCount: number;
    sections: {
        competencyId: string;
        label: string;
        priority: Priority;
        status: TopicProgress["status"];
        asked: number;
        targetMin: number;
        targetMax: number;
    }[];
    pendingQuestion: SessionDoc["pendingQuestion"];
    turnCount: number;
    upcomingQuestions?: string[];
}
