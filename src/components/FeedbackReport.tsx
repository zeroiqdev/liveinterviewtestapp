"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useInterview } from "../context/InterviewContext";
import styles from "./feedback.module.css";
import type { FeedbackReportData } from "@/app/api/feedback/generate/route";
import { sanitizeReportData } from "@/lib/feedbackSanitizer";
import {
    CheckCircle,
    Warning,
    ChatCircleText,
    Lightning,
    Sparkle,
    TrendUp,
    Trophy,
    ShieldCheck,
    Target,
    Lightbulb,
    ArrowUpRight,
    Brain,
    Clock,
    CaretRight,
    X,
    DownloadSimple,
    Star,
    Quotes,
    Check,
} from "@phosphor-icons/react";

type SectionTabKey = "strengths" | "improvements" | "qa" | "tips";

interface UnifiedFeedbackCard {
    id: string;
    category: "strength" | "improvement" | "qa" | "tip";
    categoryLabel: string;
    title: string;
    description: string;
    characterImage: string;
    icon?: React.ElementType;
    iconBg: string;
    iconColor: string;
    tagLabel?: string;
    tagType?: "strong" | "average" | "needsWork" | "tip";
    quote?: string;
    recommendation?: string;
    modelAnswer?: string;
    question?: string;
    candidateAnswer?: string;
}

const CHAR_STRENGTH = "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680091/0c08bf7e241268702484002634c7ee15-removebg-preview_1_jyel0f.png";
const CHAR_IMPROVEMENT = "https://res.cloudinary.com/dyg7neetr/image/upload/v1786679257/0c08bf7e241268702484002634c7ee15-removebg-preview_zfigrw.png";
const CHAR_QA = "https://res.cloudinary.com/dyg7neetr/image/upload/v1786680377/0c08bf7e241268702484002634c7ee15-removebg-preview_2_zmpv2l.png";
const CHAR_TIP = "/char1.png";

// Interview-type aware illustration for Q&A — picks character based on question semantics
function getQaIllustration(question: string, idx: number): { img: string; bg: string; color: string } {
    const q = question.toLowerCase();
    // Product / prioritization / strategy
    if (/prioritiz|roadmap|feature|okr|bandwidth|stakeholder|cut in half|backlog|rice/i.test(q)) {
        return { img: CHAR_TIP, bg: "#FAF5FF", color: "#7E22CE" };
    }
    // Operational / incident / behavioral failure
    if (/failed|failure|release|deployment|rollback|migration|incident|timeout|outage|post-mortem|postmortem/i.test(q)) {
        return { img: CHAR_IMPROVEMENT, bg: "#FFF7ED", color: "#C2410C" };
    }
    // Collaboration / conflict / leadership
    if (/disagreement|whiteboard|collaborat|align|team|conflict|senior|staff engineer/i.test(q)) {
        return { img: CHAR_STRENGTH, bg: "#F0FDF4", color: "#15803D" };
    }
    // System design / architecture / trade-offs
    if (/monolith|microservice|trade-?off|architecture|latency|throughput|scalab|consistency|distributed|decoupl/i.test(q)) {
        return { img: CHAR_QA, bg: "#EFF6FF", color: "#1D4ED8" };
    }
    // Fallback: cycle so adjacent Q's never look identical
    const fallbacks = [
        { img: CHAR_QA, bg: "#EFF6FF", color: "#1D4ED8" },
        { img: CHAR_STRENGTH, bg: "#F0FDF4", color: "#15803D" },
        { img: CHAR_IMPROVEMENT, bg: "#FFF7ED", color: "#C2410C" },
        { img: CHAR_TIP, bg: "#FAF5FF", color: "#7E22CE" },
    ];
    return fallbacks[idx % fallbacks.length];
}

