"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useInterview } from "../context/InterviewContext";
import { useMediaRecorder } from "../hooks/useMediaRecorder";
import styles from "./interview.module.css";
import { db } from "../services/database";
import { blueprintForRole } from "../engine/roleMapping";
import type { EnginePrompt, PublicSessionState } from "../engine/types";
import { useTtsAudio } from "../hooks/useTtsAudio";
import {
    PhoneDisconnect,
    VideoCamera,
    Star,
    X,
    Pulse,
    Microphone,
    MicrophoneSlash,
    VideoCameraSlash,
    Warning,
    SpeakerHigh,
    ArrowClockwise,
    CheckCircle,
    Briefcase,
    User as UserIcon,
} from "@phosphor-icons/react";

interface ResumeEntry {
    id: string;
    name: string;
    data: string;
}

interface UserProfile {
    email?: string;
    domain?: string;
    role?: string;
    seniority?: string;
    provider?: string;
    name?: string;
    resumes?: ResumeEntry[];
    selectedResumeId?: string;
}

interface BlueprintOption {
    blueprintId: string;
    role: string;
    level: string;
}

const INTERVIEW_ROLES = [
    "Product Manager",
    "Frontend Developer",
    "Backend Engineer",
    "Full Stack Developer",
    "Software Engineer",
    "Data Scientist",
    "Data Analyst",
    "DevOps / SRE",
    "Product Designer",
    "Sales / BizDev",
    "Customer Service",
];

/** Pass only human-readable text to extraction — never base64 blobs. */
function readableText(raw: string): string {
    if (!raw) return "";
    const sample = raw.slice(0, 2000);
    const printable = sample.replace(/[^\x20-\x7E\s]/g, "").length;
    const hasSpaces = (sample.match(/\s/g) || []).length > 20;
    if (printable / sample.length > 0.85 && hasSpaces) return raw;
    try {
        const decoded = atob(raw);
        const dPrintable = decoded.replace(/[^\x20-\x7E\s]/g, "").length;
        if (dPrintable / decoded.length > 0.85) return decoded;
    } catch { /* not base64 */ }
    return "";
}

