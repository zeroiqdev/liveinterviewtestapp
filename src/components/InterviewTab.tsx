"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
    Lightbulb,
    ShieldWarning,
    Sparkle,
    ArrowRight,
} from "@phosphor-icons/react";
import { CamcorderRegular, AlertRegular, CloseRegular } from "@mingcute/react/core-regular";
import { RECRUITER_AVATAR } from "./dashboard/constants";
import type { PreInterviewBriefing } from "@/app/api/interview/briefing/route";
import type { InstantQuestionFeedback } from "@/app/api/interview/instant-feedback/route";

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
    const searchParams = useSearchParams();
    const queryMode = searchParams.get("mode") as "live_coaching" | "post_interview" | null;
    const queryRole = searchParams.get("role");
    const queryCompany = searchParams.get("company");
    const queryCategory = searchParams.get("category");
    const queryInterviewType = searchParams.get("interviewType");

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

    // ── Interview Mode & Live Coaching State ──
    const [interviewMode, setInterviewMode] = useState<"live_coaching" | "post_interview">("live_coaching");
    const [instantFeedback, setInstantFeedback] = useState<InstantQuestionFeedback | null>(null);
    const [isGeneratingInstantFeedback, setIsGeneratingInstantFeedback] = useState(false);
    const [interviewType, setInterviewType] = useState<string>("");

    // ── Engine state ──
    const [blueprints, setBlueprints] = useState<BlueprintOption[]>([]);
    const [selectedBlueprint, setSelectedBlueprint] = useState<string>("");
    const [linkedinText, setLinkedinText] = useState("");
    const [portfolioText, setPortfolioText] = useState("");
    const [resumeText, setResumeText] = useState("");
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [engineState, setEngineState] = useState<PublicSessionState | null>(null);

    const headerInterviewTitle = useMemo(() => {
        const title = interviewType || engineState?.role || queryRole || user?.role || "";
        if (!title) return "Interview";
        return title.trim().toLowerCase().endsWith("interview")
            ? title.trim()
            : `${title.trim()} Interview`;
    }, [interviewType, engineState?.role, queryRole, user?.role]);
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

    // ── Pre-interview briefing state ──
    const [targetCompany, setTargetCompany] = useState<string>("Stripe");
    const [briefing, setBriefing] = useState<PreInterviewBriefing | null>(null);
    const [briefingLoading, setBriefingLoading] = useState<boolean>(false);

    useEffect(() => {
        if (queryMode) {
            setInterviewMode(queryMode === "post_interview" ? "post_interview" : "live_coaching");
        }
        if (queryCompany) {
            setTargetCompany(queryCompany);
        } else {
            try {
                const rawMeta = localStorage.getItem("useladder_last_session_meta");
                if (rawMeta) {
                    const parsed = JSON.parse(rawMeta);
                    if (parsed.companyName && parsed.companyName !== "General" && parsed.companyName !== "General Industry Benchmark") {
                        setTargetCompany(parsed.companyName);
                    }
                }
            } catch {}
        }
        if (queryInterviewType) {
            setInterviewType(queryInterviewType);
        } else {
            try {
                const rawMeta = localStorage.getItem("useladder_last_session_meta");
                if (rawMeta) {
                    const parsed = JSON.parse(rawMeta);
                    if (parsed.preparationTitle) {
                        setInterviewType(parsed.preparationTitle);
                    }
                }
            } catch {}
        }
    }, [queryMode, queryCompany, queryInterviewType]);

    // Fetch pre-interview strategy briefing based on role and target company
    useEffect(() => {
        if (!user?.role) return;
        let isCancelled = false;
        setBriefingLoading(true);
        fetch("/api/interview/briefing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                role: interviewType || user.role,
                seniority: user.seniority || "Mid-Level",
                companyName: targetCompany,
            }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (!isCancelled && data.briefing) {
                    setBriefing(data.briefing);
                }
            })
            .catch((e) => console.warn("Failed loading interview briefing:", e))
            .finally(() => {
                if (!isCancelled) setBriefingLoading(false);
            });
        return () => {
            isCancelled = true;
        };
    }, [user?.role, user?.seniority, targetCompany]);

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
            body: JSON.stringify({
                candidateId,
                blueprintId,
                interviewType: interviewType || queryInterviewType || undefined,
            }),
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

    // Hand answer to orchestrator engine
    const submitTurnToEngine = async (candidateText: string) => {
        if (!sessionId) return;
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

    // Candidate finished their answer — hand it to orchestrator or trigger instant coaching
    const handleNext = async () => {
        if (!sessionId || isEngineBusy) return;

        const candidateText = currentAnswer.trim();
        setIsListening(false);

        // If in live coaching mode, request instant feedback and pause for coaching review
        if (interviewMode === "live_coaching" && !instantFeedback) {
            setIsGeneratingInstantFeedback(true);
            try {
                const res = await fetch("/api/interview/instant-feedback", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        question: currentPrompt?.text || "Interview question",
                        answer: candidateText,
                        role: user?.role || "Software Engineer",
                        companyName: targetCompany || "Top Tech",
                        category: queryCategory || "General Interview",
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.feedback) {
                        setInstantFeedback(data.feedback);
                        setIsGeneratingInstantFeedback(false);
                        return; // Keep modal open for candidate review
                    }
                }
            } catch (e) {
                console.warn("Instant feedback error:", e);
            }
            setIsGeneratingInstantFeedback(false);
        }

        await submitTurnToEngine(candidateText);
    };

    // Candidate reviewed coaching feedback and clicked "Next Question →"
    const handleContinueAfterCoaching = async () => {
        const candidateText = currentAnswer.trim();
        setInstantFeedback(null);
        await submitTurnToEngine(candidateText);
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
                companyName: targetCompany || "Top Tech",
                responsibilities: briefing?.decodedResponsibilities?.map((r) => r.responsibility) || [],
            })
        );

        router.push(sessionId ? `/feedback?sessionId=${sessionId}` : "/feedback");
    };

    const handleCancelEnd = () => {
        setShowEndModal(false);
        setIsListening(true);
    };

    const questionNumber = useMemo(() => {
        const interviewerTurns = localTranscript.filter((t) => t.role === "interviewer").length;
        if (interviewerTurns > 0) return interviewerTurns;
        if (sessionStarted && currentPrompt?.text) return 1;
        return 0;
    }, [localTranscript, sessionStarted, currentPrompt]);

    if (loading || !user) return null;

    const candidateDisplayName = (() => {
        if (user.name && user.name.trim()) {
            return user.name
                .trim()
                .split(/\s+/)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(" ");
        }
        if (user.email && user.email.trim()) {
            const namePart = user.email.split("@")[0].replace(/[._-]/g, " ");
            return namePart
                .trim()
                .split(/\s+/)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(" ");
        }
        return "Candidate";
    })();

    const userName = candidateDisplayName;
    const initials = userName.slice(0, 2).toUpperCase();

    const handleLogout = () => {
        localStorage.removeItem("useladder_user");
        router.push("/");
    };

    /* ── Derived display values ── */

    const fmt = (s: number) =>
        `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

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
                                    <div style={{ marginBottom: "0.5rem" }}>
                                        <CamcorderRegular size={46} color="#94a3b8" />
                                    </div>
                                    <h3
                                        style={{
                                            fontSize: "1.3rem",
                                            fontWeight: 400,
                                            color: "#fff",
                                            marginTop: "1rem",
                                            letterSpacing: "-0.01em",
                                        }}
                                    >
                                        Click start button to start interview
                                    </h3>

                                    {resumeText && (
                                        <div className={styles.resumeStatusBadge} style={{ marginTop: "0.75rem", marginBottom: "0.5rem" }}>
                                            <CheckCircle size={15} weight="fill" color="#10b981" />
                                            <span>Resume loaded · Questions will personalize to your background</span>
                                        </div>
                                    )}

                                    <button
                                        className={styles.grantBtn}
                                        onClick={handleStartInterview}
                                        disabled={isConnecting || isEngineBusy}
                                    >
                                        {isConnecting
                                            ? "Connecting Camera & Mic…"
                                            : isEngineBusy
                                              ? "Preparing your interview…"
                                              : "Start"}
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
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <div className={styles.headerLabel}>
                                        <span>{headerInterviewTitle}</span>
                                    </div>
                                </div>
                                <div className={styles.timer} title="Time elapsed in interview">
                                    <span className={styles.timerBlinkDot} />
                                    <span>{fmt(sessionStarted ? elapsedTick : 0)}</span>
                                </div>
                            </div>


                            {sessionStarted && currentPrompt?.kind === "follow_up" && (
                                <div className={styles.followUpBadge}>
                                    <span>🎯 Probing detail from your previous answer</span>
                                </div>
                            )}

                            <div className={styles.questionSection}>
                                <div className={styles.interviewerHeader}>
                                    <div className={styles.questionAvatarWrap}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={RECRUITER_AVATAR}
                                            alt="Interviewer"
                                            className={styles.questionAvatarImg}
                                            draggable={false}
                                        />
                                        {isAiSpeaking && (
                                            <span className={styles.questionSpeakingDot} />
                                        )}
                                    </div>
                                    <span className={styles.interviewerLabel}>
                                        {sessionStarted && questionNumber > 0 ? `Question ${questionNumber}` : "Interviewer"}
                                    </span>
                                </div>
                                <h2 className={styles.questionText}>
                                    {sessionStarted
                                        ? isEngineBusy
                                            ? "…"
                                            : (currentPrompt?.text ?? "")
                                        : `Welcome ${candidateDisplayName}, your interview will begin shortly`}
                                </h2>
                                {sessionStarted && questionNumber > 0 && (
                                    <div className={styles.questionMetaBelow}>
                                        Question {questionNumber}{engineState?.sectionCount ? ` · ${sectionProgress}` : ""}
                                    </div>
                                )}
                            </div>

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

            {/* Live Coaching Instant Feedback Modal */}
            {(isGeneratingInstantFeedback || instantFeedback) && (
                <div className={styles.instantFeedbackOverlay}>
                    <div className={styles.instantFeedbackModal}>
                        {isGeneratingInstantFeedback ? (
                            <div className={styles.instantGeneratingCard}>
                                <div className={styles.instantGeneratingSpinner} />
                                <h4 style={{ color: "#f8fafc", margin: 0, fontSize: "1rem" }}>
                                    Analyzing your response…
                                </h4>
                                <p style={{ color: "#94a3b8", fontSize: "0.825rem", margin: 0, maxWidth: 360 }}>
                                    Your AI coach is evaluating delivery, technical depth, and alignment with {targetCompany} benchmarks.
                                </p>
                            </div>
                        ) : instantFeedback ? (
                            <>
                                <div className={styles.instantFeedbackHeader}>
                                    <div className={styles.instantCoachProfile}>
                                        <div className={styles.instantCoachAvatar}>
                                            <Sparkle size={20} weight="fill" />
                                        </div>
                                        <div>
                                            <h3 className={styles.instantCoachTitle}>Live Coach Feedback</h3>
                                            <p className={styles.instantCoachSubtitle}>Instant Per-Question Critique</p>
                                        </div>
                                    </div>
                                    <div className={styles.instantScoreBadgeRow}>
                                        <span
                                            className={`${styles.instantRatingPill} ${
                                                instantFeedback.rating === "Strong"
                                                    ? styles.ratingStrong
                                                    : instantFeedback.rating === "Average"
                                                    ? styles.ratingAverage
                                                    : styles.ratingNeedsWork
                                            }`}
                                        >
                                            {instantFeedback.rating}
                                        </span>
                                        <span className={styles.instantScorePill}>
                                            {instantFeedback.score}/100
                                        </span>
                                    </div>
                                </div>

                                <div className={styles.instantFeedbackBody}>
                                    <div className={styles.instantHeadlineCard}>
                                        "{instantFeedback.headline}"
                                    </div>

                                    <div>
                                        <div className={styles.instantSectionTitle}>
                                            <CheckCircle size={15} weight="fill" color="#10b981" />
                                            <span>What Worked Well</span>
                                        </div>
                                        <ul className={styles.instantStrengthsList}>
                                            {instantFeedback.strengths?.map((str, idx) => (
                                                <li key={idx} className={styles.instantStrengthsItem}>
                                                    <CheckCircle size={14} weight="fill" />
                                                    <span>{str}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div className={styles.instantCoachingTipCard}>
                                        <div className={styles.instantSectionTitle} style={{ color: "#fbbf24" }}>
                                            <Lightbulb size={15} weight="fill" color="#fbbf24" />
                                            <span>Coach Polish Tip</span>
                                        </div>
                                        <p>{instantFeedback.coachingTip}</p>
                                    </div>

                                    <div className={styles.instantModelAnswerCard}>
                                        <div className={styles.instantSectionTitle} style={{ color: "#94a3b8" }}>
                                            <Star size={14} weight="fill" color="#f59e0b" />
                                            <span>Top 1% Model Answer Benchmark</span>
                                        </div>
                                        <p>"{instantFeedback.modelAnswer}"</p>
                                    </div>
                                </div>

                                <div className={styles.instantFeedbackFooter}>
                                    <button
                                        type="button"
                                        className={styles.instantContinueBtn}
                                        onClick={handleContinueAfterCoaching}
                                    >
                                        <span>Next Question</span>
                                        <ArrowRight size={16} weight="bold" />
                                    </button>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            )}

            {/* End Interview Warning Modal — modern design */}
            {showEndModal && (
                <div className={styles.modalOverlay} onClick={handleCancelEnd}>
                    <div className={styles.endModal} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.endModalCloseBtn} onClick={handleCancelEnd} aria-label="Close">
                            <CloseRegular size={16} />
                        </button>
                        <div className={styles.endModalIcon}>
                            <AlertRegular size={30} color="#f59e0b" />
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
