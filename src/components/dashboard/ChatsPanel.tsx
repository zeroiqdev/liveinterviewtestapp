import React, { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "@phosphor-icons/react";
import styles from "../dashboard.module.css";
import { buildCharactersForUser } from "./constants";
import { DmRow } from "./DmRow";
import type { FeedbackReportData } from "@/app/api/feedback/generate/route";
import type { JobItem } from "@/app/api/jobs/route";

interface ChatsPanelProps {
    userRole?: string;
    userRoleFamily?: string;
    displayedJobs?: JobItem[];
    onPractice?: () => void;
    onOpenJob?: (job: JobItem) => void;
}

export function ChatsPanel({
    userRole,
    userRoleFamily,
    displayedJobs = [],
    onPractice,
    onOpenJob,
}: ChatsPanelProps) {
    const [selectedCharacterId, setSelectedCharacterId] = useState("coach");
    const [openedDmId, setOpenedDmId] = useState<string | null>(null);
    const [showRoleBubble, setShowRoleBubble] = useState(true);
    const [lastFeedback, setLastFeedback] = useState<FeedbackReportData | null>(null);

    // Read last session's actual feedback report from localStorage
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const raw = localStorage.getItem("useladder_last_feedback");
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.overallScore === "number") {
                    setLastFeedback(parsed);
                    return;
                }
            }
            const lastSessionId = localStorage.getItem("useladder_last_session_id");
            if (lastSessionId) {
                const cached = localStorage.getItem(`useladder_feedback_${lastSessionId}`);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed && typeof parsed.overallScore === "number") {
                        setLastFeedback(parsed);
                    }
                }
            }
        } catch {
            // Ignore parse errors
        }
    }, []);

    const coachProfile = useMemo(() => {
        const characters = buildCharactersForUser({
            userRole,
            userRoleFamily,
            displayedJobs,
            lastFeedback,
            onPractice,
            onOpenJob,
        });
        return characters.find((c) => c.id === "coach") || characters[0];
    }, [userRole, userRoleFamily, displayedJobs, lastFeedback, onPractice, onOpenJob]);

    const handleToggleDm = useCallback((id: string) => {
        setOpenedDmId((prev) => (prev === id ? null : id));
    }, []);

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
                        {coachProfile.unreadCount > 0 && (
                            <span className={styles.charUnreadBadge}>
                                {coachProfile.unreadCount}
                            </span>
                        )}
                    </button>

                    {/* iMessage style blue bubble for the Interview Coach */}
                    {showRoleBubble && (
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
                                <X size={10} weight="bold" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Conversation Style DM Rows List ── */}
            <div className={styles.conversationDmList}>
                {coachProfile.items.map((dm) => (
                    <DmRow
                        key={dm.id}
                        dm={dm}
                        isOpen={openedDmId === dm.id}
                        onToggle={handleToggleDm}
                        onPractice={onPractice}
                    />
                ))}
            </div>
        </div>
    );
}

