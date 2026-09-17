"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
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
import { Target, Warning, Check, SpinnerGap } from "@phosphor-icons/react";
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

function getDefaultResponsibilitiesForRole(roleName: string): string[] {
    const r = (roleName || "").toLowerCase();
    if (r.includes("product") || r.includes("pm")) {
        return [
            "Define product strategy, roadmaps, and metric-driven execution across squads.",
            "Drive end-to-end feature delivery from discovery to measurable customer launch.",
            "Analyze user funnels, conversion rates, and retention analytics to inform prioritization.",
            "Align engineering, design, and business stakeholders on cross-functional trade-offs."
        ];
    }
    if (r.includes("engineer") || r.includes("developer") || r.includes("frontend") || r.includes("backend") || r.includes("swe")) {
        return [
            "Build and scale resilient, high-performance web applications and backend APIs.",
            "Write clean, test-driven code and participate in rigorous code and architecture reviews.",
            "Optimize database queries, reduce latency, and ensure 99.9%+ system availability.",
            "Collaborate with product and design to deliver high-quality user experiences."
        ];
    }
    if (r.includes("design") || r.includes("ux") || r.includes("ui")) {
        return [
            "Design intuitive user flows, responsive wireframes, and production-ready component libraries.",
            "Conduct usability testing and qualitative user research to validate design assumptions.",
            "Partner with frontend engineers to uphold design fidelity and WCAG accessibility standards."
        ];
    }
    return [
        "Deliver strategic initiatives and high-quality outputs aligned with team objectives.",
        "Collaborate cross-functionally to eliminate execution bottlenecks and streamline workflows.",
        "Track and optimize performance metrics against target business key results."
    ];
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
    // Job-match state (Practice next to a role)
    const [matchData, setMatchData] = useState<any | null>(null);
    const [matchLoading, setMatchLoading] = useState(false);
    const [matchError, setMatchError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const effectiveRole = jobTitle || initialRole;

    // Determine Preparation For title: e.g. "Execution & Metrics Interview", "Stripe Software Engineer", or "Product Sense Interview"
    const preparationTitle = interviewTypeTitle
        ? interviewTypeTitle
        : initialCompany && initialCompany.trim()
            ? `${initialCompany.trim()} ${effectiveRole}`
            : (effectiveRole.toLowerCase().endsWith("interview") ? effectiveRole : `${effectiveRole} Interview`);

    const effectiveResponsibilities = useMemo(() => {
        if (jobResponsibilities && jobResponsibilities.length > 0) return jobResponsibilities;
        return getDefaultResponsibilitiesForRole(jobTitle || effectiveRole || initialRole);
    }, [jobResponsibilities, jobTitle, effectiveRole, initialRole]);


    // Fetch resume ↔ role match whenever role/job + resume are selected
    useEffect(() => {
        if (!isOpen || !activeResumeText || activeResumeText.length < 30 || !effectiveResponsibilities.length) {
            setMatchData(null);
            setMatchError(null);
            return;
        }
        let cancelled = false;
        setMatchLoading(true);
        setMatchError(null);
        const timer = setTimeout(async () => {
            try {
                const res = await fetch("/api/resume/job-match", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        resumeText: activeResumeText,
                        resumeName: activeResumeName || "Resume.pdf",
                        jobTitle: jobTitle || effectiveRole,
                        jobCompany: initialCompany || "Target Company",
                        jobResponsibilities: effectiveResponsibilities,
                        jobDescription: effectiveResponsibilities.join("\n"),
                        requiredExperience: "",
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Match failed");
                if (!cancelled) setMatchData(data.result);
            } catch (e: any) {
                if (!cancelled) setMatchError(e.message || "Failed to compute match");
            } finally {
                if (!cancelled) setMatchLoading(false);
            }
        }, 500);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [isOpen, effectiveResponsibilities, activeResumeText, activeResumeName, jobTitle, effectiveRole, initialCompany]);

    const resolveResumeText = (item: StoredResumeItem): string => {
        if (item.rawText && !item.rawText.startsWith("data:") && !item.rawText.startsWith("PK") && item.rawText.length >= 30) {
            return item.rawText;
        }
        if (typeof item.data === "string" && !item.data.startsWith("data:") && !item.data.startsWith("PK") && item.data.length >= 30) {
            return item.data;
        }
        try {
            const lastRaw = typeof window !== "undefined" ? localStorage.getItem("useladder_last_resume_feedback") : null;
            if (lastRaw) {
                const fb = JSON.parse(lastRaw);
                if (fb?.resumeText && typeof fb.resumeText === "string" && !fb.resumeText.startsWith("data:") && !fb.resumeText.startsWith("PK") && fb.resumeText.length >= 30) {
                    return fb.resumeText;
                }
            }
        } catch {}
        return item.rawText || item.data || "";
    };

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
                    setActiveResumeText(resolveResumeText(found));
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

    // Auto-parse binary dataUrl to plain text if needed
    useEffect(() => {
        if (!isOpen || !activeResumeText) return;
        if (activeResumeText.startsWith("data:") || activeResumeText.startsWith("PK")) {
            (async () => {
                try {
                    const parseRes = await fetch("/api/resume/parse", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            fileData: activeResumeText,
                            resumeName: activeResumeName || "Resume.pdf",
                        }),
                    });
                    const parseData = await parseRes.json();
                    if (parseData.success && parseData.text && parseData.text.length > 20) {
                        setActiveResumeText(parseData.text);
                    }
                } catch (e) {
                    console.warn("[InterviewSetupModal] Auto-parse failed:", e);
                }
            })();
        }
    }, [isOpen, activeResumeText, activeResumeName]);

    if (!isOpen) return null;

    // Handle selecting an existing resume
    const handleSelectResume = (item: StoredResumeItem) => {
        setSelectedResumeId(item.id);
        setActiveResumeName(item.name);
        setActiveResumeText(resolveResumeText(item));
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
        reader.onload = async () => {
            const content = typeof reader.result === "string" ? reader.result : "";
            let extractedText = "";

            try {
                const parseRes = await fetch("/api/resume/parse", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        fileData: content,
                        resumeText: file.type.startsWith("text/") ? content : "",
                        resumeName: file.name,
                    }),
                });
                const parseData = await parseRes.json();
                if (parseData.success && parseData.text) {
                    extractedText = parseData.text;
                }
            } catch (err) {
                console.warn("[InterviewSetupModal] Document parse error:", err);
            }

            const finalText = extractedText || (file.type.startsWith("text/") ? content : `Resume document: ${file.name}`);

            const newResumeItem: StoredResumeItem = {
                id: `cv_${Date.now()}`,
                name: file.name,
                data: content,
                rawText: finalText,
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

        if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
            reader.readAsText(file);
        } else {
            reader.readAsDataURL(file);
        }
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

                            {/* ── ITEM 3: RESUME ↔ ROLE MATCH ── */}
                            {Boolean(effectiveResponsibilities.length > 0) && (
                                <div className={styles.timelineItem}>
                                    <div className={styles.timelineAvatarCircle} title="Role Match" style={{ background: matchData ? (matchData.overallMatch >= 75 ? "#F0FDF4" : matchData.overallMatch >= 50 ? "#FFFBEB" : "#FEF2F2") : "#EFF6FF", border: "1px solid #E2E8F0" }}>
                                        <Target size={16} weight="bold" color={matchData ? (matchData.overallMatch >= 75 ? "#16A34A" : matchData.overallMatch >= 50 ? "#D97706" : "#DC2626") : "#2563EB"} />
                                    </div>
                                    <div className={styles.timelineItemTopRow}>
                                        <div className={styles.greetingChipRow}>
                                            <div className={styles.greetingBadge}>How your selected resume matches this role</div>
                                        </div>
                                    </div>
                                    <div className={styles.resumeInnerFormCard} style={{ padding: "0.85rem 1rem" }}>
                                        {!activeResumeText || activeResumeText.length < 30 ? (
                                            <div style={{ fontSize: "0.78rem", color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}><Warning size={14} /> Select a resume with readable text to see match.</div>
                                        ) : matchLoading ? (
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: "#475569" }}><SpinnerGap size={16} style={{ animation: "spin 1s linear infinite" }} /> Analyzing your experience against {effectiveResponsibilities.length} responsibilities…</div>
                                        ) : matchError ? (
                                            <div style={{ fontSize: "0.76rem", color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", padding: "0.55rem 0.7rem", borderRadius: 7 }}>{matchError}</div>
                                        ) : matchData ? (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                {/* Overall + experience */}
                                                <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
                                                    <div style={{ flex: "0 0 92px", background: matchData.overallMatch >= 75 ? "#F0FDF4" : matchData.overallMatch >= 50 ? "#FFFBEB" : "#FEF2F2", border: `1px solid ${matchData.overallMatch >= 75 ? "#DCFCE7" : matchData.overallMatch >= 50 ? "#FDE68A" : "#FECACA"}`, borderRadius: 10, padding: "0.7rem 0.5rem", textAlign: "center" }}>
                                                        <div style={{ fontSize: "1.45rem", fontWeight: 700, color: matchData.overallMatch >= 75 ? "#15803D" : matchData.overallMatch >= 50 ? "#B45309" : "#B91C1C", lineHeight: 1 }}>{matchData.overallMatch}%</div>
                                                        <div style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#475569", marginTop: 4 }}>Overall Match</div>
                                                    </div>
                                                    <div style={{ flex: 1, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "0.65rem 0.75rem" }}>
                                                        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#0F172A", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><Check size={12} weight="bold" color="#2563EB" /> {activeResumeName || "Selected resume"}</div>
                                                        <div style={{ fontSize: "0.78rem", color: "#334155", lineHeight: 1.45 }}>{matchData.summary}</div>
                                                        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                                            <span style={{ fontSize: "0.68rem", background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 5, padding: "0.18rem 0.45rem", color: "#475569" }}>Experience {matchData.experienceMatch.score}%</span>
                                                            <span style={{ fontSize: "0.68rem", color: "#64748B" }}>{matchData.experienceMatch.candidate} → {matchData.experienceMatch.required}</span>
                                                        </div>
                                                        <div style={{ fontSize: "0.68rem", color: "#64748B", marginTop: 4, fontStyle: "italic" }}>{matchData.experienceMatch.note}</div>
                                                    </div>
                                                </div>
                                                {/* Per-responsibility bars */}
                                                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                                                    {matchData.responsibilityMatches.map((r: any, idx: number) => {
                                                        const barColor = r.score >= 75 ? "#16A34A" : r.score >= 45 ? "#F59E0B" : "#DC2626";
                                                        const bgTrack = r.score >= 75 ? "#DCFCE7" : r.score >= 45 ? "#FEF3C7" : "#FECACA";
                                                        return (
                                                            <div key={idx} style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, padding: "0.6rem 0.75rem" }}>
                                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 5 }}>
                                                                    <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "#0F172A", lineHeight: 1.35, flex: 1 }}>{idx + 1}. {r.responsibility}</span>
                                                                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: barColor, background: bgTrack, padding: "0.15rem 0.4rem", borderRadius: 5, flexShrink: 0 }}>{r.score}% · {r.status}</span>
                                                                </div>
                                                                <div style={{ height: 6, background: "#F1F5F9", borderRadius: 999, overflow: "hidden", marginBottom: 6 }}><div style={{ width: `${r.score}%`, height: "100%", background: barColor, borderRadius: 999 }} /></div>
                                                                <div style={{ fontSize: "0.7rem", color: "#334155", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#475569" }}>Evidence:</span> {r.evidence}</div>
                                                                {r.status !== "strong" && <div style={{ fontSize: "0.68rem", color: "#B45309", marginTop: 3, lineHeight: 1.35 }}><span style={{ fontWeight: 600 }}>Gap:</span> {r.gap}</div>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {/* Strengths / gaps */}
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                                    <div style={{ background: "#F0FDF4", border: "1px solid #DCFCE7", borderRadius: 8, padding: "0.6rem 0.7rem" }}>
                                                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#15803D", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Strengths for this role</div>
                                                        <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: "0.72rem", color: "#166534", lineHeight: 1.45 }}>{matchData.strengthsForRole.map((s: string, i: number) => <li key={i} style={{ marginBottom: 2 }}>{s}</li>)}</ul>
                                                    </div>
                                                    <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "0.6rem 0.7rem" }}>
                                                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#B45309", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Gaps to address</div>
                                                        <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: "0.72rem", color: "#92400E", lineHeight: 1.45 }}>{matchData.gapsForRole.map((g: string, i: number) => <li key={i} style={{ marginBottom: 2 }}>{g}</li>)}</ul>
                                                    </div>
                                                </div>
                                                {matchData.interviewFocusAreas?.length > 0 && (
                                                    <div style={{ background: "#EFF6FF", border: "1px solid #DBEAFE", borderRadius: 8, padding: "0.6rem 0.7rem" }}>
                                                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#1D4ED8", marginBottom: 4 }}>Interview focus for this role</div>
                                                        <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: "0.72rem", color: "#1E40AF", lineHeight: 1.45 }}>{matchData.interviewFocusAreas.map((f: string, i: number) => <li key={i} style={{ marginBottom: 2 }}>{f}</li>)}</ul>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: "0.76rem", color: "#64748B" }}>Select a resume to compute match.</div>
                                        )}
                                    </div>
                                </div>
                            )}
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
