import { NextRequest, NextResponse, after } from "next/server";
import { startSession, toPublicState } from "@/engine/orchestrator";
import { getBlueprint } from "@/engine/data";
import { getProfile } from "@/engine/sessionStore";
import { ownerIdFor } from "@/engine/sessionAccess";
import { requireAuth } from "@/lib/session";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";
import { cleanSpokenAudioText, splitSpokenSentences } from "@/engine/conversationalEngine";
import { getCachedAudio } from "@/services/ttsService";
import { normalizeRegion } from "@/utils/regionNormalizer";

/** Upper bound on preparing the opening audio before giving up on it. */
const OPENING_AUDIO_BUDGET_MS = 15_000;

/**
 * Synthesize the opening line before the interview starts, one clip per
 * sentence in parallel (short clips synthesize faster than one long one).
 * Returns null if it can't be ready in time; the client then fetches it.
 */
async function prepareOpeningAudio(text: string, region: string) {
    const spoken = cleanSpokenAudioText(text);
    if (!spoken) return null;
    const sentences = splitSpokenSentences(spoken);
    const synthesis = Promise.all(sentences.map((sentence) => getCachedAudio(sentence, "recruiter", region)));
    const results = await Promise.race([
        synthesis,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), OPENING_AUDIO_BUDGET_MS)),
    ]).catch(() => null);
    if (!results) return null;
    return {
        audioSegments: sentences.map((sentence, i) => ({ text: sentence, audioUrl: results[i].audioUrl })),
        voiceLabel: results[0]?.voiceLabel ?? null,
    };
}

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAuth(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }
        const limited = await rateLimit(LIMITS.interview, `user:${authResult.session.email}`);
        if (limited) return limited;

        const body = await req.json();
        const { blueprintId, interviewType, candidateName, companyName, probeDepth, jobRegion } = body || {};
        // The interviewer's voice is chosen once here and kept for the session.
        const voiceRegion = normalizeRegion(typeof jobRegion === "string" && jobRegion ? jobRegion : "nigeria");
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
            voiceRegion,
        });

        // Ready the first question's audio now so it plays the moment the
        // interview starts, in the same voice as every later question.
        const opening = prompt.text ? await prepareOpeningAudio(prompt.text, voiceRegion) : null;
        // The resume-line question is fixed from the start; record it too.
        const resumeText = session.resumeQuestion?.text;
        if (resumeText) {
            after(() => getCachedAudio(cleanSpokenAudioText(resumeText), "recruiter", voiceRegion).catch(() => undefined));
        }

        return NextResponse.json({
            sessionId: session.sessionId,
            prompt,
            state: toPublicState(session),
            voiceRegion,
            audioSegments: opening?.audioSegments,
            voiceLabel: opening?.voiceLabel ?? null,
        });
    } catch (err) {
        return serverError("api/engine/session", err, "session start failed");
    }
}
