import { NextRequest, NextResponse, after } from "next/server";
import { startSession, toPublicState } from "@/engine/orchestrator";
import { getBlueprint } from "@/engine/data";
import { getProfile } from "@/engine/sessionStore";
import { ownerIdFor } from "@/engine/sessionAccess";
import { requireAuth } from "@/lib/session";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";
import { cleanSpokenAudioText } from "@/engine/conversationalEngine";
import { getCachedAudio } from "@/services/ttsService";
import { normalizeRegion } from "@/utils/regionNormalizer";
import { liveAudioTiming } from "@/config/voiceConfig";

/** Upper bound on preparing the opening audio before giving up on it. */
const OPENING_AUDIO_BUDGET_MS = 15_000;

/**
 * Ready the opening before the interview starts. It's spoken as separate
 * clips — greeting, intro, first question — so only the short greeting is
 * new; the intro and question are usually already recorded. A handful of
 * requests at most, well inside Azure's rate limit. Returns null if any clip
 * can't be ready in time; the client then fetches the missing ones itself.
 */
async function prepareOpeningAudio(parts: string[], region: string) {
    const spoken = parts.map((part) => cleanSpokenAudioText(part)).filter(Boolean);
    if (spoken.length === 0) return null;
    const results = await Promise.race([
        Promise.all(spoken.map((text) => getCachedAudio(text, "recruiter", region))),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), OPENING_AUDIO_BUDGET_MS)),
    ]).catch((err) => {
        console.warn("[api/engine/session] opening audio failed:", (err as Error).message);
        return null;
    });
    if (!results) return null;
    return {
        audioSegments: spoken.map((text, i) => ({ text, audioUrl: results[i].audioUrl })),
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
        const { blueprintId, interviewType, candidateName, companyName, candidateRole, roleFamily, probeDepth, jobRegion } = body || {};
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
            candidateRole: typeof candidateRole === "string" ? candidateRole.slice(0, 120) : null,
            roleFamily: typeof roleFamily === "string" ? roleFamily.slice(0, 60) : authResult.session.roleFamily || null,
            probeDepth: probeDepth === "deep" ? "deep" : "standard",
            voiceRegion,
        });

        // Ready the first question's audio now so it plays the moment the
        // interview starts, in the same voice as every later question.
        const openingParts = prompt.openingParts ?? (prompt.text ? [prompt.text] : []);
        const opening = openingParts.length ? await prepareOpeningAudio(openingParts, voiceRegion) : null;
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
            // Slower voices get longer for a draft still being recorded.
            lateDraftWaitMs: liveAudioTiming("recruiter", voiceRegion).lateDraftWaitMs,
        });
    } catch (err) {
        return serverError("api/engine/session", err, "session start failed");
    }
}
