"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useInterview } from "../context/InterviewContext";
import { useMediaRecorder } from "../hooks/useMediaRecorder";
import { useTtsAudio } from "../hooks/useTtsAudio";
import { Play, Pause, Square, Microphone, ArrowsOut, DownloadSimple, CheckCircle, Clock } from "@phosphor-icons/react";

export default function VideoSession() {
    const { settings, setStatus, setInterviewBlob } = useInterview();
    const { previewStream, startRecording, stopRecording, isRecording, mediaBlob } = useMediaRecorder();
    const {
        playTts,
        stopAudio,
        replayCurrentAudio,
        isPlaying: aiSpeaking,
        isLoadingAudio,
        voiceLabel,
    } = useTtsAudio();
    const videoRef = useRef<HTMLVideoElement>(null);
    const router = useRouter();

    const [currentQuestion, setCurrentQuestion] = useState("");
    const [transcript, setTranscript] = useState<{ time: string, text: string, sender: 'AI' | 'User' }[]>([]);
    const [questions, setQuestions] = useState<string[]>([]);
    const [loadingQuestions, setLoadingQuestions] = useState(true);

    // Initialize Questions
    useEffect(() => {
        // Dynamic import to avoid server-side issues if any
        import("../utils/questionMatcher").then(({ getQuestionsForSession }) => {
            const q = getQuestionsForSession(settings.role, settings.experience, settings.industry);
            setQuestions(q);
            setLoadingQuestions(false);
        });
    }, [settings]);

    useEffect(() => {
        if (videoRef.current && previewStream) {
            videoRef.current.srcObject = previewStream;
        }
    }, [previewStream]);

    // Handle Recording Completion
    useEffect(() => {
        if (mediaBlob) {
            stopAudio();
            setInterviewBlob(mediaBlob);
            setStatus("completed");
            router.push("/feedback");
        }
    }, [mediaBlob, setInterviewBlob, setStatus, router, stopAudio]);

    const addTranscript = (text: string, sender: 'AI' | 'User') => {
        const time = new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' });
        setTranscript(prev => [...prev, { time, text, sender }]);
    };

    /* TIMER LOGIC */
    const [timeLeft, setTimeLeft] = useState(60);
    const [isTimerActive, setIsTimerActive] = useState(false);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isTimerActive && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0) {
            setIsTimerActive(false);
            // Optional: Auto-advance logic could go here
        }
        return () => clearInterval(interval);
    }, [isTimerActive, timeLeft]);

    const speakQuestion = (text: string) => {
        setIsTimerActive(false);
        setTimeLeft(60);
        setCurrentQuestion(text);
        addTranscript(text, 'AI');

        playTts(text, {
            persona: "recruiter",
            onStart: () => {
                setIsTimerActive(false);
            },
            onEnd: () => {
                setIsTimerActive(true); // Start user response timer
            },
        });
    };

    const [qIndex, setQIndex] = useState(0);

    const handleNext = () => {
        // Reset timer when moving manually
        setIsTimerActive(false);
        setTimeLeft(60);

        if (qIndex < questions.length - 1) {
            const nextQ = qIndex + 1;
            setQIndex(nextQ);
            speakQuestion(questions[nextQ]);
        } else {
            stopRecording();
        }
    };

    const startSession = () => {
        if (questions.length === 0) return;
        startRecording();
        setTimeout(() => speakQuestion(questions[0]), 1000);
    };

    return (
        <div className="grid grid-cols-12 gap-6 h-full">

            {/* LEFT COLUMN (Course Info & Material) */}
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                {/* 1. Course Info Widget */}
                <div className="dashboard-card">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Comprehensive Interview Test Role-Play</h2>
                    <p className="text-sm text-gray-500 mb-4">Course by <span className="text-blue-600 cursor-pointer">Antigravity AI</span></p>

                    <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                        Enhance your interview performance with this role-play training course. Through interactive scenarios and expert guidance.
                    </p>

                    <div className="flex gap-2 mb-6">
                        <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-xs font-medium">Tone</span>
                        <span className="bg-green-50 text-green-600 px-3 py-1 rounded-full text-xs font-medium">Accuracy</span>
                        <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-medium">Speed</span>
                    </div>

                    <div className="space-y-3 text-sm text-gray-600">
                        <div className="flex justify-between">
                            <span className="flex items-center gap-2"><Square size={14} /> Lecture Type</span>
                            <span className="font-semibold text-gray-900">Live AI</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="flex items-center gap-2"><Clock size={14} /> Duration</span>
                            <span className="font-semibold text-gray-900">~15 Mins</span>
                        </div>
                    </div>
                </div>

                {/* 3. Material (Lesson Steps) */}
                <div className="dashboard-card flex-1">
                    <h3 className="font-bold text-gray-900 mb-4">Material</h3>
                    <div className="space-y-4">
                        {[
                            { title: "Preparing for the Interview", done: true },
                            { title: "Understand the Role", current: true },
                            { title: "Breaking down job descriptions", time: "12:23" },
                            { title: "Aligning skills with requirements", time: "12:23" },
                        ].map((item, i) => (
                            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${item.current ? "bg-orange-50 border border-orange-100" : "hover:bg-gray-50"}`}>
                                <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${item.done ? "bg-green-500 text-white" : item.current ? "border-2 border-orange-500" : "border border-gray-300"}`}>
                                    {item.done && <CheckCircle size={12} fill="white" />}
                                    {item.current && <div className="w-2 h-2 bg-orange-500 rounded-full" />}
                                </div>
                                <div className="flex-1">
                                    <p className={`text-sm font-medium ${item.current ? "text-gray-900" : "text-gray-600"}`}>{item.title}</p>
                                    {item.current && <p className="text-xs text-orange-600 mt-1 font-semibold">{Math.round((qIndex / questions.length) * 100)}% Completed</p>}
                                </div>
                                {item.time && <span className="text-xs text-gray-400">{item.time}</span>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN (Video & Transcript) */}
            <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">

                {/* 2. Video Player Widget */}
                <div className="dashboard-card p-0 overflow-hidden relative aspect-video bg-black group">
                    <video
                        ref={videoRef}
                        className="w-full h-full object-cover transform scale-x-[-1]"
                        autoPlay
                        muted
                        playsInline
                    />

                    {/* Overlay Header */}
                    <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent flex justify-between items-start text-white">
                        <div>
                            <p className="text-xs opacity-80">Stage 2 • Lesson 2</p>
                            <h3 className="text-lg font-bold">Understand the Role</h3>
                        </div>
                        <button className="bg-white/20 hover:bg-white/30 backdrop-blur text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors">
                            <DownloadSimple size={14} /> Download
                        </button>
                    </div>

                    {/* Overlay Controls */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-4">
                        {!isRecording ? (
                            <button onClick={startSession} className="text-white hover:text-orange-400 transition-colors">
                                <Play weight="fill" size={24} />
                            </button>
                        ) : (
                            <button onClick={handleNext} className="text-white hover:text-orange-400 transition-colors">
                                <Pause weight="fill" size={24} />
                            </button>
                        )}

                        {/* Progress Bar */}
                        <div className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden cursor-pointer relative group/progress">
                            <div
                                className="h-full bg-orange-500 relative"
                                style={{ width: `${((qIndex + 1) / questions.length) * 100}%` }}
                            >
                                <div className="absolute -right-1.5 -top-1 w-3 h-3 bg-white rounded-full opacity-0 group-hover/progress:opacity-100 shadow-sm" />
                            </div>
                        </div>

                        {/* Timer Display */}
                        <div className={`flex items-center gap-2 font-mono text-sm ${timeLeft < 10 ? "text-red-400 animate-pulse" : "text-white"}`}>
                            <Clock size={14} />
                            <span>00:{timeLeft.toString().padStart(2, '0')}</span>
                        </div>

                        <ArrowsOut size={18} className="text-white cursor-pointer hover:scale-110 transition-transform" />
                    </div>
                </div>

                {/* AI Speaking Indicator */}
                {aiSpeaking && (
                    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur px-4 py-2 rounded-full text-white text-sm font-medium animate-pulse">
                        AI Speaking...
                    </div>
                )}
            </div>

            {/* 4. Live Transcript Widget */}
            <div className="dashboard-card flex-1 min-h-[300px] flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-gray-900">Live Transcript</h3>
                    <div className="bg-orange-500 rounded-full p-2 animate-pulse">
                        <Microphone size={16} className="text-white" />
                    </div>
                </div>

                {/* Current Speaker Banner */}
                <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center shadow-md">
                        {aiSpeaking ? <span className="text-lg">🤖</span> : <span className="text-lg">👤</span>}
                    </div>
                    <div>
                        <h4 className="font-bold text-gray-900">{aiSpeaking ? "AI Assistant" : "You"}</h4>
                        <p className={`text-xs ${isRecording ? "text-green-600 font-medium" : "text-gray-400"}`}>
                            {aiSpeaking ? "Speaking..." : isRecording ? "Listening..." : "Connected"}
                        </p>
                    </div>
                    {/* Visualizer bars simulation */}
                    <div className="flex-1 flex justify-end items-center gap-1 h-8">
                        {[...Array(20)].map((_, i) => (
                            <div
                                key={i}
                                className={`w-1 bg-orange-400 rounded-full transition-all duration-100 ease-in-out ${(aiSpeaking || isRecording) ? "animate-bounce" : "h-1 opacity-20"
                                    }`}
                                style={{
                                    height: (aiSpeaking || isRecording) ? `${Math.random() * 24 + 4}px` : "4px",
                                    animationDelay: `${i * 0.05}s`
                                }}
                            />
                        ))}
                    </div>
                </div>

                {/* Transcript Scroll Area */}
                <div className="flex-1 overflow-y-auto space-y-6 pr-2 max-h-[300px]">
                    {transcript.length === 0 && (
                        <p className="text-center text-gray-400 text-sm mt-8">Transcript will appear here once the session starts.</p>
                    )}
                    {transcript.map((t, i) => (
                        <div key={i} className="flex gap-4 group">
                            <span className="text-xs font-mono text-gray-400 w-12 pt-1">{t.time}</span>
                            <div className="flex-1">
                                <p className={`text-sm leading-relaxed ${t.sender === 'AI' ? "text-gray-600" : "text-gray-900 font-medium"}`}>
                                    {t.text}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>

    );
}
