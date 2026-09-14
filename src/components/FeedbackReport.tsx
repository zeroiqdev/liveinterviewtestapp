"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useInterview } from "../context/InterviewContext";
import styles from "./feedback.module.css";
import type { FeedbackReportData } from "@/app/api/feedback/generate/route";
import {
    DownloadSimple,
    FileText,
    Lightning,
    Clock,
    ChatCenteredText,
    Eye,
    Microphone,
    CheckCircle,
    Warning,
    ArrowLeft,
    TrendUp,
    Sparkle,
} from "@phosphor-icons/react";

interface MetricItem {
    label: string;
    value: number;
    color: string;
    bgColor: string;
    icon: React.ElementType;
}

export default function FeedbackReport() {
    const router = useRouter();
    const { interviewBlob, settings } = useInterview();

    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [reportData, setReportData] = useState<FeedbackReportData | null>(null);
    const [sessionMeta, setSessionMeta] = useState<{
        role?: string;
        experience?: string;
        domain?: string;
    }>({});

    const handleDownload = () => {
        if (!interviewBlob) return;
        const url = URL.createObjectURL(interviewBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `interview-recording-${new Date().toISOString()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleLogout = () => {
        localStorage.removeItem("useladder_user");
        router.push("/");
    };

    const fetchFeedback = async () => {
        setIsLoading(true);
        setHasError(false);
        setErrorMessage("");
        try {
            let sessionId: string | null = null;
            let meta: any = {};
            let directTranscript: any[] = [];

            let userProfileRole = "";
            if (typeof window !== "undefined") {
                const userRaw = localStorage.getItem("useladder_user");
                if (userRaw) {
                    try {
                        const parsedUser = JSON.parse(userRaw);
                        userProfileRole = parsedUser.role || "";
                    } catch {}
                }
                const params = new URLSearchParams(window.location.search);
                sessionId = params.get("sessionId") || localStorage.getItem("useladder_last_session_id");
                const rawMeta = localStorage.getItem("useladder_last_session_meta");
                if (rawMeta) {
                    try {
                        meta = JSON.parse(rawMeta);
                    } catch {}
                }
                const rawTranscript = localStorage.getItem("useladder_last_session_transcript");
                if (rawTranscript) {
                    try {
                        directTranscript = JSON.parse(rawTranscript);
                    } catch {}
                }

                // Check cache if session report was already generated
                if (sessionId) {
                    const cached = localStorage.getItem(`useladder_feedback_${sessionId}`);
                    if (cached) {
                        try {
                            const parsed = JSON.parse(cached);
                            if (parsed && typeof parsed.overallScore === "number") {
                                setReportData(parsed);
                                localStorage.setItem("useladder_last_feedback", JSON.stringify(parsed));
                                setSessionMeta({
                                    role: meta.role || settings.role || userProfileRole || "Candidate",
                                    experience: meta.experience || settings.experience || "Mid",
                                    domain: meta.domain || settings.domain || "General Tech",
                                });
                                setIsLoading(false);
                                return;
                            }
                        } catch {}
                    }
                }
            }

            const effectiveRole = meta.role || settings.role || userProfileRole || "Candidate";
            setSessionMeta({
                role: effectiveRole,
                experience: meta.experience || settings.experience || "Mid",
                domain: meta.domain || settings.domain || "General Tech",
            });

            const res = await fetch("/api/feedback/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId,
                    transcript: directTranscript,
                    role: effectiveRole,
                    experience: meta.experience || settings.experience,
                    domain: meta.domain || settings.domain,
                }),
            });

            if (res.ok) {
                const data: FeedbackReportData = await res.json();
                setReportData(data);
                if (typeof window !== "undefined") {
                    localStorage.setItem("useladder_last_feedback", JSON.stringify(data));
                    if (sessionId) {
                        localStorage.setItem(`useladder_feedback_${sessionId}`, JSON.stringify(data));
                    }
                }
            } else {
                const errData = await res.json().catch(() => ({}));
                setHasError(true);
                setErrorMessage(errData?.error || "AI evaluation failed to complete. Please try again.");
            }
        } catch (err) {
            console.warn("[FeedbackReport] AI evaluation request failed:", err);
            setHasError(true);
            setErrorMessage("Network or timeout error while generating feedback.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchFeedback();
    }, [settings]);

    const overallScore = reportData ? reportData.overallScore : 72;

    const metrics: MetricItem[] = reportData
        ? [
              {
                  label: "Vocabulary",
                  value: reportData.metrics.vocabulary,
                  color: "#f59e0b",
                  bgColor: "rgba(245, 158, 11, 0.15)",
                  icon: FileText,
              },
              {
                  label: "Technical Depth",
                  value: reportData.metrics.technicalDepth,
                  color: "#22C55E",
                  bgColor: "rgba(34, 197, 94, 0.15)",
                  icon: Lightning,
              },
              {
                  label: "Pace & Delivery",
                  value: reportData.metrics.pace,
                  color: "#4793f7",
                  bgColor: "rgba(71, 147, 247, 0.15)",
                  icon: Clock,
              },
              {
                  label: "Filler Word Control",
                  value: reportData.metrics.fillerWords,
                  color: reportData.metrics.fillerWords < 60 ? "#ef4444" : "#22C55E",
                  bgColor: "rgba(239, 68, 68, 0.15)",
                  icon: ChatCenteredText,
              },
              {
                  label: "Clarity",
                  value: reportData.metrics.clarity,
                  color: "#22C55E",
                  bgColor: "rgba(34, 197, 94, 0.15)",
                  icon: Eye,
              },
              {
                  label: "STAR Structure",
                  value: reportData.metrics.structureStar,
                  color: reportData.metrics.structureStar < 65 ? "#ef4444" : reportData.metrics.structureStar < 78 ? "#f59e0b" : "#22C55E",
                  bgColor: reportData.metrics.structureStar < 65 ? "rgba(239, 68, 68, 0.15)" : reportData.metrics.structureStar < 78 ? "rgba(245, 158, 11, 0.15)" : "rgba(34, 197, 94, 0.15)",
                  icon: Microphone,
              },
          ]
        : [
              { label: "Vocabulary", value: 78, color: "#f59e0b", bgColor: "rgba(245, 158, 11, 0.15)", icon: FileText },
              { label: "Technical Depth", value: 85, color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.15)", icon: Lightning },
              { label: "Pace & Delivery", value: 65, color: "#4793f7", bgColor: "rgba(71, 147, 247, 0.15)", icon: Clock },
              { label: "Filler Words", value: 42, color: "#ef4444", bgColor: "rgba(239, 68, 68, 0.15)", icon: ChatCenteredText },
              { label: "Clarity", value: 88, color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.15)", icon: Eye },
              { label: "STAR Structure", value: 60, color: "#ef4444", bgColor: "rgba(239, 68, 68, 0.15)", icon: Microphone },
          ];

    // Circle math
    const radius = 58;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (overallScore / 100) * circumference;

    return (
        <div className={styles.feedbackPage}>
            {/* Navbar */}
            <nav className={styles.navbar}>
                <div className={styles.logo}>
                    <div className={styles.logoIcon}>L</div>
                    useladder
                </div>
                <div className={styles.navActions}>
                    <button
                        className={styles.backBtn}
                        onClick={() => router.push("/dashboard")}
                    >
                        <ArrowLeft size={14} style={{ marginRight: 4 }} />
                        Back to Dashboard
                    </button>
                    {interviewBlob && (
                        <button
                            className={styles.downloadBtn}
                            onClick={handleDownload}
                        >
                            <DownloadSimple size={14} />
                            Download Recording
                        </button>
                    )}
                    <button
                        className={styles.logoutBtn}
                        onClick={handleLogout}
                        aria-label="Logout"
                    >
                        Logout
                    </button>
                </div>
            </nav>

            {isLoading ? (
                <div className={styles.loadingContainer}>
                    <div className={styles.loadingSpinner} />
                    <h2 className={styles.loadingTitle}>AI is analyzing your interview…</h2>
                    <p className={styles.loadingSubtitle}>
                        Evaluating your spoken answers, domain depth, vocabulary, and response structure.
                    </p>
                </div>
            ) : hasError && !reportData ? (
                <div className={styles.errorContainer}>
                    <Warning size={48} className={styles.errorIcon} />
                    <h2 className={styles.loadingTitle}>Evaluation Encountered an Issue</h2>
                    <p className={styles.loadingSubtitle}>
                        {errorMessage || "We were unable to complete the AI analysis for this session."}
                    </p>
                    <button type="button" className={styles.retryBtn} onClick={fetchFeedback}>
                        <Lightning size={16} />
                        Retry Analysis
                    </button>
                </div>
            ) : (
                <div className={styles.mainContent}>
                    {/* Left Column: Score + Metrics */}
                    <div className={styles.scorePanel}>
                        {/* Overall Score */}
                        <div className={styles.overallScoreCard}>
                            <div className={styles.scoreCircle}>
                                <svg className={styles.scoreSvg} viewBox="0 0 140 140">
                                    <circle
                                        className={styles.scoreTrack}
                                        cx="70"
                                        cy="70"
                                        r={radius}
                                    />
                                    <circle
                                        className={styles.scoreFill}
                                        cx="70"
                                        cy="70"
                                        r={radius}
                                        strokeDasharray={circumference}
                                        strokeDashoffset={offset}
                                        stroke="url(#feedbackGradient)"
                                    />
                                    <defs>
                                        <linearGradient id="feedbackGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="#4793f7" />
                                            <stop offset="100%" stopColor="#22C55E" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                <div className={styles.scoreCenter}>
                                    <span className={styles.scoreNumber}>{overallScore}</span>
                                    <span className={styles.scoreOutOf}>/ 100</span>
                                </div>
                            </div>
                            <div className={styles.scoreInfo}>
                                <h2 className={styles.scoreTitle}>
                                    {reportData?.verdict || "Interview Performance"}
                                </h2>
                                <p className={styles.scoreSubtitle}>
                                    {reportData?.summary ||
                                        "You demonstrated solid presence with opportunities to strengthen your technical specifics and structured delivery."}
                                </p>
                                <div
                                    className={`${styles.scoreBadge} ${
                                        overallScore >= 75
                                            ? styles.scoreBadgeGood
                                            : styles.scoreBadgeAvg
                                    }`}
                                >
                                    <TrendUp size={12} />
                                    {reportData?.verdict || (overallScore >= 75 ? "Above Average" : "Needs Practice")}
                                </div>
                            </div>
                        </div>

                        {/* Session Info */}
                        <div className={styles.detailCard}>
                            <div className={styles.sessionInfo}>
                                <div className={styles.sessionStat}>
                                    <span className={styles.sessionStatLabel}>Target Role</span>
                                    <span className={styles.sessionStatValue}>
                                        {sessionMeta.role || "Software Engineer"}
                                    </span>
                                </div>
                                <div className={styles.sessionStat}>
                                    <span className={styles.sessionStatLabel}>Level</span>
                                    <span className={styles.sessionStatValue}>
                                        {sessionMeta.experience || "Mid"}
                                    </span>
                                </div>
                                <div className={styles.sessionStat}>
                                    <span className={styles.sessionStatLabel}>Domain</span>
                                    <span className={styles.sessionStatValue}>
                                        {sessionMeta.domain || "General Tech"}
                                    </span>
                                </div>
                                <div className={styles.sessionStat}>
                                    <span className={styles.sessionStatLabel}>Evaluation</span>
                                    <span className={styles.sessionStatValue}>
                                        AI Powered
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Metrics Grid */}
                        <div className={styles.metricsGrid}>
                            {metrics.map((metric) => (
                                <div key={metric.label} className={styles.metricCard}>
                                    <div className={styles.metricHeader}>
                                        <div
                                            className={styles.metricIconWrap}
                                            style={{ background: metric.bgColor }}
                                        >
                                            <metric.icon size={18} color={metric.color} />
                                        </div>
                                        <span
                                            className={styles.metricValue}
                                            style={{ color: metric.color }}
                                        >
                                            {metric.value}%
                                        </span>
                                    </div>
                                    <span className={styles.metricLabel}>{metric.label}</span>
                                    <div className={styles.metricBar}>
                                        <div
                                            className={styles.metricBarFill}
                                            style={{
                                                width: `${metric.value}%`,
                                                background: metric.color,
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Column: Strengths, Areas for Improvement, Q&A */}
                    <div className={styles.detailPanel}>
                        {/* Strengths */}
                        <div className={styles.detailCard}>
                            <h3 className={styles.detailTitle}>
                                <CheckCircle size={18} color="#22C55E" />
                                Key Strengths
                            </h3>
                            <ul className={styles.strengthsList}>
                                {reportData?.strengths && reportData.strengths.length > 0 ? (
                                    reportData.strengths.map((s, idx) => (
                                        <li key={idx} className={styles.strengthItem}>
                                            <CheckCircle size={16} className={styles.strengthIcon} />
                                            <div>
                                                <strong>{s.title}: </strong>
                                                <span>{s.detail}</span>
                                                {s.quote && (
                                                    <span className={styles.strengthQuote}>
                                                        &ldquo;{s.quote}&rdquo;
                                                    </span>
                                                )}
                                            </div>
                                        </li>
                                    ))
                                ) : (
                                    <li className={styles.strengthItem}>
                                        <CheckCircle size={16} className={styles.strengthIcon} />
                                        Clear and steady communication maintained throughout the questions.
                                    </li>
                                )}
                            </ul>
                        </div>

                        {/* Areas for Improvement */}
                        <div className={styles.detailCard}>
                            <h3 className={styles.detailTitle}>
                                <Warning size={18} color="#f59e0b" />
                                Actionable Areas for Improvement
                            </h3>
                            <ul className={styles.strengthsList}>
                                {reportData?.improvements && reportData.improvements.length > 0 ? (
                                    reportData.improvements.map((imp, idx) => (
                                        <li key={idx} className={styles.improvementItem}>
                                            <Warning size={16} className={styles.improvementIcon} />
                                            <div>
                                                <strong>{imp.title}: </strong>
                                                <span>{imp.detail}</span>
                                                {imp.recommendation && (
                                                    <span className={styles.improvementRecommendation}>
                                                        💡 <strong>Tip:</strong> {imp.recommendation}
                                                    </span>
                                                )}
                                            </div>
                                        </li>
                                    ))
                                ) : (
                                    <li className={styles.improvementItem}>
                                        <Warning size={16} className={styles.improvementIcon} />
                                        Incorporate more measurable business impact and metrics in your responses.
                                    </li>
                                )}
                            </ul>
                        </div>

                        {/* Question-by-Question Deep Dive */}
                        {reportData?.qaBreakdown && reportData.qaBreakdown.length > 0 && (
                            <div className={styles.detailCard}>
                                <h3 className={styles.detailTitle}>
                                    <Sparkle size={18} color="#4793f7" />
                                    Detailed Question & Answer Review
                                </h3>
                                <div className={styles.qaList}>
                                    {reportData.qaBreakdown.map((item, idx) => (
                                        <div key={idx} className={styles.qaItem}>
                                            <div className={styles.qaItemHeader}>
                                                <h4 className={styles.qaQuestionTitle}>
                                                    Q{idx + 1}: {item.question}
                                                </h4>
                                                <span
                                                    className={`${styles.qaRatingBadge} ${
                                                        item.rating === "Strong"
                                                            ? styles.badgeStrong
                                                            : item.rating === "Average"
                                                            ? styles.badgeAvg
                                                            : styles.badgeNeedsWork
                                                    }`}
                                                >
                                                    {item.rating}
                                                </span>
                                            </div>

                                            <div className={styles.qaCandidateAnswer}>
                                                <span className={styles.qaSectionLabel}>What You Said:</span>
                                                &ldquo;{item.candidateAnswer}&rdquo;
                                            </div>

                                            <p className={styles.qaFeedbackText}>
                                                <strong>Feedback:</strong> {item.feedback}
                                            </p>

                                            {item.modelAnswer && (
                                                <div className={styles.qaModelAnswer}>
                                                    <span className={styles.qaSectionLabel}>🌟 Recommended Elite Answer:</span>
                                                    {item.modelAnswer}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Quick Tips */}
                        <div className={styles.detailCard}>
                            <h3 className={styles.detailTitle}>
                                <Lightning size={18} color="#4793f7" />
                                Coaching Quick Tips
                            </h3>
                            <div className={styles.tipsGrid}>
                                {reportData?.quickTips && reportData.quickTips.length > 0 ? (
                                    reportData.quickTips.map((tip, idx) => (
                                        <div key={idx} className={styles.tipCard}>
                                            <div className={styles.tipNumber}>Tip 0{idx + 1}</div>
                                            <p className={styles.tipText}>{tip}</p>
                                        </div>
                                    ))
                                ) : (
                                    <>
                                        <div className={styles.tipCard}>
                                            <div className={styles.tipNumber}>Tip 01</div>
                                            <p className={styles.tipText}>
                                                Use pauses instead of filler words when collecting your thoughts.
                                            </p>
                                        </div>
                                        <div className={styles.tipCard}>
                                            <div className={styles.tipNumber}>Tip 02</div>
                                            <p className={styles.tipText}>
                                                Lead with the conclusion before explaining the technical rationale.
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
