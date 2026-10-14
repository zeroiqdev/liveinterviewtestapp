"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useInterview } from "../context/InterviewContext";
import styles from "./feedback.module.css";
import { FeedbackButton } from "./FeedbackButton";
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

type SectionTabKey = "strengths" | "improvements" | "responsibilities" | "qa" | "tips";

interface UnifiedFeedbackCard {
    id: string;
    category: "strength" | "improvement" | "qa" | "tip" | "responsibility";
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

    // Nothing is read from the browser's saved data while the page is first
    // drawn: the server can't see that data, so reading it here made the page
    // draw twice and flash placeholder values. It starts as "loading" and the
    // effect below fills it in.
    const [isLoading, setIsLoading] = useState<boolean>(!initialReportData);
    const [hasError, setHasError] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    // True when this person has no interview to report on yet.
    const [noReport, setNoReport] = useState(false);
    const [reportData, setReportData] = useState<FeedbackReportData | null>(() => (initialReportData ? sanitizeReportData(initialReportData) : null));
    const [activeTab, setActiveTab] = useState<SectionTabKey>("strengths");
    const [selectedCard, setSelectedCard] = useState<UnifiedFeedbackCard | null>(null);
    const [sessionMeta, setSessionMeta] = useState<{
        role?: string;
        experience?: string;
        domain?: string;
        companyName?: string;
        responsibilities?: string[];
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

    const handleCloseAction = () => {
        if (isModal && onClose) {
            onClose();
        } else {
            router.replace("/dashboard");
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("useladder_user");
        router.push("/");
    };

    /**
     * Finds this person's report, in order: the copy this browser kept (so it
     * shows at once), the one stored on the server (so it is there on any
     * device), and only then a newly written one for an interview that has
     * just finished. With none of those there is no report, and the page says
     * so. It never shows a sample in place of a real one.
     */
    const performFeedbackFetch = useCallback(async () => {
        if (initialReportData) return;

        const readJson = <T,>(key: string): T | null => {
            try {
                const raw = localStorage.getItem(key);
                return raw ? (JSON.parse(raw) as T) : null;
            } catch {
                return null;
            }
        };
        const show = (data: FeedbackReportData, transcript?: Array<{ role?: string; sender?: string; text?: string }>, forSession?: string | null) => {
            const clean = sanitizeReportData(data, transcript);
            setReportData(clean);
            try {
                if (forSession) localStorage.setItem(`useladder_feedback_${forSession}`, JSON.stringify(clean));
                localStorage.setItem("useladder_last_feedback", JSON.stringify(clean));
            } catch {
                // Saved data is full or blocked: the report still shows.
            }
            setIsLoading(false);
        };

        try {
            const sessionId = new URLSearchParams(window.location.search).get("sessionId") || localStorage.getItem("useladder_last_session_id");
            const meta = readJson<Record<string, unknown>>("useladder_last_session_meta") ?? {};
            const transcript = readJson<Array<{ role?: string; sender?: string; text?: string }>>("useladder_last_session_transcript") ?? [];
            const profile = readJson<{ role?: string; seniority?: string; domain?: string }>("useladder_user");
            const profileRole = profile?.role || "";
            const text = (value: unknown) => (typeof value === "string" ? value : "");
            // The interview's own details first, then the person's profile. The
            // app-wide defaults come last: they describe no one in particular.
            const details = {
                role: text(meta.role) || profileRole || settings.role || "",
                experience: text(meta.experience) || profile?.seniority || "",
                domain: text(meta.domain) || profile?.domain || settings.domain || "",
                companyName: text(meta.companyName) || undefined,
                responsibilities: Array.isArray(meta.responsibilities) ? (meta.responsibilities as string[]) : [],
            };
            setSessionMeta(details);

            // 1. This browser's copy.
            const cached = sessionId ? readJson<FeedbackReportData>(`useladder_feedback_${sessionId}`) : null;
            if (cached && typeof cached.overallScore === "number") return show(cached, transcript, sessionId);

            // 2. The server's copy: for this interview, or their latest if none is named.
            const storedRes = await fetch(`/api/feedback/report${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`, { cache: "no-store" });
            if (storedRes.ok) {
                const stored = await storedRes.json();
                if (stored?.report && typeof stored.report.overallScore === "number") {
                    // The role the report was written for is the one to show.
                    if (stored.role) setSessionMeta((current) => ({ ...current, role: stored.role }));
                    return show(stored.report, transcript, stored.sessionId ?? sessionId);
                }
            }

            // 3. An interview that has just ended: have its report written (and stored).
            if (sessionId) {
                const res = await fetch("/api/feedback/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sessionId,
                        role: details.role || "Software Engineer",
                        experience: details.experience || "Mid-Level",
                        domain: details.domain || "General Tech",
                        companyName: details.companyName,
                        responsibilities: details.responsibilities.length ? details.responsibilities : undefined,
                        transcript: transcript.length > 0 ? transcript : undefined,
                        durationMinutes: typeof meta.durationMinutes === "number" ? meta.durationMinutes : undefined,
                        interviewType: text(meta.preparationTitle) || undefined,
                        mode: text(meta.interviewMode) || undefined,
                    }),
                });
                if (res.ok) {
                    const data: FeedbackReportData = await res.json();
                    if (data && typeof data.overallScore === "number") return show(data, transcript, sessionId);
                }
                // A 404 means there were no answers to report on.
                if (res.status !== 404) {
                    setHasError(true);
                    setErrorMessage("We couldn't put your report together just now. Your interview is saved, so you can try again.");
                    setIsLoading(false);
                    return;
                }
            }

            // 4. An older report this browser still has.
            const last = readJson<FeedbackReportData>("useladder_last_feedback");
            if (last && typeof last.overallScore === "number") return show(last, transcript);

            setNoReport(true);
            setIsLoading(false);
        } catch (err: unknown) {
            console.warn("[FeedbackReport] Couldn't load the report:", err);
            setHasError(true);
            setErrorMessage("We couldn't load your report. Check your connection and try again.");
            setIsLoading(false);
        }
    }, [initialReportData, settings.domain, settings.experience, settings.role]);

    // Started just after the page has drawn, so loading never interrupts a render.
    useEffect(() => {
        const start = window.setTimeout(() => void performFeedbackFetch(), 0);
        return () => window.clearTimeout(start);
    }, [performFeedbackFetch]);

    // Trying again starts from a clean loading state; the first load already is one.
    const retryFeedbackFetch = useCallback(() => {
        setIsLoading(true);
        setHasError(false);
        setErrorMessage("");
        setNoReport(false);
        void performFeedbackFetch();
    }, [performFeedbackFetch]);

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

    const responsibilityAlignment = reportData?.responsibilityAlignment;
    const responsibilityCards: UnifiedFeedbackCard[] = [];

    if (responsibilityAlignment) {
        // Overall summary card
        responsibilityCards.push({
            id: "resp-overall",
            category: "responsibility",
            categoryLabel: "Company & Role Fit",
            title: `Role Readiness: ${responsibilityAlignment.targetCompany || sessionMeta.companyName || "Target Role"}`,
            description: responsibilityAlignment.summary,
            characterImage: CHAR_STRENGTH,
            iconBg: "#EFF6FF",
            iconColor: "#2563EB",
            tagLabel: `${responsibilityAlignment.alignmentScore}% Match`,
            tagType: "strong",
        });

        // Demonstrated competencies
        responsibilityAlignment.demonstratedCompetencies?.forEach((comp, idx) => {
            responsibilityCards.push({
                id: `resp-demonstrated-${idx}`,
                category: "responsibility",
                categoryLabel: "Demonstrated Responsibility",
                title: `Demonstrated: ${comp.length > 46 ? comp.slice(0, 44) + "…" : comp}`,
                description: comp,
                characterImage: CHAR_STRENGTH,
                iconBg: "#F0FDF4",
                iconColor: "#15803D",
                tagLabel: "Demonstrated",
                tagType: "strong",
                recommendation: "Your responses convincingly proved competence in this area. Continue referencing this project depth.",
            });
        });

        // Underrepresented areas
        responsibilityAlignment.underrepresentedAreas?.forEach((area, idx) => {
            const rec = responsibilityAlignment.recommendationsForRole?.[idx] || "Provide explicit metrics and tradeoff rationales demonstrating this duty.";
            responsibilityCards.push({
                id: `resp-under-${idx}`,
                category: "responsibility",
                categoryLabel: "Responsibility Gap",
                title: `Underrepresented: ${area.length > 46 ? area.slice(0, 44) + "…" : area}`,
                description: area,
                characterImage: CHAR_IMPROVEMENT,
                iconBg: "#FFF7ED",
                iconColor: "#C2410C",
                tagLabel: "Needs Depth",
                tagType: "needsWork",
                recommendation: rec,
            });
        });
    }

    const displayedCards =
        activeTab === "strengths"
            ? strengthsCards
            : activeTab === "improvements"
            ? improvementsCards
            : activeTab === "responsibilities"
            ? (responsibilityCards.length > 0 ? responsibilityCards : strengthsCards)
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
    // Built only once there is a report to show.
    const windowContent = !reportData ? null : (
        <div className={isModal ? styles.feedbackWindowModal : styles.feedbackWindow}>
            {/* ── Window Header ── */}
            <div className={styles.windowHeader}>
                <div className={styles.windowTitleGroup}>
                    <h1 className={styles.windowTitle}>Interview Performance Feedback</h1>
                    <p className={styles.windowSubtitle}>
                        {[sessionMeta.role && `Role: ${sessionMeta.role}`, sessionMeta.experience && `Level: ${sessionMeta.experience}`].filter(Boolean).join(" · ")}
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
                            {reportData?.responsibilityAlignment && (
                                <div
                                    className={styles.rubricPill}
                                    style={{
                                        borderColor: "#93C5FD",
                                        background: "#EFF6FF",
                                        color: "#1D4ED8",
                                    }}
                                >
                                    <span>{reportData.responsibilityAlignment.targetCompany || "Role"} Fit:</span>
                                    <span className={styles.rubricVal} style={{ color: "#1D4ED8" }}>
                                        {reportData.responsibilityAlignment.alignmentScore}%
                                    </span>
                                </div>
                            )}
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
                    className={`${styles.sectionTab} ${activeTab === "responsibilities" ? styles.tabActiveStrengths : ""}`}
                    onClick={() => setActiveTab("responsibilities")}
                >
                    Role & Company Fit
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
                            <h2 className={styles.loadingTitle}>Getting your report ready…</h2>
                        </div>
                    ) : hasError && !reportData ? (
                        <div className={styles.errorContainer}>
                            <Warning size={48} weight="regular" className={styles.errorIcon} />
                            <h2 className={styles.loadingTitle}>We couldn&rsquo;t load your report</h2>
                            <p className={styles.loadingSubtitle}>{errorMessage || "Please try again."}</p>
                            <button type="button" className={styles.retryBtn} onClick={retryFeedbackFetch}>
                                <Lightning size={16} weight="regular" />
                                Try again
                            </button>
                        </div>
                    ) : noReport || !reportData ? (
                        <div className={styles.errorContainer}>
                            <h2 className={styles.loadingTitle}>No interview report yet</h2>
                            <p className={styles.loadingSubtitle}>Finish a practice interview and your report will appear here.</p>
                            <button type="button" className={styles.retryBtn} onClick={handleCloseAction}>Back to dashboard</button>
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
                    <div className={styles.logoIcon}>
                        <img
                            src="https://res.cloudinary.com/dyg7neetr/image/upload/v1790510817/Vector_10_thljja.png"
                            alt="get prepped"
                            className={styles.logoImg}
                        />
                    </div>
                    <span className={styles.brandName}>get prepped</span>
                </div>

                <div className={styles.navActions}>
                    <FeedbackButton
                        ratingQuestion="How was this interview?"
                        interviewSessionId={
                            typeof window === "undefined"
                                ? null
                                : new URLSearchParams(window.location.search).get("sessionId") || localStorage.getItem("useladder_last_session_id")
                        }
                    />

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
                    <h2 className={styles.loadingTitle}>Getting your report ready…</h2>
                </div>
            ) : hasError && !reportData ? (
                <div className={styles.errorContainer}>
                    <Warning size={48} weight="regular" className={styles.errorIcon} />
                    <h2 className={styles.loadingTitle}>We couldn&rsquo;t load your report</h2>
                    <p className={styles.loadingSubtitle}>{errorMessage || "Please try again."}</p>
                    <button type="button" className={styles.retryBtn} onClick={retryFeedbackFetch}>
                        <Lightning size={16} weight="regular" />
                        Try again
                    </button>
                </div>
            ) : noReport || !reportData ? (
                <div className={styles.errorContainer}>
                    <h2 className={styles.loadingTitle}>No interview report yet</h2>
                    <p className={styles.loadingSubtitle}>Finish a practice interview and your report will appear here.</p>
                    <button type="button" className={styles.retryBtn} onClick={() => router.replace("/dashboard")}>Start from the dashboard</button>
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
