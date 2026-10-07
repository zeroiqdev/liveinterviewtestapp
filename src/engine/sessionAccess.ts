/* ══════════════════════════════════════
   Session access — every engine route that
   reads or advances a session goes through
   here so only the user who started an
   interview can drive or read it.
   ══════════════════════════════════════ */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, type SessionPayload } from "@/lib/session";
import { getSession } from "./sessionStore";
import type { SessionDoc } from "./types";

export function ownerIdFor(auth: SessionPayload): string {
    return auth.userId || auth.email;
}

export async function loadOwnedSession(
    req: NextRequest | Request,
    sessionId: string
): Promise<{ session: SessionDoc; auth: SessionPayload } | { errorResponse: NextResponse }> {
    const authResult = await requireAuth(req);
    if ("errorResponse" in authResult) return authResult;

    const session = await getSession(sessionId);
    if (!session) {
        return { errorResponse: NextResponse.json({ error: "unknown session" }, { status: 404 }) };
    }

    const auth = authResult.session;
    if (session.ownerId && session.ownerId !== ownerIdFor(auth) && !auth.isAdmin) {
        // Same response as a missing session so ids cannot be probed.
        return { errorResponse: NextResponse.json({ error: "unknown session" }, { status: 404 }) };
    }

    return { session, auth };
}
