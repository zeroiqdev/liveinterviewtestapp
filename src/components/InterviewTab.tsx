"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useInterview } from "../context/InterviewContext";
import { useMediaRecorder } from "../hooks/useMediaRecorder";
import styles from "./interview.module.css";
import { blueprintForRole } from "../engine/roleMapping";
import type { EnginePrompt, ProbeDepth, PublicSessionState } from "../engine/types";
import { getStoredJobRegion, useTtsAudio } from "../hooks/useTtsAudio";
import { useTurnDetection } from "../hooks/useTurnDetection";
import { useAgentActivity } from "../hooks/useAgentActivity";
import { useVoiceActivity } from "../hooks/useVoiceActivity";
import { detectVoiceCommand } from "../engine/voiceCommands";
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
        getStream,
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
    const [micTestError, setMicTestError] = useState<string | null>(null);
    // How hard the interviewer follows up on vague answers (remembered per browser).
    const [probeDepth, setProbeDepth] = useState<ProbeDepth>("standard");
    useEffect(() => {
        const fromQuery = searchParams.get("probe");
        if (fromQuery === "deep" || fromQuery === "standard") {
            setProbeDepth(fromQuery);
            return;
        }
        try {
            const saved = localStorage.getItem("useladder_probe_depth");
            if (saved === "deep" || saved === "standard") setProbeDepth(saved);
        } catch { /* ignore */ }
    }, [searchParams]);
    const chooseProbeDepth = (depth: ProbeDepth) => {
        setProbeDepth(depth);
        try {
            localStorage.setItem("useladder_probe_depth", depth);
        } catch { /* ignore */ }
    };
    // Live speech-recognition problems (blocked mic, unsupported browser, …)
    const [recognitionError, setRecognitionError] = useState<string | null>(null);
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

    // Tests the *selected* mic and only passes when it actually hears speech.
    const handleTestMic = async () => {
        setMicTestStatus("listening");
        setMicTestError(null);
        setMicChecked(false);
        try {
            const ok = await startStream({ audioDeviceId: selectedAudioInput, videoDeviceId: selectedVideoInput });
            if (!ok) {
                setMicTestError("Microphone access was blocked. Allow mic access for this site in your browser's address bar, then try again.");
                setMicTestStatus("error");
                return;
            }
            await loadDevices();

            const track = getStream()?.getAudioTracks().find((t) => t.readyState === "live");
            if (!track) {
                setMicTestError("No live microphone found. Check the mic is plugged in and selected above.");
                setMicTestStatus("error");
                return;
            }

            const AudioCtx =
                window.AudioContext ||
                (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioCtx) {
                setMicTestStatus("success");
                setMicChecked(true);
                return;
            }

            const ctx = new AudioCtx();
            const source = ctx.createMediaStreamSource(new MediaStream([track]));
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            source.connect(analyser);

            const samples = new Float32Array(analyser.fftSize);
            const startedAt = Date.now();
            let heardMs = 0;
            const timer = setInterval(() => {
                analyser.getFloatTimeDomainData(samples);
                let sum = 0;
                for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
                const rms = Math.sqrt(sum / samples.length);
                if (rms > 0.02) heardMs += 100;

                const heard = heardMs >= 400; // ~0.4s of real speech
                const timedOut = Date.now() - startedAt >= 8000;
                if (heard || timedOut) {
                    clearInterval(timer);
                    source.disconnect();
                    ctx.close().catch(() => {});
                    if (heard) {
                        setMicTestStatus("success");
                        setMicChecked(true);
                    } else {
                        setMicTestError(
                            `We couldn't hear anything from "${track.label || "your microphone"}". Speak while testing, check it isn't muted (including in Discord or your headset), or pick a different mic above.`
                        );
                        setMicTestStatus("error");
                    }
                }
            }, 100);
        } catch (e) {
            console.warn("Mic test error:", e);
            setMicTestError("Couldn't start the microphone test. Check mic permissions and try again.");
            setMicTestStatus("error");
        }
    };

    // Picking a different mic reopens the stream on it and requires a re-test.
    const handleMicChange = async (deviceId: string) => {
        setSelectedAudioInput(deviceId);
        setMicChecked(false);
        setMicTestStatus("idle");
        setMicTestError(null);
        if (previewStream) {
            await startStream({ audioDeviceId: deviceId, videoDeviceId: selectedVideoInput });
        }
    };

    // Browser speech recognition always listens on the browser's *default*
    // mic, not the one picked here. Warn when they differ.
    const recognitionMicMismatch = useMemo(() => {
        if (!selectedAudioInput || selectedAudioInput === "default") return null;
        const defaultEntry = devices.audioInputs.find((d) => d.deviceId === "default");
        const picked = devices.audioInputs.find((d) => d.deviceId === selectedAudioInput);
        if (!defaultEntry || !picked?.label) return null;
        if (defaultEntry.label.includes(picked.label)) return null;
        return defaultEntry.label.replace(/^Default\s*-\s*/i, "");
    }, [selectedAudioInput, devices.audioInputs]);

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
        const ok = await startStream({ audioDeviceId: selectedAudioInput, videoDeviceId: selectedVideoInput });
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
        prefetchTts,
        prefetchFillers,
        primeAudioCache,
        stopAudio,
        pauseAudio,
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
            // Playback was already resumed by handleCancelInterruption. Sound
            // that vanishes as soon as playback pauses is usually speaker
            // echo; after repeated hits, stop listening for barge-in on this
            // utterance rather than stuttering the interviewer.
            falseInterruptionsRef.current += 1;
            if (falseInterruptionsRef.current >= 2) bargeInAllowedRef.current = false;
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
    const preparedTurnRef = useRef<{ text: string; controller: AbortController; turnId: string } | null>(null);
    const activeTurnIdRef = useRef<string | null>(null);
    const endpointAtRef = useRef<Map<string, number>>(new Map());
    // Barge-in is allowed per utterance: never on the closing message (its
    // end triggers handleComplete), and disabled after repeated echo hits.
    const bargeInAllowedRef = useRef(true);
    const falseInterruptionsRef = useRef(0);
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
        if (!SpeechRecognition) {
            setRecognitionError(
                "This browser can't transcribe speech. Use Google Chrome or Microsoft Edge to answer by voice."
            );
            return;
        }

        isRecognitionActiveRef.current = true;
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        // Nigerian English recognition is noticeably more accurate for Nigerian accents.
        recognition.lang = /nigeria/i.test(getStoredJobRegion()) ? "en-NG" : "en-US";
        recognition.onaudiostart = () => setRecognitionError(null);

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
            if (e.error === "no-speech" || e.error === "aborted") return;
            console.warn("[SpeechRecognition] error:", e.error);
            if (e.error === "language-not-supported" && recognition.lang !== "en-US") {
                // en-NG unavailable here — the auto-restart in onend retries in en-US.
                recognition.lang = "en-US";
                return;
            }
            const messages: Record<string, string> = {
                "not-allowed": "Microphone access is blocked for this site. Click the mic icon in the address bar, allow it, then reload.",
                "service-not-allowed": "Speech recognition is disabled in this browser. Use Google Chrome or Microsoft Edge.",
                "audio-capture": "No microphone could be opened for transcription. Check your browser's default mic (Settings → Privacy → Site settings → Microphone) and that no app has exclusive control of it.",
                network: "Speech recognition couldn't reach its service. Check your connection; Brave and some privacy browsers block it — use Chrome or Edge.",
                "language-not-supported": "Speech recognition doesn't support this language setting in your browser.",
            };
            setRecognitionError(messages[e.error] || `Speech recognition error: ${e.error}`);
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

    // Candidate talking over the interviewer: pause playback, verify it is
    // sustained speech, then hand the turn to the candidate.
    useVoiceActivity({
        stream: previewStream,
        enabled: sessionStarted && !isMuted && !showEndModal && agentActivity.isSpeaking,
        onSpeechStart: () => {
            if (!bargeInAllowedRef.current) return;
            agentActivity.handlePotentialInterruption(() => undefined, pauseAudio);
        },
        onSpeechEnd: () => {
            agentActivity.handleCancelInterruption(resumeAudio);
        },
    });

    const speakQuestion = (
        text: string,
        onDone?: () => void,
        segments?: Array<{ text: string; audioUrl: string }>,
        opts?: { interruptible?: boolean }
    ) => {
        bargeInAllowedRef.current = opts?.interruptible ?? true;
        falseInterruptionsRef.current = 0;
        stopRecognition();
        accumulatedFinalTranscriptRef.current = "";
        agentActivity.transitionTo("speaking", "Starting question playback");
        setIsListening(false);
        setCurrentAnswer("");

        const playOptions = {
            persona: "recruiter" as const,
            preferImmediate: true,
            onStart: () => {
                if (activeTurnIdRef.current && process.env.NEXT_PUBLIC_ONSCRIPT_TURN_TRACE === "1") {
                    console.info(`[turn:${activeTurnIdRef.current}] playback_started`);
                    const endpointAt = endpointAtRef.current.get(activeTurnIdRef.current);
                    if (endpointAt) {
                        console.info(`[turn:${activeTurnIdRef.current}] endpoint_to_playback_ms=${Date.now() - endpointAt}`);
                        endpointAtRef.current.delete(activeTurnIdRef.current);
                    }
                }
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
                probeDepth,
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
        const granted = await startStream({ audioDeviceId: selectedAudioInput, videoDeviceId: selectedVideoInput });
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
        const turnId = preparedTurnRef.current?.text === candidateText
            ? preparedTurnRef.current.turnId
            : crypto.randomUUID();
        activeTurnIdRef.current = turnId;
        if (process.env.NEXT_PUBLIC_ONSCRIPT_TURN_TRACE === "1") {
            console.info(`[turn:${turnId}] endpoint_confirmed`);
        }
        endpointAtRef.current.set(turnId, Date.now());
        const turnEpoch = turnEpochRef.current;
        setIsEngineBusy(true);
        agentActivity.transitionTo("thinking", "Candidate submitted turn, processing");
        setIsListening(false);
        accumulatedFinalTranscriptRef.current = "";
        setCurrentAnswer("");
        setFinalTranscript("");

        try {
            const res = await fetch(`/api/engine/session/${sessionId}/turn`, {
                method: "POST",
                headers: { "content-type": "application/json", "x-onscript-turn-id": turnId },
                body: JSON.stringify({
                    answerText: candidateText,
                    persona: "recruiter",
                    // Same region the client uses for the opening question, so
                    // server-synthesized turns keep the same voice.
                    jobRegion: getStoredJobRegion(),
                }),
            });
            if (!res.ok) throw new Error("turn failed");
            const data = await res.json();
            if (process.env.NEXT_PUBLIC_ONSCRIPT_TURN_TRACE === "1") {
                console.info(`[turn:${turnId}] turn_response_received`);
            }
            if (turnEpoch !== turnEpochRef.current) return;

            // Prime only the text each URL actually contains. A prepared bank
            // transition may be one exact combined clip or sentence segments.
            if (data.audioSegments?.length) {
                data.audioSegments.forEach((segment: { text: string; audioUrl: string }) => {
                    if (segment.audioUrl) primeAudioCache(segment.text, segment.audioUrl, data.voiceLabel, "recruiter");
                });
            } else if (data.audioUrl && data.prompt?.text) {
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
                        speakQuestion(data.prompt.text, () => handleComplete(), data.audioSegments, { interruptible: false });
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

            playNext();
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

        // Mock interviews stay uninterrupted. Live coaching pauses after each
        // answer to show feedback; the candidate then retries or continues.
        // Voice commands ("repeat that", "end the interview") skip coaching.
        if (interviewMode === "live_coaching" && !detectVoiceCommand(candidateText)) {
            // Idle stops recognition and endpointing while feedback is shown.
            agentActivity.transitionTo("idle", "Reviewing coaching feedback");
            setIsGeneratingInstantFeedback(true);
            setIsStarScoring(true);
            let feedback: InstantQuestionFeedback | null = null;
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
                const data = res.ok ? await res.json() : null;
                feedback = data?.feedback ?? null;
            } catch {
                feedback = null;
            } finally {
                setIsGeneratingInstantFeedback(false);
                setIsStarScoring(false);
            }

            if (feedback) {
                setInstantFeedback(feedback);
                if (feedback.star) setLatestStarScore(feedback.star);
                return; // handleRetryAnswer / handleContinueAfterCoaching take over
            }
            // Coaching unavailable — keep the interview moving.
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
        minDelayMs: 2200,
        maxDelayMs: 4500,
        alpha: 0.35,
        minWords: 5,
        onTurnLikelyComplete: (transcript) => {
            if (!sessionId || transcript.trim().length < 24) return;
            if (preparedTurnRef.current?.text === transcript) return;
            preparedTurnRef.current?.controller.abort();
            const controller = new AbortController();
            const turnId = crypto.randomUUID();
            preparedTurnRef.current = { text: transcript, controller, turnId };
            if (process.env.NEXT_PUBLIC_ONSCRIPT_TURN_TRACE === "1") {
                console.info(`[turn:${turnId}] stt_snapshot_ready`);
            }
            void fetch(`/api/engine/session/${sessionId}/prepare`, {
                method: "POST",
                headers: { "content-type": "application/json", "x-onscript-turn-id": turnId },
                body: JSON.stringify({ answerText: transcript }),
                signal: controller.signal,
            })
                .then((res) => res.ok ? res.json() : null)
                .then((data) => {
                    if (data?.preparedText && preparedTurnRef.current?.turnId === turnId) {
                        // Warm the exact bridge + selected bank question while
                        // endpointing is still protecting the candidate turn.
                        prefetchTts([data.preparedText], { persona: "recruiter", turnId });
                    }
                })
                .catch(() => undefined);
        },
        onTurnActivity: (transcript) => {
            const prepared = preparedTurnRef.current;
            if (!prepared || prepared.text === transcript) return;
            prepared.controller.abort();
            preparedTurnRef.current = null;
            if (process.env.NEXT_PUBLIC_ONSCRIPT_TURN_TRACE === "1") {
                console.info(`[turn:${prepared.turnId}] prepare_discarded`);
            }
        },
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
        setFinalTranscript("");
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

        // Stats are recorded on the feedback page once the real score exists.
        const minutes = Math.max(1, Math.round(elapsedTick / 60));
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
                durationMinutes: minutes,
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

    const handleLogout = async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } catch {}
        localStorage.removeItem("useladder_user");
        router.push("/login");
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
                                                onChange={(e) => void handleMicChange(e.target.value)}
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
                                                        <Warning size={15} weight="fill" /> {micTestError ? "Mic test failed" : "Mic access needed"}
                                                    </span>
                                                )}
                                            </div>
                                            {micTestStatus === "error" && micTestError && (
                                                <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#EF4444", lineHeight: 1.4 }}>
                                                    {micTestError}
                                                </p>
                                            )}
                                            {recognitionMicMismatch && (
                                                <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#B45309", lineHeight: 1.4 }}>
                                                    Heads up: answers are transcribed from your browser&apos;s default mic
                                                    (&ldquo;{recognitionMicMismatch}&rdquo;), not the one selected. Make your
                                                    selected mic the default in your browser&apos;s site settings or in Windows
                                                    Sound settings.
                                                </p>
                                            )}
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

                                        {/* Probing depth */}
                                        <div style={{ marginBottom: "0.85rem" }}>
                                            <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                                                Follow-up depth
                                            </div>
                                            <div role="radiogroup" aria-label="Follow-up depth" style={{ display: "flex", gap: "0.5rem" }}>
                                                {([
                                                    { value: "standard", title: "Standard", hint: "Up to 2 follow-ups on vague answers" },
                                                    { value: "deep", title: "Deep dive", hint: "Up to 4 — keeps pushing until you prove it" },
                                                ] as const).map((opt) => {
                                                    const selected = probeDepth === opt.value;
                                                    return (
                                                        <button
                                                            key={opt.value}
                                                            type="button"
                                                            role="radio"
                                                            aria-checked={selected}
                                                            onClick={() => chooseProbeDepth(opt.value)}
                                                            style={{
                                                                flex: 1,
                                                                textAlign: "left",
                                                                padding: "0.55rem 0.7rem",
                                                                borderRadius: 10,
                                                                border: `1.5px solid ${selected ? "#2563EB" : "rgba(148, 163, 184, 0.45)"}`,
                                                                background: selected ? "rgba(37, 99, 235, 0.08)" : "transparent",
                                                                color: "inherit",
                                                                cursor: "pointer",
                                                            }}
                                                        >
                                                            <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{opt.title}</div>
                                                            <div style={{ fontSize: "0.72rem", opacity: 0.75, marginTop: 2 }}>{opt.hint}</div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
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

                                {((isListening && !isAiSpeaking) || currentAnswer.trim() || recognitionError) && (
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
                                                recognitionError ? (
                                                    <p className={styles.liveSpeechPlaceholder} style={{ color: "#EF4444" }} role="alert">{recognitionError}</p>
                                                ) : (
                                                    <p className={styles.liveSpeechPlaceholder}>Speak your answer… (audio is captured automatically)</p>
                                                )
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
