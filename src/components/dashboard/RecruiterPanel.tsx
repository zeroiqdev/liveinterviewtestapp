import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Globe, X } from "@phosphor-icons/react";
import styles from "../dashboard.module.css";
import { buildCharactersForUser } from "./constants";
import { JobPickRow } from "./JobPickRow";
import type { JobItem } from "@/app/api/jobs/route";
import type { UserLocation } from "@/utils/locationDetector";
import type { FeedbackReportData } from "@/app/api/feedback/generate/route";

const LOCATION_PRESETS = [
    { country: "Nigeria", countryCode: "NG", city: "Lagos", continent: "Africa", isAfrica: true, isNigeria: true, label: "Nigeria (Lagos & Remote)" },
    { country: "Pan-African", countryCode: "AF", continent: "Africa", isAfrica: true, isNigeria: false, label: "Africa (Pan-African & Remote)" },
    { country: "United Kingdom", countryCode: "GB", city: "London", continent: "Europe", isAfrica: false, isNigeria: false, label: "United Kingdom & Europe" },
    { country: "United States", countryCode: "US", city: "San Francisco", continent: "North America", isAfrica: false, isNigeria: false, label: "United States & North America" },
    { country: "Worldwide", countryCode: "WW", continent: "Worldwide", isAfrica: false, isNigeria: false, label: "Global Remote Everywhere" },
];

interface RecruiterPanelProps {
    userRole?: string;
    userRoleFamily?: string;
    displayedJobs: JobItem[];
    userLocation: UserLocation | null;
    onSwitchLocation: (preset: { country: string; countryCode: string; city?: string; continent: string; isAfrica: boolean; isNigeria: boolean }) => void;
    onPractice?: () => void;
    onOpenJob?: (job: JobItem) => void;
}

export function RecruiterPanel({
    userRole,
    userRoleFamily,
    displayedJobs,
    userLocation,
    onSwitchLocation,
    onPractice,
    onOpenJob,
}: RecruiterPanelProps) {
    const [showRoleBubble, setShowRoleBubble] = useState(true);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [lastFeedback, setLastFeedback] = useState<FeedbackReportData | null>(null);

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
        } catch {}
    }, []);

    useEffect(() => {
        if (!showDropdown) return;
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showDropdown]);

    const recruiterProfile = useMemo(() => {
        const characters = buildCharactersForUser({
            userRole,
            userRoleFamily,
            displayedJobs,
            lastFeedback,
            onPractice,
            onOpenJob,
        });
        return characters.find((c) => c.id === "recruiter") || characters[1] || characters[0];
    }, [userRole, userRoleFamily, displayedJobs, lastFeedback, onPractice, onOpenJob]);

    const handlePresetClick = useCallback(
        (preset: (typeof LOCATION_PRESETS)[number]) => {
            onSwitchLocation(preset);
            setShowDropdown(false);
        },
        [onSwitchLocation]
    );

    return (
        <div className={styles.moduleProgressPanel}>
            {/* ── Recruiter Identity Header (mirrors Interview Coach) ── */}
            <div className={styles.scheduledHeader}>
                <div className={styles.headerCharacterGroup}>
                    <button
                        type="button"
                        className={`${styles.headerCharAvatarButton} ${styles.headerCharAvatarButtonActive}`}
                        onClick={() => setShowRoleBubble(!showRoleBubble)}
                        title="View Recruiter details"
                        aria-label="View Recruiter details"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={recruiterProfile.avatar} alt={recruiterProfile.name} className={styles.headerCharAvatarCircle} />
                        {recruiterProfile.unreadCount > 0 && <span className={styles.charUnreadBadge}>{recruiterProfile.unreadCount}</span>}
                    </button>

                    {showRoleBubble && (
                        <div className={styles.imessageRoleBubble} role="status">
                            <div className={styles.imessageBubbleTail} />
                            <div className={styles.imessageBubbleContent}>
                                <p className={styles.imessageRoleText}>{recruiterProfile.roleExplanation}</p>
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

                {userLocation && (
                    <div className={styles.locationSwitcherWrap} ref={dropdownRef}>
                        <button
                            type="button"
                            className={`${styles.locationBadgePill} ${styles.locationBadgeIconOnly}`}
                            onClick={() => setShowDropdown(!showDropdown)}
                            title={`Location: ${userLocation.country} (Click to switch)`}
                            aria-label="Change location"
                        >
                            <Globe size={14} weight="bold" />
                        </button>
                        {showDropdown && (
                            <div className={styles.locationDropdownMenu}>
                                {LOCATION_PRESETS.map((preset) => {
                                    const isActive = preset.isNigeria
                                        ? userLocation.isNigeria
                                        : preset.country === "Pan-African"
                                            ? userLocation.isAfrica && !userLocation.isNigeria
                                            : userLocation.country === preset.country;
                                    return (
                                        <button
                                            key={preset.countryCode}
                                            type="button"
                                            className={`${styles.locationDropdownItem} ${isActive ? styles.locationDropdownItemActive : ""}`}
                                            onClick={() => handlePresetClick(preset)}
                                        >
                                            <span>{preset.label}</span>
                                            {isActive && <Check size={12} weight="bold" />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className={styles.jobPickList}>
                {displayedJobs.map((job) => (
                    <JobPickRow key={job.id || `${job.company}-${job.title}`} job={job} onOpen={onOpenJob!} onPractice={onPractice!} />
                ))}
                {displayedJobs.length === 0 && (
                    <div className={styles.jobEmptyMessage}>No active {userRole ? `${userRole} ` : ""}opportunities currently found in this region.</div>
                )}
            </div>
        </div>
    );
}
