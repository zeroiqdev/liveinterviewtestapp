import { NextRequest, NextResponse } from "next/server";
import { toPublicState } from "@/engine/orchestrator";
import { loadOwnedSession } from "@/engine/sessionAccess";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const access = await loadOwnedSession(req, id);
    if ("errorResponse" in access) return access.errorResponse;
    const { session } = access;
    return NextResponse.json({
        state: toPublicState(session),
        // Fairness backstop: every probe/park/let-go decision with reasoning.
        auditLog: session.auditLog,
        transcript: session.transcript,
    });
}
