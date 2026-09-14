import { NextRequest, NextResponse } from "next/server";
import { toPublicState } from "@/engine/orchestrator";
import { getSession } from "@/engine/sessionStore";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = getSession(id);
    if (!session) {
        return NextResponse.json({ error: "unknown session" }, { status: 404 });
    }
    return NextResponse.json({
        state: toPublicState(session),
        // Fairness backstop: every probe/park/let-go decision with reasoning.
        auditLog: session.auditLog,
        transcript: session.transcript,
    });
}
