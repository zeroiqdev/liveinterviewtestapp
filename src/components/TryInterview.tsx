"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Microphone, MicrophoneSlash, SpeakerHigh, VideoCamera, VideoCameraSlash } from "@phosphor-icons/react";
import { TryStartForm } from "./TryStartForm";
import { clearTry, continueUrl, readTry, saveTry, type TryState } from "@/lib/tryClient";
import { initialsOf } from "@/lib/interviewer";
import { useTurnDetection, type VoiceState } from "@/hooks/useTurnDetection";
import { useVoiceActivity } from "@/hooks/useVoiceActivity";
import { unlockMediaElement } from "@/hooks/useTtsAudio";
import ob from "./onboarding.module.css";
import iv from "./interview.module.css";
import styles from "./tryInterview.module.css";

/** Longest the microphone listens for one answer. */
const MAX_LISTEN_MS = 120_000;
/** Longest "Start" waits for a question's audio before showing it as text only. */
const AUDIO_WAIT_MS = 8000;

/** The same characters as at sign-up. */
const RECRUITER_AVATAR = "/char2.png";
const COACH_AVATAR = "/char1.png";

type Stage = "loading" | "form" | "brief" | "asking" | "wall";

interface QuestionAudio {
    audioUrl: string | null;
    voiceLabel: string | null;
}

/** Records one of this try's questions in the interviewer's voice. */
function fetchQuestionAudio(index: number): Promise<QuestionAudio> {
    return fetch("/api/try/audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index }) })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => ({
            audioUrl: typeof data?.audioUrl === "string" ? data.audioUrl : null,
            voiceLabel: typeof data?.voiceLabel === "string" ? data.voiceLabel : null,
        }))
        .catch(() => ({ audioUrl: null, voiceLabel: null }));
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

interface Recognition {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
    onerror: ((e: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
}

function recognitionClass(): (new () => Recognition) | null {
    if (typeof window === "undefined") return null;
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const MIC_BLOCKED = "We need your microphone to hear your answer. Allow it in your browser, then press Try again.";

/** The character and a short line above each step, as at sign-up. */
function Greeting({ avatar, alt, children, speaking = false }: { avatar: string; alt: string; children: React.ReactNode; speaking?: boolean }) {
    return (
        <div className={ob.greetingChipRow}>
            <Image src={avatar} alt={alt} width={36} height={36} className={`${ob.greetingCharImg} ${speaking ? styles.speaking : ""}`} />
            <div className={ob.greetingBadge}>{children}</div>
        </div>
    );
}

/**
 * The interview a visitor gets before signing up. The steps around it look
 * like sign-up; the questions themselves happen in the same room as the full
 * interview: the interviewer's tile, their own camera, and answers spoken,
 * never typed.
 */
export default function TryInterview() {
    const router = useRouter();
    const [stage, setStage] = useState<Stage>("loading");
    const [state, setState] = useState<TryState | null>(null);
    const [answer, setAnswer] = useState("");
    const [interim, setInterim] = useState("");
    const [listening, setListening] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [canListen, setCanListen] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [micError, setMicError] = useState<string | null>(null);
    const [signedIn, setSignedIn] = useState(false);
    const [preparing, setPreparing] = useState(false);
    // Shown as "Interviewer", never the voice's own name.
    const interviewerName = "Interviewer";
    const [currentAudio, setCurrentAudio] = useState<string | null>(null);

    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    // Read when a question finishes playing, to know whether to open the microphone.
    const isMutedRef = useRef(false);
    const recognitionRef = useRef<Recognition | null>(null);
    const wantListeningRef = useRef(false);
    const listenTimerRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    // The questions' audio, recorded while they read what the job will test.
    const audioRequestsRef = useRef<Map<number, Promise<QuestionAudio>>>(new Map());

    const questionAudio = useCallback((index: number) => {
        const requests = audioRequestsRef.current;
        if (!requests.has(index)) requests.set(index, fetchQuestionAudio(index));
        return requests.get(index)!;
    }, []);

    useEffect(() => {
        const saved = readTry();
        setState(saved);
        setCanListen(Boolean(recognitionClass()));
        setStage(!saved ? "form" : saved.done ? "wall" : "brief");
        fetch("/api/auth/me")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => setSignedIn(Boolean(data?.authenticated)))
            .catch(() => undefined);
    }, []);

    // As soon as the job has been read: record this question, then the next.
    useEffect(() => {
        if (stage !== "brief" || !state) return;
        const current = state.question.index;
        void questionAudio(current).then(() => (current + 1 < state.total ? questionAudio(current + 1) : null));
    }, [stage, state, questionAudio]);

    const bindVideo = useCallback(
        (el: HTMLVideoElement | null) => {
            if (el && stream && el.srcObject !== stream) el.srcObject = stream;
        },
        [stream]
    );

    const stopDevices = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setStream(null);
    }, []);

