import { NextRequest, NextResponse } from "next/server";
import { prepareAnswer } from "@/engine/orchestrator";
import { getProfile, getSession } from "@/engine/sessionStore";
import { traceTurn } from "@/engine/turnTrace";

/**
 * Read-only turn warm-up. This never writes to the interview session or asks
 * the next question; it only prepares the decision for an exact final STT
 * transcript that may arrive a moment later.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { answerText } = await req.json();
        const turnId = req.headers.get("x-onscript-turn-id");
        traceTurn(turnId, "prepare_request_received");
        if (typeof answerText !== "string" || !answerText.trim()) {
            return NextResponse.json({ prepared: false }, { status: 400 });
        }
        const session = getSession(id);
        if (!session) return NextResponse.json({ prepared: false }, { status: 404 });
        const prepared = await prepareAnswer({
            sessionId: id,
            answerText,
            profile: getProfile(session.candidateId),
            turnId: turnId || undefined,
        });
        // The client may begin warming this exact immutable utterance, but it
        // still cannot play anything until endpointing submits the same text.
        return NextResponse.json({
            prepared: Boolean(prepared),
            preparedText: prepared?.spokenText || null,
            action: prepared?.action || null,
            questionId: prepared?.questionId || null,
            bridge: prepared?.bridge || null,
            audioPlan: prepared?.spokenText ? { text: prepared.spokenText } : null,
        });
    } catch {
        // Preparation is strictly opportunistic; a normal submitted turn
        // remains fully functional if this request is cancelled or fails.
        return NextResponse.json({ prepared: false });
    }
}
