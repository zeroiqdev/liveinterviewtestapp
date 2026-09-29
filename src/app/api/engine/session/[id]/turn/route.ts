import { NextRequest, NextResponse } from "next/server";
import { submitAnswer, toPublicState } from "@/engine/orchestrator";
import { getProfile, getSession } from "@/engine/sessionStore";
import { getCachedAudio } from "@/services/ttsService";
import type { Persona } from "@/config/voiceConfig";

import { cleanSpokenAudioText } from "@/engine/conversationalEngine";

const QUICK_AUDIO_BUDGET_MS = 240;

async function getQuickAudio(
    text: string,
    persona: Persona,
    jobRegion: string
) {
    const audioPromise = getCachedAudio(text, persona, jobRegion);
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
        const body = await req.json();
        const answerText = typeof body?.answerText === "string" ? body.answerText : "";

        // Profile is read fresh each turn from the stored static doc —
        // no re-extraction, just a richer input to the orchestrator.
        const existing = getSession(id);
        const profile = existing ? getProfile(existing.candidateId) : null;

        const { session, prompt, pacing, toolCall } = await submitAnswer({
            sessionId: id,
            answerText,
            profile,
        });

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
                const persona = (body?.persona as Persona) || "recruiter";
                const jobRegion = body?.jobRegion || "nigeria";

                // Phase 3: Sentence-level pipelining (LiveKit SpeechHandle architecture)
                const sentenceMatches = textToSynthesize.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
                const sentences = sentenceMatches ? sentenceMatches.map((s) => s.trim()).filter(Boolean) : [textToSynthesize];

                if (sentences.length > 1) {
                    // Synthesize first sentence with ultra-low latency for instant TTFA
                    const firstChunkRes = await getQuickAudio(sentences[0], persona, jobRegion);
                    if (firstChunkRes) {
                        audioUrl = firstChunkRes.audioUrl;
                        voiceLabel = firstChunkRes.voiceLabel;
                        audioSegments.push({ text: sentences[0], audioUrl: firstChunkRes.audioUrl });

                        // Include following chunks only when the opener is ready.
                        // Otherwise the client uses its immediate full-text fallback.
                        sentences.slice(1).forEach((seg) => {
                            audioSegments.push({ text: seg, audioUrl: "" });
                            getCachedAudio(seg, persona, jobRegion).catch(() => {});
                        });
                    } else {
                        sentences.slice(1).forEach((seg) => {
                            getCachedAudio(seg, persona, jobRegion).catch(() => {});
                        });
                    }
                } else {
                    const ttsRes = await getQuickAudio(textToSynthesize, persona, jobRegion);
                    if (ttsRes) {
                        audioUrl = ttsRes.audioUrl;
                        voiceLabel = ttsRes.voiceLabel;
                        audioSegments.push({ text: textToSynthesize, audioUrl: ttsRes.audioUrl });
                    }
                }
            } catch (ttsErr) {
                console.warn("[turn/route] Server-side TTS synthesis skipped:", ttsErr);
            }
        }

        const resolvedToolCall = toolCall || (endCall ? {
            tool: "end_call",
            reason: endCall.reason,
            systemMessage: endCall.systemMessage,
        } : undefined);

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
