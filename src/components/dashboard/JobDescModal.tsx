import React, { useState, useEffect, useMemo } from "react";
import { ArrowSquareOut, Play, X, Warning, SpinnerGap, FileText } from "@phosphor-icons/react";
import type { JobItem } from "@/app/api/jobs/route";
import styles from "../dashboard.module.css";
import { CompanyLogo } from "./CompanyLogo";
import { generateRoleOverview } from "@/services/careerPageScraper";
import {
    cleanJobTitle,
    deriveJobResponsibilities,
    getJobMatchCacheKey,
    getCachedJobMatch,
    setCachedJobMatch,
} from "./utils";
import { matchResumeToJob } from "@/lib/atsScorer";
import { RECRUITER_AVATAR } from "./constants";

export interface StoredResumeOption {
    id: string;
    name: string;
    rawText?: string;
    data?: string;
    score?: number;
}

interface JobDescModalProps {
    job: JobItem;
    onClose: () => void;
    onPractice: () => void;
    calibrationSectionTitle?: string;
    calibrationText?: string;
    userRole?: string;
    resumes?: StoredResumeOption[];
    activeResumeId?: string;
}

function resolveResumeText(item?: StoredResumeOption | null): string {
    if (!item) return "";
    if (item.rawText && typeof item.rawText === "string" && item.rawText.length >= 30 && !item.rawText.startsWith("data:") && !item.rawText.startsWith("PK")) {
        return item.rawText;
    }
    if (item.data && typeof item.data === "string" && item.data.length >= 30 && !item.data.startsWith("data:") && !item.data.startsWith("PK")) {
        return item.data;
    }
    try {
        if (typeof window !== "undefined") {
            const lastRaw = localStorage.getItem("useladder_last_resume_feedback");
            if (lastRaw) {
                const fb = JSON.parse(lastRaw);
                if (fb?.resumeText && typeof fb.resumeText === "string" && fb.resumeText.length >= 30) {
                    return fb.resumeText;
                }
            }
        }
    } catch {}
    return item.rawText || item.data || "";
}

