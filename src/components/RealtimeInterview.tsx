"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./realtimeInterview.module.css";
import { blueprintForRole } from "../engine/roleMapping";
import type { ProbeDepth } from "../engine/types";
import { useVoiceLive, type VoiceLiveStatus, type VoiceLiveTurn } from "../hooks/useVoiceLive";
import { getStoredJobRegion } from "../hooks/useTtsAudio";

interface StoredUser {
    email?: string;
    name?: string;
    role?: string;
    seniority?: string;
    domain?: string;
}

const STATUS_LABEL: Record<VoiceLiveStatus, string> = {
    idle: "Ready",
    connecting: "Connecting…",
    listening: "Your turn — listening",
    thinking: "Interviewer is thinking…",
    speaking: "Interviewer speaking",
    ended: "Interview complete",
    error: "Disconnected",
};

function displayName(user: StoredUser | null): string {
    const raw = user?.name?.trim() || user?.email?.split("@")[0].replace(/[._-]/g, " ") || "";
    if (!raw) return "Candidate";
    return raw
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
}

/**
 * Realtime (speech-to-speech) interview — beta. Uses Azure Voice Live through
 * the relay in server/voiceLiveRelay.ts, with the same interview engine,
 * probing rules and feedback report as the standard interview.
 */
export default function RealtimeInterview() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [user, setUser] = useState<StoredUser | null>(null);
    const [probeDepth, setProbeDepth] = useState<ProbeDepth>("standard");
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);
    const startedAtRef = useRef<number>(0);
    const transcriptEndRef = useRef<HTMLDivElement>(null);

    const role = searchParams.get("role")?.trim() || user?.role || "Software Engineer";
    const company = searchParams.get("company")?.trim() || "";
    const interviewType = searchParams.get("interviewType")?.trim() || "";

    useEffect(() => {
        try {
            setUser(JSON.parse(localStorage.getItem("useladder_user") || "null"));
            const saved = localStorage.getItem("useladder_probe_depth");
            if (saved === "deep" || saved === "standard") setProbeDepth(saved);
        } catch {
            /* ignore */
        }
    }, []);

    const voice = useVoiceLive({
        onComplete: (sessionId: string, transcript: VoiceLiveTurn[]) => {
            // Same hand-off as the standard interview, so the feedback page works unchanged.
            try {
                localStorage.setItem("useladder_last_session_transcript", JSON.stringify(transcript));
                localStorage.setItem("useladder_last_session_id", sessionId);
                localStorage.setItem(
                    "useladder_last_session_meta",
                    JSON.stringify({
                        sessionId,
                        role,
                        experience: user?.seniority || "Mid",
                        domain: user?.domain || "General Tech",
                        companyName: company || "Top Tech",
                        durationMinutes: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 60000)),
                    })
                );
            } catch {
                /* ignore */
            }
            router.push(`/feedback?sessionId=${sessionId}`);
        },
    });

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [voice.turns, voice.liveAiText]);

    const chooseDepth = (depth: ProbeDepth) => {
        setProbeDepth(depth);
        try {
            localStorage.setItem("useladder_probe_depth", depth);
        } catch {
            /* ignore */
        }
    };

    const start = async () => {
        setStarting(true);
        setStartError(null);
        try {
            const sessionRes = await fetch("/api/engine/session", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    blueprintId: blueprintForRole(role, user?.seniority),
                    interviewType: interviewType || undefined,
                    candidateName: displayName(user),
                    companyName: company || "General Industry Benchmark",
                    probeDepth,
                }),
            });
            if (!sessionRes.ok) throw new Error(`Couldn't start the interview (${sessionRes.status}).`);
            const { sessionId } = await sessionRes.json();

            const tokenRes = await fetch(`/api/engine/session/${sessionId}/realtime-token`, { method: "POST" });
            if (!tokenRes.ok) throw new Error(`Couldn't authorize the voice session (${tokenRes.status}).`);
            const { token, relayUrl } = await tokenRes.json();

            startedAtRef.current = Date.now();
            await voice.connect({ relayUrl, token, region: getStoredJobRegion() });
        } catch (err) {
            setStartError((err as Error).message);
        } finally {
            setStarting(false);
        }
    };

    const inSession = voice.status !== "idle" && voice.status !== "error";
    const section = voice.engineState
        ? `${voice.engineState.currentSectionLabel} · section ${voice.engineState.sectionIndex + 1} of ${voice.engineState.sectionCount}`
        : null;
    const statusClass = useMemo(() => {
        if (voice.status === "speaking") return styles.statusSpeaking;
        if (voice.status === "listening") return styles.statusListening;
        return "";
    }, [voice.status]);

    return (
        <main className={styles.page}>
            <div className={styles.shell}>
                <header className={styles.header}>
                    <div>
                        <p className={styles.eyebrow}>Realtime voice · beta</p>
                        <h1 className={styles.title}>{role} interview</h1>
                        <p className={styles.subtitle}>
                            Speak naturally — the interviewer responds in about 2–3 seconds and you can interrupt it at any time.
                        </p>
                    </div>
                    {inSession && (
                        <div className={styles.controls}>
                            <button type="button" className={styles.secondary} onClick={voice.toggleMute}>
                                {voice.isMuted ? "Unmute" : "Mute"}
                            </button>
                            <button type="button" className={styles.danger} onClick={voice.end}>
                                End interview
                            </button>
                        </div>
                    )}
                </header>

                {!inSession && (
                    <section className={styles.card}>
                        <div className={styles.label}>Follow-up depth</div>
                        <div className={styles.depthRow} role="radiogroup" aria-label="Follow-up depth">
                            {([
                                { value: "standard", title: "Standard", hint: "Up to 2 follow-ups on vague answers" },
                                { value: "deep", title: "Deep dive", hint: "Up to 4 — keeps pushing until you prove it" },
                            ] as const).map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={probeDepth === opt.value}
                                    className={styles.depthOption}
                                    onClick={() => chooseDepth(opt.value)}
                                >
                                    <div className={styles.depthTitle}>{opt.title}</div>
                                    <div className={styles.depthHint}>{opt.hint}</div>
                                </button>
                            ))}
                        </div>
                        <button type="button" className={styles.primary} onClick={start} disabled={starting}>
                            {starting ? "Starting…" : voice.status === "error" ? "Reconnect & start again" : "Start realtime interview"}
                        </button>
                        <p className={styles.note}>
                            Uses your browser&apos;s default microphone. Headphones give the best results. Requires the voice relay to be
                            running (<code>npm run voice-relay</code>).
                        </p>
                    </section>
                )}

                {(startError || voice.error) && (
                    <div className={styles.error} role="alert">
                        {startError || voice.error}
                    </div>
                )}

                {inSession && (
                    <>
                        <div className={styles.statusBar}>
                            <span className={`${styles.statusPill} ${statusClass}`} aria-live="polite">
                                <span className={styles.dot} />
                                {voice.isMuted && voice.status === "listening" ? "Muted" : STATUS_LABEL[voice.status]}
                            </span>
                            <div className={styles.meta}>
                                {section && <span>{section}</span>}
                                {voice.lastLatencyMs !== null && <span>Last response: {(voice.lastLatencyMs / 1000).toFixed(1)}s</span>}
                            </div>
                        </div>

                        <section className={styles.card}>
                            <div className={styles.transcript}>
                                {voice.turns.length === 0 && !voice.liveAiText && (
                                    <div className={styles.empty}>The interviewer will greet you in a moment…</div>
                                )}
                                {voice.turns.map((t, i) => (
                                    <div
                                        key={i}
                                        className={`${styles.turn} ${t.role === "interviewer" ? styles.turnInterviewer : styles.turnCandidate}`}
                                    >
                                        <span className={styles.who}>{t.role === "interviewer" ? "Interviewer" : "You"}</span>
                                        {t.text}
                                    </div>
                                ))}
                                {voice.liveAiText && (
                                    <div className={`${styles.turn} ${styles.turnInterviewer} ${styles.turnLive}`}>
                                        <span className={styles.who}>Interviewer</span>
                                        {voice.liveAiText}
                                    </div>
                                )}
                                <div ref={transcriptEndRef} />
                            </div>
                        </section>
                    </>
                )}
            </div>
        </main>
    );
}
