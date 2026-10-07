"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

export type AgentState = "initializing" | "idle" | "listening" | "thinking" | "speaking";

export interface AgentActivityOptions {
    initialState?: AgentState;
    minInterruptionDurationMs?: number; // Default: 480ms — rejects coughs and room noise.
    onStateChange?: (prev: AgentState, current: AgentState) => void;
    onInterruption?: () => void;
    onFalseInterruption?: () => void;
}

/**
 * useAgentActivity
 *
 * Implements LiveKit Agents' canonical AgentActivity state machine.
 * Provides a single source of truth for the voice conversation lifecycle:
 * INITIALIZING -> IDLE -> LISTENING -> THINKING -> SPEAKING -> IDLE
 *
 * Includes false interruption filtering and acoustic hysteresis.
 */
export function useAgentActivity({
    initialState = "idle",
    minInterruptionDurationMs = 480,
    onStateChange,
    onInterruption,
    onFalseInterruption,
}: AgentActivityOptions = {}) {
    const [state, setState] = useState<AgentState>(initialState);
    const [isPausedForVerification, setIsPausedForVerification] = useState(false);
    const stateRef = useRef<AgentState>(initialState);

    const falseInterruptionTimerRef = useRef<NodeJS.Timeout | null>(null);
    const interruptionConfirmedRef = useRef<boolean>(false);

    const onStateChangeRef = useRef(onStateChange);
    const onInterruptionRef = useRef(onInterruption);
    const onFalseInterruptionRef = useRef(onFalseInterruption);

    useEffect(() => {
        onStateChangeRef.current = onStateChange;
        onInterruptionRef.current = onInterruption;
        onFalseInterruptionRef.current = onFalseInterruption;
    }, [onStateChange, onInterruption, onFalseInterruption]);

    const clearInterruptionTimer = useCallback(() => {
        if (falseInterruptionTimerRef.current) {
            clearTimeout(falseInterruptionTimerRef.current);
            falseInterruptionTimerRef.current = null;
        }
    }, []);

    const transitionTo = useCallback((nextState: AgentState, reason?: string) => {
        const prev = stateRef.current;
        if (prev === nextState) return;

        clearInterruptionTimer();
        setIsPausedForVerification(false);
        interruptionConfirmedRef.current = false;

        stateRef.current = nextState;
        setState(nextState);

        if (process.env.NODE_ENV !== "production") {
            console.log(`[AgentActivity] Transition: ${prev} -> ${nextState} ${reason ? `(${reason})` : ""}`);
        }

        onStateChangeRef.current?.(prev, nextState);
    }, [clearInterruptionTimer]);

    /**
     * Called when microphone detects potential candidate voice activity while agent is SPEAKING.
     * Starts the hysteresis verification window (LiveKit _false_interruption_timer).
     */
    const handlePotentialInterruption = useCallback((
        onConfirmInterruption: () => void,
        onPausePlayback: () => void
    ) => {
        // Only interviewer speech can be interrupted. Interrupting "thinking"
        // would drop a turn the server has already applied.
        if (stateRef.current !== "speaking") return;
        if (falseInterruptionTimerRef.current) return; // Already verifying

        // Pause first. The surrounding turn remains intact until the short
        // verification window proves this is a real candidate interruption.
        onPausePlayback();
        setIsPausedForVerification(true);

        falseInterruptionTimerRef.current = setTimeout(() => {
            falseInterruptionTimerRef.current = null;
            interruptionConfirmedRef.current = true;
            setIsPausedForVerification(false);

            // True interruption confirmed: cancel AI speech and transition to listening
            transitionTo("listening", "Candidate interrupted AI speech");
            onConfirmInterruption();
            onInterruptionRef.current?.();
        }, minInterruptionDurationMs);
    }, [minInterruptionDurationMs, transitionTo]);

    /**
     * Called if sound stops before minInterruptionDurationMs (e.g. cough, mic click, transient noise).
     * Rejects the interruption and resumes AI speech.
     */
    const handleCancelInterruption = useCallback((onResumePlayback: () => void) => {
        if (falseInterruptionTimerRef.current && !interruptionConfirmedRef.current) {
            clearInterruptionTimer();
            setIsPausedForVerification(false);
            onResumePlayback();
            onFalseInterruptionRef.current?.();
        }
    }, [clearInterruptionTimer]);

    useEffect(() => {
        return () => {
            clearInterruptionTimer();
        };
    }, [clearInterruptionTimer]);

    return useMemo(() => ({
        state,
        stateRef,
        isInitializing: state === "initializing",
        isIdle: state === "idle",
        isListening: state === "listening",
        isThinking: state === "thinking",
        isSpeaking: state === "speaking",
        isPausedForVerification,
        transitionTo,
        handlePotentialInterruption,
        handleCancelInterruption,
    }), [state, isPausedForVerification, transitionTo, handlePotentialInterruption, handleCancelInterruption]);
}
