"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
    X,
    UploadSimple,
    FileText,
    Check,
    ArrowsClockwise,
    MagnifyingGlass,
    WarningCircle,
    CheckCircle,
    Globe,
    ArrowSquareOut,
    Sparkle,
    User,
} from "@phosphor-icons/react";
import styles from "../dashboard.module.css";
import { COACH_AVATAR, RECRUITER_AVATAR } from "./constants";
import type { ResumeScanResult } from "@/app/api/resume/scan/route";
import { CareerNarrativeStudio } from "./CareerNarrativeStudio";

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentRole?: string;
    currentDomain?: string;
    userEmail?: string;
    onRoleChange: (newRole: string, newDomain: string) => void;
}

interface RoleOption {
    role: string;
    domain: string;
}

const FALLBACK_ROLES: RoleOption[] = [
    { role: "Product Manager", domain: "Product & Design" },
    { role: "Product Designer", domain: "Product & Design" },
    { role: "Product Marketer", domain: "Product & Design" },
    { role: "Software Engineer", domain: "Software & Engineering" },
    { role: "Frontend Developer", domain: "Software & Engineering" },
    { role: "Backend Engineer", domain: "Software & Engineering" },
    { role: "Full Stack Developer", domain: "Software & Engineering" },
    { role: "DevOps / SRE", domain: "Software & Engineering" },
    { role: "Cloud Solutions Architect", domain: "Software & Engineering" },
    { role: "Data Scientist", domain: "Data & Analytics" },
    { role: "Data Analyst", domain: "Data & Analytics" },
    { role: "Business Analyst", domain: "Business & Operations" },
    { role: "Banking & Finance", domain: "Banking & Finance" },
    { role: "Investment Banker", domain: "Banking & Finance" },
    { role: "Financial Analyst", domain: "Banking & Finance" },
    { role: "Sales & Business Development", domain: "Sales & Commercial" },
    { role: "Account Executive", domain: "Sales & Commercial" },
    { role: "Customer Service Representative", domain: "Customer Service & Support" },
    { role: "Virtual Assistant", domain: "Administrative & Support" },
    { role: "Executive Assistant", domain: "Administrative & Support" },
    { role: "Engineering — Oil & Gas", domain: "Engineering & Energy" },
    { role: "HSE / Safety Officer", domain: "Engineering & Energy" },
];

