import { NextRequest, NextResponse } from "next/server";
import { submitAnswer, toPublicState } from "@/engine/orchestrator";
import { getProfile } from "@/engine/sessionStore";
import { loadOwnedSession } from "@/engine/sessionAccess";
import { getCachedAudio, lookupCachedAudio } from "@/services/ttsService";
import type { Persona } from "@/config/voiceConfig";

import { cleanSpokenAudioText } from "@/engine/conversationalEngine";
import { traceTurn } from "@/engine/turnTrace";

// Cold synthesis (Azure en-NG) takes ~1–1.7s. Waiting for it here returns
// real audio in the turn payload; a shorter budget sends the client to the
// robotic browser-voice fallback for nearly every freshly generated line.
const QUICK_AUDIO_BUDGET_MS = 2500;

async function getQuickAudio(
    text: string,
    persona: Persona,
    jobRegion: string,
    turnId?: string | null
) {
    const audioPromise = getCachedAudio(text, persona, jobRegion, turnId || undefined);
    const quickResult = await Promise.race([
        audioPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), QUICK_AUDIO_BUDGET_MS)),
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
        const body = await req.json();
        const answerText = typeof body?.answerText === "string" ? body.answerText : "";

        // Profile is read fresh each turn from the stored static doc —
        // no re-extraction, just a richer input to the orchestrator.
        const profile = await getProfile(access.session.candidateId);

        const { session, prompt, pacing, toolCall } = await submitAnswer({
            sessionId: id,
            answerText,
            profile,
            turnId: turnId || undefined,
            session: access.session,
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

        if (textToSynthesize) {
            try {
                traceTurn(turnId, "tts_lookup_started");
                const persona = (body?.persona as Persona) || "recruiter";
                const jobRegion = body?.jobRegion || "nigeria";

                // The warm-up keys bank transitions by their exact combined
                // bridge + question text. Prefer that clip first: it gives
                // the prepared bridge immediate playback with no segment gap.
                const isBankTransition = prompt?.kind === "scripted" && toolCall?.tool !== "repeat_question";
                // Only reuse a clip that already exists (warmed by /prepare or
                // the cache script). Waiting on a fresh full-length synthesis
                // here and then again for the first sentence doubled latency.
                const fullClip = isBankTransition
                    ? await lookupCachedAudio(textToSynthesize, persona, jobRegion, turnId || undefined)
                    : null;
                if (fullClip) {
                    audioUrl = fullClip.audioUrl;
                    voiceLabel = fullClip.voiceLabel;
                    audioSegments.push({ text: textToSynthesize, audioUrl: fullClip.audioUrl });
                    traceTurn(turnId, "first_audio_ready", { exactCombined: true });
                } else {
                // Dynamic probes retain the existing fast sentence fallback.
                const sentenceMatches = textToSynthesize.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
                const sentences = sentenceMatches ? sentenceMatches.map((s) => s.trim()).filter(Boolean) : [textToSynthesize];

                if (sentences.length > 1) {
                    // Synthesize first sentence with ultra-low latency for instant TTFA
                    const firstChunkRes = await getQuickAudio(sentences[0], persona, jobRegion, turnId);
                    if (firstChunkRes) {
                        audioUrl = firstChunkRes.audioUrl;
                        voiceLabel = firstChunkRes.voiceLabel;
                        audioSegments.push({ text: sentences[0], audioUrl: firstChunkRes.audioUrl });
                        traceTurn(turnId, "first_audio_ready", { exactCombined: false });

                        // Include following chunks only when the opener is ready.
                        // Otherwise the client uses its immediate full-text fallback.
                        sentences.slice(1).forEach((seg) => {
                            audioSegments.push({ text: seg, audioUrl: "" });
                            getCachedAudio(seg, persona, jobRegion, turnId || undefined).catch(() => {});
                        });
                    } else {
                        sentences.slice(1).forEach((seg) => {
                            getCachedAudio(seg, persona, jobRegion, turnId || undefined).catch(() => {});
                        });
                    }
                } else {
                    const ttsRes = await getQuickAudio(textToSynthesize, persona, jobRegion, turnId);
                    if (ttsRes) {
                        audioUrl = ttsRes.audioUrl;
                        voiceLabel = ttsRes.voiceLabel;
                        audioSegments.push({ text: textToSynthesize, audioUrl: ttsRes.audioUrl });
                    }
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
        return NextResponse.json({
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
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "turn failed";
        const status = message.startsWith("unknown sessionId") ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
