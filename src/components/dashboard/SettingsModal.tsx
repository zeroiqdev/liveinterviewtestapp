"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
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
    ArrowUpRight,
    Trash,
} from "@phosphor-icons/react";
import styles from "../dashboard.module.css";
import { COACH_AVATAR, RECRUITER_AVATAR } from "./constants";
import type { ResumeScanResult } from "@/app/api/resume/scan/route";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { normalizeUserRoleFamily } from "@/utils/locationDetector";

export interface StoredResumeItem {
    id: string;
    name: string;
    data?: string;
    rawText?: string;
    updatedAt?: string;
    source?: "uploaded";
    score?: number;
}

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
    { role: "UI Designer", domain: "Product & Design" },
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
    const router = useRouter();

    // Role state
    const [selectedRole, setSelectedRole] = useState(currentRole);
    const [selectedDomain, setSelectedDomain] = useState(currentDomain);
    const [roleQuery, setRoleQuery] = useState(currentRole);
    const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
    const [roleSavedSuccess, setRoleSavedSuccess] = useState(false);
    const [fetchedRoles, setFetchedRoles] = useState<RoleOption[]>([]);

    // Saved Resumes list state (consistent with InterviewSetupModal)
    const [savedResumes, setSavedResumes] = useState<StoredResumeItem[]>([]);
    const [selectedResumeId, setSelectedResumeId] = useState<string>("");
    const [isUploadingNew, setIsUploadingNew] = useState<boolean>(false);

    // Resume Scan / Submission state
    const [resumeName, setResumeName] = useState<string>("");
    const [resumeText, setResumeText] = useState<string>("");
    const [isScanning, setIsScanning] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);

    // Portfolio link state
    const [portfolioUrl, setPortfolioUrl] = useState<string>("");
    const [deletingResumeId, setDeletingResumeId] = useState<string | null>(null);
    const [resumeToDelete, setResumeToDelete] = useState<StoredResumeItem | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const roleDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setSelectedRole(currentRole);
        setSelectedDomain(currentDomain);
        setRoleQuery(currentRole);
    }, [currentRole, currentDomain]);

    // Check saved resumes and portfolio from local storage and backend
    useEffect(() => {
        if (!isOpen) return;

        let loadedList: StoredResumeItem[] = [];
        const raw = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed.portfolioUrl) {
                    setPortfolioUrl(parsed.portfolioUrl);
                }
                if (parsed.resumes && Array.isArray(parsed.resumes) && parsed.resumes.length > 0) {
                    loadedList = parsed.resumes.map((r: any, idx: number) => ({
                        id: r.id || `resume_${idx}`,
                        name: r.name || `Resume_${idx + 1}.pdf`,
                        data: r.data || "",
                        rawText: r.rawText || r.data || "",
                        updatedAt: r.updatedAt ? new Date(r.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
                        source: r.source || "uploaded",
                        score: r.score,
                    }));
                } else if (parsed.resume) {
                    loadedList = [
                        {
                            id: typeof parsed.resume === "object" && parsed.resume.id ? parsed.resume.id : "res_primary",
                            name: typeof parsed.resume === "object" && parsed.resume.name ? parsed.resume.name : "Active_Resume.pdf",
                            data: typeof parsed.resume === "object" ? parsed.resume.data || "" : "",
                            rawText: typeof parsed.resume === "object" ? parsed.resume.rawText || parsed.resume.data || "" : "",
                            updatedAt: typeof parsed.resume === "object" && parsed.resume.updatedAt ? new Date(parsed.resume.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
                            source: "uploaded",
                            score: typeof parsed.resume === "object" ? parsed.resume.score : undefined,
                        },
                    ];
                }

                setSavedResumes(loadedList);

                if (loadedList.length > 0) {
                    const targetId = parsed.selectedResumeId || loadedList[0].id;
                    const found = loadedList.find((r) => r.id === targetId) || loadedList[0];
                    setSelectedResumeId(found.id);
                    setResumeName(found.name);
                    setResumeText(found.rawText || found.data || "");
                    setIsUploadingNew(false);
                } else {
                    setIsUploadingNew(true);
                }
            } catch (e) {
                console.error("Error reading useladder_user resumes:", e);
                setIsUploadingNew(true);
            }
        }

        if (userEmail) {
            fetch(`/api/auth/user?email=${encodeURIComponent(userEmail)}`)
                .then((r) => r.json())
                .then((data) => {
                    if (data.user?.portfolioUrl) {
                        setPortfolioUrl(data.user.portfolioUrl);
                    }
                    if (data.user?.resumes && Array.isArray(data.user.resumes) && data.user.resumes.length > 0) {
                        const fetchedList: StoredResumeItem[] = data.user.resumes.map((r: any, idx: number) => ({
                            id: r.id || `resume_${idx}`,
                            name: r.name || `Resume_${idx + 1}.pdf`,
                            data: r.rawText || "",
                            rawText: r.rawText || "",
                            updatedAt: r.updatedAt ? new Date(r.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
                            source: "uploaded",
                            score: r.score,
                        }));
                        setSavedResumes(fetchedList);
                        if (fetchedList.length > 0) {
                            setSelectedResumeId(fetchedList[0].id);
                            setResumeName(fetchedList[0].name);
                            setResumeText(fetchedList[0].rawText || "");
                            setIsUploadingNew(false);
                        }
                    }
                })
                .catch(() => {});
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

    // Keep Saved Resumes in sync when resume is improved elsewhere (Resume Feedback → ATS score live)
    useEffect(() => {
        const syncFromStorage = () => {
            try {
                const raw = localStorage.getItem("useladder_user");
                if (!raw) return;
                const parsed = JSON.parse(raw);
                if (parsed.resumes && Array.isArray(parsed.resumes) && parsed.resumes.length > 0) {
                    const list: StoredResumeItem[] = parsed.resumes.map((r: any, idx: number) => ({
                        id: r.id || `resume_${idx}`,
                        name: r.name || `Resume_${idx + 1}.pdf`,
                        data: r.data || "",
                        rawText: r.rawText || r.data || "",
                        updatedAt: r.updatedAt ? new Date(r.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
                        source: r.source || "uploaded",
                        score: r.score,
                    }));
                    setSavedResumes(list);
                    // keep selected in sync if its score changed
                    const selId = parsed.selectedResumeId || selectedResumeId;
                    const sel = list.find((r) => r.id === selId);
                    if (sel) {
                        setSelectedResumeId(sel.id);
                        setResumeName(sel.name);
                        if (sel.rawText) setResumeText(sel.rawText);
                    }
                }
            } catch {}
        };
        window.addEventListener("useladder_resume_scanned", syncFromStorage);
        // also sync when modal opens (covers improve without close/reopen)
        if (isOpen) syncFromStorage();
        return () => window.removeEventListener("useladder_resume_scanned", syncFromStorage);
    }, [isOpen, selectedResumeId]);

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

    const handleSelectResume = async (item: StoredResumeItem) => {
        setSelectedResumeId(item.id);
        setResumeName(item.name);
        setScanError(null);

        let cleanText = item.rawText || "";
        if (!cleanText && item.data) {
            if (item.data.startsWith("data:") || item.name.endsWith(".pdf") || item.name.endsWith(".docx")) {
                try {
                    const parseRes = await fetch("/api/resume/parse", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            fileData: item.data,
                            resumeName: item.name,
                        }),
                    });
                    const parseData = await parseRes.json();
                    if (parseData.success && parseData.text) {
                        cleanText = parseData.text;
                        item.rawText = cleanText;
                    }
                } catch {}
            } else if (!item.data.startsWith("data:")) {
                cleanText = item.data;
            }
        }

        setResumeText(cleanText);
        setIsUploadingNew(false);

        const raw = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                parsed.selectedResumeId = item.id;
                parsed.resume = { ...item, rawText: cleanText || item.rawText };
                localStorage.setItem("useladder_user", JSON.stringify(parsed));
            } catch (e) {
                console.error("Error updating selected resume in storage:", e);
            }
        }

        // Immediately seed or update last resume feedback with real text
        if (cleanText) {
            try {
                const lastFbRaw = localStorage.getItem("useladder_last_resume_feedback");
                const lastFb = lastFbRaw ? JSON.parse(lastFbRaw) : {};
                lastFb.id = item.id;
                lastFb.resumeName = item.name;
                lastFb.resumeText = cleanText;
                lastFb.role = selectedRole;
                lastFb.domain = selectedDomain;
                localStorage.setItem("useladder_last_resume_feedback", JSON.stringify(lastFb));
                window.dispatchEvent(new Event("useladder_resume_scanned"));
            } catch {}
        }
    };

    const handleDeleteResume = (resumeId: string) => {
        const target = savedResumes.find((r) => r.id === resumeId);
        if (!target) return;
        setResumeToDelete(target);
    };

    const handleConfirmDelete = async () => {
        const resumeId = resumeToDelete?.id;
        const target = resumeToDelete;
        if (!resumeId || !target) return;

        setDeletingResumeId(resumeId);
        try {
            const updatedList = savedResumes.filter((r) => r.id !== resumeId);
            setSavedResumes(updatedList);

            // Update selection if deleted resume was selected
            if (selectedResumeId === resumeId) {
                if (updatedList.length > 0) {
                    const next = updatedList[0];
                    setSelectedResumeId(next.id);
                    setResumeName(next.name);
                    setResumeText(next.rawText || next.data || "");
                    setIsUploadingNew(false);
                } else {
                    setSelectedResumeId("");
                    setResumeName("");
                    setResumeText("");
                    setIsUploadingNew(true);
                }
            }

            // Sync localStorage: useladder_user
            try {
                const raw = localStorage.getItem("useladder_user");
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed.resumes)) {
                        parsed.resumes = (parsed.resumes as any[]).filter((r: any) => (r.id || r._id) !== resumeId);
                    }
                    if (parsed.selectedResumeId === resumeId) {
                        parsed.selectedResumeId = updatedList[0]?.id || "";
                    }
                    if (parsed.resume && (parsed.resume.id === resumeId || parsed.resume._id === resumeId)) {
                        parsed.resume = updatedList[0] || null;
                        if (!parsed.resume) delete parsed.resume;
                    }
                    // If no resumes left, clean up legacy keys
                    if (!parsed.resumes || parsed.resumes.length === 0) {
                        delete parsed.resumes;
                        delete parsed.selectedResumeId;
                        delete parsed.resume;
                    }
                    localStorage.setItem("useladder_user", JSON.stringify(parsed));
                }
            } catch (e) {
                console.error("Failed to update localStorage after delete:", e);
            }

            // Clean feedback caches tied to this resume
            try {
                const lastRaw = localStorage.getItem("useladder_last_resume_feedback");
                if (lastRaw) {
                    const last = JSON.parse(lastRaw);
                    if (last.id === resumeId || last.resumeName === target.name) {
                        localStorage.removeItem("useladder_last_resume_feedback");
                    }
                }
            } catch {}
            try {
                const allRaw = localStorage.getItem("useladder_all_resume_feedbacks");
                if (allRaw) {
                    const all = JSON.parse(allRaw);
                    if (Array.isArray(all)) {
                        const filtered = all.filter((f: any) => f.id !== resumeId && f.resumeName !== target.name);
                        localStorage.setItem("useladder_all_resume_feedbacks", JSON.stringify(filtered));
                    }
                }
            } catch {}

            window.dispatchEvent(new Event("useladder_resume_scanned"));

            // Sync with backend
            if (userEmail) {
                try {
                    const res = await fetch(`/api/auth/user?email=${encodeURIComponent(userEmail)}&resumeId=${encodeURIComponent(resumeId)}`, {
                        method: "DELETE",
                    });
                    if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        console.warn("Backend delete failed:", data.error);
                    }
                } catch (err) {
                    console.warn("Backend delete error:", err);
                }
            }
        } finally {
            setDeletingResumeId(null);
            setResumeToDelete(null);
        }
    };

    const handleCancelDelete = () => {
        if (deletingResumeId) return;
        setResumeToDelete(null);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setResumeName(file.name);
        setScanError(null);
        setIsScanning(true);

        const reader = new FileReader();
        reader.onload = async () => {
            const content = typeof reader.result === "string" ? reader.result : "";
            const currentResumeId = `cv_${Date.now()}`;

            // 1. Fast immediate text extraction so clean text is ready in under 100ms
            let extractedCleanText = "";
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
                if (parseData.success && parseData.text && parseData.text.length > 25) {
                    extractedCleanText = parseData.text;
                }
            } catch (err) {
                console.warn("[SettingsModal] Immediate parse note:", err);
            }

            if (!extractedCleanText && file.type.startsWith("text/")) {
                extractedCleanText = content;
            }
            if (!extractedCleanText) {
                extractedCleanText = `Resume document: ${file.name}`;
            }

            setResumeText(extractedCleanText);

            const newResumeItem: StoredResumeItem = {
                id: currentResumeId,
                name: file.name,
                data: content,
                rawText: extractedCleanText,
                score: null as unknown as number,
                updatedAt: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                source: "uploaded",
            };

            const updatedList = [newResumeItem, ...savedResumes];
            setSavedResumes(updatedList);
            setSelectedResumeId(newResumeItem.id);
            setIsUploadingNew(false);

            // Sync with local storage user profile immediately
            const raw = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    parsed.resumes = updatedList;
                    parsed.selectedResumeId = newResumeItem.id;
                    parsed.resume = newResumeItem;
                    localStorage.setItem("useladder_user", JSON.stringify(parsed));
                } catch (err) {
                    console.error("Error saving uploaded resume:", err);
                }
            }

            // Immediately seed useladder_last_resume_feedback so landing on /resume-feedback displays real parsed CV right away — score stays null until LLM returns
            const initialFeedbackPayload: any = {
                id: currentResumeId,
                resumeName: file.name,
                role: selectedRole,
                domain: selectedDomain,
                resumeText: extractedCleanText,
                score: null,
                summary: "Analyzing your resume — scoring and tailored suggestions will appear as soon as the review is complete.",
                strengths: [],
                suggestions: [],
                missingKeywords: [],
                updatedAt: new Date().toISOString(),
            };

            if (typeof window !== "undefined") {
                localStorage.setItem("useladder_last_resume_feedback", JSON.stringify(initialFeedbackPayload));
                try {
                    const allRaw = localStorage.getItem("useladder_all_resume_feedbacks");
                    const all = allRaw ? JSON.parse(allRaw) : [];
                    const filtered = Array.isArray(all) ? all.filter((f: any) => f.id !== initialFeedbackPayload.id) : [];
                    filtered.unshift(initialFeedbackPayload);
                    localStorage.setItem("useladder_all_resume_feedbacks", JSON.stringify(filtered.slice(0, 20)));
                } catch {}
                localStorage.setItem("useladder_has_new_resume_dm", "true");
                window.dispatchEvent(new Event("useladder_resume_scanned"));
            }

            // 2. Perform deep AI scan in background/parallel to enrich with suggestions & score
            try {
                const res = await fetch("/api/resume/scan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        fileData: content,
                        resumeText: extractedCleanText,
                        resumeName: file.name,
                        role: selectedRole,
                        domain: selectedDomain,
                        email: userEmail,
                    }),
                });

                const data = await res.json();
                if (res.ok && !data.error && data.result) {
                    const finalCleanText = data.extractedText || extractedCleanText;
                    const finalScore = data.result?.score || 82;

                    setResumeText(finalCleanText);

                    // Update saved resume list
                    setSavedResumes((prev) =>
                        prev.map((r) =>
                            r.id === currentResumeId
                                ? { ...r, score: finalScore, rawText: finalCleanText }
                                : r
                        )
                    );

                    // Update local user storage
                    const rawUser = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
                    if (rawUser) {
                        try {
                            const pUser = JSON.parse(rawUser);
                            if (pUser.resume?.id === currentResumeId) {
                                pUser.resume.score = finalScore;
                                pUser.resume.rawText = finalCleanText;
                            }
                            localStorage.setItem("useladder_user", JSON.stringify(pUser));
                        } catch {}
                    }

                    const enrichedFeedback = {
                        id: currentResumeId,
                        resumeName: file.name,
                        role: selectedRole,
                        domain: selectedDomain,
                        resumeText: finalCleanText,
                        score: finalScore,
                        summary: data.result.summary || initialFeedbackPayload.summary,
                        strengths: data.result.strengths || [],
                        suggestions: data.result.suggestions || [],
                        missingKeywords: data.result.missingKeywords || [],
                        updatedAt: new Date().toISOString(),
                    };

                    localStorage.setItem("useladder_last_resume_feedback", JSON.stringify(enrichedFeedback));
                    try {
                        const allRaw2 = localStorage.getItem("useladder_all_resume_feedbacks");
                        const all2 = allRaw2 ? JSON.parse(allRaw2) : [];
                        const filtered2 = Array.isArray(all2) ? all2.filter((f: any) => f.id !== enrichedFeedback.id) : [];
                        filtered2.unshift(enrichedFeedback);
                        localStorage.setItem("useladder_all_resume_feedbacks", JSON.stringify(filtered2.slice(0, 20)));
                    } catch {}
                    window.dispatchEvent(new Event("useladder_resume_scanned"));
                }
            } catch (err: any) {
                console.warn("Background AI scan note:", err);
            } finally {
                setIsScanning(false);
                onClose();
            }
        };

        if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
            reader.readAsText(file);
        } else {
            reader.readAsDataURL(file);
        }
    };

    const handleRunScan = async () => {
        if (!resumeName && !resumeText.trim()) {
            setScanError("Please select or upload a resume file to analyze.");
            return;
        }

        setIsScanning(true);
        setScanError(null);

        const currentResumeId = selectedResumeId || `cv_${Date.now()}`;
        const selectedItem = savedResumes.find((r) => r.id === currentResumeId);
        const textPayload = resumeText.trim() || selectedItem?.rawText || `Resume profile uploaded: ${resumeName}. Experience aligned with ${selectedRole}.`;
        const finalResumeName = resumeName || selectedItem?.name || "Uploaded_Resume.pdf";
        const fileDataPayload = selectedItem?.data && selectedItem.data.startsWith("data:") ? selectedItem.data : "";

        try {
            const res = await fetch("/api/resume/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileData: fileDataPayload,
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

            const cleanText = data.extractedText || textPayload;
            setResumeText(cleanText);

            // Update resume score in savedResumes
            setSavedResumes((prev) =>
                prev.map((r) =>
                    r.id === currentResumeId
                        ? { ...r, score: data.result.score || 80, rawText: cleanText }
                        : r
                )
            );

            // Store last resume feedback for Coach DM and Feedback page
            const feedbackPayload = {
                id: currentResumeId,
                resumeName: finalResumeName,
                role: selectedRole,
                domain: selectedDomain,
                resumeText: cleanText,
                score: data.result.score || 82,
                summary: data.result.summary || "",
                strengths: data.result.strengths || [],
                suggestions: data.result.suggestions || [],
                missingKeywords: data.result.missingKeywords || [],
                updatedAt: new Date().toISOString(),
            };

            if (typeof window !== "undefined") {
                localStorage.setItem("useladder_last_resume_feedback", JSON.stringify(feedbackPayload));
                try {
                    const allRaw3 = localStorage.getItem("useladder_all_resume_feedbacks");
                    const all3 = allRaw3 ? JSON.parse(allRaw3) : [];
                    const filtered3 = Array.isArray(all3) ? all3.filter((f: any) => f.id !== feedbackPayload.id) : [];
                    filtered3.unshift(feedbackPayload);
                    localStorage.setItem("useladder_all_resume_feedbacks", JSON.stringify(filtered3.slice(0, 20)));
                } catch {}
                localStorage.setItem("useladder_has_new_resume_dm", "true");
                window.dispatchEvent(new Event("useladder_resume_scanned"));
            }

            // Sync with local storage user profile
            const raw = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    const newResumeItem = {
                        id: currentResumeId,
                        name: finalResumeName,
                        data: selectedItem?.data || cleanText,
                        rawText: cleanText,
                        score: data.result?.score || 80,
                        updatedAt: new Date().toISOString(),
                    };
                    const existing = parsed.resumes || [];
                    parsed.resumes = [newResumeItem, ...existing.filter((r: { id: string }) => r.id !== currentResumeId)];
                    parsed.selectedResumeId = currentResumeId;
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
                            id: currentResumeId,
                            name: finalResumeName,
                            rawText: cleanText,
                            score: data.result?.score || 80,
                        },
                    }),
                }).catch(() => {});
            }

            // Close modal so feedback is viewed via Coach DM on dashboard
            onClose();
        } catch (err) {
            setScanError(err instanceof Error ? err.message : "Network error during scan. Please try again.");
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
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: userEmail,
                        role: selectedRole,
                        domain: selectedDomain,
                        portfolioUrl,
                    }),
                });
            } catch (err) {
                console.error("Failed to sync role/portfolio:", err);
            }
        }

        // Update localStorage useladder_user
        const raw = typeof window !== "undefined" ? localStorage.getItem("useladder_user") : null;
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                parsed.role = selectedRole;
                parsed.roleFamily = normalizeUserRoleFamily(selectedRole);
                parsed.specialization = selectedRole;
                parsed.domain = selectedDomain;
                parsed.portfolioUrl = portfolioUrl;
                if (selectedResumeId) {
                    parsed.selectedResumeId = selectedResumeId;
                }
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

                {/* ── Timeline Body ── */}
                <div className={styles.settingsTimelineBody}>
                    <div className={styles.timelineSectionWrap}>
                        <div className={styles.timelineItemsList}>
                            <div className={styles.timelineConnectorLine} />

                            {/* ── ITEM 1: RECRUITER SAYING IN TEXTBOX "TRY OUT A NEW ROLE" + DROPDOWN ── */}
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
                                    </div>
                                </div>
                            </div>

                            {/* ── ITEM 2: UPLOAD YOUR RESUME & PORTFOLIO ── */}
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

                                    {/* List of previously uploaded / saved resumes */}
                                    {savedResumes.length > 0 && !isUploadingNew && (
                                        <div>
                                            <div className={styles.resumePickerHeader}>
                                                <span className={styles.resumePickerTitle}>Saved Resumes</span>
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
                                                                    <FileText size={18} />
                                                                </div>
                                                                <div className={styles.resumeOptionTextGroup}>
                                                                    <span className={styles.resumeOptionName}>{resume.name}</span>
                                                                    <div className={styles.resumeOptionSub}>
                                                                        <span>Uploaded Resume</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteResume(resume.id);
                                                                    }}
                                                                    disabled={deletingResumeId === resume.id}
                                                                    aria-label={`Delete ${resume.name}`}
                                                                    title="Delete resume"
                                                                    style={{
                                                                        background: "#FFF1F2",
                                                                        border: "1px solid #FECDD3",
                                                                        borderRadius: 6,
                                                                        padding: "4px 6px",
                                                                        cursor: deletingResumeId === resume.id ? "not-allowed" : "pointer",
                                                                        opacity: deletingResumeId === resume.id ? 0.6 : 1,
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        justifyContent: "center",
                                                                    }}
                                                                >
                                                                    <Trash size={14} weight="bold" color="#DC2626" />
                                                                </button>
                                                                <div className={styles.resumeOptionCheck}>
                                                                    {isSelected ? (
                                                                        <CheckCircle size={18} weight="fill" color="#2563EB" />
                                                                    ) : (
                                                                        <div style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid #CBD5E1" }} />
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <button
                                                type="button"
                                                className={styles.uploadNewCvTriggerBtn}
                                                onClick={() => {
                                                    setIsUploadingNew(true);
                                                    // Clear previous name so dropzone doesn't show old selection as "Selected:"
                                                    setResumeName("");
                                                    setResumeText("");
                                                    if (fileInputRef.current) fileInputRef.current.value = "";
                                                    fileInputRef.current?.click();
                                                }}
                                            >
                                                <UploadSimple size={16} weight="bold" />
                                                <span>Upload a New Resume</span>
                                            </button>
                                        </div>
                                    )}

                                    {/* Upload Dropzone (if user chooses to upload new or no resumes saved) */}
                                    {(savedResumes.length === 0 || isUploadingNew) && (
                                        <div style={{ marginTop: savedResumes.length > 0 ? "0.5rem" : "0" }}>
                                            <div
                                                className={styles.resumeDropzoneArea}
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                <UploadSimple size={24} color="#2563EB" />
                                                <span className={styles.resumeDropzoneTitle}>
                                                    Click to upload Resume (PDF, DOCX, TXT, MD)
                                                </span>
                                                <span className={styles.resumeDropzoneSubtitle}>
                                                    Interview coach analyzes your achievements against industry expectations
                                                </span>
                                            </div>

                                            {savedResumes.length > 0 && (
                                                <div style={{ textAlign: "center", marginTop: "0.5rem" }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsUploadingNew(false);
                                                            const sel = savedResumes.find((r) => r.id === selectedResumeId);
                                                            if (sel) {
                                                                setResumeName(sel.name);
                                                                setResumeText(sel.rawText || sel.data || "");
                                                            }
                                                            if (fileInputRef.current) fileInputRef.current.value = "";
                                                        }}
                                                        style={{ background: "none", border: "none", color: "#64748B", fontSize: "0.76rem", cursor: "pointer", textDecoration: "underline" }}
                                                    >
                                                        Cancel & choose from saved resumes
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Portfolio Link Field (Moved to Resume Section) ── */}
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

                                    {scanError && (
                                        <div className={styles.errorBanner}>
                                            <WarningCircle size={16} weight="bold" />
                                            {scanError}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

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

            <DeleteConfirmModal
                isOpen={!!resumeToDelete}
                resumeName={resumeToDelete?.name || ""}
                isDeleting={!!deletingResumeId}
                onCancel={handleCancelDelete}
                onConfirm={handleConfirmDelete}
            />
        </div>
    );
}
