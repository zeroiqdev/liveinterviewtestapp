/**
 * DATABASE SERVICE (MongoDB via Server Actions)
 * This service abstracts the data fetching logic.
 * It uses Next.js Server Actions to securely interact with MongoDB.
 */

import { getUserStatsAction } from "@/app/actions/stats";
import type { PrepScore } from "@/lib/prepScore";

export interface UserStats {
    interviewsCompleted: number;
    averageScore: number;
    totalPracticeTime: number; 
    skills: {
        name: string;
        value: number;
    }[];
    /** Worked out on the server from recent interviews (see lib/prepScore). */
    prep?: PrepScore;
}

class DatabaseService {
    /**
     * Fetches the signed-in user's stats from MongoDB.
     */
    async getUserStats(): Promise<UserStats> {
        try {
            return await getUserStatsAction();
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
}

export const db = new DatabaseService();