// Rich fallback demo data for immediate preview if no live session exists
const DEFAULT_DEMO_REPORT: FeedbackReportData = {
    overallScore: 84,
    verdict: "Strong Candidate",
    summary: "You completed the session and demonstrated strong analytical problem solving and structured thinking. You articulated technical trade-offs with confidence and maintained steady pacing throughout.",
    metrics: {
        vocabulary: 88,
        technicalDepth: 82,
        pace: 85,
        fillerWords: 90,
        clarity: 86,
        structureStar: 84,
    },
    strengths: [
        {
            title: "Structured STAR Methodology",
            detail: "You framed the situation, obstacles, direct interventions, and quantifiable business outcomes in your responses.",
            quote: "We prioritized user retention by isolating the onboarding churn bottleneck and launched an A/B test driving +14% activation.",
        },
        {
            title: "Domain Terminology & Technical Depth",
            detail: "You accurately referenced system trade-offs, latency implications, and API contract design during technical questions.",
            quote: "Decoupled asynchronous webhook processing to safeguard uptime and achieve sub-100ms response targets.",
        },
        {
            title: "Cross-Functional Collaboration",
            detail: "You clearly articulated how to align engineering, product, and executive stakeholders around shared roadmap milestones.",
        },
    ],
    improvements: [
        {
            title: "Quantify Business Impact Earlier",
            detail: "Your initial narrative spent significant time on context before mentioning the core metric lift or bottom-line value.",
            recommendation: "Lead with the bottom-line result first (Executive Summary format), then unpack your technical details.",
        },
        {
            title: "Address Edge Cases Proactively",
            detail: "You focused primarily on the happy path before the interviewer prompted for failure modes and recovery procedures.",
            recommendation: "Dedicate the final 30 seconds of your system design answers to risk mitigation, fallback strategies, and rate limits.",
        },
    ],
    quickTips: [
        "Use deliberate 1-2 second pauses instead of filler words when digesting complex questions.",
        "Synthesize interviewer hints into your revised approach rather than defending the initial design.",
        "Conclude your answers with a crisp summary sentence to signal you have finished speaking.",
        "Quantify your achievements with concrete metrics like latency reductions, uptime, or business impact.",
    ],
    qaBreakdown: [
        {
            question: "How do you prioritize features when engineering bandwidth is cut in half?",
            candidateAnswer: "I would sit with the engineering manager, identify the top 3 company OKRs, calculate RICE scores for the backlog, and negotiate a cut line.",
            rating: "Strong",
            feedback: "You demonstrated a crisp, framework-driven approach. You showed empathy for engineering constraints while defending business objectives.",
            modelAnswer: "First, align with leadership on non-negotiable compliance and reliability commitments. Next, stack-rank remaining backlog using expected business value over engineering effort (RICE framework). Finally, communicate revised scope proactively with transparent tradeoff rationales to stakeholders.",
        },
        {
            question: "Tell me about a time a major release failed and how you resolved it.",
            candidateAnswer: "We had a deployment issue with database migrations causing timeouts. I rolled back the release, briefed the customer support team, and patched the index.",
            rating: "Average",
            feedback: "You outlined good incident response actions, but you should detail the post-mortem, blameless culture, and automated regression guards introduced.",
            modelAnswer: "Initiated the incident triage within 5 minutes, executed the zero-downtime rollback runbook, and maintained a live status page. Following resolution, led a blameless post-mortem that identified a missing pre-migration index check and automated shadow-traffic verification in our CI/CD pipeline.",
        },
        {
            question: "How do you handle architectural disagreements between senior and staff engineers?",
            candidateAnswer: "I bring both engineers into a whiteboard session to list out measurable criteria like throughput, latency, and operational cost, then prototype the ambiguous areas.",
            rating: "Strong",
            feedback: "You effectively depersonalized the technical conflict by anchoring the discussion on quantifiable objective criteria.",
            modelAnswer: "Align on shared architectural principles and define empirical decision criteria (latency, scalability, maintenance overhead). If deadlock persists, time-box a spike proof-of-concept to produce real data rather than debating hypotheses.",
        },
        {
            question: "What trade-offs do you consider when choosing between a monolithic and microservices architecture?",
            candidateAnswer: "Microservices offer independent scaling and deployability, but introduce distributed system complexity, eventual consistency challenges, and network latency.",
            rating: "Strong",
            feedback: "You articulated clear awareness of operational overhead and distributed systems complexity rather than defaulting to microservices reflexively.",
            modelAnswer: "Evaluate team topology, domain boundary maturity, and deployment velocity requirements. Favor a modular monolith initially to keep operational complexity low until independent scaling and organizational decoupling strictly justify service boundaries.",
        },
    ],
};

