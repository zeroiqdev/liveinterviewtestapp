import { NextRequest, NextResponse } from "next/server";
import { startSession, toPublicState } from "@/engine/orchestrator";
import { getBlueprint } from "@/engine/data";
import { getProfile } from "@/engine/sessionStore";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { candidateId, blueprintId } = body || {};

        if (!candidateId || !blueprintId) {
            return NextResponse.json(
                { error: "candidateId and blueprintId are required" },
                { status: 400 }
            );
        }
        if (!getBlueprint(blueprintId)) {
            return NextResponse.json(
                { error: `unknown blueprintId: ${blueprintId}` },
                { status: 404 }
            );
        }

        // Profile is enrichment, not dependency — null is a first-class case.
        const profile = getProfile(candidateId);

        const { session, prompt } = await startSession({
            candidateId,
            blueprintId,
            profile,
        });

        return NextResponse.json({
            sessionId: session.sessionId,
            prompt,
            state: toPublicState(session),
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "session start failed" },
            { status: 500 }
        );
    }
}