    /** Camera and microphone, as in the full interview. The camera is optional; the microphone isn't. */
    const openDevices = useCallback(async (): Promise<boolean> => {
        if (streamRef.current) return true;
        try {
            let media: MediaStream;
            try {
                media = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            } catch {
                media = await navigator.mediaDevices.getUserMedia({ audio: true });
                setIsVideoOff(true);
            }
            streamRef.current = media;
            setStream(media);
            setMicError(null);
            return true;
        } catch {
            setMicError(MIC_BLOCKED);
            return false;
        }
    }, []);

    const stopListening = useCallback(() => {
        wantListeningRef.current = false;
        if (listenTimerRef.current) window.clearTimeout(listenTimerRef.current);
        listenTimerRef.current = null;
        try {
            recognitionRef.current?.stop();
        } catch {
            // Already stopped.
        }
        setListening(false);
    }, []);

    const startListening = useCallback(() => {
        const Recognizer = recognitionClass();
        if (!Recognizer || wantListeningRef.current) return;
        try {
            const recognition = new Recognizer();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = "en-NG";
            recognition.onresult = (e) => {
                let heard = "";
                let partial = "";
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    const result = e.results[i];
                    if (result.isFinal) heard += result[0].transcript;
                    else partial += result[0].transcript;
                }
                if (heard.trim()) setAnswer((current) => `${current} ${heard}`.replace(/\s+/g, " ").trimStart());
                setInterim(partial);
            };
            recognition.onerror = (e) => {
                if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
                    wantListeningRef.current = false;
                    setMicError(MIC_BLOCKED);
                }
            };
            // Browsers end recognition after a pause; carry on until the answer is done.
            recognition.onend = () => {
                if (!wantListeningRef.current) return setListening(false);
                try {
                    recognition.start();
                } catch {
                    setListening(false);
                }
            };
            recognitionRef.current = recognition;
            wantListeningRef.current = true;
            recognition.start();
            setListening(true);
            listenTimerRef.current = window.setTimeout(stopListening, MAX_LISTEN_MS);
        } catch {
            setListening(false);
        }
    }, [stopListening]);

    useEffect(() => () => {
        stopListening();
        audioRef.current?.pause();
        streamRef.current?.getTracks().forEach((track) => track.stop());
    }, [stopListening]);

    const play = useCallback(
        (audioUrl: string | null, then: () => void) => {
            if (!audioUrl) return then();
            const audio = audioRef.current ?? new Audio();
            audioRef.current = audio;
            audio.src = audioUrl;
            audio.onended = then;
            audio.onerror = then;
            setSpeaking(true);
            audio.play().catch(then);
        },
        []
    );

    /** The interviewer asks; then the microphone opens for the answer. */
    const ask = useCallback(
        (audio: QuestionAudio) => {
            setAnswer("");
            setInterim("");
            setError(null);
            setCurrentAudio(audio.audioUrl);
            play(audio.audioUrl, () => {
                setSpeaking(false);
                if (!isMutedRef.current) startListening();
            });
        },
        [play, startListening]
    );


    const replay = () => {
        if (!currentAudio || speaking) return;
        stopListening();
        play(currentAudio, () => {
            setSpeaking(false);
            if (!isMutedRef.current) startListening();
        });
    };

    const toggleMute = () => {
        const next = !isMuted;
        isMutedRef.current = next;
        setIsMuted(next);
        streamRef.current?.getAudioTracks().forEach((track) => (track.enabled = !next));
        if (next) stopListening();
        else if (!speaking && !busy) startListening();
    };

    const toggleVideo = () => {
        const next = !isVideoOff;
        streamRef.current?.getVideoTracks().forEach((track) => (track.enabled = !next));
        setIsVideoOff(next || (streamRef.current?.getVideoTracks().length ?? 0) === 0);
    };

    const begin = async () => {
        if (!state || preparing || !canListen) return;
        // Unlocked during this tap: Safari and iPhones won't play the question later otherwise.
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.setAttribute("playsinline", "");
        unlockMediaElement(audioRef.current);
        setPreparing(true);
        // Asked on this tap, so the browser lets the page use the camera and microphone.
        const [audio] = await Promise.all([withTimeout(questionAudio(state.question.index), AUDIO_WAIT_MS, { audioUrl: null, voiceLabel: null }), openDevices()]);
        setPreparing(false);
        setStage("asking");
        ask(audio);
    };

    const retryMic = async () => {
        setMicError(null);
        if (await openDevices()) startListening();
    };

    const submitAnswer = async (heard?: string) => {
        if (!state || busy) return;
        const text = (heard ?? `${answer} ${interim}`).replace(/\s+/g, " ").trim();
        if (text.split(" ").length < 3) return setError("We didn't catch enough of your answer. Say a little more, then press Done speaking.");
        stopListening();
        setInterim("");
        audioRef.current?.pause();
        setSpeaking(false);
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/try/answer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ index: state.question.index, answer: text }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 404) {
                stopDevices();
                clearTry();
                setState(null);
                setStage("form");
                return;
            }
            if (!res.ok) throw new Error(data.error || "We couldn't save that answer. Please try again.");
            if (data.done) {
                stopDevices();
                const next: TryState = { ...state, done: true, feedback: data.feedback ?? null, firstQuestion: data.question, secondQuestion: data.secondQuestion };
                saveTry(next);
                setState(next);
                setStage("wall");
            } else {
                const audio = await withTimeout(questionAudio(data.question.index), AUDIO_WAIT_MS, { audioUrl: null, voiceLabel: null });
                const next: TryState = { ...state, question: data.question };
                saveTry(next);
                setState(next);
                ask(audio);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "We couldn't save that answer. Please try again.");
        } finally {
            setBusy(false);
        }
    };

    const carryOn = () => {
        if (!state) return;
        // The report page reads this to label the interview.
        try {
            localStorage.setItem(
                "useladder_last_session_meta",
                JSON.stringify({ role: state.role, companyName: state.company || undefined, preparationTitle: `${state.title} Interview`, interviewMode: "live_coaching", startedAt: new Date().toISOString() })
            );
        } catch {
            // Saved data is blocked: the report still works without the label.
        }
        router.push(signedIn ? continueUrl(state) : "/onboarding?try=1");
    };

    // The answer ends by itself, as in the full interview: about two seconds of
    // real quiet after they stop (up to three when they're mid-thought), timed
    // from when the microphone last heard them, so a pause to think never cuts
    // them off. "Done speaking" stays as a shortcut.
    const voiceRef = useRef<VoiceState>({ speaking: false, lastAt: 0 });
    const [isUserSpeaking, setIsUserSpeaking] = useState(false);
    const answering = stage === "asking" && listening && !isMuted && !speaking && !busy;
    useVoiceActivity({
        stream,
        enabled: answering,
        threshold: 0.012,
        adaptive: true,
        startMs: 100,
        stopMs: 200,
        onSpeechStart: () => {
            voiceRef.current = { speaking: true, lastAt: Date.now() };
            setIsUserSpeaking(true);
        },
        onSpeechEnd: () => {
            voiceRef.current = { speaking: false, lastAt: Date.now() };
            setIsUserSpeaking(false);
        },
    });
    const getVoiceState = useCallback(() => voiceRef.current, []);
    useTurnDetection({
        enabled: answering,
        isAiSpeaking: speaking,
        isEngineBusy: busy,
        activityTranscript: `${answer} ${interim}`.trim(),
        currentTranscript: answer,
        minDelayMs: 2000,
        maxDelayMs: 3000,
        minWords: 5,
        getVoiceState,
        // Browsers stall transcription in long answers; restarting it catches up.
        onTranscriptionStalled: () => {
            try {
                recognitionRef.current?.stop();
            } catch {
                // Not running.
            }
        },
        onTurnComplete: (heard) => {
            if (heard.trim().split(/\s+/).length >= 3) void submitAnswer(heard);
        },
    });

    if (stage === "loading") return null;

    const jobLine = state ? [state.title, state.company].filter(Boolean).join(" · ") : "";

    if (stage === "asking" && state) {
        const spoken = `${answer} ${interim}`.trim();
        const words = spoken ? spoken.split(/\s+/).length : 0;
        return (
            <div className={iv.interviewPage}>
                <nav className={iv.navbar}>
                    <div className={iv.navLeft}>
                        <Link href="/" className={iv.logo} style={{ textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
                            <div className={iv.logoIcon}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="https://res.cloudinary.com/dyg7neetr/image/upload/v1790510817/Vector_10_thljja.png" alt="get prepped" className={iv.logoImg} />
                            </div>
                            <span className={iv.brandName}>get prepped</span>
                        </Link>
                    </div>
                    <span className={styles.navJob}>{jobLine}</span>
                </nav>

                <main className={iv.mainContent}>
                    <div className={iv.contentGrid}>
                        <div className={iv.videoCard}>
                            <div className={iv.videoFeed}>
                                <div className={iv.speakerStage}>
                                    <div
                                        className={`${iv.speakerAvatar} ${speaking ? iv.speakerAvatarSpeaking : ""}`}
                                        aria-label={`${interviewerName}${speaking ? " is speaking" : ""}`}
                                    >
                                        <span className={iv.speakerRing} aria-hidden="true" />
                                        <span className={`${iv.speakerRing} ${iv.speakerRingDelayed}`} aria-hidden="true" />
                                        <span className={iv.speakerInitials}>{initialsOf(interviewerName)}</span>
                                    </div>
                                    <div className={iv.speakerName}>
                                        <span className={`${iv.speakingBars} ${speaking ? iv.speakingBarsOn : ""}`} aria-hidden="true">
                                            <i /><i /><i />
                                        </span>
                                        <span className={iv.speakerNameText}>{interviewerName}</span>
                                    </div>
                                </div>

                                <div className={`${iv.selfTile} ${isUserSpeaking && !isMuted ? iv.selfTileSpeaking : ""}`}>
                                    {isVideoOff || !stream ? (
                                        <div className={iv.selfTileInitials}>You</div>
                                    ) : (
                                        <video ref={bindVideo} className={iv.selfTileVideo} autoPlay muted playsInline />
                                    )}
                                    <span className={iv.selfTileLabel}>
                                        {isMuted && <MicrophoneSlash size={11} weight="bold" />}
                                        You
                                    </span>
                                </div>

                                <div className={iv.videoControls}>
                                    <button
                                        type="button"
                                        className={`${iv.controlBtn} ${isMuted ? iv.controlBtnActive : ""}`}
                                        onClick={toggleMute}
                                        aria-label={isMuted ? "Unmute" : "Mute"}
                                        title={isMuted ? "Unmute" : "Mute"}
                                    >
                                        {isMuted ? <MicrophoneSlash size={18} /> : <Microphone size={18} />}
                                    </button>
                                    <button
                                        type="button"
                                        className={`${iv.controlBtn} ${isVideoOff ? iv.controlBtnActive : ""}`}
                                        onClick={toggleVideo}
                                        aria-label={isVideoOff ? "Turn camera on" : "Turn camera off"}
                                        title={isVideoOff ? "Turn camera on" : "Turn camera off"}
                                        disabled={!stream || stream.getVideoTracks().length === 0}
                                    >
                                        {isVideoOff ? <VideoCameraSlash size={18} /> : <VideoCamera size={18} />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className={iv.rightColumn}>
                            <div className={iv.infoCard}>
                                <div className={iv.cardHeader}>
                                    <div className={iv.headerLabel}>
                                        <span>Question {state.question.index + 1} of {state.total}</span>
                                    </div>
                                </div>

                                <div className={iv.questionSection}>
                                    <div className={iv.interviewerHeader}>
                                        <div className={iv.questionAvatarWrap}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={RECRUITER_AVATAR} alt="Interviewer" className={iv.questionAvatarImg} draggable={false} />
                                            {speaking && <span className={iv.questionSpeakingDot} />}
                                        </div>
                                        <span className={iv.interviewerLabel}>Question {state.question.index + 1}</span>
                                    </div>
                                    <h2 className={iv.questionText}>{state.question.text}</h2>
                                </div>

                                {currentAudio && !speaking && (
                                    <div style={{ marginBottom: "0.85rem" }}>
                                        <button type="button" className={iv.replayAudioBtn} onClick={replay} title="Replay the question">
                                            <SpeakerHigh size={14} weight="bold" />
                                            <span>Replay Audio</span>
                                        </button>
                                    </div>
                                )}

                                {!speaking && (
                                    <div className={`${iv.liveSpeechBox} ${spoken ? iv.liveSpeechActive : ""}`}>
                                        <div className={iv.liveSpeechHeader}>
                                            <span className={iv.speechPulseDot} />
                                            <span>Your Response</span>
                                            {words > 0 && <span className={iv.wordCountBadge}>{words} words</span>}
                                        </div>
                                        <div className={iv.liveSpeechContent}>
                                            {micError ? (
                                                <p className={iv.liveSpeechPlaceholder} style={{ color: "#EF4444" }} role="alert">{micError}</p>
                                            ) : spoken ? (
                                                <p className={iv.liveSpeechText}>{spoken}</p>
                                            ) : (
                                                <p className={iv.liveSpeechPlaceholder}>{isMuted ? "You're muted. Unmute to answer." : busy ? "Saving your answer…" : "Speak your answer. When you pause at the end, we'll move on."}</p>
                                            )}
                                        </div>
                                        {error && (
                                            <p className={iv.liveSpeechPlaceholder} style={{ color: "#EF4444", padding: "0 1rem 0.75rem" }} role="alert">{error}</p>
                                        )}
                                    </div>
                                )}

                                <div className={iv.cardFooter}>
                                    <span />
                                    {micError && !speaking && (
                                        <button type="button" className={iv.quickSendBtn} onClick={retryMic}>Try again</button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    // Job, question one, question two, feedback.
    const progress = stage === "form" || stage === "brief" ? 1 : 4;

    return (
        <div className={ob.splitWrapper}>
            <div className={ob.leftHeroPanel}>
                <div className={ob.leftHeroCenter}>
                    <h1 className={ob.welcomeHeading}>
                        <span className={ob.welcomeRow}>
                            Practise
                            <svg className={ob.sparkleIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
                            </svg>
                        </span>
                        <span>for the job</span>
                    </h1>
                    <p className={ob.lockInSubtitle}>{stage === "form" ? "Two questions, no account needed" : jobLine}</p>
                </div>
                <div />
            </div>

            <div className={ob.rightContentPanel}>
                <div className={ob.topProgressBar}>
                    {[1, 2, 3, 4].map((step) => (
                        <span key={step} className={`${ob.progressSegment} ${step <= progress ? ob.progressSegmentActive : ""}`} />
                    ))}
                </div>

                {stage === "form" && (
                    <div>
                        <Greeting avatar={RECRUITER_AVATAR} alt="Recruiter">Hi there</Greeting>
                        <h2 className={ob.stepTitleParabole}>Which job are you applying for?</h2>
                        <p className={`${ob.stepSubtitle} ${styles.subtitleGap}`}>
                            Paste the job description and I&rsquo;ll ask you two questions written for that job. You&rsquo;ll see how your first answer landed.
                        </p>
                        <TryStartForm />
                        <p className={ob.switchAuthPrompt}>
                            Already have an account?{" "}
                            <Link href="/login" className={ob.switchAuthLink}>Sign in</Link>
                        </p>
                    </div>
                )}

                {stage === "brief" && state && (
                    <div>
                        <Greeting avatar={RECRUITER_AVATAR} alt="Recruiter">{jobLine}</Greeting>
                        <h2 className={ob.stepTitleParabole}>What this job will test you on</h2>
                        <p className={`${ob.stepSubtitle} ${styles.subtitleGap}`}>
                            I&rsquo;ll ask you {state.total} questions about this job. Answer out loud, the way you would in the room. Your browser will ask to use your microphone and camera.
                        </p>
                        <div className={ob.roleResultsList}>
                            {state.themes.map((theme, i) => (
                                <div key={theme} className={`${ob.roleTintRow} ${styles.themeRow}`}>
                                    <span>{theme}</span>
                                    <span className={styles.themeNumber}>{i + 1}</span>
                                </div>
                            ))}
                        </div>
                        {!canListen && (
                            <div className={ob.authErrorBanner} role="alert">
                                <span>This practice listens to your answer, which works in Chrome, Edge and Safari. Open this page in one of those to continue.</span>
                            </div>
                        )}
                        <button type="button" className={ob.continueSubmitBtn} onClick={begin} disabled={preparing || !canListen}>
                            {preparing ? "Getting your first question ready..." : "Start the interview"}
                        </button>
                    </div>
                )}

                {stage === "wall" && state && (
                    <div>
                        <Greeting avatar={COACH_AVATAR} alt="Interview Coach">Your first answer</Greeting>
                        {state.firstQuestion && <p className={ob.stepSubtitle}>&ldquo;{state.firstQuestion}&rdquo;</p>}

                        {state.feedback ? (
                            <div className={styles.feedback}>
                                <div className={styles.scoreRow}>
                                    <span className={styles.score}>{state.feedback.score}</span>
                                    <span className={styles.scoreOf}>out of 100</span>
                                </div>
                                {state.feedback.working && (
                                    <div className={styles.point}>
                                        <div className={ob.resultsHeaderLabel}>What worked</div>
                                        <p>{state.feedback.working}</p>
                                    </div>
                                )}
                                <div className={styles.point}>
                                    <div className={ob.resultsHeaderLabel}>Fix this first</div>
                                    <p>{state.feedback.fix}</p>
                                </div>
                            </div>
                        ) : (
                            <p className={`${ob.stepSubtitle} ${styles.subtitleGap}`}>Your answers are saved. Your feedback will be in your report once you sign up.</p>
                        )}

                        <div className={styles.locked}>
                            <div className={styles.lockedHead}>
                                <Lock size={15} weight="bold" />
                                <span>Feedback on your second answer</span>
                            </div>
                            {state.secondQuestion && <p className={ob.stepSubtitle}>&ldquo;{state.secondQuestion}&rdquo;</p>}
                            <div className={styles.blurred} aria-hidden="true">
                                <span /><span /><span />
                            </div>
                        </div>

                        <h2 className={ob.stepTitleParabole}>{signedIn ? "Carry on with your interview" : "Sign up to carry on"}</h2>
                        <p className={ob.stepSubtitle}>
                            Your two answers are saved. The interview picks up at question three for the same job, and your full report covers every answer. It&rsquo;s free.
                        </p>
                        <button type="button" className={ob.continueSubmitBtn} onClick={carryOn}>
                            {signedIn ? "Continue the interview" : "Sign up and continue"}
                        </button>
                        {!signedIn && (
                            <p className={ob.switchAuthPrompt}>
                                Already have an account?{" "}
                                <Link href="/login?redirect=/dashboard" className={ob.switchAuthLink}>Sign in</Link>
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
