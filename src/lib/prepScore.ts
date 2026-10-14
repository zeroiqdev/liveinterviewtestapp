/**
 * Prep Score: how ready someone is, from the practice they have actually done.
 *
 * It answers two questions together:
 *   - How good were their recent answers? The scores of their last few
 *     interviews, with the most recent counting most.
 *   - Have they practised enough for that to mean something? One good
 *     interview is a promising start, not proof, so the score is held back
 *     until a handful of full-length interviews are behind them.
 *
 * An interview abandoned after a minute or two counts for little on both.
 */

export interface PracticeSession {
    /** The interview's overall score, 0–100. */
    score: number;
    /** How long the interview lasted. */
    minutes: number;
    /** When it finished (ISO date). */
    at: string;
}

/** How many of the most recent interviews the score looks at. */
export const RECENT_SESSIONS = 5;
/** An interview at least this long counts in full; a shorter one counts in proportion. */
export const FULL_SESSION_MINUTES = 8;
/** Share of the answer quality that one's first interview can earn; the rest comes with practice. */
const BASE_SHARE = 0.5;

function lengthWeight(minutes: number): number {
    return Math.min(1, Math.max(0, minutes) / FULL_SESSION_MINUTES);
}

export interface PrepScore {
    /** 0–100. */
    score: number;
    /** Recency-weighted quality of recent answers, 0–100 (before the practice adjustment). */
    answerQuality: number;
    /** Full-length interviews' worth of recent practice, 0–RECENT_SESSIONS. */
    practiceDone: number;
    /** Full-length interviews still needed for the score to count in full. */
    sessionsToFull: number;
}

export function prepScore(sessions: PracticeSession[]): PrepScore {
    const recent = [...sessions].sort((a, b) => b.at.localeCompare(a.at)).slice(0, RECENT_SESSIONS);

    let weighted = 0;
    let weights = 0;
    let practiceDone = 0;
    recent.forEach((session, index) => {
        const length = lengthWeight(session.minutes);
        // Newest counts 5, then 4, 3, 2, 1.
        const weight = (RECENT_SESSIONS - index) * length;
        weighted += Math.min(100, Math.max(0, session.score)) * weight;
        weights += weight;
        practiceDone += length;
    });

    const answerQuality = weights > 0 ? weighted / weights : 0;
    const practiceShare = Math.min(1, practiceDone / RECENT_SESSIONS);
    return {
        score: Math.round(answerQuality * (BASE_SHARE + (1 - BASE_SHARE) * practiceShare)),
        answerQuality: Math.round(answerQuality),
        practiceDone: Math.round(practiceDone * 10) / 10,
        sessionsToFull: Math.max(0, Math.ceil(RECENT_SESSIONS - practiceDone)),
    };
}

/**
 * Accounts from before individual interviews were kept only have a count and
 * an average: treat that as up to five full interviews at the average.
 */
export function sessionsFromTotals(interviewsCompleted: number, averageScore: number): PracticeSession[] {
    const count = Math.min(RECENT_SESSIONS, Math.max(0, Math.floor(interviewsCompleted)));
    return Array.from({ length: count }, (_, index) => ({
        score: averageScore,
        minutes: FULL_SESSION_MINUTES,
        at: new Date(index).toISOString(),
    }));
}