export function SettingsModal({
    isOpen,
    onClose,
    currentRole = "Software Engineer",
    currentDomain = "Software & Engineering",
    userEmail,
    onRoleChange,
}: SettingsModalProps) {
    // Role state
    const [selectedRole, setSelectedRole] = useState(currentRole);
    const [selectedDomain, setSelectedDomain] = useState(currentDomain);
    const [roleQuery, setRoleQuery] = useState(currentRole);
    const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
    const [roleSavedSuccess, setRoleSavedSuccess] = useState(false);
    const [fetchedRoles, setFetchedRoles] = useState<RoleOption[]>([]);

    // CV Upload Status state
    const [hasCvUploaded, setHasCvUploaded] = useState<boolean>(false);
    const [uploadedCvName, setUploadedCvName] = useState<string>("");
    const [isUploadingNewCv, setIsUploadingNewCv] = useState<boolean>(false);

    // Resume Scan / Submission state
    const [resumeName, setResumeName] = useState<string>("");
    const [resumeText, setResumeText] = useState<string>("");
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<ResumeScanResult | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);

    // Portfolio link & Navigation tab state
    const [portfolioUrl, setPortfolioUrl] = useState<string>("");
    const [activeTab, setActiveTab] = useState<"credentials" | "narrative">("credentials");

    const fileInputRef = useRef<HTMLInputElement>(null);
    const roleDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setSelectedRole(currentRole);
        setSelectedDomain(currentDomain);
        setRoleQuery(currentRole);
    }, [currentRole, currentDomain]);

    // Check CV upload status and portfolio from local storage and backend
    useEffect(() => {
        if (!isOpen) return;

        let foundCv = "";
        const raw = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed.portfolioUrl) {
                    setPortfolioUrl(parsed.portfolioUrl);
                }
                if (parsed.resumes && Array.isArray(parsed.resumes) && parsed.resumes.length > 0) {
                    foundCv = parsed.resumes[0].name || "Uploaded_Resume.pdf";
                    if (parsed.resumes[0].rawText || parsed.resumes[0].data) {
                        setResumeText(parsed.resumes[0].rawText || parsed.resumes[0].data);
                    }
                } else if (parsed.resume) {
                    foundCv = typeof parsed.resume === "string" ? "Uploaded_Resume.pdf" : (parsed.resume.name || "Uploaded_Resume.pdf");
                    if (parsed.resume.rawText || parsed.resume.data) {
                        setResumeText(parsed.resume.rawText || parsed.resume.data);
                    }
                }
            } catch (e) {
                console.error("Error reading useladder_user resumes:", e);
            }
        }

        if (foundCv) {
            setHasCvUploaded(true);
            setUploadedCvName(foundCv);
            setResumeName(foundCv);
            setIsUploadingNewCv(false);
        } else if (userEmail) {
            fetch(`/api/auth/user?email=${encodeURIComponent(userEmail)}`)
                .then((r) => r.json())
                .then((data) => {
                    if (data.user?.portfolioUrl) {
                        setPortfolioUrl(data.user.portfolioUrl);
                    }
                    if (data.user?.resumes && Array.isArray(data.user.resumes) && data.user.resumes.length > 0) {
                        const r = data.user.resumes[0];
                        const name = r.name || "Uploaded_Resume.pdf";
                        setHasCvUploaded(true);
                        setUploadedCvName(name);
                        setResumeName(name);
                        if (r.rawText) {
                            setResumeText(r.rawText);
                        }
                        setIsUploadingNewCv(false);
                    } else {
                        setHasCvUploaded(false);
                        setIsUploadingNewCv(true);
                    }
                })
                .catch(() => {
                    setHasCvUploaded(false);
                    setIsUploadingNewCv(true);
                });
        } else {
            setHasCvUploaded(false);
            setIsUploadingNewCv(true);
        }
    }, [isOpen, userEmail]);

    // Fetch roles dynamically from backend API route (/api/roles) like onboarding
    useEffect(() => {
        fetch("/api/roles")
            .then((res) => res.json())
            .then((data) => {
                if (data.roles && Array.isArray(data.roles)) {
                    const formatted = data.roles.map((r: { title: string; domain: string }) => ({
                        role: r.title,
                        domain: r.domain,
                    }));
                    setFetchedRoles(formatted);
                } else {
                    setFetchedRoles(FALLBACK_ROLES);
                }
            })
            .catch(() => {
                setFetchedRoles(FALLBACK_ROLES);
            });
    }, []);

    // Close dropdowns on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
                setIsRoleDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const activeRolesList = useMemo(() => {
        return fetchedRoles.length > 0 ? fetchedRoles : FALLBACK_ROLES;
    }, [fetchedRoles]);

    const visibleRoles = useMemo(() => {
        const q = roleQuery.trim().toLowerCase();
        if (!q) return activeRolesList;
        return activeRolesList.filter(
            (r) => r.role.toLowerCase().includes(q) || r.domain.toLowerCase().includes(q)
        );
    }, [activeRolesList, roleQuery]);

    if (!isOpen) return null;

    const handleSelectRole = async (role: string, domain: string) => {
        setSelectedRole(role);
        setSelectedDomain(domain);
        setRoleQuery(role);
        onRoleChange(role, domain);
        setRoleSavedSuccess(true);
        setTimeout(() => setRoleSavedSuccess(false), 2500);

        // Sync with MongoDB backend
        if (userEmail) {
            try {
                await fetch("/api/auth/user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: userEmail,
                        role,
                        domain,
                    }),
                });
            } catch (err) {
                console.error("Failed to sync role with backend:", err);
            }
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setResumeName(file.name);
        setScanError(null);
        setScanResult(null);

        const reader = new FileReader();
        reader.onload = () => {
            const content = typeof reader.result === "string" ? reader.result : "";
            if (content.startsWith("data:")) {
                try {
                    const base64 = content.split(",")[1];
                    const decoded = atob(base64);
                    const cleaned = decoded.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{2,}/g, " ");
                    setResumeText(cleaned.trim() || `Resume document: ${file.name}`);
                } catch {
                    setResumeText(`Resume document: ${file.name}`);
                }
            } else {
                setResumeText(content.trim() || `Resume document: ${file.name}`);
            }
        };
        reader.readAsText(file);
    };

    const handleRunScan = async () => {
        if (!resumeName && !resumeText.trim()) {
            setScanError("Please select a resume file to upload.");
            return;
        }

        setIsScanning(true);
        setScanError(null);

        const textPayload = resumeText.trim() || `Resume profile uploaded: ${resumeName}. Experience aligned with ${selectedRole}.`;
        const finalResumeName = resumeName || "Uploaded_Resume.pdf";

        try {
            const res = await fetch("/api/resume/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resumeText: textPayload,
                    resumeName: finalResumeName,
                    role: selectedRole,
                    domain: selectedDomain,
                    email: userEmail,
                }),
            });

            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || "Failed to submit resume");
            }

            setScanResult(data.result);
            setHasCvUploaded(true);
            setUploadedCvName(finalResumeName);
            setIsUploadingNewCv(false);

            // Sync with local storage
            const raw = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    const newResumeItem = {
                        id: `cv_${Date.now()}`,
                        name: finalResumeName,
                        data: textPayload,
                        score: data.result?.score || 80,
                        updatedAt: new Date().toISOString(),
                    };
                    const existing = parsed.resumes || [];
                    parsed.resumes = [newResumeItem, ...existing.filter((r: { name: string }) => r.name !== finalResumeName)];
                    parsed.resume = newResumeItem;
                    localStorage.setItem("useladder_user", JSON.stringify(parsed));
                } catch (e) {
                    console.error("Failed to save resume in localStorage:", e);
                }
            }

            // Sync with MongoDB
            if (userEmail) {
                fetch("/api/auth/user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: userEmail,
                        resume: {
                            id: `cv_${Date.now()}`,
                            name: finalResumeName,
                            rawText: textPayload,
                            score: data.result?.score || 80,
                        },
                    }),
                }).catch((err) => console.warn("Could not sync resume to DB:", err));
            }
        } catch (err) {
            setScanError(err instanceof Error ? err.message : "Error submitting resume");
        } finally {
            setIsScanning(false);
        }
    };

    const handleSaveAll = async () => {
        onRoleChange(selectedRole, selectedDomain);
        setRoleSavedSuccess(true);

        // Sync role and portfolio to MongoDB
        if (userEmail) {
            try {
                await fetch("/api/auth/user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: userEmail,
                        role: selectedRole,
                        domain: selectedDomain,
                        portfolioUrl,
                    }),
                });
            } catch (err) {
                console.error("Failed to save credentials:", err);
            }
        }

        // Update localStorage useladder_user
        const raw = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                parsed.role = selectedRole;
                parsed.domain = selectedDomain;
                parsed.portfolioUrl = portfolioUrl;
                localStorage.setItem("useladder_user", JSON.stringify(parsed));
            } catch (e) {
                console.error(e);
            }
        }

        setTimeout(() => {
            setRoleSavedSuccess(false);
            onClose();
        }, 600);
    };

    // Only show upload CV section if no CV is uploaded, OR if user clicked "Upload new CV"
    const shouldShowUploadSection = !hasCvUploaded || isUploadingNewCv;

    return (
        <div className={styles.settingsModalOverlay} onClick={onClose}>
            <div className={styles.settingsModalContent} onClick={(e) => e.stopPropagation()}>
                {/* ── Top Header ── */}
                <div className={styles.settingsModalHeader}>
                    <div>
                        <h2 className={styles.settingsModalTitle}>Update Credentials</h2>
                    </div>
                    <button className={styles.settingsCloseBtn} onClick={onClose} aria-label="Close settings">
                        <X size={18} weight="bold" />
                    </button>
                </div>

                {/* ── Sub Navigation Tabs: Profile & CV vs Career Narrative Studio ── */}
                <div className={styles.settingsSubNav}>
                    <button
                        type="button"
                        className={`${styles.settingsSubNavTab} ${activeTab === "credentials" ? styles.settingsSubNavTabActive : ""}`}
                        onClick={() => setActiveTab("credentials")}
                    >
                        <User size={15} weight={activeTab === "credentials" ? "fill" : "regular"} />
                        Profile & CV
                    </button>
                    <button
                        type="button"
                        className={`${styles.settingsSubNavTab} ${activeTab === "narrative" ? styles.settingsSubNavTabActive : ""}`}
                        onClick={() => setActiveTab("narrative")}
                    >
                        <Sparkle size={15} weight={activeTab === "narrative" ? "fill" : "regular"} color={activeTab === "narrative" ? "#2563EB" : undefined} />
                        Career Narrative Studio
                    </button>
                </div>

                {activeTab === "narrative" ? (
                    <CareerNarrativeStudio
                        currentRole={selectedRole}
                        targetRole={selectedRole}
                        resumeText={resumeText}
                        resumeName={uploadedCvName || resumeName}
                        userEmail={userEmail}
                    />
                ) : (
                    <>
                        {/* ── Section at Top: CV Upload Status & Action Button ── */}
                        <div className={`${styles.cvTopStatusCard} ${hasCvUploaded ? styles.cvTopStatusCardUploaded : ""}`}>
                    <div className={styles.cvTopStatusInfo}>
                        <div className={styles.cvTopStatusIconWrap}>
                            {hasCvUploaded ? (
                                <FileText size={20} color="#2563EB" weight="bold" />
                            ) : (
                                <WarningCircle size={20} color="#64748B" weight="bold" />
                            )}
                        </div>
                        <div className={styles.cvTopStatusTextGroup}>
                            <div className={styles.cvTopStatusTitleRow}>
                                <span className={styles.cvTopStatusTitle}>CV Status:</span>
                                {hasCvUploaded ? (
                                    <span className={styles.cvTopStatusBadgeSuccess}>
                                        <Check size={11} weight="bold" />
                                        Uploaded
                                    </span>
                                ) : (
                                    <span className={styles.cvTopStatusBadgePending}>
                                        No CV Uploaded
                                    </span>
                                )}
                            </div>
                            <span className={styles.cvTopStatusSub}>
                                {hasCvUploaded
                                    ? (uploadedCvName ? `Active file: ${uploadedCvName}` : "Resume file stored on profile")
                                    : "upload your resume to get precise opportunities"}
                            </span>
                        </div>
                    </div>

                    {hasCvUploaded && (
                        <button
                            type="button"
                            className={isUploadingNewCv ? styles.cvUploadCancelBtn : styles.cvUploadNewBtn}
                            onClick={() => {
                                setIsUploadingNewCv((prev) => !prev);
                                setScanError(null);
                            }}
                        >
                            {isUploadingNewCv ? (
                                <>Cancel</>
                            ) : (
                                <>
                                    <UploadSimple size={15} weight="bold" />
                                    Upload new CV
                                </>
                            )}
                        </button>
                    )}
                </div>

                {/* ── Timeline Body ── */}
                <div className={styles.settingsTimelineBody}>
                    <div className={styles.timelineSectionWrap}>
                        <div className={styles.timelineItemsList}>
                            <div className={styles.timelineConnectorLine} />

                            {/* ── ITEM 1: UPLOAD YOUR RESUME (Shown if no CV or when user clicks 'Upload new CV') ── */}
                            {shouldShowUploadSection && (
                                <div className={styles.timelineItem}>
                                    {/* AI Coach Character Avatar Node */}
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
                                        {/* Upload your resume in conversation bubble (matching dashboard blue) */}
                                        <div className={styles.greetingChipRow}>
                                            <div className={styles.greetingBadge}>
                                                Upload your resume
                                            </div>
                                        </div>
                                    </div>

                                    {/* Resume Form Card with Onboarding-style inputs */}
                                    <div className={styles.resumeInnerFormCard}>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileUpload}
                                            accept=".pdf,.doc,.docx,.txt,.md"
                                            style={{ display: "none" }}
                                        />
                                        <div
                                            className={styles.resumeDropzoneArea}
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <UploadSimple size={24} color="#2563EB" />
                                            <span className={styles.resumeDropzoneTitle}>
                                                {resumeName ? `Selected: ${resumeName}` : "Click to upload Resume (PDF, DOCX, TXT, MD)"}
                                            </span>
                                            <span className={styles.resumeDropzoneSubtitle}>
                                                Interview coach analyzes your achievements against industry expectations
                                            </span>
                                        </div>

                                        {scanError && (
                                            <div className={styles.errorBanner}>
                                                <WarningCircle size={16} weight="bold" />
                                                {scanError}
                                            </div>
                                        )}

                                        <div className={styles.resumeActionRow}>
                                            <button
                                                type="button"
                                                className={styles.resumeScanPrimaryBtn}
                                                onClick={handleRunScan}
                                                disabled={isScanning || (!resumeName && !resumeText.trim())}
                                            >
                                                {isScanning ? (
                                                    <>
                                                        <ArrowsClockwise size={15} className="animate-spin" />
                                                        Submitting...
                                                    </>
                                                ) : (
                                                    "Submit"
                                                )}
                                            </button>
                                        </div>

                                        {/* Scan Result Breakdown */}
                                        {scanResult && (
                                            <div className={styles.scanSuggestionsTable}>
                                                {scanResult.suggestions?.map((s, idx) => (
                                                    <div key={idx} className={styles.scanSuggestionRow}>
                                                        <div className={styles.scanSuggestionHeader}>
                                                            <span className={styles.rowTagInformation}>{s.category}</span>
                                                            <span style={{ fontSize: "0.74rem", color: "#64748B" }}>
                                                                Rubric Enhancement
                                                            </span>
                                                        </div>
                                                        <p className={styles.scanFeedbackText}>{s.feedback}</p>
                                                        <div className={styles.scanRecBox}>
                                                            <strong>Coach Recommendation:</strong> {s.recommendation}
                                                        </div>
                                                    </div>
                                                ))}

                                                {scanResult.missingKeywords?.length > 0 && (
                                                    <div style={{ padding: "0.85rem 1rem", background: "#F8FAFC" }}>
                                                        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#334155" }}>
                                                            Missing High-Value Keywords for {selectedRole}:
                                                        </span>
                                                        <div className={styles.keywordsPillList}>
                                                            {scanResult.missingKeywords.map((kw, i) => (
                                                                <span key={i} className={styles.keywordPillItem}>
                                                                    + {kw}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── ITEM 2: RECRUITER SAYING IN TEXTBOX "TRY OUT A NEW ROLE" + DROPDOWN ── */}
                            <div className={styles.timelineItem}>
                                {/* Recruiter Character Avatar Node */}
                                <div className={styles.timelineAvatarCircle} title="Recruiter Character">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={RECRUITER_AVATAR}
                                        alt="Recruiter"
                                        className={styles.timelineAvatarImg}
                                        draggable={false}
                                    />
                                </div>

                                <div className={styles.timelineItemTopRow}>
                                    {/* Recruiter saying in a textbox like onboarding (matching dashboard blue) */}
                                    <div className={styles.greetingChipRow}>
                                        <div className={styles.greetingBadge}>
                                            Try out a new role
                                        </div>
                                    </div>

                                    <div className={styles.currentRoleLabel}>
                                        Current role : {selectedRole}
                                    </div>
                                </div>

                                {/* Role Dropdown like Onboarding Flow */}
                                <div className={styles.resumeInnerFormCard}>
                                    <div className={styles.roleDropdownWrapper} ref={roleDropdownRef}>
                                        <div className={styles.roleSearchBoxWrap}>
                                            <input
                                                type="text"
                                                className={styles.roleSearchBoxInput}
                                                placeholder="Search or choose a new role..."
                                                value={roleQuery}
                                                onChange={(e) => {
                                                    setRoleQuery(e.target.value);
                                                    setIsRoleDropdownOpen(true);
                                                }}
                                                onFocus={() => setIsRoleDropdownOpen(true)}
                                            />
                                            <MagnifyingGlass size={18} className={styles.roleSearchBoxRightIcon} />
                                        </div>

                                        {/* Role Dropdown List (matching onboarding styling) */}
                                        {isRoleDropdownOpen && (
                                            <div className={styles.roleResultsList}>
                                                <div className={styles.resultsHeaderLabel}>
                                                    Available Roles ({visibleRoles.length})
                                                </div>
                                                {visibleRoles.map((r) => {
                                                    const isSelected = selectedRole === r.role;
                                                    return (
                                                        <button
                                                            key={r.role}
                                                            type="button"
                                                            className={`${styles.roleTintRow} ${isSelected ? styles.roleTintRowSelected : ""}`}
                                                            onClick={() => {
                                                                handleSelectRole(r.role, r.domain);
                                                                setIsRoleDropdownOpen(false);
                                                            }}
                                                        >
                                                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                                                <span style={{ fontWeight: 500 }}>{r.role}</span>
                                                                <span style={{ fontSize: "12px", opacity: isSelected ? 0.95 : 0.65 }}>
                                                                    {r.domain}
                                                                </span>
                                                            </div>
                                                            {isSelected && (
                                                                <span className={styles.selectedCheckCircle}>
                                                                    <Check size={12} strokeWidth={3} />
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                                {visibleRoles.length === 0 && (
                                                    <p style={{ padding: "12px", textAlign: "center", color: "#94A3B8", fontSize: "13px" }}>
                                                        No roles match &quot;{roleQuery}&quot;
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {roleSavedSuccess && (
                                            <div className={styles.activeRoleNotice}>
                                                <CheckCircle size={15} weight="fill" />
                                                Target role updated to {selectedRole}! All dashboard jobs & interviews aligned.
                                            </div>
                                        )}

                                        {/* ── Portfolio Link Field ── */}
                                        <div className={styles.portfolioFieldWrap}>
                                            <div className={styles.portfolioLabelRow}>
                                                <label className={styles.portfolioLabel}>
                                                    <Globe size={14} weight="bold" color="#2563EB" />
                                                    Portfolio / Personal Website
                                                </label>
                                                {portfolioUrl && (
                                                    <a
                                                        href={portfolioUrl.startsWith("http") ? portfolioUrl : `https://${portfolioUrl}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={styles.portfolioLinkOpenBtn}
                                                    >
                                                        <ArrowSquareOut size={12} weight="bold" />
                                                        Visit Link
                                                    </a>
                                                )}
                                            </div>
                                            <div className={styles.portfolioInputRow}>
                                                <input
                                                    type="url"
                                                    className={styles.portfolioInput}
                                                    placeholder="e.g. https://yourportfolio.com, github.com/username, or behance.net/profile"
                                                    value={portfolioUrl}
                                                    onChange={(e) => setPortfolioUrl(e.target.value)}
                                                />
                                            </div>
                                            <span className={styles.portfolioHelperText}>
                                                Showcase your real work, live apps, GitHub repositories, or design case studies.
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </>
                )}

                {/* ── Modal Footer with Save Button ── */}
                <div className={styles.settingsModalFooter}>
                    {roleSavedSuccess ? (
                        <div className={styles.saveSuccessMsg}>
                            <CheckCircle size={16} weight="fill" color="#16A34A" />
                            Saved successfully!
                        </div>
                    ) : (
                        <div />
                    )}
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
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
                            onClick={handleSaveAll}
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
