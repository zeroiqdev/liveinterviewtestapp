/**
 * What someone was asked in their recent interviews, so the next one covers
 * new ground: the bank questions to leave out, the questions to steer away
 * from, and the opening lines they've already heard.
 */

import dbConnect from "@/lib/mongodb";
import { EngineSessionModel } from "@/models/EngineSession";
import type { SessionDoc } from "./types";

/** How many past interviews count. Older ones can come round again. */
export const HISTORY_INTERVIEWS = 5;
/** How many past questions are listed for the question picker. */
const HISTORY_QUESTIONS_LISTED = 12;

export interface InterviewHistory {
    questionIds: string[];
    questions: string[];
    openings: string[];
}

export const EMPTY_HISTORY: InterviewHistory = { questionIds: [], questions: [], openings: [] };

type PastSession = Pick<SessionDoc, "topicProgress" | "generalAsked" | "transcript" | "startedAt">;

/** Newest first in, de-duplicated out. */
export function historyFromSessions(sessions: Array<Partial<PastSession>>): InterviewHistory {
    const ids = new Set<string>();
    const questions: string[] = [];
    const openings: string[] = [];
    const sorted = [...sessions].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)).slice(0, HISTORY_INTERVIEWS);
    for (const session of sorted) {
        for (const progress of session.topicProgress ?? []) for (const id of progress.askedQuestionIds ?? []) ids.add(id);
        for (const id of session.generalAsked?.questionIds ?? []) ids.add(id);
        for (const turn of session.transcript ?? []) {
            if (turn.role !== "interviewer") continue;
            if (turn.kind === "opening") openings.push(turn.text);
            else if (turn.kind === "scripted" && !questions.includes(turn.text)) questions.push(turn.text);
        }
    }
    return { questionIds: [...ids], questions: questions.slice(0, HISTORY_QUESTIONS_LISTED), openings };
}

/** The recent interviews of whoever owns these ids (account id and, for older ones, email). */
export async function loadInterviewHistory(ownerIds: string[]): Promise<InterviewHistory> {
    const owners = ownerIds.filter(Boolean);
    if (owners.length === 0 || !process.env.MONGODB_URI) return EMPTY_HISTORY;
    try {
        await dbConnect();
        const docs = await EngineSessionModel.find({ ownerId: { $in: owners } })
            .sort({ "doc.startedAt": -1 })
            .limit(HISTORY_INTERVIEWS)
            .select("doc.topicProgress doc.generalAsked doc.transcript doc.startedAt")
            .lean<Array<{ doc?: Partial<PastSession> }>>();
        return historyFromSessions(docs.map((d) => d.doc ?? {}));
    } catch (err) {
        // Without history the interview still runs; it just may repeat itself.
        console.warn("[history] couldn't load past interviews:", (err as Error).message);
        return EMPTY_HISTORY;
    }
}

/** Whether an opening line was already heard in a recent interview. */
export function heardBefore(opener: string, openings: string[]): boolean {
    const line = opener.trim().toLowerCase();
    return line.length > 0 && openings.some((opening) => opening.toLowerCase().includes(line));
}
