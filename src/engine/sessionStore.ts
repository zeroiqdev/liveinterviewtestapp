/* ══════════════════════════════════════
   Session store — MongoDB-backed with an
   in-process cache.

   Serverless deployments route each turn
   to whichever instance is free, so the
   database is the source of truth. When
   MONGODB_URI is not set (local dev) the
   store falls back to memory only.
   ══════════════════════════════════════ */

import dbConnect from "@/lib/mongodb";
import { EngineProfileModel, EngineSessionModel } from "@/models/EngineSession";
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
