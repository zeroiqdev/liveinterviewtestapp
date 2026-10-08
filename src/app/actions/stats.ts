"use server";

import { cookies } from "next/headers";
import dbConnect from "@/lib/mongodb";
import UserStatsModel from "@/models/UserStats";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/sessionToken";

const DEFAULT_SKILLS = [
    { name: "Professionalism", value: 0 },
    { name: "Leadership", value: 0 },
    { name: "Creative", value: 0 },
    { name: "Communication", value: 0 },
    { name: "Attitude", value: 0 },
    { name: "Sociability", value: 0 },
];

/**
 * Server actions are public POST endpoints, so the user always comes from the
 * session cookie. Stats are keyed by the signed-in user's email.
 */
async function currentUserId(): Promise<string> {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    if (!session?.email) throw new Error("Unauthorized");
    return session.email;
}

export async function getUserStatsAction() {
    const userId = await currentUserId();
    await dbConnect();
    
    let stats = await UserStatsModel.findOne({ userId });
    
    // Auto-cleanse legacy mock data from existing DB records
    if (stats && stats.interviewsCompleted === 2 && stats.averageScore === 73) {
        stats.interviewsCompleted = 0;
        stats.averageScore = 0;
        stats.totalPracticeTime = 0;
        stats.skills = DEFAULT_SKILLS;
        await stats.save();
    }
    
    if (!stats) {
        stats = await UserStatsModel.create({
            userId,
            interviewsCompleted: 0,
            averageScore: 0,
            totalPracticeTime: 0,
            skills: DEFAULT_SKILLS
        });
    }
    
    return JSON.parse(JSON.stringify(stats));
}

export async function updateStatsAction(sessionScore: number, durationMinutes: number) {
    const userId = await currentUserId();
    if (!Number.isFinite(sessionScore) || !Number.isFinite(durationMinutes)) return null;
    sessionScore = Math.min(100, Math.max(0, sessionScore));
    durationMinutes = Math.min(180, Math.max(0, durationMinutes));
    await dbConnect();
    
    const current = await UserStatsModel.findOne({ userId });
    if (!current) return null;

    const newCount = current.interviewsCompleted + 1;
    const newAvg = Math.round(((current.averageScore * current.interviewsCompleted) + sessionScore) / newCount);
    const newTime = parseFloat((current.totalPracticeTime + (durationMinutes / 60)).toFixed(1));

    // Update skills based on session
    const newSkills = current.skills.map((s: { name: string; value: number }) => ({
        name: s.name,
        value: Math.min(100, Math.max(0, s.value + (sessionScore > 70 ? 2 : -1)))
    }));

    const updated = await UserStatsModel.findOneAndUpdate(
        { userId },
        {
            interviewsCompleted: newCount,
            averageScore: newAvg,
            totalPracticeTime: newTime,
            skills: newSkills,
            updatedAt: new Date()
        },
        { new: true }
    );

    return JSON.parse(JSON.stringify(updated));
}
