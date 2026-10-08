"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { detectVoiceCommand } from "../engine/voiceCommands";

/** How often the silence clock is checked. */
const POLL_MS = 100;
/**
 * The mic may report "speech" from steady background noise. If it does so for
 * this long with no new transcript, stop trusting it and fall back to the
 * transcript alone so noise can't hold a turn open.
 */
const VOICE_WITHOUT_TEXT_MAX_MS = 4000;

/**
 * Drafting the reply while the candidate is still talking: at a natural pause
 * of this length, once enough new words have arrived since the last draft.
 */
const DRAFT_PAUSE_MS = 350;
const DRAFT_MIN_NEW_WORDS = 8;
const DRAFT_MIN_WORDS = 10;
const DRAFT_MIN_INTERVAL_MS = 1500;

/** Silence that ends a turn when the reply to it is already drafted and ready. */
const READY_ENDPOINT_MS = 1200;

/** Answers ending like this are mid-thought and get the longest pause. */
const TRAILING_THOUGHT =
    /(,|—|\.\.\.)\s*$|\b(and|or|so|but|because|like|um|uh|er|right|where|when|that|which|also|then|actually|specifically|such as|for example|i was|we were|i had|we had|i think|to|well|meaning|sort of|kind of|the|a|an|of|with|in|on|my|our)\s*$/i;

export interface EndpointOptions {
    minDelayMs: number;
    maxDelayMs: number;
    minWords: number;
}

/**
 * Silence (in ms of actual quiet after the candidate's voice stops) that ends
 * a turn. Natural pauses at sentence boundaries run ~0.5–1.5s, so normal
 * answers need ~2s; longer stories get a little more, a thought that is
 * clearly unfinished gets the most, and explicit commands ("next question")
 * end quickly.
 */
export function endpointDelayMs(answer: string, opts: EndpointOptions): number {
    const words = answer.split(/\s+/).filter(Boolean).length;
    if (detectVoiceCommand(answer) !== null) return 700;
    if (TRAILING_THOUGHT.test(answer.trim())) return opts.maxDelayMs;
    if (words < opts.minWords) return Math.min(opts.maxDelayMs, opts.minDelayMs + 400);
    return Math.min(opts.maxDelayMs - 500, opts.minDelayMs + Math.min(words, 60) * 8);
}

export interface VoiceState {
    /** Mic currently hears the candidate. */
    speaking: boolean;
    /** Last time (ms) the mic heard the candidate. */
    lastAt: number;
}

