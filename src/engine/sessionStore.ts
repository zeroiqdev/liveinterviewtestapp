/* ══════════════════════════════════════
   Session store — MongoDB-backed with an
   in-process cache.

   Serverless deployments route each turn
   to whichever instance is free, so the
   database is the source of truth. When
   MONGODB_URI is not set (local dev) the
   store falls back to memory only.
   ══════════════════════════════════════ */

import { createHash } from "crypto";
import dbConnect from "@/lib/mongodb";
import { EngineProfileModel, EngineSessionModel, PreparedTurnModel } from "@/models/EngineSession";
import type { CandidateProfile, SessionDoc } from "./types";

interface StoreShape {
    sessions: Map<string, SessionDoc>;
    profiles: Map<string, CandidateProfile>;
    warnedNoDb: boolean;
}

const globalStore = globalThis as unknown as { __useladderStore?: StoreShape };

if (!globalStore.__useladderStore) {
    globalStore.__useladderStore = {
        sessions: new Map(),
        profiles: new Map(),
        warnedNoDb: false,
    };
}

const store = globalStore.__useladderStore;

/** Returns true when MongoDB is reachable; logs once when it is not. */
async function dbAvailable(): Promise<boolean> {
    if (!process.env.MONGODB_URI) {
        if (!store.warnedNoDb) {
            console.warn("[sessionStore] MONGODB_URI not set — interview sessions are in-memory only (single instance).");
            store.warnedNoDb = true;
        }
        return false;
    }
    try {
        // dbConnect fails fast for a short window after a failed connect,
        // so an outage does not add a 5s timeout to every read and write.
        await dbConnect();
        return true;
    } catch (err) {
        console.warn("[sessionStore] MongoDB unavailable, using in-memory store:", (err as Error).message);
        return false;
    }
}

export async function saveSession(session: SessionDoc): Promise<void> {
    store.sessions.set(session.sessionId, session);
    if (!(await dbAvailable())) return;
    try {
        await EngineSessionModel.updateOne(
            { _id: session.sessionId },
            { $set: { ownerId: session.ownerId ?? null, doc: session, updatedAt: new Date() } },
            { upsert: true }
        );
    } catch (err) {
        console.warn("[sessionStore] Failed to persist session:", (err as Error).message);
    }
}

export async function getSession(sessionId: string): Promise<SessionDoc | null> {
    // The database wins over the local cache: another instance may have
    // advanced this session since we last saw it.
    if (await dbAvailable()) {
        try {
            const row = await EngineSessionModel.findById(sessionId).lean<{ doc: SessionDoc }>();
            if (row?.doc) {
                store.sessions.set(sessionId, row.doc);
                return row.doc;
            }
        } catch (err) {
            console.warn("[sessionStore] Failed to read session:", (err as Error).message);
        }
    }
    return store.sessions.get(sessionId) ?? null;
}

export async function saveProfile(profile: CandidateProfile): Promise<void> {
    store.profiles.set(profile.candidateId, profile);
    if (!(await dbAvailable())) return;
    try {
        await EngineProfileModel.updateOne(
            { _id: profile.candidateId },
            { $set: { doc: profile, updatedAt: new Date() } },
            { upsert: true }
        );
    } catch (err) {
        console.warn("[sessionStore] Failed to persist profile:", (err as Error).message);
    }
}

export async function getProfile(candidateId: string): Promise<CandidateProfile | null> {
    if (await dbAvailable()) {
        try {
            const row = await EngineProfileModel.findById(candidateId).lean<{ doc: CandidateProfile }>();
            if (row?.doc) {
                store.profiles.set(candidateId, row.doc);
                return row.doc;
            }
        } catch (err) {
            console.warn("[sessionStore] Failed to read profile:", (err as Error).message);
        }
    }
    return store.profiles.get(candidateId) ?? null;
}

/* ── Drafted turn decisions (shared across instances) ──
   One row per drafted answer snapshot (several per turn while the candidate
   talks), so a later draft never replaces one the client has already spoken. */

export interface StoredPreparedTurn<T> {
    answerText: string;
    turnCount: number;
    decision: T;
    expiresAt: number;
}

type DraftRow<T> = { answerText: string; turnCount: number; decision: T; expiresAt: Date };

export function draftKey(sessionId: string, answerText: string): string {
    const norm = answerText.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
    return `${sessionId}:${createHash("sha1").update(norm).digest("hex")}`;
}

function fromRow<T>(row: DraftRow<T>): StoredPreparedTurn<T> {
    return { ...row, expiresAt: new Date(row.expiresAt).getTime() };
}

export async function savePreparedTurn<T>(sessionId: string, prepared: StoredPreparedTurn<T>): Promise<void> {
    if (!(await dbAvailable())) return;
    try {
        await PreparedTurnModel.updateOne(
            { _id: draftKey(sessionId, prepared.answerText) },
            {
                $set: {
                    sessionId,
                    answerText: prepared.answerText,
                    answerWords: prepared.answerText.split(/\s+/).filter(Boolean).length,
                    turnCount: prepared.turnCount,
                    decision: prepared.decision,
                    expiresAt: new Date(prepared.expiresAt),
                },
            },
            { upsert: true }
        );
    } catch (err) {
        console.warn("[sessionStore] Failed to persist prepared turn:", (err as Error).message);
    }
}

/** The draft made from exactly this answer snapshot, if stored. */
export async function takePreparedTurn<T>(sessionId: string, answerText: string): Promise<StoredPreparedTurn<T> | null> {
    if (!(await dbAvailable())) return null;
    try {
        const row = await PreparedTurnModel.findOneAndDelete({ _id: draftKey(sessionId, answerText) }).lean<DraftRow<T>>();
        return row ? fromRow(row) : null;
    } catch (err) {
        console.warn("[sessionStore] Failed to read prepared turn:", (err as Error).message);
        return null;
    }
}

/** The longest stored draft for this turn that the final answer still matches. */
export async function takeBestPreparedTurn<T>(
    sessionId: string,
    turnCount: number,
    matches: (draftAnswer: string) => boolean
): Promise<StoredPreparedTurn<T> | null> {
    if (!(await dbAvailable())) return null;
    try {
        const rows = await PreparedTurnModel.find({ sessionId, turnCount })
            .select("answerText turnCount decision expiresAt")
            .lean<Array<DraftRow<T> & { _id: string }>>();
        const best = rows
            .filter((row) => matches(row.answerText))
            .sort((a, b) => b.answerText.length - a.answerText.length)[0];
        if (!best) return null;
        await PreparedTurnModel.deleteOne({ _id: best._id });
        return fromRow(best);
    } catch (err) {
        console.warn("[sessionStore] Failed to read prepared turns:", (err as Error).message);
        return null;
    }
}

/** Drop a session's leftover drafts once a turn is committed. */
export function clearPreparedTurns(sessionId: string): void {
    void dbAvailable()
        .then((ok) => (ok ? PreparedTurnModel.deleteMany({ sessionId }) : undefined))
        .catch(() => undefined);
}
