"use server";

import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/sessionToken";
import { getUserStats } from "@/lib/userStats";

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

/**
 * The signed-in user's stats. There is deliberately no action to add to them:
 * an interview is counted by the server when it stores that interview's
 * report (api/feedback/generate), so a browser can't send itself a score.
 */
export async function getUserStatsAction() {
    return getUserStats(await currentUserId());
}
