import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Globe, X } from "@phosphor-icons/react";
import type { JobItem } from "@/app/api/jobs/route";
import type { UserLocation } from "@/utils/locationDetector";
import styles from "../dashboard.module.css";
import { JobPickRow } from "./JobPickRow";
import { RECRUITER_AVATAR } from "./constants";

const RECRUITER_BUBBLE_TEXT =
    "I match you with open career trajectory roles at top companies and simulate their specific live interview rounds.";

const LOCATION_PRESETS = [
    { country: "Nigeria", countryCode: "NG", city: "Lagos", continent: "Africa", isAfrica: true, isNigeria: true, label: "Nigeria (Lagos & Remote)" },
    { country: "Pan-African", countryCode: "AF", continent: "Africa", isAfrica: true, isNigeria: false, label: "Africa (Pan-African & Remote)" },
    { country: "United Kingdom", countryCode: "GB", city: "London", continent: "Europe", isAfrica: false, isNigeria: false, label: "United Kingdom & Europe" },
    { country: "United States", countryCode: "US", city: "San Francisco", continent: "North America", isAfrica: false, isNigeria: false, label: "United States & North America" },
    { country: "Worldwide", countryCode: "WW", continent: "Worldwide", isAfrica: false, isNigeria: false, label: "Global Remote Everywhere" },
];

interface TopJobsPanelProps {
    userLocation: UserLocation | null;
    jobs: JobItem[];
    userRole?: string;
    userRoleFamily?: string;
    onSwitchLocation: (preset: { country: string; countryCode: string; city?: string; continent: string; isAfrica: boolean; isNigeria: boolean }) => void;
    onOpenJob: (job: JobItem) => void;
    onPractice: () => void;
}

export function TopJobsPanel({
    userLocation,
    jobs,
    userRole,
    onSwitchLocation,
    onOpenJob,
    onPractice,
}: TopJobsPanelProps) {
    const [showDropdown, setShowDropdown] = useState(false);
    const [showBubble, setShowBubble] = useState(true);
    const dropdownRef = useRef<HTMLDivElement>(null);

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

    const handlePresetClick = useCallback((preset: (typeof LOCATION_PRESETS)[number]) => {
        onSwitchLocation(preset);
        setShowDropdown(false);
    }, [onSwitchLocation]);

    return (
        <div className={styles.moduleProgressPanel}>
            <div className={styles.topJobPicksHeader}>
                <div className={styles.headerCharacterGroup}>
                    {/* Recruiter character avatar — clickable to toggle bubble */}
                    <button
                        type="button"
                        className={`${styles.headerCharAvatarButton} ${styles.headerCharAvatarButtonActive}`}
                        onClick={() => setShowBubble(!showBubble)}
                        title="View Recruiter details"
                        aria-label="View Recruiter details"
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={RECRUITER_AVATAR}
                            alt="Recruiter"
                            className={styles.headerCharAvatarCircle}
                            draggable={false}
                        />
                    </button>

                    {/* iMessage style blue bubble for the Recruiter */}
                    {showBubble && (
                        <div className={styles.imessageRoleBubble} role="status">
                            <div className={styles.imessageBubbleTail} />
                            <div className={styles.imessageBubbleContent}>
                                <p className={styles.imessageRoleText}>
                                    {RECRUITER_BUBBLE_TEXT}
                                </p>
                            </div>
                            <button
                                type="button"
                                className={styles.imessageCloseBtn}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowBubble(false);
                                }}
                                aria-label="Close"
                                title="Close"
                            >
                                <X size={10} weight="bold" />
                            </button>
                        </div>
                    )}
                </div>

                <div className={styles.topJobPicksRight}>
                    {userLocation && (
                        <div className={styles.locationSwitcherWrap} ref={dropdownRef}>
                            <button
                                type="button"
                                className={styles.locationBadgePill}
                                onClick={() => setShowDropdown(!showDropdown)}
                                title={`Location: ${userLocation.isNigeria ? "Nigeria & Remote" : `${userLocation.country} & Remote`} (Click to switch)`}
                                aria-label="Change location"
                            >
                                <Globe size={16} weight="bold" />
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
            </div>

            <div className={styles.jobPickList}>
                {jobs.map((job) => (
                    <JobPickRow
                        key={job.id || `${job.company}-${job.title}`}
                        job={job}
                        onOpen={onOpenJob}
                        onPractice={onPractice}
                    />
                ))}
                {jobs.length === 0 && (
                    <div className={styles.jobEmptyMessage}>
                        No active {userRole ? `${userRole} ` : ""}opportunities currently found in this region.
                    </div>
                )}
            </div>
        </div>
    );
}
