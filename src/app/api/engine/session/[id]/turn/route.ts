import { NextRequest, NextResponse } from "next/server";
import { submitAnswer, toPublicState } from "@/engine/orchestrator";
import { getProfile, getSession } from "@/engine/sessionStore";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const answerText = typeof body?.answerText === "string" ? body.answerText : "";

        // Profile is read fresh each turn from the stored static doc —
        // no re-extraction, just a richer input to the orchestrator.
        const existing = getSession(id);
        const profile = existing ? getProfile(existing.candidateId) : null;

        const { session, prompt, pacing } = await submitAnswer({
            sessionId: id,
            answerText,
            profile,
        });

        return NextResponse.json({
            prompt,
            state: toPublicState(session, pacing.mode),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "turn failed";
        const status = message.startsWith("unknown sessionId") ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