export interface FeedbackReportProps {
    isModal?: boolean;
    onClose?: () => void;
    initialReportData?: FeedbackReportData | null;
}

export default function FeedbackReport({
    isModal = false,
    onClose,
    initialReportData,
}: FeedbackReportProps = {}) {
    const router = useRouter();
    const { settings, interviewBlob } = useInterview();

    const [isLoading, setIsLoading] = useState<boolean>(() => {
        if (initialReportData) return false;
        if (typeof window === "undefined") return false;
        try {
            const params = new URLSearchParams(window.location.search);
            const sessionId = params.get("sessionId") || localStorage.getItem("useladder_last_session_id");
            if (sessionId) {
                const cached = localStorage.getItem(`useladder_feedback_${sessionId}`);
                if (cached) return false;
                return true;
            }
        } catch {}
        return false;
    });
    const [hasError, setHasError] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [reportData, setReportData] = useState<FeedbackReportData | null>(() => {
        if (initialReportData) return sanitizeReportData(initialReportData);
        if (typeof window === "undefined") return null;
        try {
            const params = new URLSearchParams(window.location.search);
            const sessionId = params.get("sessionId") || localStorage.getItem("useladder_last_session_id");
            if (sessionId) {
                const cached = localStorage.getItem(`useladder_feedback_${sessionId}`);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed && typeof parsed.overallScore === "number") {
                        return sanitizeReportData(parsed);
                    }
                }
            }
            const lastStored = localStorage.getItem("useladder_last_feedback");
            if (lastStored) {
                const parsed = JSON.parse(lastStored);
                if (parsed && typeof parsed.overallScore === "number") {
                    return sanitizeReportData(parsed);
                }
            }
        } catch {}
        return sanitizeReportData(DEFAULT_DEMO_REPORT);
    });
    const [activeTab, setActiveTab] = useState<SectionTabKey>("strengths");
    const [selectedCard, setSelectedCard] = useState<UnifiedFeedbackCard | null>(null);
    const [sessionMeta, setSessionMeta] = useState<{
        role?: string;
        experience?: string;
        domain?: string;
    }>(() => {
        if (typeof window === "undefined") return {};
        try {
            const rawMeta = localStorage.getItem("useladder_last_session_meta");
            if (rawMeta) {
                const meta = JSON.parse(rawMeta);
                return {
                    role: meta.role || "Software Engineer",
                    experience: meta.experience || "Mid-Level",
                    domain: meta.domain || "General Tech",
                };
            }
        } catch {}
        return {
            role: "Software Engineer",
            experience: "Mid-Level",
            domain: "General Tech",
        };
    });

    const handleDownload = () => {
        if (!interviewBlob) return;
        const url = URL.createObjectURL(interviewBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `interview-recording-${new Date().toISOString()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleCloseAction = () => {
        if (isModal && onClose) {
            onClose();
        } else {
            router.push("/dashboard");
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("useladder_user");
        router.push("/");
    };

    const performFeedbackFetch = useCallback(async () => {
        if (initialReportData) return;

        setIsLoading(true);
        setHasError(false);
        setErrorMessage("");
        try {
            let sessionId: string | null = null;
            let meta: Record<string, unknown> = {};
            let directTranscript: Array<{ role?: string; sender?: string; text?: string }> = [];
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

                if (sessionId) {
                    const cached = localStorage.getItem(`useladder_feedback_${sessionId}`);
                    if (cached) {
                        try {
                            const parsed = JSON.parse(cached);
                            if (parsed && typeof parsed.overallScore === "number") {
                                const clean = sanitizeReportData(parsed, directTranscript);
                                setReportData(clean);
                                localStorage.setItem("useladder_last_feedback", JSON.stringify(clean));
                                setSessionMeta({
                                    role: (typeof meta.role === "string" ? meta.role : "") || settings.role || userProfileRole || "Software Engineer",
                                    experience: (typeof meta.experience === "string" ? meta.experience : "") || settings.experience || "Mid-Level",
                                    domain: (typeof meta.domain === "string" ? meta.domain : "") || settings.domain || "General Tech",
                                });
                                setIsLoading(false);
                                return;
                            }
                        } catch {}
                    }
                }
            }

            const effectiveRole = (typeof meta.role === "string" ? meta.role : "") || settings.role || userProfileRole || "Software Engineer";
            setSessionMeta({
                role: effectiveRole,
                experience: (typeof meta.experience === "string" ? meta.experience : "") || settings.experience || "Mid-Level",
                domain: (typeof meta.domain === "string" ? meta.domain : "") || settings.domain || "General Tech",
            });

            if (sessionId) {
                const res = await fetch("/api/feedback/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sessionId,
                        role: effectiveRole,
                        experience: (typeof meta.experience === "string" ? meta.experience : "") || settings.experience || "Mid-Level",
                        domain: (typeof meta.domain === "string" ? meta.domain : "") || settings.domain || "General Tech",
                        transcript: directTranscript.length > 0 ? directTranscript : undefined,
                    }),
                });

                if (res.ok) {
                    const data: FeedbackReportData = await res.json();
                    if (data && typeof data.overallScore === "number") {
                        const clean = sanitizeReportData(data, directTranscript);
                        setReportData(clean);
                        localStorage.setItem(`useladder_feedback_${sessionId}`, JSON.stringify(clean));
                        localStorage.setItem("useladder_last_feedback", JSON.stringify(clean));
                        setIsLoading(false);
                        return;
                    }
                }
            }

            const lastStored = localStorage.getItem("useladder_last_feedback");
            if (lastStored) {
                try {
                    const parsed = JSON.parse(lastStored);
                    if (parsed && typeof parsed.overallScore === "number") {
                        const clean = sanitizeReportData(parsed, directTranscript);
                        setReportData(clean);
                        setIsLoading(false);
                        return;
                    }
                } catch {}
            }

            setReportData(sanitizeReportData(DEFAULT_DEMO_REPORT, directTranscript));
            setIsLoading(false);
        } catch (err: unknown) {
            console.warn("[FeedbackReport] Failed to fetch live report, using default demo:", err);
            setReportData(sanitizeReportData(DEFAULT_DEMO_REPORT));
            setIsLoading(false);
        }
    }, [initialReportData, settings.domain, settings.experience, settings.role]);

    useEffect(() => {
        if (initialReportData) return;
        if (typeof window === "undefined") return;

        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get("sessionId") || localStorage.getItem("useladder_last_session_id");
        if (!sessionId) return;

        const cached = localStorage.getItem(`useladder_feedback_${sessionId}`);
        if (cached) return;

        let isCancelled = false;

        const generateFeedback = async () => {
            try {
                let meta: Record<string, unknown> = {};
                let directTranscript: Array<{ role?: string; sender?: string; text?: string }> = [];
                let userProfileRole = "";

                const userRaw = localStorage.getItem("useladder_user");
                if (userRaw) {
                    try {
                        const parsedUser = JSON.parse(userRaw);
                        userProfileRole = parsedUser.role || "";
                    } catch {}
                }
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

                const effectiveRole = (typeof meta.role === "string" ? meta.role : "") || settings.role || userProfileRole || "Software Engineer";

                const res = await fetch("/api/feedback/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sessionId,
                        role: effectiveRole,
                        experience: (typeof meta.experience === "string" ? meta.experience : "") || settings.experience || "Mid-Level",
                        domain: (typeof meta.domain === "string" ? meta.domain : "") || settings.domain || "General Tech",
                        transcript: directTranscript.length > 0 ? directTranscript : undefined,
                    }),
                });

                if (res.ok) {
                    const data: FeedbackReportData = await res.json();
                    if (data && typeof data.overallScore === "number" && !isCancelled) {
                        const clean = sanitizeReportData(data, directTranscript);
                        setReportData(clean);
                        localStorage.setItem(`useladder_feedback_${sessionId}`, JSON.stringify(clean));
                        localStorage.setItem("useladder_last_feedback", JSON.stringify(clean));
                        setIsLoading(false);
                    }
                } else if (!isCancelled) {
                    setIsLoading(false);
                    setHasError(true);
                    setErrorMessage("Failed to generate interview feedback report.");
                }
            } catch (err: unknown) {
                console.warn("[FeedbackReport] Failed to generate live report:", err);
                if (!isCancelled) {
                    setIsLoading(false);
                }
            }
        };

        void generateFeedback();

        return () => {
            isCancelled = true;
        };
    }, [initialReportData, settings.domain, settings.experience, settings.role]);

    // Transform reportData into unified cards with minimal aesthetics
    const strengthsCards: UnifiedFeedbackCard[] = (reportData?.strengths || []).map((s, idx) => {
        const iconList = [CheckCircle, Trophy, TrendUp, ShieldCheck, Star];
        return {
            id: `strength-${idx}`,
            category: "strength",
            categoryLabel: "Strength",
            title: s.title,
            description: s.detail,
            characterImage: CHAR_STRENGTH,
            icon: iconList[idx % iconList.length],
            iconBg: "#F0FDF4",
            iconColor: "#15803D",
            tagLabel: "Strength",
            tagType: "strong",
            quote: s.quote,
        };
    });

    const improvementsCards: UnifiedFeedbackCard[] = (reportData?.improvements || []).map((imp, idx) => {
        const iconList = [Warning, Target, Lightbulb, ArrowUpRight];
        return {
            id: `improvement-${idx}`,
            category: "improvement",
            categoryLabel: "Area to Improve",
            title: imp.title,
            description: imp.detail,
            characterImage: CHAR_IMPROVEMENT,
            icon: iconList[idx % iconList.length],
            iconBg: "#FFF7ED",
            iconColor: "#C2410C",
            tagLabel: "To Improve",
            tagType: "average",
            recommendation: imp.recommendation,
        };
    });

    const qaCards: UnifiedFeedbackCard[] = (reportData?.qaBreakdown || []).map((qa, idx) => {
        const iconList = [ChatCircleText, Brain, Quotes, Sparkle];
        const tagType = qa.rating === "Strong" ? "strong" : qa.rating === "Average" ? "average" : "needsWork";
        const illustration = getQaIllustration(qa.question, idx);
        return {
            id: `qa-${idx}`,
            category: "qa",
            categoryLabel: `Question 0${idx + 1}`,
            title: qa.question,
            description: qa.feedback,
            characterImage: illustration.img,
            icon: iconList[idx % iconList.length],
            iconBg: illustration.bg,
            iconColor: illustration.color,
            tagLabel: qa.rating,
            tagType,
            question: qa.question,
            candidateAnswer: qa.candidateAnswer,
            modelAnswer: qa.modelAnswer,
            recommendation: qa.modelAnswer,
        };
    });

    const tipsCards: UnifiedFeedbackCard[] = (reportData?.quickTips || []).map((tip, idx) => {
        const iconList = [Lightning, Sparkle, Clock, Brain];
        return {
            id: `tip-${idx}`,
            category: "tip",
            categoryLabel: "General Tip",
            title: `Tip 0${idx + 1}: Delivery & Mindset`,
            description: tip,
            characterImage: CHAR_TIP,
            icon: iconList[idx % iconList.length],
            iconBg: "#FAF5FF",
            iconColor: "#7E22CE",
            tagLabel: "General Tip",
            tagType: "tip",
        };
    });

    const displayedCards =
        activeTab === "strengths"
            ? strengthsCards
            : activeTab === "improvements"
            ? improvementsCards
            : activeTab === "qa"
            ? qaCards
            : tipsCards;

    const overallScore = reportData?.overallScore || 80;
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (overallScore / 100) * circumference;

    const verdict = reportData?.verdict || (overallScore >= 80 ? "Strong Candidate" : overallScore >= 65 ? "Above Average" : "Needs Improvement");
    const verdictClass =
        verdict === "Strong Candidate"
            ? styles.verdictGood
            : verdict === "Above Average"
            ? styles.verdictAvg
            : styles.verdictNeedsWork;

    // ── Card Detail Modal Component ──
    const renderCardDetailModal = () => {
        if (!selectedCard) return null;
        return (
            <div
                className={styles.modalBackdrop}
                onClick={() => setSelectedCard(null)}
            >
                <div
                    className={styles.modalCard}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={styles.modalHeader}>
                        <div className={styles.modalHeaderLeft}>
                            {selectedCard.characterImage ? (
                                <div
                                    className={styles.cardCharBox}
                                    style={{
                                        backgroundColor: selectedCard.iconBg,
                                        width: 36,
                                        height: 36,
                                        borderRadius: 8,
                                    }}
                                >
                                    <img
                                        src={selectedCard.characterImage}
                                        alt=""
                                        className={styles.cardCharImg}
                                    />
                                </div>
                            ) : selectedCard.icon ? (
                                <div
                                    className={styles.cardIconBox}
                                    style={{
                                        backgroundColor: selectedCard.iconBg,
                                        color: selectedCard.iconColor,
                                        width: 36,
                                        height: 36,
                                        borderRadius: 8,
                                    }}
                                >
                                    <selectedCard.icon size={18} weight="regular" />
                                </div>
                            ) : null}
                            <div>
                                <span className={styles.modalSectionLabel}>
                                    {selectedCard.categoryLabel}
                                </span>
                            </div>
                        </div>
                        <button
                            type="button"
                            className={styles.windowCloseBtn}
                            onClick={() => setSelectedCard(null)}
                            aria-label="Close detail"
                        >
                            <X size={15} weight="regular" />
                        </button>
                    </div>

                    <div className={styles.modalBody}>
                        <h2 className={styles.modalTitle}>{selectedCard.title}</h2>

                        <div className={styles.modalSection}>
                            <span className={styles.modalSectionLabel}>Evaluator Analysis</span>
                            <p className={styles.modalSectionText}>{selectedCard.description}</p>
                        </div>

                        {selectedCard.candidateAnswer && (
                            <div className={styles.modalSection}>
                                <span className={styles.modalSectionLabel}>Your Answer</span>
                                <div className={styles.modalQuoteBox}>
                                    &ldquo;{selectedCard.candidateAnswer}&rdquo;
                                </div>
                            </div>
                        )}

                        {selectedCard.quote && (
                            <div className={styles.modalSection}>
                                <span className={styles.modalSectionLabel}>Your Spoken Quote</span>
                                <div className={styles.modalQuoteBox}>
                                    &ldquo;{selectedCard.quote}&rdquo;
                                </div>
                            </div>
                        )}

                        {(selectedCard.recommendation || selectedCard.modelAnswer) && (
                            <div className={styles.modalSection}>
                                <span className={styles.modalSectionLabel}>Tip</span>
                                <div className={styles.modalTipBox}>
                                    {selectedCard.recommendation || selectedCard.modelAnswer}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={styles.modalFooter}>
                        <button
                            type="button"
                            className={styles.modalDoneBtn}
                            onClick={() => setSelectedCard(null)}
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // ── Main Window Content (Used in both full page and modal modes) ──
    const windowContent = (
        <div className={isModal ? styles.feedbackWindowModal : styles.feedbackWindow}>
            {/* ── Window Header ── */}
            <div className={styles.windowHeader}>
                <div className={styles.windowTitleGroup}>
                    <h1 className={styles.windowTitle}>Interview Performance Feedback</h1>
                    <p className={styles.windowSubtitle}>
                        Role: {sessionMeta.role || "Product Manager"} · Level: {sessionMeta.experience || "Mid-Level"}
                    </p>
                </div>
                {isModal && (
                    <button
                        type="button"
                        className={styles.windowCloseBtn}
                        onClick={handleCloseAction}
                        aria-label="Close"
                    >
                        <X size={15} weight="regular" />
                    </button>
                )}
            </div>

            {/* ── Performance Summary Card ── */}
            <div className={styles.summaryBanner}>
                <div className={styles.scoreCircleWrap}>
                    <svg className={styles.scoreSvg} viewBox="0 0 100 100">
                        <circle className={styles.scoreTrack} cx="50" cy="50" r={radius} />
                        <circle
                            className={styles.scoreFill}
                            cx="50"
                            cy="50"
                            r={radius}
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                            stroke={overallScore >= 75 ? "#16A34A" : overallScore >= 60 ? "#F59E0B" : "#DC2626"}
                        />
                    </svg>
                    <div className={styles.scoreCenter}>
                        <span className={styles.scoreNumber}>{overallScore}</span>
                        <span className={styles.scoreOutOf}>/ 100</span>
                    </div>
                </div>

                <div className={styles.summaryContent}>
                    <div className={styles.summaryTopRow}>
                        <span className={`${styles.verdictBadge} ${verdictClass}`}>
                            <Check size={12} weight="regular" />
                            {verdict}
                        </span>
                    </div>
                    <p className={styles.summaryParagraph}>
                        {reportData?.summary || "Solid overall interview performance with structured answers and confident delivery."}
                    </p>

                    {reportData?.metrics && (
                        <div className={styles.rubricRow}>
                            <div className={styles.rubricPill}>
                                <span>Technical Depth:</span>
                                <span className={styles.rubricVal}>{reportData.metrics.technicalDepth}%</span>
                            </div>
                            <div className={styles.rubricPill}>
                                <span>Vocabulary:</span>
                                <span className={styles.rubricVal}>{reportData.metrics.vocabulary}%</span>
                            </div>
                            <div className={styles.rubricPill}>
                                <span>Clarity:</span>
                                <span className={styles.rubricVal}>{reportData.metrics.clarity}%</span>
                            </div>
                            <div className={styles.rubricPill}>
                                <span>Pace:</span>
                                <span className={styles.rubricVal}>{reportData.metrics.pace}%</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Sectioning Tab Bar (Flush, Gap-Free, Sharp Corners) ── */}
            <div className={styles.sectionTabBar}>
                <button
                    type="button"
                    className={`${styles.sectionTab} ${activeTab === "strengths" ? styles.tabActiveStrengths : ""}`}
                    onClick={() => setActiveTab("strengths")}
                >
                    Strengths
                </button>

                <button
                    type="button"
                    className={`${styles.sectionTab} ${activeTab === "improvements" ? styles.tabActiveImprovements : ""}`}
                    onClick={() => setActiveTab("improvements")}
                >
                    Improvements
                </button>

                <button
                    type="button"
                    className={`${styles.sectionTab} ${activeTab === "qa" ? styles.tabActiveQa : ""}`}
                    onClick={() => setActiveTab("qa")}
                >
                    Q&A Review
                </button>

                <button
                    type="button"
                    className={`${styles.sectionTab} ${activeTab === "tips" ? styles.tabActiveTips : ""}`}
                    onClick={() => setActiveTab("tips")}
                >
                    General Tips
                </button>
            </div>

            {/* ── Cards Grid (One feedback per card with clean icons) ── */}
            <div className={styles.cardsGridContainer}>
                <div className={styles.feedbackGrid}>
                    {displayedCards.map((card) => {
                        const isSelected = selectedCard?.id === card.id;

                        return (
                            <div
                                key={card.id}
                                className={`${styles.feedbackCard} ${isSelected ? styles.feedbackCardSelected : ""}`}
                                onClick={() => setSelectedCard(card)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        setSelectedCard(card);
                                    }
                                }}
                            >
                                {/* Left badge: character illustration for strengths/improvements/tips + interview-type illustration for Q&A */}
                                {card.characterImage ? (
                                    <div
                                        className={styles.cardCharBox}
                                        style={{ backgroundColor: card.iconBg }}
                                    >
                                        <img
                                            src={card.characterImage}
                                            alt={card.categoryLabel}
                                            className={styles.cardCharImg}
                                        />
                                    </div>
                                ) : card.icon ? (
                                    <div
                                        className={styles.cardIconBox}
                                        style={{ backgroundColor: card.iconBg, color: card.iconColor }}
                                    >
                                        <card.icon size={20} weight="regular" />
                                    </div>
                                ) : null}

                                {/* Middle Content: Title + Feedback Text */}
                                <div className={styles.cardBody}>
                                    <div className={styles.cardHeaderRow}>
                                        <h3 className={styles.cardTitle}>{card.title}</h3>
                                        {card.tagLabel && (
                                            <span
                                                className={`${styles.cardTag} ${
                                                    card.tagType === "strong"
                                                        ? styles.tagStrong
                                                        : card.tagType === "average"
                                                        ? styles.tagAverage
                                                        : card.tagType === "needsWork"
                                                        ? styles.tagNeedsWork
                                                        : styles.tagTip
                                                }`}
                                            >
                                                {card.tagLabel}
                                            </span>
                                        )}
                                    </div>

                                    <p className={styles.cardDescription}>{card.description}</p>

                                    {card.recommendation && (
                                        <div className={styles.cardSnippet}>
                                            Tip: {card.recommendation}
                                        </div>
                                    )}

                                    {card.quote && (
                                        <div className={styles.cardSnippet}>
                                            &ldquo;{card.quote}&rdquo;
                                        </div>
                                    )}
                                </div>

                                {/* Right Circular Chevron (minimal circular chevron) */}
                                <div className={styles.cardChevron}>
                                    <CaretRight size={13} weight="regular" />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Window Footer ── */}
            <div className={styles.windowFooter}>
                <div className={styles.footerActions}>
                    <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={handleCloseAction}
                    >
                        Go back to dashboard
                    </button>
                </div>
            </div>
        </div>
    );

    // ── Render as Modal Dialog Overlay ──
    if (isModal) {
        return (
            <div className={styles.modalOverlay} onClick={handleCloseAction}>
                <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
                    {isLoading ? (
                        <div className={styles.loadingContainer}>
                            <div className={styles.loadingSpinner} />
                            <h2 className={styles.loadingTitle}>Evaluating your session…</h2>
                            <p className={styles.loadingSubtitle}>
                                Analyzing transcript claims, terminology precision, structured delivery, and industry rubrics.
                            </p>
                        </div>
                    ) : hasError && !reportData ? (
                        <div className={styles.errorContainer}>
                            <Warning size={48} weight="regular" className={styles.errorIcon} />
                            <h2 className={styles.loadingTitle}>Evaluation Encountered an Issue</h2>
                            <p className={styles.loadingSubtitle}>
                                {errorMessage || "We were unable to complete the AI analysis for this session."}
                            </p>
                            <button type="button" className={styles.retryBtn} onClick={performFeedbackFetch}>
                                <Lightning size={16} weight="regular" />
                                Retry Analysis
                            </button>
                        </div>
                    ) : (
                        windowContent
                    )}
                </div>
                {renderCardDetailModal()}
            </div>
        );
    }

    // ── Standalone Page Mode (/feedback) ──
    return (
        <div className={styles.feedbackPage}>
            {/* ── Top Navbar ── */}
            <nav className={styles.navbar}>
                <div
                    className={styles.logo}
                    onClick={handleCloseAction}
                    style={{ cursor: "pointer" }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") handleCloseAction();
                    }}
                >
                    <div className={styles.logoIcon}>L</div>
                    <span>useladder</span>
                </div>

                <div className={styles.navActions}>

                    {interviewBlob && (
                        <button
                            type="button"
                            className={styles.downloadBtn}
                            onClick={handleDownload}
                        >
                            <DownloadSimple size={15} weight="regular" />
                            Download Recording
                        </button>
                    )}

                    <button
                        type="button"
                        className={styles.logoutBtn}
                        onClick={handleLogout}
                    >
                        Logout
                    </button>
                </div>
            </nav>

            {/* ── Main Content Area ── */}
            {isLoading ? (
                <div className={styles.loadingContainer}>
                    <div className={styles.loadingSpinner} />
                    <h2 className={styles.loadingTitle}>Evaluating your session…</h2>
                    <p className={styles.loadingSubtitle}>
                        Analyzing transcript claims, terminology precision, structured delivery, and industry rubrics.
                    </p>
                </div>
            ) : hasError && !reportData ? (
                <div className={styles.errorContainer}>
                    <Warning size={48} weight="regular" className={styles.errorIcon} />
                    <h2 className={styles.loadingTitle}>Evaluation Encountered an Issue</h2>
                    <p className={styles.loadingSubtitle}>
                        {errorMessage || "We were unable to complete the AI analysis for this session."}
                    </p>
                    <button type="button" className={styles.retryBtn} onClick={performFeedbackFetch}>
                        <Lightning size={16} weight="regular" />
                        Retry Analysis
                    </button>
                </div>
            ) : (
                <main className={styles.mainContainer}>
                    {windowContent}
                </main>
            )}

            {renderCardDetailModal()}
        </div>
    );
}
