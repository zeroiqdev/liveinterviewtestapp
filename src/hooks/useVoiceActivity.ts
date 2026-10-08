"use client";

import { useEffect, useRef } from "react";

/** Speech must be this many times louder than the background level. */
const NOISE_MARGIN = 2.5;

interface UseVoiceActivityOptions {
    /** Mic stream to monitor (the session's camera/mic preview stream). */
    stream: MediaStream | null;
    enabled: boolean;
    /** RMS level (0..1) treated as speech. Conservative to ignore room noise. */
    threshold?: number;
    /**
     * Track the room's background level and require speech to stand clearly
     * above it (threshold becomes the minimum). Lets a low threshold catch
     * quiet voices without steady noise registering as speech.
     */
    adaptive?: boolean;
    /** Sustained level required before reporting speech start. */
    startMs?: number;
    /** Sustained quiet required before reporting speech end. Must be shorter
     * than the agent's interruption verification window so speaker echo that
     * vanishes once playback pauses is rejected in time. */
    stopMs?: number;
    onSpeechStart: () => void;
    onSpeechEnd: () => void;
}

/**
 * useVoiceActivity
 *
 * Lightweight energy-based VAD on the live mic stream. Used only while the
 * interviewer is speaking, to detect the candidate talking over it (barge-in).
 * Browser speech recognition is off during interviewer speech, so this is the
 * only signal available in that window.
 */
export function useVoiceActivity({
    stream,
    enabled,
    threshold = 0.05,
    adaptive = false,
    startMs = 200,
    stopMs = 250,
    onSpeechStart,
    onSpeechEnd,
}: UseVoiceActivityOptions) {
    const onSpeechStartRef = useRef(onSpeechStart);
    const onSpeechEndRef = useRef(onSpeechEnd);

    useEffect(() => {
        onSpeechStartRef.current = onSpeechStart;
        onSpeechEndRef.current = onSpeechEnd;
    }, [onSpeechStart, onSpeechEnd]);

    useEffect(() => {
        if (!enabled || !stream) return;
        const audioTrack = stream.getAudioTracks().find((t) => t.readyState === "live");
        if (!audioTrack) return;

        const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        const ctx: AudioContext = new AudioCtx();
        // Monitor only the audio track; the stream also carries video.
        const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const samples = new Float32Array(analyser.fftSize);

        let speaking = false;
        let aboveSince: number | null = null;
        let belowSince: number | null = null;
        // Slow-moving estimate of background level, updated only from quiet frames.
        let noiseFloor: number | null = null;

        const timer = setInterval(() => {
            // A disabled (muted) track yields silence, which is what we want.
            analyser.getFloatTimeDomainData(samples);
            let sum = 0;
            for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
            const rms = Math.sqrt(sum / samples.length);
            const now = Date.now();

            let level = threshold;
            if (adaptive) {
                noiseFloor ??= rms;
                level = Math.max(threshold, noiseFloor * NOISE_MARGIN);
                if (rms < level) noiseFloor = noiseFloor * 0.95 + rms * 0.05;
            }

            if (rms >= level) {
                belowSince = null;
                if (!speaking) {
                    aboveSince ??= now;
                    if (now - aboveSince >= startMs) {
                        speaking = true;
                        aboveSince = null;
                        onSpeechStartRef.current();
                    }
                }
            } else {
                aboveSince = null;
                if (speaking) {
                    belowSince ??= now;
                    if (now - belowSince >= stopMs) {
                        speaking = false;
                        belowSince = null;
                        onSpeechEndRef.current();
                    }
                }
            }
        }, 50);

        return () => {
            clearInterval(timer);
            try {
                source.disconnect();
            } catch {}
            ctx.close().catch(() => {});
        };
    }, [enabled, stream, threshold, adaptive, startMs, stopMs]);
}
