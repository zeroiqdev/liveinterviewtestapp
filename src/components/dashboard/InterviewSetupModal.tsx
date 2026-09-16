"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    CloseRegular,
    Upload2Regular,
    FileRegular,
    AddRegular,
    AlertRegular,
    ArrowRightRegular,
} from "@mingcute/react/core-regular";
import { CheckCircleFilled } from "@mingcute/react/core-filled";
import styles from "../dashboard.module.css";
import { COACH_AVATAR, RECRUITER_AVATAR } from "./constants";

export interface StoredResumeItem {
    id: string;
    name: string;
    data?: string;
    rawText?: string;
    updatedAt?: string;
    source?: "uploaded" | "narrative_studio";
}

export interface InterviewSetupModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialRole?: string;
    initialCompany?: string;
    isSpecificJob?: boolean;
    jobTitle?: string;
    interviewTypeTitle?: string;
    jobResponsibilities?: string[];
}

export function InterviewSetupModal({
    isOpen,
    onClose,
    initialRole = "Software Engineer",
    initialCompany = "",
    isSpecificJob = false,
    jobTitle = "",
    interviewTypeTitle = "",
    jobResponsibilities = [],
}: InterviewSetupModalProps) {
    const router = useRouter();

    // ── 1. Interview Mode (Live Coaching vs Mock Simulation) ──
    const [interviewMode, setInterviewMode] = useState<"live_coaching" | "post_interview">("live_coaching");

    // ── 2. Resume Selection & Upload State ──
    const [savedResumes, setSavedResumes] = useState<StoredResumeItem[]>([]);
    const [selectedResumeId, setSelectedResumeId] = useState<string>("");
    const [activeResumeName, setActiveResumeName] = useState<string>("");
    const [activeResumeText, setActiveResumeText] = useState<string>("");
    const [isUploadingNew, setIsUploadingNew] = useState<boolean>(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const effectiveRole = jobTitle || initialRole;

    // Determine Preparation For title: e.g. "Execution & Metrics Interview", "Stripe Software Engineer", or "Product Sense Interview"
    const preparationTitle = interviewTypeTitle
        ? interviewTypeTitle
        : initialCompany && initialCompany.trim()
            ? `${initialCompany.trim()} ${effectiveRole}`
            : (effectiveRole.toLowerCase().endsWith("interview") ? effectiveRole : `${effectiveRole} Interview`);


    // Load available resumes & active selection from localStorage
    useEffect(() => {
        if (!isOpen) return;

        const raw = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                let loadedResumes: StoredResumeItem[] = [];

                if (parsed.resumes && Array.isArray(parsed.resumes) && parsed.resumes.length > 0) {
                    loadedResumes = parsed.resumes.map((r: any, idx: number) => ({
                        id: r.id || `resume_${idx}`,
                        name: r.name || `Resume_${idx + 1}.pdf`,
                        data: r.data || "",
                        rawText: r.rawText || r.data || "",
                        updatedAt: r.updatedAt || "",
                        source: r.source || "uploaded",
                    }));
                } else if (parsed.resume) {
                    loadedResumes = [
                        {
                            id: typeof parsed.resume === "object" && parsed.resume.id ? parsed.resume.id : "res_primary",
                            name: typeof parsed.resume === "object" && parsed.resume.name ? parsed.resume.name : "Active_Resume.pdf",
                            data: typeof parsed.resume === "object" ? parsed.resume.data || "" : "",
                            rawText: typeof parsed.resume === "object" ? parsed.resume.rawText || parsed.resume.data || "" : "",
                            updatedAt: typeof parsed.resume === "object" ? parsed.resume.updatedAt : "",
                            source: "uploaded",
                        },
                    ];
                }

                setSavedResumes(loadedResumes);

                if (loadedResumes.length > 0) {
                    const targetId = parsed.selectedResumeId || loadedResumes[0].id;
                    const found = loadedResumes.find((r) => r.id === targetId) || loadedResumes[0];
                    setSelectedResumeId(found.id);
                    setActiveResumeName(found.name);
                    setActiveResumeText(found.rawText || found.data || "");
                    setIsUploadingNew(false);
                } else {
                    setIsUploadingNew(true);
                }
            } catch (e) {
                console.error("Error loading stored resumes:", e);
                setIsUploadingNew(true);
            }
        } else {
            setIsUploadingNew(true);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // Handle selecting an existing resume
    const handleSelectResume = (item: StoredResumeItem) => {
        setSelectedResumeId(item.id);
        setActiveResumeName(item.name);
        setActiveResumeText(item.rawText || item.data || "");
        setIsUploadingNew(false);
        setUploadError(null);

        const raw = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                parsed.selectedResumeId = item.id;
                parsed.resume = item;
                localStorage.setItem("useladder_user", JSON.stringify(parsed));
            } catch (e) {
                console.error("Error updating selected resume in storage:", e);
            }
        }
    };

    // Handle uploading a new resume file
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadError(null);

        const reader = new FileReader();
        reader.onload = () => {
            const content = typeof reader.result === "string" ? reader.result : "";
            let cleanedText = content;
            if (content.startsWith("data:")) {
                try {
                    const base64 = content.split(",")[1];
                    const decoded = atob(base64);
                    cleanedText = decoded.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{2,}/g, " ").trim();
                } catch {
                    cleanedText = `Resume document: ${file.name}`;
                }
            }

            const newResumeItem: StoredResumeItem = {
                id: `cv_${Date.now()}`,
                name: file.name,
                data: content,
                rawText: cleanedText || `Resume document: ${file.name}`,
                updatedAt: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                source: "uploaded",
            };

            const updatedList = [newResumeItem, ...savedResumes];
            setSavedResumes(updatedList);
            setSelectedResumeId(newResumeItem.id);
            setActiveResumeName(newResumeItem.name);
            setActiveResumeText(newResumeItem.rawText || "");
            setIsUploadingNew(false);

            // Sync with localStorage
            const raw = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    parsed.resumes = updatedList;
                    parsed.selectedResumeId = newResumeItem.id;
                    parsed.resume = newResumeItem;
                    localStorage.setItem("useladder_user", JSON.stringify(parsed));
                } catch (err) {
                    console.error("Error saving newly uploaded resume:", err);
                }
            }
        };
        reader.readAsText(file);
    };

    // Start Session with configured settings
    const handleStartSession = () => {
        const sessionMeta = {
            role: effectiveRole,
            companyName: initialCompany || "General Industry Benchmark",
            interviewMode,
            preparationTitle,
            responsibilities: jobResponsibilities,
            isSpecificJob,
            selectedResumeId,
            resumeName: activeResumeName,
            startedAt: new Date().toISOString(),
        };

        localStorage.setItem("useladder_last_session_meta", JSON.stringify(sessionMeta));

        // Ensure engine selects this resume
        const raw = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
        if (raw && selectedResumeId) {
            try {
                const parsed = JSON.parse(raw);
                parsed.selectedResumeId = selectedResumeId;
                const match = savedResumes.find((r) => r.id === selectedResumeId);
                if (match) parsed.resume = match;
                localStorage.setItem("useladder_user", JSON.stringify(parsed));
            } catch { /* ignore */ }
        }

        onClose();

        const queryParams = new URLSearchParams({
            mode: interviewMode,
            role: initialRole || effectiveRole,
            company: initialCompany || "General",
            interviewType: preparationTitle,
        });

        router.push(`/interview?${queryParams.toString()}`);
    };

    return (
        <div className={styles.settingsModalOverlay} onClick={onClose}>
            <div className={`${styles.settingsModalContent} ${styles.unboldedModal}`} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
                {/* ── Top Header ── */}
                <div className={styles.settingsModalHeader}>
                    <div>
                        <h2 className={styles.settingsModalTitle}>Configure Interview Session</h2>
                    </div>
                    <button className={styles.settingsCloseBtn} onClick={onClose} aria-label="Close configuration">
                        <CloseRegular size={18} />
                    </button>
                </div>

                {/* ── Preparation For Heading ── */}
                <div style={{ padding: "0.85rem 1.5rem 0" }}>
                    <div className={styles.setupPreparationBox}>
                        <span className={styles.setupPreparationLabel}>Preparation for</span>
                        <span className={styles.setupPreparationValue}>{preparationTitle}</span>
                    </div>
                </div>

                {/* ── Timeline Body ── */}
                <div className={styles.settingsTimelineBody}>
                    <div className={styles.timelineSectionWrap}>
                        <div className={styles.timelineItemsList}>
                            <div className={styles.timelineConnectorLine} />

                            {/* ── ITEM 1 (AT THE TOP): INTERVIEW MODE ── */}
                            <div className={styles.timelineItem}>
                                <div className={styles.timelineAvatarCircle} title="Recruiter">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={RECRUITER_AVATAR}
                                        alt="Recruiter"
                                        className={styles.timelineAvatarImg}
                                        draggable={false}
                                    />
                                </div>

                                <div className={styles.timelineItemTopRow}>
                                    <div className={styles.greetingChipRow}>
                                        <div className={styles.greetingBadge}>
                                            Hello, select your preferred interview mode
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.resumeInnerFormCard}>
                                    {/* Mode Tabs with Divider & Underline Selected State */}
                                    <div className={styles.modeTabsRow}>
                                        <div
                                            className={`${styles.modeTabCol} ${interviewMode === "live_coaching" ? styles.modeTabColActive : ""}`}
                                            onClick={() => setInterviewMode("live_coaching")}
                                        >
                                            <div className={styles.modeTabHeaderWrap}>
                                                <span className={styles.modeTabHeader}>
                                                    Live Coaching
                                                </span>
                                            </div>
                                            <p className={styles.modeTabDesc}>
                                                Receive real-time critiques, strengths, coach tips, and top 1% model answers immediately after each question.
                                            </p>
                                        </div>

                                        <div className={styles.modeTabDivider} />

                                        <div
                                            className={`${styles.modeTabCol} ${interviewMode === "post_interview" ? styles.modeTabColActive : ""}`}
                                            onClick={() => setInterviewMode("post_interview")}
                                        >
                                            <div className={styles.modeTabHeaderWrap}>
                                                <span className={styles.modeTabHeader}>
                                                    Mock Simulation
                                                </span>
                                            </div>
                                            <p className={styles.modeTabDesc}>
                                                A realistic, uninterrupted mock interview round with comprehensive evaluation and benchmark scoring at the end.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── ITEM 2: RESUME PICKER & CALIBRATION ── */}
                            <div className={styles.timelineItem}>
                                <div className={styles.timelineAvatarCircle} title="AI Interview Coach">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={COACH_AVATAR}
                                        alt="AI Coach"
                                        className={styles.timelineAvatarImg}
                                        draggable={false}
                                    />
                                </div>

                                <div className={styles.timelineItemTopRow}>
                                    <div className={styles.greetingChipRow}>
                                        <div className={styles.greetingBadge}>
                                            Select a resume so I can ask detailed questions around your experience, and achievements
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.resumeInnerFormCard}>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileUpload}
                                        accept=".pdf,.doc,.docx,.txt,.md"
                                        style={{ display: "none" }}
                                    />

                                    {/* List of previously uploaded / modified resumes */}
                                    {savedResumes.length > 0 && !isUploadingNew && (
                                        <div>
                                            <div className={styles.resumePickerHeader}>
                                                <span className={styles.resumePickerTitle}>Select Resume for Session</span>
                                                <span className={styles.resumePickerCount}>
                                                    {savedResumes.length} {savedResumes.length === 1 ? "resume" : "resumes"} available
                                                </span>
                                            </div>

                                            <div className={styles.resumePickerList}>
                                                {savedResumes.map((resume) => {
                                                    const isSelected = resume.id === selectedResumeId;
                                                    return (
                                                        <div
                                                            key={resume.id}
                                                            className={`${styles.resumeOptionCard} ${isSelected ? styles.resumeOptionCardActive : ""}`}
                                                            onClick={() => handleSelectResume(resume)}
                                                        >
                                                            <div className={styles.resumeOptionLeft}>
                                                                <div className={styles.resumeOptionIconWrap}>
                                                                    <FileRegular size={18} />
                                                                </div>
                                                                <div className={styles.resumeOptionTextGroup}>
                                                                    <span className={styles.resumeOptionName}>{resume.name}</span>
                                                                    <div className={styles.resumeOptionSub}>
                                                                        {resume.source === "narrative_studio" ? (
                                                                            <span style={{ color: "#2563EB" }}>Tailored in Studio</span>
                                                                        ) : (
                                                                            <span>Uploaded Resume</span>
                                                                        )}
                                                                        {resume.updatedAt && <span>• {resume.updatedAt}</span>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className={styles.resumeOptionCheck}>
                                                                {isSelected ? (
                                                                    <CheckCircleFilled size={18} color="#2563EB" />
                                                                ) : (
                                                                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid #CBD5E1" }} />
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <button
                                                type="button"
                                                className={styles.uploadNewCvTriggerBtn}
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                <AddRegular size={16} />
                                                <span>Upload a New Resume</span>
                                            </button>
                                        </div>
                                    )}

                                    {/* Upload Dropzone (if user chooses to upload new or no resumes saved) */}
                                    {(savedResumes.length === 0 || isUploadingNew) && (
                                        <div style={{ marginTop: "0.75rem" }}>
                                            <div
                                                className={styles.resumeDropzoneArea}
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                <Upload2Regular size={24} color="#2563EB" />
                                                <span className={styles.resumeDropzoneTitle}>
                                                    Click to upload CV / Resume
                                                </span>
                                                <span className={styles.resumeDropzoneSubtitle}>
                                                    PDF, DOCX, TXT, MD
                                                </span>
                                            </div>

                                            {savedResumes.length > 0 && (
                                                <div style={{ textAlign: "center", marginTop: "0.5rem" }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsUploadingNew(false)}
                                                        style={{ background: "none", border: "none", color: "#64748B", fontSize: "0.76rem", cursor: "pointer", textDecoration: "underline" }}
                                                    >
                                                        Cancel & choose from saved resumes
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {uploadError && (
                                        <div className={styles.errorBanner}>
                                            <AlertRegular size={16} color="#DC2626" />
                                            <span>{uploadError}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Modal Footer with Action Buttons ── */}
                <div className={styles.settingsModalFooter}>
                    <button
                        type="button"
                        className={styles.settingsCancelFooterBtn}
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className={styles.settingsSaveFooterBtn}
                        onClick={handleStartSession}
                    >
                        <span>Start {interviewMode === "live_coaching" ? "Live Coaching" : "Interview"} Session</span>
                        <ArrowRightRegular size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
