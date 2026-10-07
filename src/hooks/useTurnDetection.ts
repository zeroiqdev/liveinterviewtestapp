"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { detectVoiceCommand } from "../engine/voiceCommands";

interface UseTurnDetectionOptions {
    enabled: boolean;
    isAiSpeaking: boolean;
    isEngineBusy: boolean;
    /** Live interim + final text used only to keep an open turn alive. */
    activityTranscript?: string;
    /** Finalized STT text. Only this value can be submitted as a turn. */
    currentTranscript: string;
    minDelayMs?: number;
    maxDelayMs?: number;
    alpha?: number;
    minWords?: number; // Default: 3 words
    /** A stable partial answer can be prepared, but is never submitted yet. */
    preparationDelayMs?: number;
    onTurnLikelyComplete?: (transcript: string) => void;
    /** Speech resumed or STT advanced after a preview; caller should abort it. */
    onTurnActivity?: (transcript: string) => void;
    onTurnComplete: (transcript: string) => void;
}

export function useTurnDetection({
    enabled,
    isAiSpeaking,
    isEngineBusy,
    activityTranscript,
    currentTranscript,
    minDelayMs = 2200,
    maxDelayMs = 4500,
    alpha = 0.35,
    minWords = 5,
    preparationDelayMs = 1000,
    onTurnLikelyComplete,
    onTurnActivity,
    onTurnComplete,
}: UseTurnDetectionOptions) {
    const [silenceRemainingMs, setSilenceRemainingMs] = useState<number | null>(null);
    const [isCountingDown, setIsCountingDown] = useState(false);

    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const preparationTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastActivityTextRef = useRef<string>("");
    const hasSpokenThisTurnRef = useRef<boolean>(false);
    const smoothedDelayRef = useRef<number>(minDelayMs);
    const onTurnCompleteRef = useRef(onTurnComplete);
    const onTurnLikelyCompleteRef = useRef(onTurnLikelyComplete);
    const onTurnActivityRef = useRef(onTurnActivity);

    useEffect(() => {
        onTurnCompleteRef.current = onTurnComplete;
    }, [onTurnComplete]);

    useEffect(() => {
        onTurnLikelyCompleteRef.current = onTurnLikelyComplete;
    }, [onTurnLikelyComplete]);
    useEffect(() => { onTurnActivityRef.current = onTurnActivity; }, [onTurnActivity]);

    const cancelSilence = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (preparationTimerRef.current) {
            clearTimeout(preparationTimerRef.current);
            preparationTimerRef.current = null;
        }
        setIsCountingDown(false);
        setSilenceRemainingMs(null);
    }, []);

    useEffect(() => {
        // If detection is disabled, AI is speaking, or engine is processing, reset state
        if (!enabled || isAiSpeaking || isEngineBusy) {
            // This effect synchronizes the displayed countdown with external
            // voice-agent state, so an immediate reset is intentional.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            cancelSilence();
            lastActivityTextRef.current = "";
            hasSpokenThisTurnRef.current = false;
            return;
        }

        const finalized = currentTranscript.trim();
        const activity = (activityTranscript || finalized).trim();
        if (!finalized) {
            cancelSilence();
            return;
        }

        const wordCount = finalized.split(/\s+/).filter(Boolean).length;

        // Check for genuine candidate voice action commands or completion intent
        const isExplicitEnding = detectVoiceCommand(finalized) !== null;

        if (wordCount < 1) {
            cancelSilence();
            return;
        }

        // Active speech: reset silence timer when transcript advances
        // Interim recognition is activity, not a turn. It resets endpointing
        // without ever changing orchestrator state or submitted text.
        if (activity !== lastActivityTextRef.current) {
            // This is a read-only activity signal. It never submits a turn,
            // but lets speculative work be discarded as soon as speech resumes.
            onTurnActivityRef.current?.(finalized || activity);
            lastActivityTextRef.current = activity;
            hasSpokenThisTurnRef.current = true;
            cancelSilence();

            // Trailing thought detection: connective words, commas, hesitation fillers, mid-clause markers
            const isTrailingThought = /[,—\.\.\.]\s*$/i.test(activity) ||
                /\b(and|or|so|but|because|like|um|uh|right|where|when|that|which|also|then|actually|specifically|such as|for example|i was|we were|i had|we had|i think|to|well|meaning|sort of|kind of)\s*$/i.test(activity);

            // Dynamic endpointing is deliberately conservative for formal
            // interviews. Short answers can close quickly; a mid-thought
            // answer gets up to maxDelayMs rather than being cut off at a chatty
            // assistant's cadence. alpha dampens recognition jitter.
            let targetDelay = minDelayMs;
            if (isExplicitEnding) {
                targetDelay = 1200;
            } else if (wordCount < minWords) {
                targetDelay = Math.max(minDelayMs, 2600);
            } else if (isTrailingThought) {
                targetDelay = maxDelayMs;
            } else {
                targetDelay = Math.min(maxDelayMs, minDelayMs + Math.min(wordCount, 80) * 18);
            }
            const effectiveThreshold = Math.round(
                alpha * smoothedDelayRef.current + (1 - alpha) * targetDelay
            );
            smoothedDelayRef.current = effectiveThreshold;

            const startTime = Date.now();
            // This is deliberately a *read-only* early signal. The normal,
            // conservative endpoint timer below remains the sole authority
            // that can submit a candidate turn.
            if (!isExplicitEnding && wordCount >= minWords) {
                const preparationSnapshot = finalized;
                preparationTimerRef.current = setTimeout(() => {
                    onTurnLikelyCompleteRef.current?.(preparationSnapshot);
                }, preparationDelayMs);
            }
            setIsCountingDown(true);
            setSilenceRemainingMs(effectiveThreshold);

            intervalRef.current = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, effectiveThreshold - elapsed);
                setSilenceRemainingMs(remaining);
            }, 100);

            timerRef.current = setTimeout(() => {
                cancelSilence();
                onTurnCompleteRef.current(finalized);
            }, effectiveThreshold);
        }
    }, [currentTranscript, activityTranscript, enabled, isAiSpeaking, isEngineBusy, minWords, minDelayMs, maxDelayMs, alpha, preparationDelayMs, cancelSilence]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cancelSilence();
        };
    }, [cancelSilence]);

    return {
        isCountingDown,
        silenceRemainingMs,
        cancelSilence,
    };
}
