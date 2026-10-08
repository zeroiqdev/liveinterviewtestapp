import { NextRequest, NextResponse } from "next/server";
import { loadOwnedSession, ownerIdFor } from "@/engine/sessionAccess";
import { signRelayToken } from "@/lib/relayToken";
import { LIMITS, rateLimit } from "@/lib/rateLimit";

/** Issues a 2-minute token for connecting to the realtime voice relay. */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const access = await loadOwnedSession(req, id);
    if ("errorResponse" in access) return access.errorResponse;
    const limited = await rateLimit(LIMITS.realtime, `user:${access.auth.email}`);
    if (limited) return limited;

    const token = await signRelayToken({ sessionId: id, ownerId: ownerIdFor(access.auth) });
    return NextResponse.json({
        token,
        relayUrl: process.env.NEXT_PUBLIC_VOICE_RELAY_URL || "ws://localhost:8787",
    });
}
