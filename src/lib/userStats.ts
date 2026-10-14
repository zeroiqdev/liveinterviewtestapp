/**
 * A user's practice stats and Prep Score. Server only: the numbers come from
 * interviews the server has a report for, never from a score a browser sends.
 */

import dbConnect from "@/lib/mongodb";
import UserStatsModel from "@/models/UserStats";
import { prepScore, sessionsFromTotals, type PracticeSession } from "@/lib/prepScore";

const DEFAULT_SKILLS = [
    { name: "Professionalism", value: 0 },
    { name: "Leadership", value: 0 },
    { name: "Creative", value: 0 },
    { name: "Communication", value: 0 },
    { name: "Attitude", value: 0 },
    { name: "Sociability", value: 0 },
];

/** Interviews kept per user: more than the score needs, enough to show a trend later. */
const KEPT_SESSIONS = 20;

/** The stats as the dashboard gets them, with the Prep Score worked out. */
function withPrepScore(stats: unknown) {
    const plain = JSON.parse(JSON.stringify(stats));
    const kept: PracticeSession[] = (plain.recentSessions ?? []).map((session: { score: number; minutes: number; at: string }) => ({
        score: session.score,
        minutes: session.minutes,
        at: session.at,
    }));
    const sessions = kept.length > 0 ? kept : sessionsFromTotals(plain.interviewsCompleted, plain.averageScore);
    return { ...plain, prep: prepScore(sessions) };
}

export async function getUserStats(userId: string) {
    await dbConnect();
    let stats = await UserStatsModel.findOne({ userId });

    // Auto-cleanse legacy mock data from existing DB records
    if (stats && stats.interviewsCompleted === 2 && stats.averageScore === 73 && !(stats.recentSessions?.length > 0)) {
        stats.interviewsCompleted = 0;
        stats.averageScore = 0;
        stats.totalPracticeTime = 0;
        stats.skills = DEFAULT_SKILLS;
        await stats.save();
    }
    if (!stats) {
        stats = await UserStatsModel.create({ userId, interviewsCompleted: 0, averageScore: 0, totalPracticeTime: 0, skills: DEFAULT_SKILLS });
    }
    return withPrepScore(stats);
}

/** Adds a finished interview to a user's stats. Call once per interview. */
export async function recordInterview(userId: string, score: number, minutes: number) {
    const sessionScore = Math.min(100, Math.max(0, Math.round(score)));
    const durationMinutes = Math.min(180, Math.max(0, minutes));
    await dbConnect();
    const current =
        (await UserStatsModel.findOne({ userId })) ??
        (await UserStatsModel.create({ userId, interviewsCompleted: 0, averageScore: 0, totalPracticeTime: 0, skills: DEFAULT_SKILLS }));

    const newCount = current.interviewsCompleted + 1;
    const newAvg = Math.round((current.averageScore * current.interviewsCompleted + sessionScore) / newCount);
    const newTime = parseFloat((current.totalPracticeTime + durationMinutes / 60).toFixed(1));
    const newSkills = current.skills.map((s: { name: string; value: number }) => ({
        name: s.name,
        value: Math.min(100, Math.max(0, s.value + (sessionScore > 70 ? 2 : -1))),
    }));

    // Interviews from before each one was kept are carried over from the
    // totals, so the first new interview doesn't wipe out earlier practice.
    const earlier =
        current.recentSessions?.length > 0
            ? current.recentSessions
            : sessionsFromTotals(current.interviewsCompleted, current.averageScore).map((earlierSession) => ({ ...earlierSession, at: new Date(earlierSession.at) }));
    const recentSessions = [...earlier, { score: sessionScore, minutes: durationMinutes, at: new Date() }].slice(-KEPT_SESSIONS);

    const updated = await UserStatsModel.findOneAndUpdate(
        { userId },
        { interviewsCompleted: newCount, averageScore: newAvg, totalPracticeTime: newTime, skills: newSkills, recentSessions, updatedAt: new Date() },
        { new: true }
    );
    return withPrepScore(updated);
}
