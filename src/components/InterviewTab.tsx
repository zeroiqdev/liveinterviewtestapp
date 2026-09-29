"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useInterview } from "../context/InterviewContext";
import { useMediaRecorder } from "../hooks/useMediaRecorder";
import styles from "./interview.module.css";
import { db } from "../services/database";
import { blueprintForRole } from "../engine/roleMapping";
import type { EnginePrompt, PublicSessionState } from "../engine/types";
import { useTtsAudio } from "../hooks/useTtsAudio";
import { useTurnDetection } from "../hooks/useTurnDetection";
import { useAgentActivity } from "../hooks/useAgentActivity";
import {
    PhoneDisconnect,
    VideoCamera,
    Star,
    X,
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
    CaretUpDown,
    Minus,
    Check,
    Clock,
    Pause,
    Play,
    Chats,
    Ticket,
    ShieldCheck,
    CalendarDots,
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

function isPlaceholderCompanyName(company: string | null | undefined): boolean {
    const normalized = company?.trim().toLowerCase();
    return !normalized || normalized === "target role" || normalized === "general";
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

    // ── Interview Mode (Mock Interview vs Live Coaching) State ──
    const [interviewMode, setInterviewMode] = useState<"live_coaching" | "post_interview">("post_interview");
    const [instantFeedback, setInstantFeedback] = useState<InstantQuestionFeedback | null>(null);
    const [isGeneratingInstantFeedback, setIsGeneratingInstantFeedback] = useState(false);
    const lastCandidateAnswerRef = useRef<string>("");
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
    const [activeToolCall, setActiveToolCall] = useState<{ tool: string; reason?: string; systemMessage?: string } | null>(null);

    // ── Live session UI state ──
    const [isListening, setIsListening] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [isTimerPaused, setIsTimerPaused] = useState(false);
    const [sessionStarted, setSessionStarted] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [currentAnswer, setCurrentAnswer] = useState("");
    const [finalTranscript, setFinalTranscript] = useState("");
    const [latestStarScore, setLatestStarScore] = useState<InstantQuestionFeedback["star"] | null>(null);
    const [isStarScoring, setIsStarScoring] = useState(false);
    const [isEditingAnswer, setIsEditingAnswer] = useState(false);
    const [showEndModal, setShowEndModal] = useState(false);
    const [elapsedTick, setElapsedTick] = useState(0);
    const [localTranscript, setLocalTranscript] = useState<
        Array<{ role: "interviewer" | "candidate"; text: string }>
    >([]);

    // ── Pre-interview briefing state ──
    const [targetCompany, setTargetCompany] = useState<string>("General Industry Benchmark");
    const [briefing, setBriefing] = useState<PreInterviewBriefing | null>(null);
    const [briefingLoading, setBriefingLoading] = useState<boolean>(false);

    // ── Pre-interview setup checklist & device state ──
    const [activePreTab, setActivePreTab] = useState<"checks" | "about">("checks");
    const [devices, setDevices] = useState<{
        audioInputs: MediaDeviceInfo[];
        audioOutputs: MediaDeviceInfo[];
        videoInputs: MediaDeviceInfo[];
    }>({ audioInputs: [], audioOutputs: [], videoInputs: [] });
    const [selectedAudioInput, setSelectedAudioInput] = useState<string>("");
    const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>("");
    const [selectedVideoInput, setSelectedVideoInput] = useState<string>("");

    const [micChecked, setMicChecked] = useState(false);
    const [micTestStatus, setMicTestStatus] = useState<"idle" | "listening" | "success" | "error">("idle");
    const [faceInFrameChecked, setFaceInFrameChecked] = useState(false);
    const [goodLightingChecked, setGoodLightingChecked] = useState(false);
    const [cameraChecked, setCameraChecked] = useState(false);
    const [steadyCameraChecked, setSteadyCameraChecked] = useState(false);
    const [showTroubleshooting, setShowTroubleshooting] = useState(false);

    // A link launched from a configured interview card should retain that
    // configuration even when it is opened in a fresh browser profile. The
    // session remains anonymous until the candidate signs in elsewhere.
    const hasConfiguredLaunch = Boolean(queryRole || queryCompany || queryInterviewType);
    const configuredRole = queryRole?.trim() || user?.role || "Software Engineer";
    const canStartInterview = micChecked && !isConnecting && !isEngineBusy;

    const loadDevices = async () => {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
        try {
            const list = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = list.filter((d) => d.kind === "audioinput");
            const audioOutputs = list.filter((d) => d.kind === "audiooutput");
            const videoInputs = list.filter((d) => d.kind === "videoinput");
            setDevices({ audioInputs, audioOutputs, videoInputs });
            if (audioInputs.length && !selectedAudioInput) setSelectedAudioInput(audioInputs[0].deviceId);
            if (audioOutputs.length && !selectedAudioOutput) setSelectedAudioOutput(audioOutputs[0].deviceId);
            if (videoInputs.length && !selectedVideoInput) setSelectedVideoInput(videoInputs[0].deviceId);
        } catch (e) {
            console.warn("Device enumeration failed:", e);
        }
    };

    useEffect(() => {
        loadDevices();
        if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
            navigator.mediaDevices.addEventListener("devicechange", loadDevices);
            return () => {
                navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
            };
        }
    }, []);

    useEffect(() => {
        if (previewStream && previewStream.getVideoTracks().some((t) => t.readyState === "live")) {
            setCameraChecked(true);
            setFaceInFrameChecked(true);
        }
    }, [previewStream]);

    const handleTestMic = async () => {
        setMicTestStatus("listening");
        try {
            let stream = previewStream;
            if (!stream || !stream.getAudioTracks().length) {
                const ok = await startStream();
                if (!ok) {
                    setMicTestStatus("error");
                    return;
                }
            }
            await loadDevices();

            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) {
                setTimeout(() => {
                    setMicTestStatus("success");
                    setMicChecked(true);
                }, 1200);
                return;
            }

            const ctx = new AudioCtx();
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = ctx.createMediaStreamSource(micStream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            let checks = 0;
            const timer = setInterval(() => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const avg = sum / dataArray.length;
                checks++;
                if (avg > 12 || checks >= 30) {
                    clearInterval(timer);
                    ctx.close().catch(() => {});
                    micStream.getTracks().forEach((t) => t.stop());
                    setMicTestStatus("success");
                    setMicChecked(true);
                }
            }, 100);
        } catch (e) {
            console.warn("Mic test error:", e);
            setMicTestStatus("error");
        }
    };

    const handlePlayTestSound = () => {
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = "sine";
            osc.frequency.setValueAtTime(523.25, ctx.currentTime);
            osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.14);
            osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.28);

            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.65);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.65);
            setTimeout(() => ctx.close().catch(() => {}), 750);
        } catch (e) {
            console.warn("Play test sound error:", e);
        }
    };

    const handleRestartDevices = async () => {
        stopStream();
        const ok = await startStream();
        await loadDevices();
        if (ok) {
            setCameraChecked(true);
        }
    };

    useEffect(() => {
        if (queryMode) {
            setInterviewMode(queryMode === "post_interview" ? "post_interview" : "live_coaching");
        }
        if (!isPlaceholderCompanyName(queryCompany)) {
            setTargetCompany(queryCompany?.trim() || "General Industry Benchmark");
        } else {
            try {
                const rawMeta = localStorage.getItem("useladder_last_session_meta");
                if (rawMeta) {
                    const parsed = JSON.parse(rawMeta);
                    if (!isPlaceholderCompanyName(parsed.companyName) && parsed.companyName !== "General Industry Benchmark") {
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
                role: configuredRole,
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
    }, [user?.role, user?.seniority, configuredRole, targetCompany]);

    // Auth check
    useEffect(() => {
        const raw = localStorage.getItem("useladder_user");
        if (!raw) {
            if (hasConfiguredLaunch) {
                setUser({
                    name: "Candidate",
                    role: queryRole?.trim() || "Software Engineer",
                    seniority: "Mid-Level",
                });
                setLoading(false);
                return;
            }
            router.push("/onboarding");
            return;
        }
        try {
            setUser(JSON.parse(raw));
        } catch {
            router.push("/onboarding");
        }
        setLoading(false);
    }, [router, hasConfiguredLaunch, queryRole]);

    // Automatically map user's target role & experience to the engine blueprint
    useEffect(() => {
        const raw = localStorage.getItem("useladder_user");
        if (raw) {
            try {
                const u: UserProfile = JSON.parse(raw);
                const mapped = blueprintForRole(queryRole?.trim() || u.role, u.seniority);
                setSelectedBlueprint(mapped);
            } catch { /* ignore */ }
        } else if (hasConfiguredLaunch) {
            setSelectedBlueprint(blueprintForRole(queryRole, "Mid-Level"));
        }
    }, [user, queryRole, hasConfiguredLaunch]);

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

    // The engine owns pacing; this display timer can be paused without
    // changing question selection or the server session.
    useEffect(() => {
        if (!sessionStarted || !engineState || engineState.complete || isTimerPaused) return;
        const base = engineState.elapsedSeconds;
        const baseAt = Date.now();
        setElapsedTick(base);
        const t = setInterval(() => {
            setElapsedTick(base + Math.floor((Date.now() - baseAt) / 1000));
        }, 1000);
        return () => clearInterval(t);
    }, [sessionStarted, engineState, isTimerPaused]);

    // TTS Audio & Regional Voice Engine
    const {
        playTts,
        playPipelinedSpeech,
        playFiller,
        prefetchTts,
        prefetchFillers,
        primeAudioCache,
        stopAudio,
        restoreAudio,
        resumeAudio,
        replayCurrentAudio,
        isPlaying: isAiSpeaking,
        isLoadingAudio,
        voiceLabel,
    } = useTtsAudio();

    // Canonical Voice Agent State Machine (LiveKit AgentActivity model)
    const agentActivity = useAgentActivity({
        initialState: "idle",
        minInterruptionDurationMs: 480,
        onStateChange: (_prev, current) => {
            if (current === "listening") {
                setIsListening(true);
            } else {
                setIsListening(false);
            }
        },
        onInterruption: () => {
            turnEpochRef.current += 1;
            stopAudio();
            setCurrentAnswer("");
            setFinalTranscript("");
        },
        onFalseInterruption: () => {
            resumeAudio();
            restoreAudio();
        },
    });

    const isListeningRef = useRef(isListening);
    isListeningRef.current = isListening;
    const isMutedRef = useRef(isMuted);
    isMutedRef.current = isMuted;
    const isEngineBusyRef = useRef(isEngineBusy);
    isEngineBusyRef.current = isEngineBusy;
    const sessionStartedRef = useRef(sessionStarted);
    sessionStartedRef.current = sessionStarted;

    const recognitionRef = useRef<any>(null);
    const isRecognitionActiveRef = useRef<boolean>(false);
    const accumulatedFinalTranscriptRef = useRef<string>("");
    const turnEpochRef = useRef(0);
    const recognitionEnabled = sessionStarted && !isMuted && agentActivity.isListening;

    const stopRecognition = useCallback(() => {
        isRecognitionActiveRef.current = false;
        if (recognitionRef.current) {
            try {
                recognitionRef.current.abort();
            } catch {}
            recognitionRef.current = null;
        }
    }, []);

    // Recognition is deliberately active only during the candidate's turn.
    // Leaving it on during TTS lets the browser transcribe the interviewer and
    // feed that text back into the turn loop.
    useEffect(() => {
        if (!recognitionEnabled) {
            stopRecognition();
            return;
        }

        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        if (!SpeechRecognition) return;

        isRecognitionActiveRef.current = true;
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
            // A delayed final result can arrive just after a turn transition.
            // Discard it rather than letting interviewer audio become an answer.
            if (agentActivity.stateRef.current !== "listening" || !isListeningRef.current || isEngineBusyRef.current) return;

            let interimTranscript = "";
            let finalChunk = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const item = event.results[i];
                if (item.isFinal) {
                    finalChunk += item[0].transcript + " ";
                } else {
                    interimTranscript += item[0].transcript;
                }
            }

            if (finalChunk) {
                accumulatedFinalTranscriptRef.current += finalChunk;
                setFinalTranscript(accumulatedFinalTranscriptRef.current.trim());
            }

            const fullTranscript = (accumulatedFinalTranscriptRef.current + interimTranscript).trim();
            setCurrentAnswer(fullTranscript);
        };

        recognition.onerror = (e: any) => {
            if (e.error !== "no-speech" && e.error !== "aborted") {
                console.warn("[SpeechRecognition] error:", e.error);
            }
        };

        recognition.onend = () => {
            // Auto-restart only while it is still the candidate's turn.
            if (isRecognitionActiveRef.current && sessionStartedRef.current && !isMutedRef.current && agentActivity.stateRef.current === "listening") {
                setTimeout(() => {
                    if (isRecognitionActiveRef.current && sessionStartedRef.current && !isMutedRef.current && agentActivity.stateRef.current === "listening" && recognitionRef.current) {
                        try {
                            recognitionRef.current.start();
                        } catch (err) {
                            // If already started or browser state in transition, next onend will catch it
                        }
                    }
                }, 100);
            }
        };

        try {
            recognition.start();
        } catch (e) {
            console.warn("[SpeechRecognition] start failed:", e);
        }

        return () => {
            if (recognitionRef.current === recognition) stopRecognition();
        };
    }, [recognitionEnabled, stopRecognition, agentActivity.stateRef]);

    // Background pre-fetch conversational fillers & upcoming questions to eliminate dead air
    useEffect(() => {
        prefetchFillers({ persona: "recruiter" });
    }, [prefetchFillers]);

    useEffect(() => {
        if (engineState?.upcomingQuestions && engineState.upcomingQuestions.length > 0) {
            prefetchTts(engineState.upcomingQuestions, { persona: "recruiter" });
        }
    }, [engineState?.upcomingQuestions, prefetchTts]);

    const speakQuestion = (
        text: string,
        onDone?: () => void,
        segments?: Array<{ text: string; audioUrl: string }>
    ) => {
        stopRecognition();
        accumulatedFinalTranscriptRef.current = "";
        agentActivity.transitionTo("speaking", "Starting question playback");
        setIsListening(false);
        setCurrentAnswer("");

        const playOptions = {
            persona: "recruiter" as const,
            preferImmediate: true,
            onStart: () => {
                accumulatedFinalTranscriptRef.current = "";
                agentActivity.transitionTo("speaking", "TTS audio playing");
                setIsListening(false);
                setCurrentAnswer("");
            },
            onEnd: () => {
                // 500ms acoustic grace period to allow room reverb and speaker echo to die
                setTimeout(() => {
                    accumulatedFinalTranscriptRef.current = "";
                    setCurrentAnswer("");
                    agentActivity.transitionTo("listening", "Interviewer speech ended, listening for candidate");
                    onDone?.();
                }, 500);
            },
        };

        if (segments && segments.length > 1) {
            playPipelinedSpeech(segments, playOptions);
        } else {
            playTts(text, playOptions);
        }
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
        const blueprintId = selectedBlueprint || blueprintForRole(configuredRole, user?.seniority);

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
                candidateName: candidateDisplayName,
                companyName: targetCompany,
            }),
        });
        if (!res.ok) return null;
        return res.json();
    };

    // Main entry point — user clicks "Start"
    const handleStartInterview = async () => {
        if (!micChecked) {
            setMicTestStatus("error");
            return;
        }
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
        setCurrentAnswer("");
        setIsListening(false);
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

    // Hand answer to orchestrator engine with conversational filler to eliminate dead air
    const submitTurnToEngine = async (candidateText: string) => {
        if (!sessionId) return;
        const turnEpoch = turnEpochRef.current;
        setIsEngineBusy(true);
        agentActivity.transitionTo("thinking", "Candidate submitted turn, processing");
        setIsListening(false);
        accumulatedFinalTranscriptRef.current = "";
        setCurrentAnswer("");
        setFinalTranscript("");

        // A brief bridge gives the interviewer a natural conversational beat.
        // It is deliberately capped so a slow model can never make the caller wait.
        const bridgeStartedAt = Date.now();
        const BRIDGE_RUNWAY_MS = 600;
        playFiller(candidateText, {
            persona: "recruiter",
            onStart: () => {
                setIsListening(false);
                setCurrentAnswer("");
            },
        });

        try {
            const res = await fetch(`/api/engine/session/${sessionId}/turn`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    answerText: candidateText,
                    persona: "recruiter",
                }),
            });
            if (!res.ok) throw new Error("turn failed");
            const data = await res.json();
            if (turnEpoch !== turnEpochRef.current) return;

            // Prime client audio cache immediately with server-synthesized audio URL
            if (data.audioUrl && data.prompt?.text) {
                primeAudioCache(data.prompt.text, data.audioUrl, data.voiceLabel, "recruiter");
            }

            setLocalTranscript((prev) => [
                ...prev,
                ...(candidateText ? [{ role: "candidate" as const, text: candidateText }] : []),
                ...(data.prompt.text ? [{ role: "interviewer" as const, text: data.prompt.text }] : []),
            ]);

            setCurrentPrompt(data.prompt);
            setEngineState(data.state);
            setCurrentAnswer("");
            setIsEditingAnswer(false);

            if (data.toolCall) {
                setActiveToolCall(data.toolCall);
                if (data.toolCall.tool !== "end_call") {
                    setTimeout(() => {
                        setActiveToolCall((prev) => (prev?.tool === data.toolCall.tool ? null : prev));
                    }, 4500);
                }
            } else {
                setActiveToolCall(null);
            }

            const playNext = () => {
                if (data.prompt.type === "complete" || data.state.complete || data.endCall) {
                    if (data.prompt.text) {
                        speakQuestion(data.prompt.text, () => handleComplete(), data.audioSegments);
                    } else {
                        handleComplete();
                    }
                    return;
                }

                if (data.prompt.text) {
                    speakQuestion(data.prompt.text, () => {
                        agentActivity.transitionTo("listening", "Interviewer speech ended, listening for candidate");
                    }, data.audioSegments);
                } else {
                    agentActivity.transitionTo("listening", "No prompt text, listening");
                }
            };

            const remainingBridgeMs = Math.max(0, BRIDGE_RUNWAY_MS - (Date.now() - bridgeStartedAt));
            window.setTimeout(playNext, remainingBridgeMs);
        } catch (err) {
            console.error("submitTurnToEngine error:", err);
            agentActivity.transitionTo("listening", "Engine turn error, re-enabling listening");
            setIsListening(true);
        } finally {
            setIsEngineBusy(false);
        }
    };

    // Candidate finished their answer — hand it to orchestrator or trigger instant coaching
    const handleNext = async (overrideText?: string) => {
        if (!sessionId || isEngineBusy) return;

        const candidateText = (typeof overrideText === "string" ? overrideText : finalTranscript).trim();
        if (!candidateText) return;
        lastCandidateAnswerRef.current = candidateText;
        accumulatedFinalTranscriptRef.current = "";
        setIsListening(false);
        setCurrentAnswer("");

        // Mock interviews stay uninterrupted. The score is generated only in
        // the explicit live-coaching mode and never blocks the voice turn.
        if (interviewMode === "live_coaching") {
            setIsStarScoring(true);
            void fetch("/api/interview/instant-feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question: currentPrompt?.text || "Interview question",
                answer: candidateText,
                role: user?.role || "Software Engineer",
                companyName: targetCompany || "Top Tech",
                category: queryCategory || "General Interview",
            }),
            })
                .then((res) => res.ok ? res.json() : null)
                .then((data) => {
                    if (data?.feedback?.star) setLatestStarScore(data.feedback.star);
                })
                .catch(() => undefined)
                .finally(() => setIsStarScoring(false));
        }

        await submitTurnToEngine(candidateText);
    };

    // Hands-free Voice Activity & Silence Detection (VAD)
    const { isCountingDown } = useTurnDetection({
        enabled: sessionStarted && !showEndModal && agentActivity.isListening && !isMuted,
        isAiSpeaking: agentActivity.isSpeaking,
        isEngineBusy: agentActivity.isThinking || isEngineBusy,
        activityTranscript: currentAnswer,
        currentTranscript: finalTranscript,
        minDelayMs: 3600,
        maxDelayMs: 8000,
        alpha: 0.35,
        minWords: 5,
        onTurnComplete: (transcript) => {
            handleNext(transcript);
        },
    });

    // Candidate reviewed coaching feedback and clicked "Next Question →"
    const handleContinueAfterCoaching = async () => {
        const textToSubmit = lastCandidateAnswerRef.current || currentAnswer.trim();
        setInstantFeedback(null);
        await submitTurnToEngine(textToSubmit);
    };

    // Candidate wants to retry answering the same question with coaching tips in mind
    const handleRetryAnswer = () => {
        setInstantFeedback(null);
        accumulatedFinalTranscriptRef.current = "";
        setCurrentAnswer("");
        setIsListening(true);
        agentActivity.transitionTo("listening", "Retrying answer with coach tips");
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

    const timeRemaining = Math.max(0, (engineState?.totalTimeBudgetSeconds ?? 1800) - elapsedTick);
    const timerTone = timeRemaining <= 120 ? styles.timerCritical : timeRemaining <= 300 ? styles.timerWarning : "";

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
                    <div
                        className={styles.logo}
                        onClick={() => router.replace("/dashboard")}
                        style={{ cursor: "pointer" }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") router.replace("/dashboard");
                        }}
                    >
                        <div className={styles.logoIcon}>
                            <img
                                src="https://res.cloudinary.com/dyg7neetr/image/upload/v1790510817/Vector_10_thljja.png"
                                alt="get prepped"
                                className={styles.logoImg}
                            />
                        </div>
                        <span className={styles.brandName}>get prepped</span>
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
                {!sessionStarted ? (
                    /* ── Pre-Interview Setup Page matching Reference Design ── */
                    <div className={styles.preInterviewWrapper}>
                        {/* Header: Dynamic Role Name + 14 min pill + Subtitle */}
                        <div className={styles.preInterviewHeader}>
                            <div className={styles.preInterviewTitleRow}>
                                <h1 className={styles.preInterviewTitle}>{headerInterviewTitle}</h1>
                                <span className={styles.preInterviewPill}>14 min</span>
                            </div>
                            <p className={styles.preInterviewSubtitle}>
                                Practice {interviewType || "role-specific"} questions for {configuredRole} with focused follow-ups based on your answers.
                            </p>
                        </div>

                        {/* 2-Column Grid */}
                        <div className={styles.preInterviewGrid}>
                            {/* Left Column: Video Box, Device Selectors, Links, Troubleshooting */}
                            <div className={styles.preInterviewLeft}>
                                <div className={styles.preInterviewVideoBox}>
                                    {previewStream && previewStream.getVideoTracks().length > 0 ? (
                                        <>
                                            <video
                                                ref={videoRef}
                                                className={styles.preInterviewVideoElement}
                                                autoPlay
                                                muted
                                                playsInline
                                            />
                                            <div className={styles.preInterviewLiveBadge}>
                                                <span className={styles.preInterviewLiveDot} />
                                                <span>Camera preview</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className={styles.preInterviewVideoPlaceholder}>
                                            <VideoCameraSlash size={34} weight="regular" color="#94A3B8" />
                                            <p className={styles.preInterviewVideoPlaceholderText}>
                                                {isConnecting ? "Connecting Camera & Mic…" : "Camera permission required"}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* 3 Device Selectors */}
                                <div className={styles.preInterviewDeviceGrid}>
                                    {/* Microphone */}
                                    <div className={styles.preInterviewDeviceItem}>
                                        <div className={styles.preInterviewDeviceSelectWrap}>
                                            <Microphone size={16} />
                                            <select
                                                className={styles.preInterviewDeviceSelect}
                                                value={selectedAudioInput}
                                                onChange={(e) => setSelectedAudioInput(e.target.value)}
                                            >
                                                {devices.audioInputs.length > 0 ? (
                                                    devices.audioInputs.map((d, i) => (
                                                        <option key={d.deviceId || i} value={d.deviceId}>
                                                            {d.label || `Microphone ${i + 1}`}
                                                        </option>
                                                    ))
                                                ) : (
                                                    <option value="">Permission required</option>
                                                )}
                                            </select>
                                            <span className={styles.preInterviewDeviceChevron}>
                                                <CaretUpDown size={12} />
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className={styles.preInterviewDeviceLink}
                                            onClick={handleTestMic}
                                        >
                                            Test your mic
                                        </button>
                                    </div>

                                    {/* Speaker */}
                                    <div className={styles.preInterviewDeviceItem}>
                                        <div className={styles.preInterviewDeviceSelectWrap}>
                                            <SpeakerHigh size={16} />
                                            <select
                                                className={styles.preInterviewDeviceSelect}
                                                value={selectedAudioOutput}
                                                onChange={(e) => setSelectedAudioOutput(e.target.value)}
                                            >
                                                {devices.audioOutputs.length > 0 ? (
                                                    devices.audioOutputs.map((d, i) => (
                                                        <option key={d.deviceId || i} value={d.deviceId}>
                                                            {d.label || `Speaker ${i + 1}`}
                                                        </option>
                                                    ))
                                                ) : (
                                                    <option value="">Select speakers</option>
                                                )}
                                            </select>
                                            <span className={styles.preInterviewDeviceChevron}>
                                                <CaretUpDown size={12} />
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className={styles.preInterviewDeviceLink}
                                            onClick={handlePlayTestSound}
                                        >
                                            Play test sound
                                        </button>
                                    </div>

                                    {/* Camera */}
                                    <div className={styles.preInterviewDeviceItem}>
                                        <div className={styles.preInterviewDeviceSelectWrap}>
                                            <VideoCamera size={16} />
                                            <select
                                                className={styles.preInterviewDeviceSelect}
                                                value={selectedVideoInput}
                                                onChange={(e) => setSelectedVideoInput(e.target.value)}
                                            >
                                                {devices.videoInputs.length > 0 ? (
                                                    devices.videoInputs.map((d, i) => (
                                                        <option key={d.deviceId || i} value={d.deviceId}>
                                                            {d.label || `Camera ${i + 1}`}
                                                        </option>
                                                    ))
                                                ) : (
                                                    <option value="">Permission required</option>
                                                )}
                                            </select>
                                            <span className={styles.preInterviewDeviceChevron}>
                                                <CaretUpDown size={12} />
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className={styles.preInterviewDeviceLink}
                                            onClick={handleRestartDevices}
                                        >
                                            Restart devices
                                        </button>
                                    </div>
                                </div>

                                {/* Troubleshooting Help Button */}
                                <button
                                    type="button"
                                    className={styles.preInterviewHelpBtn}
                                    onClick={() => setShowTroubleshooting(!showTroubleshooting)}
                                >
                                    Troubleshooting help
                                </button>

                                {showTroubleshooting && (
                                    <div className={styles.preInterviewHelpContent}>
                                        <div>
                                            <strong>1. Check Browser Permissions:</strong> Click the padlock or camera icon in your address bar and select &quot;Allow&quot; for Camera &amp; Microphone.
                                        </div>
                                        <div>
                                            <strong>2. Free Up Hardware:</strong> Close other applications (Zoom, Teams, FaceTime) that may have exclusive hold of your camera or microphone.
                                        </div>
                                        <div>
                                            <strong>3. Microphone Input:</strong> If speaking is not detected, check your default input volume in macOS System Settings &gt; Sound &gt; Input.
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right Column: Tabs (Setup checks [5] | About assessment) */}
                            <div className={styles.preInterviewRight}>
                                <div className={styles.preInterviewTabs}>
                                    <button
                                        type="button"
                                        className={`${styles.preInterviewTab} ${activePreTab === "checks" ? styles.preInterviewTabActive : ""}`}
                                        onClick={() => setActivePreTab("checks")}
                                    >
                                        <span>Setup checks</span>
                                        <span className={styles.preInterviewTabBadge}>5</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.preInterviewTab} ${activePreTab === "about" ? styles.preInterviewTabActive : ""}`}
                                        onClick={() => setActivePreTab("about")}
                                    >
                                        <span>About assessment</span>
                                    </button>
                                </div>

                                {activePreTab === "checks" ? (
                                    <div className={styles.preInterviewCheckList}>
                                        {/* Check 1: Working mic (Required) */}
                                        <div className={styles.preInterviewCheckCard}>
                                            <div className={styles.preInterviewCheckHeader}>
                                                <div className={styles.preInterviewCheckTitleWrap}>
                                                    <span className={`${styles.preInterviewCheckIcon} ${micChecked ? styles.preInterviewCheckIconDone : ""}`}>
                                                        {micChecked ? <Check size={12} weight="bold" /> : <Minus size={12} weight="bold" />}
                                                    </span>
                                                    <span className={styles.preInterviewCheckLabel}>
                                                        <strong>Working mic:</strong> Read the phrase out loud
                                                    </span>
                                                </div>
                                                <span className={styles.preInterviewRequiredBadge}>Required</span>
                                            </div>

                                            <div className={styles.preInterviewPromptBox}>
                                                I am ready to begin my assessment
                                            </div>

                                            <div className={styles.preInterviewMicRow}>
                                                <button
                                                    type="button"
                                                    className={styles.preInterviewTestMicBtn}
                                                    onClick={handleTestMic}
                                                    disabled={micTestStatus === "listening"}
                                                >
                                                    {micTestStatus === "listening" ? "Listening…" : micChecked ? "Test mic again" : "Test mic"}
                                                </button>

                                                {micTestStatus === "listening" && (
                                                    <div className={styles.preInterviewMicMeter}>
                                                        <span className={styles.preInterviewMicBar} />
                                                        <span className={styles.preInterviewMicBar} />
                                                        <span className={styles.preInterviewMicBar} />
                                                        <span className={styles.preInterviewMicBar} />
                                                    </div>
                                                )}

                                                {micChecked && (
                                                    <span className={styles.preInterviewMicResult} style={{ color: "#10B981" }}>
                                                        <CheckCircle size={15} weight="fill" /> Audio verified
                                                    </span>
                                                )}
                                                {micTestStatus === "error" && (
                                                    <span className={styles.preInterviewMicResult} style={{ color: "#EF4444" }}>
                                                        <Warning size={15} weight="fill" /> Mic access needed
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Check 2: Face in frame */}
                                        <div
                                            className={styles.preInterviewCheckCardSimple}
                                            onClick={() => setFaceInFrameChecked(!faceInFrameChecked)}
                                        >
                                            <span className={`${styles.preInterviewCheckIcon} ${faceInFrameChecked ? styles.preInterviewCheckIconDone : ""}`}>
                                                {faceInFrameChecked ? <Check size={12} weight="bold" /> : <Minus size={12} weight="bold" />}
                                            </span>
                                            <span className={styles.preInterviewCheckLabel}>
                                                <strong>Face in frame:</strong> Sit an arm&apos;s length back
                                            </span>
                                        </div>

                                        {/* Check 3: Good lighting */}
                                        <div
                                            className={styles.preInterviewCheckCardSimple}
                                            onClick={() => setGoodLightingChecked(!goodLightingChecked)}
                                        >
                                            <span className={`${styles.preInterviewCheckIcon} ${goodLightingChecked ? styles.preInterviewCheckIconDone : ""}`}>
                                                {goodLightingChecked ? <Check size={12} weight="bold" /> : <Minus size={12} weight="bold" />}
                                            </span>
                                            <span className={styles.preInterviewCheckLabel}>
                                                <strong>Good lighting:</strong> Face a window or lamp, not away from it
                                            </span>
                                        </div>

                                        {/* Check 4: Working camera */}
                                        <div
                                            className={styles.preInterviewCheckCardSimple}
                                            onClick={() => setCameraChecked(!cameraChecked)}
                                        >
                                            <span className={`${styles.preInterviewCheckIcon} ${cameraChecked ? styles.preInterviewCheckIconDone : ""}`}>
                                                {cameraChecked ? <Check size={12} weight="bold" /> : <Minus size={12} weight="bold" />}
                                            </span>
                                            <span className={styles.preInterviewCheckLabel}>
                                                <strong>Working camera:</strong> Check the picture is sharp
                                            </span>
                                        </div>

                                        {/* Check 5: Steady camera */}
                                        <div
                                            className={styles.preInterviewCheckCardSimple}
                                            onClick={() => setSteadyCameraChecked(!steadyCameraChecked)}
                                        >
                                            <span className={`${styles.preInterviewCheckIcon} ${steadyCameraChecked ? styles.preInterviewCheckIconDone : ""}`}>
                                                {steadyCameraChecked ? <Check size={12} weight="bold" /> : <Minus size={12} weight="bold" />}
                                            </span>
                                            <span className={styles.preInterviewCheckLabel}>
                                                <strong>Steady camera:</strong> Set your device on a desk or table
                                            </span>
                                        </div>

                                        {/* Primary Start CTA */}
                                        <button
                                            type="button"
                                            className={styles.preInterviewStartCta}
                                            onClick={handleStartInterview}
                                            disabled={!canStartInterview}
                                            aria-describedby="start-interview-requirement"
                                        >
                                            {isConnecting
                                                ? "Connecting Camera & Mic…"
                                                : isEngineBusy
                                                  ? "Preparing your interview…"
                                                  : "Start interview"}
                                        </button>

                                        {mediaError && (
                                            <p
                                                style={{
                                                    color: "#ef4444",
                                                    fontSize: "0.8rem",
                                                    marginTop: "0.4rem",
                                                    textAlign: "center",
                                                    background: "rgba(239, 68, 68, 0.08)",
                                                    padding: "0.45rem 0.75rem",
                                                    borderRadius: "6px",
                                                    border: "1px solid rgba(239, 68, 68, 0.2)"
                                                }}
                                            >
                                                {mediaError}
                                            </p>
                                        )}

                                        <p className={styles.preInterviewFooterNote}>
                                            <span id="start-interview-requirement">
                                                Test your microphone to enable the interview. Your mock interview stays uninterrupted, with feedback after it ends.
                                            </span>
                                        </p>
                                    </div>
                                ) : (
                                    <div className={styles.aboutAssessmentCard}>
                                        <div className={styles.aboutAssessmentItem}>
                                            <div>
                                                <h4 className={styles.aboutAssessmentItemTitle}>This is an AI interview</h4>
                                                <p className={styles.aboutAssessmentItemDesc}>
                                                    This interview is built around the role you&apos;re preparing for. It includes focused questions about your experience, skills, and approach to the work, with follow-up questions based on your responses—just like you can expect in a real interview.
                                                </p>
                                            </div>
                                        </div>

                                        <div className={styles.aboutAssessmentItem}>
                                            <Clock size={20} className={styles.aboutAssessmentIcon} />
                                            <div>
                                                <h4 className={styles.aboutAssessmentItemTitle}>Expect to spend ~</h4>
                                                <p className={styles.aboutAssessmentItemDesc}>15 minutes</p>
                                            </div>
                                        </div>

                                        <div className={styles.aboutAssessmentItem}>
                                            <Chats size={20} className={styles.aboutAssessmentIcon} />
                                            <div>
                                                <h4 className={styles.aboutAssessmentItemTitle}>Need assistance?</h4>
                                                <p className={styles.aboutAssessmentItemDesc}>Just ask</p>
                                            </div>
                                        </div>

                                        <div className={styles.aboutAssessmentItem}>
                                            <Ticket size={20} className={styles.aboutAssessmentIcon} />
                                            <div>
                                                <h4 className={styles.aboutAssessmentItemTitle}>1 pass available</h4>
                                                <p className={styles.aboutAssessmentItemDesc} style={{ opacity: 0 }}>.</p>
                                            </div>
                                        </div>

                                        <div className={styles.aboutAssessmentItem}>
                                            <ShieldCheck size={20} className={styles.aboutAssessmentIcon} />
                                            <div>
                                                <h4 className={styles.aboutAssessmentItemTitle}>Your data is in your control</h4>
                                            </div>
                                        </div>

                                        <div className={styles.aboutAssessmentItem}>
                                            <CalendarDots size={20} className={styles.aboutAssessmentIcon} />
                                            <div>
                                                <h4 className={styles.aboutAssessmentItemTitle}>Interview on your own time</h4>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* ── Live Active Interview Session ── */
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

                                {/* During session: Show HUD */}
                                {isRecording && (
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
                                                onClick={handleEndClick}
                                            />
                                        </div>

                                        {/* Status / Coach overlay pill */}
                                        <div className={styles.videoStatusPill}>
                                            <div
                                                className={`${styles.statusDot} ${
                                                    isAiSpeaking
                                                        ? styles.statusDotSpeaking
                                                        : isListening
                                                          ? styles.statusDotListening
                                                          : isEngineBusy
                                                            ? styles.statusDotThinking
                                                            : ""
                                                }`}
                                            />
                                            <span>
                                                {isAiSpeaking
                                                    ? "Interviewer is speaking…"
                                                    : isEngineBusy
                                                        ? "Evaluating response…"
                                                        : "Live"}
                                            </span>
                                            {interviewMode === "live_coaching" && (
                                                <span className={styles.liveCoachTag}>
                                                    <Star size={11} weight="fill" /> Coach Active
                                                </span>
                                            )}
                                        </div>
                                    </>
                                )}

                                {countdown !== null && (
                                    <div className={styles.countdownOverlay}>
                                        <span className={styles.countdownNumber}>
                                            {countdown}
                                        </span>
                                    </div>
                                )}

                                {/* Floating in-video controls */}
                                <div className={styles.videoControls}>
                                    <button
                                        className={`${styles.controlBtn} ${
                                            isMuted ? styles.controlBtnActive : ""
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
                            </div>
                        </div>

                        {/* Right Column */}
                        <div className={styles.rightColumn}>
                            {/* Questions Card */}
                            <div className={`${styles.infoCard} ${interviewMode === "live_coaching" && (isGeneratingInstantFeedback || instantFeedback) ? styles.infoCardCoachingActive : ""}`}>
                                <div className={styles.cardHeader}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                        <div className={styles.headerLabel}>
                                            <span>{headerInterviewTitle}</span>
                                        </div>
                                    </div>
                                    <div className={`${styles.timer} ${timerTone}`} title="Time remaining in this interview">
                                        <span className={styles.timerBlinkDot} />
                                        <span>{fmt(timeRemaining)}</span>
                                        <button
                                            type="button"
                                            className={styles.timerPauseButton}
                                            onClick={() => setIsTimerPaused((paused) => !paused)}
                                            title={isTimerPaused ? "Resume visual timer" : "Pause visual timer"}
                                            aria-label={isTimerPaused ? "Resume visual timer" : "Pause visual timer"}
                                        >
                                            {isTimerPaused ? <Play size={13} weight="fill" /> : <Pause size={13} weight="fill" />}
                                        </button>
                                    </div>
                                </div>

                                {activeToolCall && (
                                    <div className={`${styles.toolCallBadge} ${activeToolCall.tool === "end_call" ? styles.toolCallBadgeEnding : ""}`}>
                                        <span>
                                            {activeToolCall.tool === "end_call"
                                                ? "⚡ Action: Ending Interview (Voice command detected)"
                                                : activeToolCall.tool === "repeat_question"
                                                ? "⚡ Action: Repeating Question"
                                                : activeToolCall.tool === "skip_question"
                                                ? "⚡ Action: Skipping to Next Question"
                                                : `⚡ Action: ${activeToolCall.tool}`}
                                        </span>
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
                                            {questionNumber > 0 ? `Question ${questionNumber}` : "Interviewer"}
                                        </span>
                                    </div>
                                    <h2 className={styles.questionText}>
                                        {isEngineBusy
                                            ? "…"
                                            : (currentPrompt?.text ?? "")}
                                    </h2>
                                    {questionNumber > 0 && (
                                        <div className={styles.questionMetaBelow}>
                                            Question {questionNumber}{engineState?.sectionCount ? ` · ${sectionProgress}` : ""}
                                        </div>
                                    )}
                                </div>

                                {currentPrompt?.text && !isAiSpeaking && !isLoadingAudio && (
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

                                {((isListening && !isAiSpeaking) || currentAnswer.trim()) && (
                                    <div className={`${styles.liveSpeechBox} ${currentAnswer.trim() ? styles.liveSpeechActive : ""}`}>
                                        <div className={styles.liveSpeechHeader}>
                                            <span className={styles.speechPulseDot} />
                                            <span>Your Response</span>
                                            {currentAnswer.trim() && (
                                                <span className={styles.wordCountBadge}>
                                                    {currentAnswer.trim().split(/\s+/).filter(Boolean).length} words
                                                </span>
                                            )}
                                        </div>
                                        <div className={styles.liveSpeechContent}>
                                            {currentAnswer.trim() ? (
                                                <p className={styles.liveSpeechText}>{currentAnswer}</p>
                                            ) : (
                                                <p className={styles.liveSpeechPlaceholder}>Speak your answer… (audio is captured automatically)</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className={styles.cardFooter}>
                                    <span style={{ fontSize: '0.8rem', color: '#555' }}>
                                        {`${sectionProgress}${engineState?.pacing !== "normal" && engineState ? ` · pacing: ${engineState.pacing}` : ""}`}
                                    </span>
                                    {!isAiSpeaking && !isEngineBusy && (isListening || isCountingDown) && (
                                        <button
                                            type="button"
                                            className={styles.quickSendBtn}
                                            onClick={() => handleNext()}
                                            title="Finish answer immediately"
                                        >
                                            Done speaking
                                        </button>
                                    )}
                                </div>
                            </div>

                            {interviewMode === "live_coaching" && (isStarScoring || latestStarScore) && (
                                <section className={styles.starScorePanel} aria-live="polite">
                                    <div className={styles.starScoreHeader}>
                                        <div>
                                            <span className={styles.starScoreEyebrow}>Answer structure</span>
                                            <h3>STAR signal</h3>
                                        </div>
                                        {isStarScoring ? (
                                            <div className={styles.starPending}><span className={styles.miniSpinner} /> Scoring</div>
                                        ) : latestStarScore ? (
                                            <div className={styles.starOverall}>{latestStarScore.overallScore}<span>/100</span></div>
                                        ) : null}
                                    </div>
                                    {latestStarScore && (
                                        <>
                                            <div className={styles.starMetrics}>
                                                {[
                                                    ["Situation", latestStarScore.situation],
                                                    ["Task", latestStarScore.task],
                                                    ["Action", latestStarScore.action],
                                                    ["Result", latestStarScore.result],
                                                ].map(([label, score]) => (
                                                    <div key={label as string} className={styles.starMetric}>
                                                        <div><span>{label}</span><strong>{score as number}</strong></div>
                                                        <i><b style={{ width: `${Math.min(100, Number(score) * 4)}%` }} /></i>
                                                    </div>
                                                ))}
                                            </div>
                                            <p className={styles.starSummary}>{latestStarScore.summary}</p>
                                            <p className={styles.starFocus}>Next: {latestStarScore.nextFocus}</p>
                                        </>
                                    )}
                                </section>
                            )}

                            {/* Live Coaching Panel – Runs in-page beside video below question */}
                            {interviewMode === "live_coaching" && (isGeneratingInstantFeedback || instantFeedback) && (
                                <div className={styles.inlineFeedbackCard}>
                                    {isGeneratingInstantFeedback ? (
                                        <div className={styles.inlineAnalyzingCard}>
                                            <div className={styles.inlineAnalyzingHeader}>
                                                <div className={styles.inlineCoachBadge}>
                                                    <Sparkle size={14} weight="fill" />
                                                    <span>AI Coach Evaluating</span>
                                                </div>
                                                {targetCompany && (
                                                    <span className={styles.inlineTargetCompany}>
                                                        Target: {targetCompany}
                                                    </span>
                                                )}
                                            </div>
                                            <div className={styles.inlineAnalyzingBody}>
                                                <div className={styles.inlineAnalyzingSpinnerWrap}>
                                                    <div className={styles.inlineAnalyzingSpinner} />
                                                </div>
                                                <div className={styles.inlineAnalyzingContent}>
                                                    <h4 className={styles.inlineAnalyzingTitle}>Analyzing your response…</h4>
                                                    <p className={styles.inlineAnalyzingText}>
                                                        Evaluating structure, delivery, and alignment with {targetCompany || "role"} standards.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={styles.inlineAnalyzingProgressTrack}>
                                                <div className={styles.inlineAnalyzingProgressBar} />
                                            </div>
                                        </div>
                                    ) : instantFeedback ? (
                                        <div className={styles.inlineFeedbackContent}>
                                            <div className={styles.inlineFeedbackHeader}>
                                                <div className={styles.inlineCoachProfile}>
                                                    <div className={styles.inlineCoachAvatar}>
                                                        <Sparkle size={16} weight="fill" />
                                                    </div>
                                                    <div>
                                                        <h3 className={styles.inlineCoachTitle}>Live Coach Feedback</h3>
                                                        <p className={styles.inlineCoachSubtitle}>Instant Per-Question Critique</p>
                                                    </div>
                                                </div>
                                                <div className={styles.inlineScoreBadgeRow}>
                                                    <span
                                                        className={`${styles.inlineRatingPill} ${
                                                            instantFeedback.rating === "Strong"
                                                                ? styles.ratingStrong
                                                                : instantFeedback.rating === "Average"
                                                                ? styles.ratingAverage
                                                                : styles.ratingNeedsWork
                                                        }`}
                                                    >
                                                        {instantFeedback.rating}
                                                    </span>
                                                    <span className={styles.inlineScorePill}>
                                                        {instantFeedback.score}/100
                                                    </span>
                                                </div>
                                            </div>

                                            <div className={styles.inlineFeedbackBody}>
                                                <div className={styles.inlineHeadlineCard}>
                                                    &ldquo;{instantFeedback.headline}&rdquo;
                                                </div>

                                                {instantFeedback.strengths && instantFeedback.strengths.length > 0 && (
                                                    <div>
                                                        <div className={styles.inlineSectionTitle}>
                                                            <CheckCircle size={15} weight="fill" color="#10b981" />
                                                            <span>What Worked Well</span>
                                                        </div>
                                                        <ul className={styles.inlineStrengthsList}>
                                                            {instantFeedback.strengths.map((str, idx) => (
                                                                <li key={idx} className={styles.inlineStrengthsItem}>
                                                                    <CheckCircle size={14} weight="fill" />
                                                                    <span>{str}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {instantFeedback.coachingTip && (
                                                    <div className={styles.inlineCoachingTipCard}>
                                                        <div className={styles.inlineSectionTitle} style={{ color: "#b45309" }}>
                                                            <Lightbulb size={15} weight="fill" color="#d97706" />
                                                            <span>Coach Polish Tip</span>
                                                        </div>
                                                        <p>{instantFeedback.coachingTip}</p>
                                                    </div>
                                                )}

                                                {instantFeedback.modelAnswer && (
                                                    <div className={styles.inlineModelAnswerCard}>
                                                        <div className={styles.inlineSectionTitle} style={{ color: "#475569" }}>
                                                            <Star size={14} weight="fill" color="#f59e0b" />
                                                            <span>Top 1% Model Answer Benchmark</span>
                                                        </div>
                                                        <p>&ldquo;{instantFeedback.modelAnswer}&rdquo;</p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className={styles.inlineFeedbackFooter}>
                                                <button
                                                    type="button"
                                                    className={styles.inlineRetryBtn}
                                                    onClick={handleRetryAnswer}
                                                    title="Re-speak your answer using the coach's tips"
                                                >
                                                    <span>Try Answer Again</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className={styles.inlineContinueBtn}
                                                    onClick={handleContinueAfterCoaching}
                                                >
                                                    <span>Next Question</span>
                                                    <ArrowRight size={15} weight="bold" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

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
