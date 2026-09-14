/* ══════════════════════════════════════
   Session store — in-memory, per-process.
   Swap for MongoDB/Redis when deploying
   multi-instance; the interface stays.
   ══════════════════════════════════════ */

import type { CandidateProfile, SessionDoc } from "./types";

interface StoreShape {
    sessions: Map<string, SessionDoc>;
    profiles: Map<string, CandidateProfile>;
}

const globalStore = globalThis as unknown as { __useladderStore?: StoreShape };

if (!globalStore.__useladderStore) {
    globalStore.__useladderStore = {
        sessions: new Map(),
        profiles: new Map(),
    };
}

const store = globalStore.__useladderStore;

export function saveSession(session: SessionDoc): void {
    store.sessions.set(session.sessionId, session);
}

export function getSession(sessionId: string): SessionDoc | null {
    return store.sessions.get(sessionId) ?? null;
}

export function saveProfile(profile: CandidateProfile): void {
    store.profiles.set(profile.candidateId, profile);
}

export function getProfile(candidateId: string): CandidateProfile | null {
    return store.profiles.get(candidateId) ?? null;
}