interface UseTurnDetectionOptions {
    enabled: boolean;
    isAiSpeaking: boolean;
    isEngineBusy: boolean;
    /** Live interim + final text. */
    activityTranscript?: string;
    /** Finalized STT text. */
    currentTranscript: string;
    /**
     * Mic-level voice activity. The silence clock runs from the later of the
     * last transcript change and the last moment the mic heard the candidate,
     * so a turn never ends while they are audibly speaking and transcription
     * lag doesn't shorten the pause they get.
     */
    getVoiceState?: () => VoiceState;
    minDelayMs?: number;
    maxDelayMs?: number;
    minWords?: number;
    /** Silence after which a final draft of the reply is prepared (never submitted). */
    preparationDelayMs?: number;
    /**
     * Draft the reply from the answer so far. Called at natural pauses while
     * the candidate is still talking, and once more when they go quiet, so the
     * next line is usually ready the moment their turn ends.
     */
    onTurnLikelyComplete?: (transcript: string) => void;
    /**
     * A reply to this answer is already drafted and ready to speak. Then the
     * turn can end sooner (READY_ENDPOINT_MS), like a person who knows what
     * to say next — unless the answer is clearly unfinished.
     */
    isAnswerReady?: (transcript: string) => boolean;
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
    getVoiceState,
    minDelayMs = 2000,
    maxDelayMs = 3000,
    minWords = 5,
    preparationDelayMs = 400,
    onTurnLikelyComplete,
    isAnswerReady,
    onTurnActivity,
    onTurnComplete,
}: UseTurnDetectionOptions) {
    const [silenceRemainingMs, setSilenceRemainingMs] = useState<number | null>(null);
    const [isCountingDown, setIsCountingDown] = useState(false);

    const answerRef = useRef("");
    const lastTextAtRef = useRef(0);
    const preparedForRef = useRef<string | null>(null);
    const draftWordsRef = useRef(0);
    const draftAtRef = useRef(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const callbacks = useRef({ onTurnComplete, onTurnLikelyComplete, onTurnActivity, getVoiceState, isAnswerReady });
    useEffect(() => {
        callbacks.current = { onTurnComplete, onTurnLikelyComplete, onTurnActivity, getVoiceState, isAnswerReady };
    }, [onTurnComplete, onTurnLikelyComplete, onTurnActivity, getVoiceState, isAnswerReady]);

    const optsRef = useRef({ minDelayMs, maxDelayMs, minWords, preparationDelayMs });
    useEffect(() => {
        optsRef.current = { minDelayMs, maxDelayMs, minWords, preparationDelayMs };
    }, [minDelayMs, maxDelayMs, minWords, preparationDelayMs]);

    const stopClock = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsCountingDown(false);
        setSilenceRemainingMs(null);
    }, []);

    const reset = useCallback(() => {
        stopClock();
        answerRef.current = "";
        lastTextAtRef.current = 0;
        preparedForRef.current = null;
        draftWordsRef.current = 0;
        draftAtRef.current = 0;
    }, [stopClock]);

    const active = enabled && !isAiSpeaking && !isEngineBusy;

    // Transcript updates: record the answer and restart the silence clock.
    useEffect(() => {
        if (!active) {
            // Syncs the countdown with external agent state; an immediate reset is intended.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            reset();
            return;
        }

        // Browser STT can hold an answer as interim text and drop it on an
        // auto-restart without finalizing it, so the answer is whichever of
        // the final and live transcripts holds more.
        const finalized = currentTranscript.trim();
        const live = (activityTranscript || finalized).trim();
        const answer = live.length >= finalized.length ? live : finalized;
        if (!answer || answer === answerRef.current) return;

        answerRef.current = answer;
        lastTextAtRef.current = Date.now();
        preparedForRef.current = null;
        callbacks.current.onTurnActivity?.(answer);
    }, [active, currentTranscript, activityTranscript, reset]);

    // The silence clock.
    useEffect(() => {
        if (!active) return;

        intervalRef.current = setInterval(() => {
            const answer = answerRef.current;
            if (!answer) return;

            const now = Date.now();
            const voice = callbacks.current.getVoiceState?.();
            // Trust the mic only while transcription is keeping up with it.
            const voiceTrusted = voice && now - lastTextAtRef.current < VOICE_WITHOUT_TEXT_MAX_MS;
            if (voiceTrusted && voice.speaking) {
                setIsCountingDown(false);
                setSilenceRemainingMs(null);
                return;
            }
            const lastSpeechAt = Math.max(lastTextAtRef.current, voiceTrusted ? voice.lastAt : 0);
            const silence = now - lastSpeechAt;

            const { preparationDelayMs: prepMs, ...endpointOpts } = optsRef.current;
            let threshold = endpointDelayMs(answer, endpointOpts);
            // Reply already drafted and ready: respond sooner (never when mid-thought).
            if (threshold < endpointOpts.maxDelayMs && callbacks.current.isAnswerReady?.(answer)) {
                threshold = Math.min(threshold, READY_ENDPOINT_MS);
            }

            if (preparedForRef.current !== answer && detectVoiceCommand(answer) === null) {
                const words = answer.split(/\s+/).filter(Boolean).length;
                // Final draft once they go quiet; earlier drafts at natural
                // pauses mid-answer, throttled so cost stays bounded.
                const finalDraft = silence >= prepMs;
                const midAnswerDraft =
                    silence >= DRAFT_PAUSE_MS &&
                    words >= DRAFT_MIN_WORDS &&
                    words - draftWordsRef.current >= DRAFT_MIN_NEW_WORDS &&
                    now - draftAtRef.current >= DRAFT_MIN_INTERVAL_MS;
                if (finalDraft || midAnswerDraft) {
                    preparedForRef.current = answer;
                    draftWordsRef.current = words;
                    draftAtRef.current = now;
                    callbacks.current.onTurnLikelyComplete?.(answer);
                }
            }

            if (silence >= threshold) {
                answerRef.current = "";
                stopClock();
                callbacks.current.onTurnComplete(answer);
                return;
            }

            setIsCountingDown(true);
            setSilenceRemainingMs(threshold - silence);
        }, POLL_MS);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [active, stopClock]);

    useEffect(() => reset, [reset]);

    return {
        isCountingDown,
        silenceRemainingMs,
        cancelSilence: reset,
    };
}
