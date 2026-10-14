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
import { claimInterviewStart } from "@/lib/passWallet";
import { isAdminSession } from "@/lib/session";
import dbConnect from "@/lib/mongodb";
import TrySession from "@/models/TrySession";
import { TRY_COOKIE, TRY_QUESTIONS } from "@/lib/tryInterview";
import type { CarryOver } from "@/engine/orchestrator";
import { loadInterviewHistory } from "@/engine/history";

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

        // An interview begun before sign-up carries on here. It is theirs only
        // if this browser holds its cookie, and it can be carried over once.
        const tryId = body?.continueTry ? req.cookies.get(TRY_COOKIE)?.value || "" : "";
        let tried: InstanceType<typeof TrySession> | null = null;
        if (tryId) {
            await dbConnect();
            tried = await TrySession.findOne({ tryId, claimedBy: null });
            if (tried && tried.answers.length < TRY_QUESTIONS) tried = null;
        }

        // The first interview is free; after that an interview needs a pass.
        // Checked last, after the request is known to be valid, so a bad
        // request never uses up a pass or the free interview.
        const entry = await claimInterviewStart(authResult.session.email, await isAdminSession(authResult.session));
        if (!entry.allowed) {
            return NextResponse.json(
                { error: "You've used your free interview. Get a pass to keep practising.", code: "pass_required" },
                { status: 402 }
            );
        }

        // Profile is enrichment, not dependency — null is a first-class case.
        // History: what their recent interviews asked, so this one covers new ground.
        const [profile, history] = await Promise.all([
            getProfile(candidateId),
            loadInterviewHistory([candidateId, authResult.session.email]),
        ]);

        const { session, prompt } = await startSession({
            candidateId,
            ownerId: candidateId,
            blueprintId,
            profile,
            interviewType: tried ? `${tried.title} Interview` : interviewType,
            candidateName,
            companyName: tried ? tried.company || companyName : companyName,
            carryOver: tried
                ? ({
                      title: tried.title,
                      turns: tried.answers.slice(0, TRY_QUESTIONS).map((answer, i) => ({ question: tried!.questions[i], answer: answer.text })),
                      nextQuestions: tried.questions.slice(TRY_QUESTIONS),
                  } satisfies CarryOver)
                : null,
            candidateRole: typeof candidateRole === "string" ? candidateRole.slice(0, 120) : null,
            roleFamily: typeof roleFamily === "string" ? roleFamily.slice(0, 60) : authResult.session.roleFamily || null,
            probeDepth: probeDepth === "deep" ? "deep" : "standard",
            voiceRegion,
            history,
        });

        if (tried) {
            await TrySession.updateOne({ tryId, claimedBy: null }, { $set: { claimedBy: authResult.session.email, claimedSessionId: session.sessionId } });
        }

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
            carriedOver: Boolean(tried),
            audioSegments: opening?.audioSegments,
            voiceLabel: opening?.voiceLabel ?? null,
            // Slower voices get longer for a draft still being recorded.
            lateDraftWaitMs: liveAudioTiming("recruiter", voiceRegion).lateDraftWaitMs,
        });
    } catch (err) {
        return serverError("api/engine/session", err, "session start failed");
    }
}
