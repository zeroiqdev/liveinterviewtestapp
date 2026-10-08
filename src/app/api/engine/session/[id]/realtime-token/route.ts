import { NextRequest, NextResponse } from "next/server";
import { loadOwnedSession, ownerIdFor } from "@/engine/sessionAccess";
import { signRelayToken } from "@/lib/relayToken";

/** Issues a 2-minute token for connecting to the realtime voice relay. */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const access = await loadOwnedSession(req, id);
    if ("errorResponse" in access) return access.errorResponse;

    const token = await signRelayToken({ sessionId: id, ownerId: ownerIdFor(access.auth) });
    return NextResponse.json({
        token,
        relayUrl: process.env.NEXT_PUBLIC_VOICE_RELAY_URL || "ws://localhost:8787",
    });
}
