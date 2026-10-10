import { NextRequest, NextResponse, after } from "next/server";
import { DraftUnavailableError, submitAnswer, toPublicState } from "@/engine/orchestrator";
import { getProfile, saveSession } from "@/engine/sessionStore";
import { loadOwnedSession } from "@/engine/sessionAccess";
import { getCachedAudio, lookupCachedAudio } from "@/services/ttsService";
import { liveAudioTiming } from "@/config/voiceConfig";
import type { Persona } from "@/config/voiceConfig";

import { cleanSpokenAudioText, replySegments } from "@/engine/conversationalEngine";
import { traceTurn } from "@/engine/turnTrace";
import { serverError } from "@/lib/apiError";

// Cold synthesis (Azure en-NG) takes ~1–1.7s. Waiting for it here returns
// real audio in the turn payload; a shorter budget sends the client to the
// robotic browser-voice fallback for nearly every freshly generated line.
async function getQuickAudio(
    text: string,
    persona: Persona,
    jobRegion: string,
    turnId?: string | null
) {
    const audioPromise = getCachedAudio(text, persona, jobRegion, turnId || undefined);
    const quickResult = await Promise.race([
        audioPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), liveAudioTiming(persona, jobRegion).quickBudgetMs)),
    ]);

    // Keep warming the persistent cache after the response when a cold
    // synthesis misses the live turn latency budget.
    if (!quickResult) void audioPromise.catch(() => undefined);
    return quickResult;
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const turnId = req.headers.get("x-onscript-turn-id");
        traceTurn(turnId, "turn_request_received");
        const access = await loadOwnedSession(req, id);
        if ("errorResponse" in access) return access.errorResponse;

        // Client retry of a turn that already completed (e.g. the response was
        // lost): replay the result rather than applying the answer again.
        if (turnId && access.session.lastTurn?.turnId === turnId) {
            traceTurn(turnId, "turn_replayed");
            return NextResponse.json(access.session.lastTurn.response);
        }

        const body = await req.json();
        const answerText = typeof body?.answerText === "string" ? body.answerText : "";
        // The client already started speaking this draft (and has its audio).
        const spokenDraft = typeof body?.spokenDraft === "string" && body.spokenDraft.trim() ? body.spokenDraft : undefined;

        // Profile is read fresh each turn from the stored static doc —
        // no re-extraction, just a richer input to the orchestrator.
        const profile = await getProfile(access.session.candidateId);

        const { session, prompt, pacing, toolCall } = await submitAnswer({
            sessionId: id,
            answerText,
            profile,
            turnId: turnId || undefined,
            session: access.session,
            spokenDraft,
        });
        traceTurn(turnId, "engine_completed");

        // Fast server-side audio resolution: Return audioUrl directly in the turn payload
        // to eliminate an entire extra HTTP client round-trip to /api/tts!
        let audioUrl: string | null = null;
        let voiceLabel: string | null = null;
        let endCall: { reason: string; systemMessage: string } | null = null;

        let rawText = prompt?.text || "";
        if (rawText.includes("end_call{")) {
            const reasonMatch = rawText.match(/reason:\s*([\s\S]*?)(?:,system__message_to_speak|$)/);
            const msgMatch = rawText.match(/system__message_to_speak:\s*([^}]+)/);
            endCall = {
                reason: reasonMatch ? reasonMatch[1].trim() : "Candidate requested to end call",
                systemMessage: msgMatch ? msgMatch[1].trim() : "Thank you for taking the time to speak with me today.",
            };
            rawText = endCall.systemMessage;
        }

        const textToSynthesize = cleanSpokenAudioText(rawText);
        const audioSegments: Array<{ text: string; audioUrl: string }> = [];
        let leadInDropped = false;

        // A spoken draft is already playing on the client with its own audio.
        if (textToSynthesize && !spokenDraft) {
            try {
                traceTurn(turnId, "tts_lookup_started");
                const persona = (body?.persona as Persona) || "recruiter";
                // Same voice for the whole interview: the region fixed at start.
                const jobRegion = session.voiceRegion || body?.jobRegion || "nigeria";

                // A new question plays as lead-in + bank question; a follow-up
                // by sentence. Clips were usually recorded during the draft.
                const segments = endCall
                    ? replySegments({ text: textToSynthesize })
                    : replySegments({ text: textToSynthesize, bridge: prompt?.bridge, question: prompt?.question });
                let segmentLookups = await Promise.all(
                    segments.map((segment) => lookupCachedAudio(segment, persona, jobRegion, turnId || undefined))
                );
                // New question whose answer-specific lead-in wasn't recorded in a
                // draft, but whose bank question was: don't make the candidate wait
                // ~1.5s for the lead-in — the client says a transition instead.
                const questionRecorded = Boolean(prompt?.question && segmentLookups[segments.length - 1]);
                const leadInMissing = segments.length > 1 && segmentLookups.slice(0, -1).some((hit) => !hit);
                if (prompt?.bridge && questionRecorded && leadInMissing) {
                    segments.slice(0, -1).forEach((segment) =>
                        getCachedAudio(segment, persona, jobRegion, turnId || undefined).catch(() => {})
                    );
                    leadInDropped = true;
                    segments.splice(0, segments.length - 1);
                    segmentLookups = segmentLookups.slice(-1);
                    traceTurn(turnId, "lead_in_dropped");
                }
                if (segments.length > 0) {
                    // Start every missing clip now so later ones are ready by the
                    // time the client reaches them; only the first gates the response.
                    segments.slice(1).forEach((segment, i) => {
                        if (!segmentLookups[i + 1]) getCachedAudio(segment, persona, jobRegion, turnId || undefined).catch(() => {});
                    });
                    const first = segmentLookups[0] ?? (await getQuickAudio(segments[0], persona, jobRegion, turnId));
                    if (first) {
                        audioUrl = first.audioUrl;
                        voiceLabel = first.voiceLabel;
                        traceTurn(turnId, "first_audio_ready", { exactCombined: false, recorded: Boolean(segmentLookups[0]) });
                        segments.forEach((segment, i) =>
                            audioSegments.push({
                                text: segment,
                                audioUrl: i === 0 ? first.audioUrl : (segmentLookups[i]?.audioUrl ?? ""),
                            })
                        );
                    }
                }
            } catch (ttsErr) {
                console.warn("[turn/route] Server-side TTS synthesis skipped:", ttsErr);
            } finally {
                traceTurn(turnId, "tts_lookup_completed", { hasAudio: Boolean(audioUrl) });
            }
        }

        const resolvedToolCall = toolCall || (endCall ? {
            tool: "end_call",
            reason: endCall.reason,
            systemMessage: endCall.systemMessage,
        } : undefined);

        traceTurn(turnId, "turn_response_sent", { hasAudio: Boolean(audioUrl) });
        if (leadInDropped && prompt.question) {
            // Keep the record true to what was actually said.
            const spoken = prompt.question;
            const lastInterviewerTurn = [...session.transcript].reverse().find((t) => t.role === "interviewer");
            if (lastInterviewerTurn?.text === prompt.text) lastInterviewerTurn.text = spoken;
            if (session.pendingQuestion?.text === prompt.text) session.pendingQuestion.text = spoken;
            if (session.probeThread?.rootQuestion === prompt.text) session.probeThread.rootQuestion = spoken;
            prompt.text = spoken;
            prompt.bridge = null;
        }

        const response = {
            prompt: {
                ...prompt,
                text: endCall ? endCall.systemMessage : prompt.text,
            },
            state: toPublicState(session, pacing.mode),
            audioUrl,
            audioSegments: audioSegments.length > 0 ? audioSegments : undefined,
            voiceLabel,
            endCall,
            toolCall: resolvedToolCall,
        };
        if (turnId) session.lastTurn = { turnId, response };
        if (turnId || leadInDropped) {
            // After the response is sent; the turn itself was already saved.
            after(() => saveSession(session).catch(() => undefined));
        }
        return NextResponse.json(response);
    } catch (err) {
        if (err instanceof DraftUnavailableError) {
            // Nothing was changed; the client resubmits without the draft.
            return NextResponse.json({ error: "draft unavailable", code: "draft_unavailable" }, { status: 409 });
        }
        const message = err instanceof Error ? err.message : "";
        if (message.startsWith("unknown sessionId")) {
            return NextResponse.json({ error: "unknown session" }, { status: 404 });
        }
        return serverError("api/engine/turn", err, "turn failed");
    }
}
