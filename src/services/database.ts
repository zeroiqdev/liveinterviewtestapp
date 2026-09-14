/**
 * DATABASE SERVICE (MongoDB via Server Actions)
 * This service abstracts the data fetching logic.
 * It uses Next.js Server Actions to securely interact with MongoDB.
 */

import { getUserStatsAction, updateStatsAction } from "@/app/actions/stats";

export interface UserStats {
    interviewsCompleted: number;
    averageScore: number;
    totalPracticeTime: number; 
    skills: {
        name: string;
        value: number;
    }[];
}

class DatabaseService {
    /**
     * Fetches real user stats from MongoDB.
     */
    async getUserStats(userId: string): Promise<UserStats> {
        try {
            return await getUserStatsAction(userId);
        } catch (error) {
            console.error("Failed to fetch stats from MongoDB:", error);
            // Fallback to empty if DB is not connected yet
            return {
                interviewsCompleted: 0,
                averageScore: 0,
                totalPracticeTime: 0,
                skills: []
            };
        }
    }

    /**
     * Logic to process a new interview result and update the global stats in MongoDB.
     */
    async recordInterviewSession(userId: string, sessionScore: number, durationMinutes: number) {
        try {
            return await updateStatsAction(userId, sessionScore, durationMinutes);
        } catch (error) {
            console.error("Failed to update MongoDB stats:", error);
            return null;
        }
    }
}

export const db = new DatabaseService();