export default function InterviewTab() {
    const router = useRouter();
    const { setStatus } = useInterview();
    const videoRef = useRef<HTMLVideoElement>(null);
    const {
        previewStream,
        startStream,
        startRecording,
        stopRecording,
        stopStream,
        isRecording,
        error: mediaError,
        toggleMute,
        toggleVideo,
        isMuted,
        isVideoOff,
    } = useMediaRecorder();

    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    // ── Engine state ──
    const [blueprints, setBlueprints] = useState<BlueprintOption[]>([]);
    const [selectedBlueprint, setSelectedBlueprint] = useState<string>("");
    const [linkedinText, setLinkedinText] = useState("");
    const [portfolioText, setPortfolioText] = useState("");
    const [resumeText, setResumeText] = useState("");
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [engineState, setEngineState] = useState<PublicSessionState | null>(null);
    const [currentPrompt, setCurrentPrompt] = useState<EnginePrompt | null>(null);
    const [isEngineBusy, setIsEngineBusy] = useState(false);

    // ── Live session UI state ──
    const [isListening, setIsListening] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [sessionStarted, setSessionStarted] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [currentAnswer, setCurrentAnswer] = useState("");
    const [isEditingAnswer, setIsEditingAnswer] = useState(false);
    const [showEndModal, setShowEndModal] = useState(false);
    const [elapsedTick, setElapsedTick] = useState(0);
    const [localTranscript, setLocalTranscript] = useState<
        Array<{ role: "interviewer" | "candidate"; text: string }>
    >([]);

    // Auth check
    useEffect(() => {
        const raw = localStorage.getItem("useladder_user");
        if (!raw) {
            router.push("/onboarding");
            return;
        }
        try {
            setUser(JSON.parse(raw));
        } catch {
            router.push("/onboarding");
        }
        setLoading(false);
    }, [router]);

    // Automatically map user's target role & experience to the engine blueprint
    useEffect(() => {
        const raw = localStorage.getItem("useladder_user");
        if (raw) {
            try {
                const u: UserProfile = JSON.parse(raw);
                const mapped = blueprintForRole(u.role, u.seniority);
                setSelectedBlueprint(mapped);
            } catch { /* ignore */ }
        }
    }, [user]);

    // Detect a readable resume from the stored profile (optional input)
    useEffect(() => {
        const raw = localStorage.getItem("useladder_user");
        if (!raw) return;
        try {
            const u: UserProfile = JSON.parse(raw);
            if (u.selectedResumeId && u.resumes) {
                const selected = u.resumes.find((r) => r.id === u.selectedResumeId);
                if (selected) setResumeText(readableText(selected.data));
            }
        } catch { /* ignore */ }
    }, []);

    // Bind video stream to <video> element
    useEffect(() => {
        if (videoRef.current && previewStream) {
            videoRef.current.srcObject = previewStream;
        }
    }, [previewStream]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopStream();
        };
    }, [stopStream]);

    // Elapsed clock — the INTERVIEWER is on a schedule, not the candidate.
    // Ticks locally between turns; the engine owns the authoritative value.
    useEffect(() => {
        if (!sessionStarted || !engineState || engineState.complete) return;
        const base = engineState.elapsedSeconds;
        const baseAt = Date.now();
        const t = setInterval(() => {
            setElapsedTick(base + Math.floor((Date.now() - baseAt) / 1000));
        }, 1000);
        return () => clearInterval(t);
    }, [sessionStarted, engineState]);

    // Speech Recognition — candidate speaks freely, never capped
    useEffect(() => {
        if (!isListening || isMuted) return;

        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event: any) => {
            const transcript = Array.from(event.results)
                .map((result: any) => (result as any)[0].transcript)
                .join("");
            setCurrentAnswer(transcript);
        };
        recognition.start();
        return () => recognition.stop();
    }, [isListening, isMuted]);

    // TTS Audio & Regional Voice Engine
    const {
        playTts,
        prefetchTts,
        stopAudio,
        replayCurrentAudio,
        isPlaying: isAiSpeaking,
        isLoadingAudio,
        voiceLabel,
    } = useTtsAudio();

    // Background pre-fetch upcoming questions to eliminate TTS latency
    useEffect(() => {
        if (engineState?.upcomingQuestions && engineState.upcomingQuestions.length > 0) {
            prefetchTts(engineState.upcomingQuestions, { persona: "recruiter" });
        }
    }, [engineState?.upcomingQuestions, prefetchTts]);

    const speakQuestion = (text: string, onDone?: () => void) => {
        playTts(text, {
            persona: "recruiter",
            onStart: () => setIsListening(false),
            onEnd: () => onDone?.(),
        });
    };

    const handleRoleSelect = (roleName: string) => {
        const bp = blueprintForRole(roleName, user?.seniority);
        setSelectedBlueprint(bp);
        if (user) {
            const next = { ...user, role: roleName };
            setUser(next);
            try {
                localStorage.setItem("useladder_user", JSON.stringify(next));
            } catch {}
        }
    };

    /* ── Engine calls ── */

    const startEngineSession = async (): Promise<{ sessionId: string; prompt: EnginePrompt; state: PublicSessionState } | null> => {
        const candidateId = user?.email || "anonymous";
        const hasSources =
            resumeText.trim() || linkedinText.trim() || portfolioText.trim();
        const blueprintId = selectedBlueprint || blueprintForRole(user?.role, user?.seniority);

        // One-time extraction, pre-interview — never inside the live loop.
        if (hasSources) {
            await fetch("/api/engine/extract", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    candidateId,
                    blueprintId,
                    resumeText: resumeText.trim() || undefined,
                    linkedinText: linkedinText.trim() || undefined,
                    portfolioText: portfolioText.trim() || undefined,
                }),
            }).catch(() => null); // extraction failure never blocks the interview
        }

        const res = await fetch("/api/engine/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ candidateId, blueprintId }),
        });
        if (!res.ok) return null;
        return res.json();
    };

    // Main entry point — user clicks "Start"
    const handleStartInterview = async () => {
        setIsConnecting(true);
        const granted = await startStream();
        if (!granted) {
            setIsConnecting(false);
            return;
        }

        setIsEngineBusy(true);
        const started = await startEngineSession();
        setIsEngineBusy(false);
        if (!started) {
            setIsConnecting(false);
            return;
        }

        setSessionId(started.sessionId);
        setCurrentPrompt(started.prompt);
        setEngineState(started.state);
        setElapsedTick(started.state.elapsedSeconds);
        setIsConnecting(false);
        setSessionStarted(true);
        if (started.prompt?.text) {
            setLocalTranscript([{ role: "interviewer", text: started.prompt.text }]);
        }

        let count = 3;
        setCountdown(count);
        const interval = setInterval(() => {
            count -= 1;
            if (count <= 0) {
                clearInterval(interval);
                setCountdown(null);
                startRecording();
                const promptText = started.prompt.text;
                if (promptText) {
                    setTimeout(() => {
                        speakQuestion(promptText, () =>
                            setIsListening(true)
                        );
                    }, 300);
                }
            } else {
                setCountdown(count);
            }
        }, 1000);
    };

    // Candidate finished their answer — hand it to the orchestrator
    const handleNext = async () => {
        if (!sessionId || isEngineBusy) return;

        const candidateText = currentAnswer.trim();
        setIsListening(false);
        setIsEngineBusy(true);

        try {
            const res = await fetch(`/api/engine/session/${sessionId}/turn`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ answerText: candidateText }),
            });
            if (!res.ok) throw new Error("turn failed");
            const data = await res.json();

            setLocalTranscript((prev) => [
                ...prev,
                ...(candidateText ? [{ role: "candidate" as const, text: candidateText }] : []),
                ...(data.prompt.text ? [{ role: "interviewer" as const, text: data.prompt.text }] : []),
            ]);

            setCurrentPrompt(data.prompt);
            setEngineState(data.state);
            setCurrentAnswer("");
            setIsEditingAnswer(false);

            if (data.prompt.type === "complete" || data.state.complete) {
                if (data.prompt.text) {
                    speakQuestion(data.prompt.text, () => handleComplete());
                } else {
                    handleComplete();
                }
                return;
            }

            if (data.prompt.text) {
                speakQuestion(data.prompt.text, () => setIsListening(true));
            } else {
                setIsListening(true);
            }
        } catch {
            setIsListening(true);
        } finally {
            setIsEngineBusy(false);
        }
    };

    const handleEndClick = () => {
        if (isRecording && engineState && !engineState.complete) {
            stopAudio();
            setShowEndModal(true);
        } else {
            handleComplete();
        }
    };

    const handleComplete = async () => {
        setShowEndModal(false);
        stopAudio();
        setIsListening(false);

        stopRecording();
        stopStream();

        const userId = user?.email || "anonymous";
        const minutes = Math.max(1, Math.round(elapsedTick / 60));
        await db.recordInterviewSession(userId, 82, minutes);
        setStatus("completed");

        const finalTurns = [...localTranscript];
        if (currentAnswer && currentAnswer.trim()) {
            finalTurns.push({ role: "candidate", text: currentAnswer.trim() });
        }
        localStorage.setItem("useladder_last_session_transcript", JSON.stringify(finalTurns));

        if (sessionId) {
            localStorage.setItem("useladder_last_session_id", sessionId);
        }
        localStorage.setItem(
            "useladder_last_session_meta",
            JSON.stringify({
                sessionId,
                role: user?.role || "Software Engineer",
                experience: user?.seniority || "Mid",
                domain: user?.domain || "General Tech",
            })
        );

        router.push(sessionId ? `/feedback?sessionId=${sessionId}` : "/feedback");
    };

    const handleCancelEnd = () => {
        setShowEndModal(false);
        setIsListening(true);
    };

    if (loading || !user) return null;

    const userName =
        user.name ||
        (user.email ? user.email.split("@")[0] : "User");
    const initials = userName.slice(0, 2).toUpperCase();

    const handleLogout = () => {
        localStorage.removeItem("useladder_user");
        router.push("/");
    };

    /* ── Derived display values ── */

    const fmt = (s: number) =>
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

    const sectionProgress = engineState
        ? `Section ${engineState.sectionIndex + 1} of ${engineState.sectionCount}`
        : "";

    return (
        <div className={styles.interviewPage}>
            {/* Countdown Overlay */}
            {countdown !== null && (
                <div className={styles.countdownOverlay}>
                    <div className={styles.countdownNumber}>{countdown}</div>
                </div>
            )}

            {/* Navbar */}
            <nav className={styles.navbar}>
                <div className={styles.navLeft}>
                    <div className={styles.logo}>
                        <div className={styles.logoIcon}>L</div>
                        useladder
                    </div>
                </div>
                <div className={styles.navRight}>
                    <button
                        className={styles.logoutBtn}
                        onClick={handleLogout}
                        aria-label="Logout"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        <span>Logout</span>
                    </button>
                    <div className={styles.avatar}>{initials}</div>
                </div>
            </nav>

            {/* Main Layout */}
            <main className={styles.mainContent}>
                <div className={styles.contentGrid}>
                    {/* Left: Video Card */}
                    <div className={styles.videoCard}>
                        <div className={styles.videoFeed}>
                            <video
                                ref={videoRef}
                                className={styles.videoElement}
                                autoPlay
                                muted
                                playsInline
                            />

                            {/* Pre-session: setup + start */}
                            {!sessionStarted && (
                                <div className={styles.mediaError}>
                                    <VideoCamera size={48} color="#4793f7" />
                                    <h3
                                        style={{
                                            fontSize: "1.3rem",
                                            fontWeight: 400,
                                            color: "#fff",
                                            marginTop: "1rem",
                                            letterSpacing: "-0.01em",
                                        }}
                                    >
                                        Ready for your mock interview?
                                    </h3>

                                    <div className={styles.candidateProfileCard}>
                                        <div className={styles.profileBadgeGroup}>
                                            <div className={styles.profileBadge}>
                                                <span className={styles.badgeLabel}>Target Role</span>
                                                <select
                                                    className={styles.roleSelect}
                                                    value={user?.role || "Product Manager"}
                                                    onChange={(e) => handleRoleSelect(e.target.value)}
                                                >
                                                    {user?.role && !INTERVIEW_ROLES.includes(user.role) && (
                                                        <option value={user.role}>{user.role}</option>
                                                    )}
                                                    {INTERVIEW_ROLES.map((r) => (
                                                        <option key={r} value={r}>
                                                            {r}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className={styles.profileBadge}>
                                                <span className={styles.badgeLabel}>Experience Level</span>
                                                <span className={styles.badgeValue}>
                                                    {user?.seniority || "Mid-Level"}
                                                </span>
                                            </div>
                                        </div>

                                        {resumeText ? (
                                            <div className={styles.resumeStatusBadge}>
                                                <CheckCircle size={15} weight="fill" color="#10b981" />
                                                <span>Resume loaded · Questions will personalize to your background</span>
                                            </div>
                                        ) : (
                                            <p style={{ fontSize: "0.72rem", color: "#94a3b8", margin: "0.2rem 0 0", lineHeight: 1.5 }}>
                                                Questions will adapt dynamically to your live responses.
                                            </p>
                                        )}
                                    </div>

                                    <button
                                        className={styles.grantBtn}
                                        onClick={handleStartInterview}
                                        disabled={isConnecting || isEngineBusy}
                                    >
                                        {isConnecting
                                            ? "Connecting Camera & Mic…"
                                            : isEngineBusy
                                              ? "Preparing your interview…"
                                              : "Start Interview"}
                                    </button>
                                    {mediaError && (
                                        <p
                                            style={{
                                                color: "#ef4444",
                                                fontSize: "0.8rem",
                                                marginTop: "0.5rem",
                                                maxWidth: 320,
                                                textAlign: "center",
                                                background: "rgba(239, 68, 68, 0.1)",
                                                padding: "0.5rem 1rem",
                                                borderRadius: "4px",
                                                border: "1px solid rgba(239, 68, 68, 0.2)"
                                            }}
                                        >
                                            {mediaError}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* During session: Show HUD */}
                            {sessionStarted && isRecording && (
                                <>
                                    <div className={styles.recordBadge}>
                                        <div
                                            style={{
                                                width: 8,
                                                height: 8,
                                                background: "#ef4444",
                                                borderRadius: "50%",
                                                animation:
                                                    "recordPulse 1.5s ease-in-out infinite",
                                            }}
                                        />
                                        <span>Recording</span>
                                        <X
                                            className={styles.closeIcon}
                                            size={14}
                                        />
                                    </div>

                                    {isListening && (
                                        <div className={`${styles.listeningBadge} ${isMuted ? styles.listeningMuted : ""}`}>
                                            <span>{isMuted ? "Mic Muted" : "Listening"}</span>
                                            {isMuted ? <MicrophoneSlash size={16} /> : <Pulse size={16} />}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Controls — shown after session starts */}
                            {sessionStarted && (
                                <div className={styles.videoControls}>
                                    <button
                                        className={`${styles.controlBtn} ${
                                            isMuted
                                                ? styles.controlBtnActive
                                                : ""
                                        }`}
                                        onClick={toggleMute}
                                    >
                                        {isMuted ? (
                                            <MicrophoneSlash size={18} />
                                        ) : (
                                            <Microphone size={18} />
                                        )}
                                    </button>
                                    <button
                                        className={`${styles.controlBtn} ${styles.controlBtnEnd}`}
                                        onClick={handleEndClick}
                                    >
                                        <PhoneDisconnect size={22} />
                                    </button>
                                    <button
                                        className={`${styles.controlBtn} ${
                                            isVideoOff
                                                ? styles.controlBtnActive
                                                : ""
                                        }`}
                                        onClick={toggleVideo}
                                    >
                                        {isVideoOff ? (
                                            <VideoCameraSlash size={18} />
                                        ) : (
                                            <VideoCamera size={18} />
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className={styles.rightColumn}>
                        {/* Questions Card */}
                        <div className={styles.infoCard}>
                            <div className={styles.cardHeader}>
                                <div className={styles.headerLabel}>
                                    <Star size={14} />
                                    <span>
                                        {engineState?.role ? `${engineState.role}: ` : ""}
                                        {engineState?.currentSectionLabel || "Questions"}
                                    </span>
                                </div>
                                <div className={styles.timer} title="Interviewer schedule — you are never cut off">
                                    {sessionStarted
                                        ? `${fmt(elapsedTick)} / ${fmt(engineState?.totalTimeBudgetSeconds ?? 2700)}`
                                        : `${fmt(0)} / ${fmt(2700)}`}
                                </div>
                            </div>

                            {sessionStarted && currentPrompt?.kind === "follow_up" && (
                                <div className={styles.followUpBadge}>
                                    <span>🎯 Probing detail from your previous answer</span>
                                </div>
                            )}

                            {/* AI Audio / Speaking Status Badge */}
                            {sessionStarted && (isAiSpeaking || isLoadingAudio) && (
                                <div className={styles.aiSpeakingBadge}>
                                    <div className={styles.speakingWave}>
                                        <div className={styles.speakingBar} />
                                        <div className={styles.speakingBar} />
                                        <div className={styles.speakingBar} />
                                        <div className={styles.speakingBar} />
                                    </div>
                                    <span>
                                        {isLoadingAudio
                                            ? "Preparing audio…"
                                            : `Interviewer speaking${voiceLabel ? ` (${voiceLabel})` : ""}`}
                                    </span>
                                </div>
                            )}

                            <h2 className={styles.questionText}>
                                {sessionStarted
                                    ? isEngineBusy
                                        ? "…"
                                        : (currentPrompt?.text ?? "")
                                    : "Ready to begin your session?"}
                            </h2>

                            {sessionStarted && currentPrompt?.text && !isAiSpeaking && !isLoadingAudio && (
                                <div style={{ marginBottom: "0.85rem" }}>
                                    <button
                                        type="button"
                                        className={styles.replayAudioBtn}
                                        onClick={replayCurrentAudio}
                                        title="Replay interviewer's question"
                                    >
                                        <SpeakerHigh size={14} weight="bold" />
                                        <span>Replay Audio</span>
                                    </button>
                                </div>
                            )}

                            {/* Live Candidate Speech Box */}
                            {sessionStarted && !engineState?.complete && isRecording && (
                                <div className={`${styles.liveSpeechBox} ${isListening && !isAiSpeaking ? styles.liveSpeechActive : ""}`}>
                                    <div className={styles.liveSpeechHeader}>
                                        <div
                                            className={styles.speechPulseDot}
                                            style={{
                                                background: isAiSpeaking ? "#94a3b8" : isListening ? "#22c55e" : "#eab308",
                                            }}
                                        />
                                        <span>
                                            {isAiSpeaking
                                                ? "Interviewer is speaking — listen closely…"
                                                : isListening
                                                ? "AI is listening to you… speak your response"
                                                : "Paused"}
                                        </span>
                                        {currentAnswer && (
                                            <span className={styles.wordCountBadge}>
                                                {currentAnswer.trim().split(/\s+/).filter(Boolean).length} words
                                            </span>
                                        )}
                                    </div>
                                    <div className={styles.liveSpeechContent}>
                                        {isEditingAnswer ? (
                                            <textarea
                                                className={styles.liveSpeechEditArea}
                                                value={currentAnswer}
                                                onChange={(e) => setCurrentAnswer(e.target.value)}
                                                placeholder="Type or refine your response here…"
                                            />
                                        ) : currentAnswer ? (
                                            <p className={styles.liveSpeechText}>{currentAnswer}</p>
                                        ) : (
                                            <p className={styles.liveSpeechPlaceholder}>
                                                {isAiSpeaking
                                                    ? "Prepare your thoughts while the interviewer finishes speaking."
                                                    : "Start speaking your answer clearly. Your spoken words are transcribed here in real-time."}
                                            </p>
                                        )}
                                    </div>
                                    {currentAnswer && (
                                        <button
                                            type="button"
                                            className={styles.liveSpeechEditToggle}
                                            onClick={() => setIsEditingAnswer(!isEditingAnswer)}
                                        >
                                            {isEditingAnswer ? "Done editing" : "Edit / refine transcription"}
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className={styles.cardFooter}>
                                <span style={{ fontSize: '0.8rem', color: '#555' }}>
                                    {sessionStarted
                                        ? `${sectionProgress}${currentPrompt?.kind === "follow_up" ? " · follow-up" : ""}${engineState?.pacing !== "normal" && engineState ? ` · pacing: ${engineState.pacing}` : ""}`
                                        : ""}
                                </span>
                                {isRecording && !engineState?.complete && (
                                    <button
                                        className={styles.nextBtn}
                                        onClick={handleNext}
                                        disabled={isEngineBusy}
                                    >
                                        {isEngineBusy ? "Thinking…" : "Next"}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* End Interview Warning Modal */}
            {showEndModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.endModal}>
                        <div className={styles.endModalIcon}>
                            <Warning size={32} color="#f59e0b" />
                        </div>
                        <h3 className={styles.endModalTitle}>End Interview Early?</h3>
                        <p className={styles.endModalText}>
                            You are <strong>{fmt(elapsedTick)}</strong> in, at{" "}
                            <strong>{engineState?.currentSectionLabel}</strong>.
                            Ending now will only score your completed responses.
                        </p>
                        <div className={styles.endModalActions}>
                            <button
                                className={styles.endModalCancel}
                                onClick={handleCancelEnd}
                            >
                                Continue Interview
                            </button>
                            <button
                                className={styles.endModalConfirm}
                                onClick={handleComplete}
                            >
                                End Session
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
