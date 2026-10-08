"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicSessionState } from "@/engine/types";

/**
 * useVoiceLive
 *
 * Browser side of the realtime voice relay (server/voiceLiveRelay.ts).
 * Streams the microphone as PCM16 mono 24 kHz, plays the interviewer's audio
 * gaplessly, and stops playback the moment the candidate starts talking.
 */

export type VoiceLiveStatus =
    | "idle"
    | "connecting"
    | "listening" // candidate's turn
    | "thinking" // candidate finished; waiting for the interviewer
    | "speaking" // interviewer audio playing
    | "ended"
    | "error";

export interface VoiceLiveTurn {
    role: "interviewer" | "candidate";
    text: string;
}

export interface VoiceLiveConnectOptions {
    relayUrl: string;
    token: string;
    region: string;
    micDeviceId?: string;
}

const TARGET_RATE = 24000;
const FRAME_SAMPLES = 960; // 40 ms at 24 kHz

// Downsamples the mic to 24 kHz and emits 40 ms Int16 frames.
const CAPTURE_WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${TARGET_RATE};
    this.pos = 0;
    this.frame = new Int16Array(${FRAME_SAMPLES});
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (; this.pos < ch.length; this.pos += this.ratio) {
      const s = Math.max(-1, Math.min(1, ch[Math.floor(this.pos)]));
      this.frame[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === ${FRAME_SAMPLES}) {
        this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
        this.frame = new Int16Array(${FRAME_SAMPLES});
        this.n = 0;
      }
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

function base64ToFloat32(b64: string): Float32Array<ArrayBuffer> {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
    const out = new Float32Array(new ArrayBuffer(pcm.length * 4));
    for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 0x8000;
    return out;
}

export function useVoiceLive(handlers?: {
    onComplete?: (sessionId: string, transcript: VoiceLiveTurn[]) => void;
}) {
    const [status, setStatus] = useState<VoiceLiveStatus>("idle");
    const [turns, setTurns] = useState<VoiceLiveTurn[]>([]);
    const [liveAiText, setLiveAiText] = useState("");
    const [engineState, setEngineState] = useState<PublicSessionState | null>(null);
    const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isMuted, setIsMuted] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const captureCtxRef = useRef<AudioContext | null>(null);
    const playCtxRef = useRef<AudioContext | null>(null);
    const nextPlayTimeRef = useRef(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const speakingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const mutedRef = useRef(false);
    const handlersRef = useRef(handlers);
    useEffect(() => {
        handlersRef.current = handlers;
    }, [handlers]);

    const stopPlayback = useCallback(() => {
        sourcesRef.current.forEach((s) => {
            try {
                s.stop();
            } catch {
                /* already stopped */
            }
        });
        sourcesRef.current.clear();
        nextPlayTimeRef.current = 0;
    }, []);

    const playChunk = useCallback((b64: string) => {
        const ctx = playCtxRef.current;
        if (!ctx) return;
        const samples = base64ToFloat32(b64);
        if (!samples.length) return;
        const buffer = ctx.createBuffer(1, samples.length, TARGET_RATE);
        buffer.copyToChannel(samples, 0);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        const startAt = Math.max(ctx.currentTime + 0.02, nextPlayTimeRef.current);
        src.start(startAt);
        nextPlayTimeRef.current = startAt + buffer.duration;
        sourcesRef.current.add(src);
        src.onended = () => sourcesRef.current.delete(src);
        setStatus("speaking");
    }, []);

    const cleanup = useCallback(() => {
        if (speakingTimerRef.current) clearInterval(speakingTimerRef.current);
        speakingTimerRef.current = null;
        stopPlayback();
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
        captureCtxRef.current?.close().catch(() => undefined);
        captureCtxRef.current = null;
        playCtxRef.current?.close().catch(() => undefined);
        playCtxRef.current = null;
        const ws = wsRef.current;
        wsRef.current = null;
        if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    }, [stopPlayback]);

    useEffect(() => cleanup, [cleanup]);

    const connect = useCallback(
        async ({ relayUrl, token, region, micDeviceId }: VoiceLiveConnectOptions) => {
            cleanup();
            setError(null);
            setTurns([]);
            setLiveAiText("");
            setStatus("connecting");

            try {
                const mic = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        ...(micDeviceId ? { deviceId: { exact: micDeviceId } } : {}),
                    },
                });
                micStreamRef.current = mic;

                // Playback context must be created from the user's click.
                const playCtx = new AudioContext();
                await playCtx.resume();
                playCtxRef.current = playCtx;

                const captureCtx = new AudioContext();
                captureCtxRef.current = captureCtx;
                const moduleUrl = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "application/javascript" }));
                await captureCtx.audioWorklet.addModule(moduleUrl);
                URL.revokeObjectURL(moduleUrl);
                const source = captureCtx.createMediaStreamSource(mic);
                const capture = new AudioWorkletNode(captureCtx, "pcm-capture");
                source.connect(capture);

                const ws = new WebSocket(
                    `${relayUrl}/?token=${encodeURIComponent(token)}&region=${encodeURIComponent(region)}`
                );
                ws.binaryType = "arraybuffer";
                wsRef.current = ws;

                capture.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
                    if (ws.readyState !== WebSocket.OPEN) return;
                    // Muted: keep the stream alive with silence so turn detection stays sane.
                    ws.send(mutedRef.current ? new ArrayBuffer(e.data.byteLength) : e.data);
                };

                // Flip back to "listening" once queued interviewer audio has played out.
                speakingTimerRef.current = setInterval(() => {
                    const ctx = playCtxRef.current;
                    if (!ctx) return;
                    setStatus((s) => (s === "speaking" && ctx.currentTime >= nextPlayTimeRef.current ? "listening" : s));
                }, 150);

                ws.onmessage = (ev) => {
                    if (typeof ev.data !== "string") return;
                    const m = JSON.parse(ev.data);
                    switch (m.type) {
                        case "ready":
                            setEngineState(m.state);
                            setStatus("thinking");
                            break;
                        case "audio":
                            playChunk(m.delta);
                            break;
                        case "ai_text_delta":
                            setLiveAiText((t) => t + m.delta);
                            break;
                        case "ai_text":
                            setLiveAiText("");
                            if (m.text) setTurns((t) => [...t, { role: "interviewer", text: m.text }]);
                            break;
                        case "user_speaking":
                            // Barge-in: the service cancels its response; silence ours now.
                            stopPlayback();
                            setLiveAiText("");
                            setStatus("listening");
                            break;
                        case "user_stopped":
                            setStatus("thinking");
                            break;
                        case "user_text":
                            setTurns((t) => [...t, { role: "candidate", text: m.text }]);
                            break;
                        case "decision":
                            setEngineState(m.state);
                            break;
                        case "metrics":
                            setLastLatencyMs(m.firstAudioMs);
                            break;
                        case "complete":
                            setStatus("ended");
                            handlersRef.current?.onComplete?.(m.sessionId, m.transcript ?? []);
                            break;
                        case "error":
                            setError(m.message);
                            break;
                    }
                };
                ws.onclose = () => {
                    setStatus((s) => (s === "ended" ? s : "error"));
                    setError((e) => e ?? "Connection to the interviewer closed.");
                    cleanup();
                };
                ws.onerror = () => setError("Couldn't reach the realtime voice server. Is it running?");
            } catch (err) {
                setStatus("error");
                setError(
                    err instanceof DOMException && err.name === "NotAllowedError"
                        ? "Microphone access was blocked. Allow it in the address bar and try again."
                        : `Couldn't start the voice session: ${(err as Error).message}`
                );
                cleanup();
            }
        },
        [cleanup, playChunk, stopPlayback]
    );

    const end = useCallback(() => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "end" }));
        else cleanup();
    }, [cleanup]);

    const toggleMute = useCallback(() => {
        mutedRef.current = !mutedRef.current;
        setIsMuted(mutedRef.current);
    }, []);

    return { status, turns, liveAiText, engineState, lastLatencyMs, error, isMuted, connect, end, toggleMute };
}
