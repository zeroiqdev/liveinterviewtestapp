import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "@phosphor-icons/react";
import styles from "../dashboard.module.css";
import { buildCharactersForUser, type ResumeScanFeedbackItem } from "./constants";
import { DmRow } from "./DmRow";
import FeedbackReport from "../FeedbackReport";
import type { FeedbackReportData } from "@/app/api/feedback/generate/route";
import type { JobItem } from "@/app/api/jobs/route";

interface ChatsPanelProps {
    userRole?: string;
    userRoleFamily?: string;
    displayedJobs?: JobItem[];
    onPractice?: () => void;
    onOpenJob?: (job: JobItem) => void;
    onOpenFeedback?: () => void;
}

export function ChatsPanel({
    userRole,
    userRoleFamily,
    displayedJobs = [],
    onPractice,
    onOpenJob,
    onOpenFeedback,
}: ChatsPanelProps) {
    const router = useRouter();
    const [openedDmId, setOpenedDmId] = useState<string | null>(() => {
        if (typeof window !== "undefined") {
            const hasNew = localStorage.getItem("useladder_has_new_resume_dm") === "true";
            if (hasNew) {
                localStorage.removeItem("useladder_has_new_resume_dm");
                try {
                    const allRaw = localStorage.getItem("useladder_all_resume_feedbacks");
                    if (allRaw) {
                        const arr = JSON.parse(allRaw);
                        if (Array.isArray(arr) && arr.length > 0 && (arr[0] as any).id) return `coach-resume-feedback-${(arr[0] as any).id}`;
                    }
                } catch {}
                return "coach-resume-feedback";
            }
        }
        return null;
    });
    const [showRoleBubble, setShowRoleBubble] = useState(true);
    const [lastFeedback] = useState<FeedbackReportData | null>(() => {
        if (typeof window === "undefined") return null;
        try {
            const raw = localStorage.getItem("useladder_last_feedback");
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.overallScore === "number") {
                    return parsed;
                }
            }
            const lastSessionId = localStorage.getItem("useladder_last_session_id");
            if (lastSessionId) {
                const cached = localStorage.getItem(`useladder_feedback_${lastSessionId}`);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed && typeof parsed.overallScore === "number") {
                        return parsed;
                    }
                }
            }
        } catch {
            // Ignore parse errors
        }
        return null;
    });

    const [lastResumeFeedback, setLastResumeFeedback] = useState<ResumeScanFeedbackItem | null>(() => {
        if (typeof window === "undefined") return null;
        try {
            const raw = localStorage.getItem("useladder_last_resume_feedback");
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.score === "number") {
                    return parsed;
                }
            }
            // If user has an active resume stored, show its feedback in DM immediately
            const userRaw = localStorage.getItem("useladder_user");
            if (userRaw) {
                const user = JSON.parse(userRaw);
                const activeResume = user.resume || (Array.isArray(user.resumes) && user.resumes[0]);
                if (activeResume && activeResume.name) {
                    return {
                        id: activeResume.id,
                        resumeName: activeResume.name,
                        role: user.role || "Software Engineer",
                        domain: user.domain || "Software & Engineering",
                        resumeText: activeResume.data || activeResume.rawText || "",
                        score: typeof activeResume.score === "number" ? activeResume.score : 82,
                        summary: "Your resume has been audited for your targeted role. Review full feedback and elevate bullet points with our in-line Google X-Y-Z improver.",
                    };
                }
            }
        } catch {}
        return null;
    });

    const [hasAdminTips, setHasAdminTips] = useState(false);
    useEffect(() => {
        fetch("/api/admin/tips")
            .then((r) => r.json())
            .then((d) => setHasAdminTips(!!d.enabled))
            .catch(() => {});
        const handler = () => fetch("/api/admin/tips").then((r) => r.json()).then((d) => setHasAdminTips(!!d.enabled)).catch(() => {});
        window.addEventListener("useladder_tips_updated", handler);
        return () => window.removeEventListener("useladder_tips_updated", handler);
    }, []);

    const [allResumeFeedbacks, setAllResumeFeedbacks] = useState<ResumeScanFeedbackItem[] | null>(() => {
        if (typeof window === "undefined") return null;
        try {
            const allRaw = localStorage.getItem("useladder_all_resume_feedbacks");
            if (allRaw) {
                const arr = JSON.parse(allRaw);
                if (Array.isArray(arr) && arr.length > 0 && typeof arr[0].score === "number") return arr as ResumeScanFeedbackItem[];
            }
        } catch {}
        return null;
    });

    useEffect(() => {
        const handleResumeScanned = () => {
            try {
                const raw = localStorage.getItem("useladder_last_resume_feedback");
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed.score === "number") {
                        setLastResumeFeedback(parsed);
                        // Prefer per-resume id if available
                        const pid = (parsed as any).id ? `coach-resume-feedback-${(parsed as any).id}` : "coach-resume-feedback";
                        setOpenedDmId(pid);
                    }
                }
                const allRaw = localStorage.getItem("useladder_all_resume_feedbacks");
                if (allRaw) {
                    const arr = JSON.parse(allRaw);
                    if (Array.isArray(arr) && arr.length > 0) setAllResumeFeedbacks(arr as ResumeScanFeedbackItem[]);
                }
            } catch {}
        };
        window.addEventListener("useladder_resume_scanned", handleResumeScanned);
        return () => window.removeEventListener("useladder_resume_scanned", handleResumeScanned);
    }, []);

    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

    const handleOpenFeedback = useCallback(() => {
        setIsFeedbackModalOpen(true);
        if (onOpenFeedback) {
            onOpenFeedback();
        }
    }, [onOpenFeedback]);

    const handleOpenResumeFeedback = useCallback((resumeId?: string) => {
        // If a specific resume DM was clicked, make it the active resume so /resume-feedback shows that file
        if (resumeId) {
            try {
                const raw = localStorage.getItem("useladder_all_resume_feedbacks");
                const userRaw = localStorage.getItem("useladder_user");
                if (raw) {
                    const arr = JSON.parse(raw);
                    const found = Array.isArray(arr) ? arr.find((r: any) => r.id === resumeId) : null;
                    if (found) {
                        localStorage.setItem("useladder_last_resume_feedback", JSON.stringify(found));
                        if (userRaw) {
                            const u = JSON.parse(userRaw);
                            u.selectedResumeId = found.id;
                            localStorage.setItem("useladder_user", JSON.stringify(u));
                        }
                    }
                } else if (userRaw) {
                    const u = JSON.parse(userRaw);
                    const found = Array.isArray(u.resumes) ? u.resumes.find((r: any) => r.id === resumeId) : null;
                    if (found) {
                        u.selectedResumeId = found.id;
                        localStorage.setItem("useladder_user", JSON.stringify(u));
                    }
                }
            } catch {}
        }
        router.push("/resume-feedback");
    }, [router]);

    const coachProfile = useMemo(() => {
        const characters = buildCharactersForUser({
            userRole,
            userRoleFamily,
            displayedJobs,
            lastFeedback,
            lastResumeFeedback,
            allResumeFeedbacks,
            hasAdminTips,
            onPractice,
            onOpenJob,
            onOpenFeedback: handleOpenFeedback,
            onOpenResumeFeedback: handleOpenResumeFeedback,
        });
        return characters.find((c) => c.id === "coach") || characters[0];
    }, [
        userRole,
        userRoleFamily,
        displayedJobs,
        lastFeedback,
        lastResumeFeedback,
        allResumeFeedbacks,
        hasAdminTips,
        onPractice,
        onOpenJob,
        handleOpenFeedback,
        handleOpenResumeFeedback,
    ]);

    const [readDmIds, setReadDmIds] = useState<Set<string>>(() => {
        if (typeof window === "undefined") return new Set<string>();
        try {
            const raw = localStorage.getItem("useladder_read_dms");
            return raw ? new Set(JSON.parse(raw)) : new Set<string>();
        } catch {
            return new Set<string>();
        }
    });

    const handleToggleDm = useCallback((id: string) => {
        setOpenedDmId((prev) => (prev === id ? null : id));
        setReadDmIds((prev) => {
            if (prev.has(id)) return prev;
            const updated = new Set(prev);
            updated.add(id);
            try {
                localStorage.setItem("useladder_read_dms", JSON.stringify(Array.from(updated)));
            } catch {}
            return updated;
        });
    }, []);

    const dynamicUnreadCount = coachProfile.items.filter((item) => !readDmIds.has(item.id)).length;

    // Collapsed: show 5 at a glance, rest via scroll (like recruiter jobPickList). Open: single DM takes entire section.
    const visibleCoachItems = useMemo(() => {
        if (openedDmId) {
            const found = coachProfile.items.find((item) => item.id === openedDmId);
            return found ? [found] : coachProfile.items;
        }
        return coachProfile.items;
    }, [coachProfile.items, openedDmId]);

    return (
        <div className={styles.scheduledPanel}>
            {/* ── Interview Coach Identity Header ── */}
            <div className={styles.scheduledHeader}>
                <div className={styles.headerCharacterGroup}>
                    <button
                        type="button"
                        className={`${styles.headerCharAvatarButton} ${styles.headerCharAvatarButtonActive}`}
                        onClick={() => setShowRoleBubble(!showRoleBubble)}
                        title="View Interview Coach details"
                        aria-label="View Interview Coach details"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={coachProfile.avatar}
                            alt={coachProfile.name}
                            className={styles.headerCharAvatarCircle}
                        />
                        {dynamicUnreadCount > 0 && (
                            <span className={styles.charUnreadBadge}>
                                {dynamicUnreadCount}
                            </span>
                        )}
                    </button>

                    {/* iMessage style blue bubble – hidden when a DM is open so open DM takes entire space */}
                    {showRoleBubble && !openedDmId && (
                        <div className={styles.imessageRoleBubble} role="status">
                            <div className={styles.imessageBubbleTail} />
                            <div className={styles.imessageBubbleContent}>
                                <p className={styles.imessageRoleText}>
                                    {coachProfile.roleExplanation}
                                </p>
                            </div>
                            <button
                                type="button"
                                className={styles.imessageCloseBtn}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowRoleBubble(false);
                                }}
                                aria-label="Close"
                                title="Close"
                            >
                                <X size={10} weight="regular" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Conversation Style DM Rows List — collapsed shows 5 at a glance + scroll for rest (like recruiter), open takes entire section ── */}
            <div
                className={styles.conversationDmList}
                style={
                    openedDmId
                        ? { maxHeight: "none", flex: 1, overflowY: "auto" }
                        : { maxHeight: "382px", overflowY: "auto" }
                }
            >
                {visibleCoachItems.map((dm) => (
                    <DmRow
                        key={dm.id}
                        dm={dm}
                        isOpen={openedDmId === dm.id}
                        isUnread={!readDmIds.has(dm.id) && openedDmId !== dm.id}
                        onToggle={handleToggleDm}
                        onPractice={onPractice}
                    />
                ))}
            </div>

            {/* ── Feedback Report Modal (Opened via Coach Message CTA) ── */}
            {isFeedbackModalOpen && (
                <FeedbackReport
                    isModal
                    onClose={() => setIsFeedbackModalOpen(false)}
                    initialReportData={lastFeedback}
                />
            )}
        </div>
    );
}