function JobDescModalComponent({
    job,
    onClose,
    onPractice,
    calibrationSectionTitle = "AI Mock Interview Calibration",
    calibrationText,
    userRole,
    resumes: propResumes,
    activeResumeId,
}: JobDescModalProps) {
    // 1. Resumes State (from props or localStorage)
    const [resumesList, setResumesList] = useState<StoredResumeOption[]>(() => {
        if (propResumes && propResumes.length > 0) return propResumes;
        if (typeof window !== "undefined") {
            try {
                const userRaw = localStorage.getItem("useladder_user");
                if (userRaw) {
                    const u = JSON.parse(userRaw);
                    if (Array.isArray(u.resumes) && u.resumes.length > 0) {
                        return u.resumes;
                    }
                    if (u.resume) return [u.resume];
                }
                const allFbRaw = localStorage.getItem("useladder_all_resume_feedbacks");
                if (allFbRaw) {
                    const arr = JSON.parse(allFbRaw);
                    if (Array.isArray(arr) && arr.length > 0) {
                        return arr.map((item: any) => ({
                            id: item.id,
                            name: item.resumeName || "Resume",
                            rawText: item.resumeText,
                            score: item.score,
                        }));
                    }
                }
            } catch {}
        }
        return [];
    });

    // 2. Role State
    const [roleToUse] = useState<string>(() => {
        if (userRole) return userRole;
        if (typeof window !== "undefined") {
            try {
                const userRaw = localStorage.getItem("useladder_user");
                if (userRaw) {
                    const u = JSON.parse(userRaw);
                    if (u.role) return u.role;
                }
            } catch {}
        }
        return "Software Engineer";
    });

    // 3. Selected Resume
    const [selectedResumeId, setSelectedResumeId] = useState<string>(() => {
        if (activeResumeId) return activeResumeId;
        return resumesList[0]?.id || "default";
    });

    useEffect(() => {
        if (propResumes && propResumes.length > 0) {
            setResumesList(propResumes);
            if (!activeResumeId && propResumes[0]) {
                setSelectedResumeId(propResumes[0].id);
            }
        }
    }, [propResumes, activeResumeId]);

    const activeResume = useMemo(() => {
        return resumesList.find((r) => r.id === selectedResumeId) || resumesList[0] || null;
    }, [resumesList, selectedResumeId]);

    // 4. Derive canonical key job responsibilities
    const responsibilities = useMemo<string[]>(() => {
        return deriveJobResponsibilities(job);
    }, [job]);

    const activeResumeText = useMemo(() => resolveResumeText(activeResume), [activeResume]);
    const activeResumeName = useMemo(() => activeResume?.name || "Selected resume", [activeResume]);

    const cacheKey = useMemo(() => {
        if (!activeResumeText || activeResumeText.length < 30 || !responsibilities.length) return "";
        return getJobMatchCacheKey(activeResumeText, job.title || roleToUse, job.company || "Target Company", responsibilities);
    }, [activeResumeText, job.title, job.company, responsibilities, roleToUse]);

    // Initialize with cached match if available to avoid flicker and ensure 100% consistency
    const [matchData, setMatchData] = useState<any | null>(() => {
        if (!cacheKey) return null;
        return getCachedJobMatch(cacheKey);
    });
    const [matchLoading, setMatchLoading] = useState(false);
    const [matchError, setMatchError] = useState<string | null>(null);
    const [showMatchDetails, setShowMatchDetails] = useState(false);

    useEffect(() => {
        setShowMatchDetails(false);
    }, [selectedResumeId]);

    useEffect(() => {
        if (!activeResumeText || activeResumeText.length < 30 || !responsibilities.length || !cacheKey) {
            setMatchData(null);
            setMatchError(null);
            return;
        }

        // 1. Instant Cache Hit Check
        const cached = getCachedJobMatch(cacheKey);
        if (cached) {
            setMatchData(cached);
            setMatchLoading(false);
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
                        resumeName: activeResumeName,
                        jobTitle: job.title || roleToUse,
                        jobCompany: job.company || "Target Company",
                        jobResponsibilities: responsibilities,
                        jobDescription: job.description || responsibilities.join("\n"),
                        requiredExperience: "",
                        userRole: roleToUse || "",
                        candidateRole: roleToUse || "",
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Match failed");
                if (!cancelled && data.result) {
                    setCachedJobMatch(cacheKey, data.result);
                    setMatchData(data.result);
                }
            } catch (e: any) {
                if (!cancelled) {
                    try {
                        const fallback = matchResumeToJob(
                            activeResumeText,
                            {
                                title: job.title,
                                company: job.company,
                                description: job.description,
                                responsibilities,
                                roleFamily: job.roleFamily,
                            },
                            roleToUse
                        );
                        setCachedJobMatch(cacheKey, fallback);
                        setMatchData(fallback);
                    } catch {
                        setMatchError(e.message || "Failed to compute match");
                    }
                }
            } finally {
                if (!cancelled) setMatchLoading(false);
            }
        }, 120);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [cacheKey, responsibilities, activeResumeText, activeResumeName, job.title, job.company, job.description, job.roleFamily, roleToUse]);

    return (
        <div className={styles.jobModalBackdrop} onClick={onClose}>
            <div className={styles.jobModalBox} onClick={(e) => e.stopPropagation()}>
                {/* ── Modal Header ── */}
                <div className={styles.jobModalHeader}>
                    <div className={styles.jobModalTitleGroup}>
                        <CompanyLogo company={job.company} url={job.url} logoUrl={job.companyLogo} />
                        <div>
                            <h3 className={styles.jobModalTitle}>{cleanJobTitle(job.title)}</h3>
                            <div className={styles.jobModalSub}>{job.company} · {job.employmentType || "Full-time"}</div>
                        </div>
                    </div>
                    <button
                        type="button"
                        className={styles.jobModalCloseBtn}
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <X size={16} weight="regular" />
                    </button>
                </div>

                <div className={styles.jobModalBody}>
                    {/* ── Meta Grid ── */}
                    <div className={styles.jobModalMetaGrid}>
                        <div className={styles.jobModalMetaItem}>
                            <span className={styles.jobModalMetaLabel}>Location</span>
                            <span className={styles.jobModalMetaVal}>{job.location}</span>
                        </div>
                        <div className={styles.jobModalMetaItem}>
                            <span className={styles.jobModalMetaLabel}>Compensation</span>
                            <span className={styles.jobModalMetaVal}>{job.salaryRange || "Competitive / Market Standard"}</span>
                        </div>
                        <div className={styles.jobModalMetaItem}>
                            <span className={styles.jobModalMetaLabel}>Employment Type</span>
                            <span className={styles.jobModalMetaVal}>{job.employmentType || "Full-time"}</span>
                        </div>
                    </div>

                    {/* ── Role Overview & Key Responsibilities (Job Description) ── */}
                    <div>
                        <h4 className={styles.jobModalSectionTitle}>Role Overview & Key Responsibilities</h4>
                        <p className={styles.jobModalText}>
                            {job.description && !job.description.startsWith("Portfolio company of")
                                ? job.description
                                : generateRoleOverview(job.title, job.roleFamily, job.company, job.location)}
                        </p>
                    </div>

                    {/* ── ITEM: RESUME ↔ ROLE MATCH (Matches Configure Interview Session modal design with softened weights) ── */}
                    {Boolean(responsibilities.length > 0) && (
                        <div className={styles.timelineSectionWrap} style={{ margin: "0.5rem 0", fontFamily: "'Inter', sans-serif" }}>
                            <div className={styles.timelineItemsList}>
                                <div className={styles.timelineConnectorLine} />
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
                                            <div className={styles.greetingBadge} style={{ fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>
                                                How your selected resume matches this role
                                            </div>
                                        </div>
                                    </div>
                                    <div className={styles.resumeInnerFormCard} style={{ padding: "0.85rem 1rem", fontFamily: "'Inter', sans-serif" }}>
                                        {!activeResumeText || activeResumeText.length < 30 ? (
                                            <div style={{ fontSize: "0.78rem", color: "#64748B", display: "flex", alignItems: "center", gap: 6 }}>
                                                <Warning size={14} /> Select a resume with readable text to see match.
                                            </div>
                                        ) : matchLoading ? (
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: "#475569" }}>
                                                <SpinnerGap size={16} style={{ animation: "spin 1s linear infinite" }} /> Analyzing your experience against {responsibilities.length} responsibilities…
                                            </div>
                                        ) : matchError ? (
                                            <div style={{ fontSize: "0.76rem", color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", padding: "0.55rem 0.7rem", borderRadius: 7 }}>
                                                {matchError}
                                            </div>
                                        ) : matchData ? (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                {/* Compact overall header – always visible */}
                                                <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                                                    <div style={{
                                                        flex: "0 0 78px",
                                                        background: matchData.overallMatch >= 75 ? "#F0FDF4" : matchData.overallMatch >= 50 ? "#FFFBEB" : "#FEF2F2",
                                                        border: `1px solid ${matchData.overallMatch >= 75 ? "#DCFCE7" : matchData.overallMatch >= 50 ? "#FDE68A" : "#FECACA"}`,
                                                        borderRadius: 10,
                                                        padding: "0.55rem 0.4rem",
                                                        textAlign: "center",
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        justifyContent: "center"
                                                    }}>
                                                        <div className={styles.tabularNums} style={{
                                                            fontSize: "1.25rem",
                                                            fontWeight: 500,
                                                            fontFamily: "'Inter', sans-serif",
                                                            color: matchData.overallMatch >= 75 ? "#15803D" : matchData.overallMatch >= 50 ? "#B45309" : "#B91C1C",
                                                            lineHeight: 1
                                                        }}>
                                                            {matchData.overallMatch}%
                                                        </div>
                                                        <div style={{ fontSize: "0.6rem", fontWeight: 500, fontFamily: "'Inter', sans-serif", letterSpacing: "0.04em", textTransform: "uppercase", color: "#475569", marginTop: 3 }}>
                                                            Overall
                                                        </div>
                                                    </div>
                                                    <div style={{ flex: 1, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "0.7rem 0.95rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                                            <FileText size={18} weight="regular" color="#4782F6" style={{ flexShrink: 0 }} />
                                                            <div style={{ minWidth: 0 }}>
                                                                <div style={{ fontSize: "0.62rem", fontWeight: 500, fontFamily: "'Inter', sans-serif", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em" }}>Selected Resume</div>
                                                                <div style={{ fontSize: "0.82rem", fontWeight: 500, fontFamily: "'Inter', sans-serif", color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                                    {activeResumeName || "Selected resume"}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => setShowMatchDetails((v) => !v)}
                                                    style={{
                                                        alignSelf: "flex-start",
                                                        background: "#FFFFFF",
                                                        border: "1px solid #D1D5DB",
                                                        color: "#000000",
                                                        fontSize: "0.74rem",
                                                        fontWeight: 500,
                                                        fontFamily: "'Inter', sans-serif",
                                                        padding: "0.38rem 0.8rem",
                                                        borderRadius: 9999,
                                                        cursor: "pointer",
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: 5,
                                                    }}
                                                >
                                                    <span style={{ color: "#000000" }}>{showMatchDetails ? "Hide details" : "View feedback"}</span>
                                                    <span style={{ fontSize: "0.65rem", transform: showMatchDetails ? "rotate(180deg)" : "none", display: "inline-block", transition: "transform 0.15s", color: "#000000" }}>▾</span>
                                                </button>

                                                {showMatchDetails && (
                                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", maxHeight: 440, overflowY: "auto", paddingRight: 4, scrollbarWidth: "thin" }}>
                                                        {/* ── Card explaining why you are a fit ── */}
                                                        {matchData.summary && (
                                                            <div style={{
                                                                background: "#F8FAFC",
                                                                border: "1px solid #E2E8F0",
                                                                borderRadius: 10,
                                                                padding: "0.95rem 1.15rem",
                                                            }}>
                                                                <p style={{
                                                                    margin: 0,
                                                                    fontSize: "0.79rem",
                                                                    lineHeight: 1.6,
                                                                    color: "#1E293B",
                                                                    fontWeight: 400,
                                                                    fontFamily: "'Inter', sans-serif",
                                                                }}>
                                                                    {matchData.summary}
                                                                </p>
                                                            </div>
                                                        )}

                                                        {/* ── List of your experience that makes it a match ── */}
                                                        <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                                                            <div style={{
                                                                fontSize: "0.72rem",
                                                                fontWeight: 500,
                                                                fontFamily: "'Inter', sans-serif",
                                                                textTransform: "uppercase",
                                                                letterSpacing: "0.04em",
                                                                color: "#475569",
                                                                marginTop: "0.25rem",
                                                            }}>
                                                                Your Experience &amp; Role Requirements
                                                            </div>
                                                            {matchData.responsibilityMatches?.map((r: any, idx: number) => {
                                                                return (
                                                                    <div
                                                                        key={idx}
                                                                        style={{
                                                                            background: "#FFFFFF",
                                                                            border: "1px solid #E2E8F0",
                                                                            borderRadius: 10,
                                                                            padding: "0.95rem 1.15rem",
                                                                            display: "flex",
                                                                            flexDirection: "column",
                                                                            gap: "0.55rem",
                                                                            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                                                                        }}
                                                                    >
                                                                        <div style={{ fontSize: "0.82rem", fontWeight: 500, fontFamily: "'Inter', sans-serif", color: "#0F172A", lineHeight: 1.4 }}>
                                                                            {idx + 1}. {r.responsibility}
                                                                        </div>
                                                                        <div style={{
                                                                            fontSize: "0.76rem",
                                                                            color: "#475569",
                                                                            lineHeight: 1.55,
                                                                            background: "#F8FAFC",
                                                                            padding: "0.65rem 0.85rem",
                                                                            borderRadius: 8,
                                                                            border: "1px solid #F1F5F9",
                                                                            fontFamily: "'Inter', sans-serif",
                                                                        }}>
                                                                            <span style={{ fontWeight: 500, color: "#1E293B", fontFamily: "'Inter', sans-serif" }}>Evidence from resume: </span>
                                                                            {r.evidence || r.gap || "Demonstrated in candidate experience."}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>

                                                        {/* Strengths / gaps */}
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "0.25rem" }}>
                                                            <div style={{ background: "#F0FDF4", border: "1px solid #DCFCE7", borderRadius: 10, padding: "0.85rem 1rem" }}>
                                                                <div style={{ fontSize: "0.7rem", fontWeight: 500, fontFamily: "'Inter', sans-serif", color: "#15803D", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Strengths</div>
                                                                <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: "0.74rem", color: "#166534", lineHeight: 1.55 }}>
                                                                    {matchData.strengthsForRole?.map((s: string, i: number) => (
                                                                        <li key={i} style={{ marginBottom: "0.25rem" }}>{s}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "0.85rem 1rem" }}>
                                                                <div style={{ fontSize: "0.7rem", fontWeight: 500, fontFamily: "'Inter', sans-serif", color: "#B45309", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Gaps to Address</div>
                                                                <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: "0.74rem", color: "#92400E", lineHeight: 1.55 }}>
                                                                    {matchData.gapsForRole?.map((g: string, i: number) => (
                                                                        <li key={i} style={{ marginBottom: "0.25rem" }}>{g}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        </div>
                                                        {matchData.interviewFocusAreas?.length > 0 && (
                                                            <div style={{ background: "#EFF6FF", border: "1px solid #DBEAFE", borderRadius: 10, padding: "0.85rem 1rem" }}>
                                                                <div style={{ fontSize: "0.7rem", fontWeight: 500, fontFamily: "'Inter', sans-serif", color: "#1D4ED8", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Interview Focus</div>
                                                                <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: "0.74rem", color: "#1E40AF", lineHeight: 1.55 }}>
                                                                    {matchData.interviewFocusAreas.map((f: string, i: number) => (
                                                                        <li key={i} style={{ marginBottom: "0.25rem" }}>{f}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: "0.76rem", color: "#64748B" }}>Select a resume to compute match.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Modal Footer with Apply to Job Button ── */}
                <div className={styles.jobModalFooter}>
                    {job.url && job.url !== "#" && (
                        <a
                            href={job.url}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.jobModalApplyBtn}
                            title={`Apply to ${job.title} at ${job.company}`}
                        >
                            Apply to Job <ArrowSquareOut size={14} weight="regular" />
                        </a>
                    )}
                    <button
                        type="button"
                        className={styles.roleSimulateBtn}
                        style={{ padding: "8px 16px", fontSize: "13px" }}
                        onClick={onPractice}
                    >
                        <Play size={13} weight="fill" /> Practice
                    </button>
                </div>
            </div>
        </div>
    );
}

export const JobDescModal = React.memo(JobDescModalComponent);

