import { NextRequest, NextResponse } from "next/server";
import { startSession, toPublicState } from "@/engine/orchestrator";
import { getBlueprint } from "@/engine/data";
import { getProfile } from "@/engine/sessionStore";
import { ownerIdFor } from "@/engine/sessionAccess";
import { requireAuth } from "@/lib/session";

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAuth(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }

        const body = await req.json();
        const { blueprintId, interviewType, candidateName, companyName, probeDepth } = body || {};
        // Identity comes from the auth cookie, never the request body, so a
        // client cannot start a session against someone else's profile.
        const candidateId = ownerIdFor(authResult.session);

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
        const profile = await getProfile(candidateId);

        const { session, prompt } = await startSession({
            candidateId,
            ownerId: candidateId,
            blueprintId,
            profile,
            interviewType,
            candidateName,
            companyName,
            probeDepth: probeDepth === "deep" ? "deep" : "standard",
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
