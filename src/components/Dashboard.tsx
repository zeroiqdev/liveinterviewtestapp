"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    SignOut,
    Bell,
    ArrowRight,
    House,
    FileText,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import styles from "./dashboard.module.css";
const PaymentModal = dynamic(() => import("./PaymentModal"));
import { db, type UserStats } from "../services/database";
import { detectUserLocation, UserLocation, scoreJobForLocation, isJobRoleMatch, normalizeUserRoleFamily } from "@/utils/locationDetector";
import type { JobItem } from "@/app/api/jobs/route";
import { getInterviewRoundsForRole, RECRUITER_AVATAR, COACH_AVATAR } from "./dashboard/constants";
import { ModuleCardItem } from "./dashboard/ModuleCardItem";
import { ChatsPanel } from "./dashboard/ChatsPanel";
import { TopJobsPanel } from "./dashboard/TopJobsPanel";
import { JobDescModal } from "./dashboard/JobDescModal";
import { TinderCardDeck } from "./dashboard/TinderCardDeck";
import { SettingsModal } from "./dashboard/SettingsModal";
import { InterviewSetupModal } from "./dashboard/InterviewSetupModal";
import { useInterview } from "../context/InterviewContext";
import { matchResumeToJob } from "@/lib/atsScorer";
import { deriveJobResponsibilities } from "./dashboard/utils";

interface StoredResumeItem {
    id: string;
    name: string;
    data?: string;
    rawText?: string;
    updatedAt?: string;
    score?: number;
}

interface UserProfile {
    id?: string;
    email?: string;
    name?: string;
    domain?: string;
    role?: string;
    roleFamily?: string;
    specialization?: string;
    seniority?: string;
    provider?: string;
    selectedResumeId?: string;
}

export function getJobStableKey(job: JobItem): string {
    if (job.url && job.url !== "#" && job.url.trim() !== "") return job.url.trim().toLowerCase();
    return `${job.title.trim().toLowerCase()}::${job.company.trim().toLowerCase()}::${job.location.trim().toLowerCase()}`;
}

export function resolveResumeTextForMatch(item: StoredResumeItem): string {
    if (item.rawText && !item.rawText.startsWith("data:") && !item.rawText.startsWith("PK") && item.rawText.length >= 30) return item.rawText;
    if (typeof item.data === "string" && !item.data.startsWith("data:") && !item.data.startsWith("PK") && item.data.length >= 30) return item.data;
    try {
        const lastRaw = typeof window !== "undefined" ? localStorage.getItem("useladder_last_resume_feedback") : null;
        if (lastRaw) {
            const fb = JSON.parse(lastRaw);
            if (fb?.resumeText && typeof fb.resumeText === "string" && !fb.resumeText.startsWith("data:") && fb.resumeText.length >= 30) return fb.resumeText;
        }
    } catch {}
    return item.rawText || item.data || "";
}

function parseStoredResumes(rawUserJson: string | null): StoredResumeItem[] {
    if (!rawUserJson) return [];
    try {
        const parsed = JSON.parse(rawUserJson);
        let list: StoredResumeItem[] = [];
        if (parsed.resumes && Array.isArray(parsed.resumes) && parsed.resumes.length > 0) {
            list = parsed.resumes.map((r: any, idx: number) => ({
                id: r.id || `resume_${idx}`,
                name: r.name || `Resume_${idx + 1}.pdf`,
                data: r.data || r.rawText || "",
                rawText: r.rawText || r.data || "",
                updatedAt: r.updatedAt || "",
                score: r.score,
            }));
        } else if (parsed.resume) {
            list = [
                {
                    id: parsed.resume.id || "res_primary",
                    name: parsed.resume.name || "Active_Resume.pdf",
                    data: parsed.resume.data || parsed.resume.rawText || "",
                    rawText: parsed.resume.rawText || parsed.resume.data || "",
                    updatedAt: parsed.resume.updatedAt || "",
                    score: parsed.resume.score,
                },
            ];
        }
        const filtered = list.filter((r) => {
            const t = resolveResumeTextForMatch(r);
            return t && t.length >= 30 && !t.startsWith("data:") && !t.startsWith("PK");
        });
        return filtered.length > 0 ? filtered : list.slice(0, 5);
    } catch {
        return [];
    }
}

function areResumesEquivalent(a: StoredResumeItem[], b: StoredResumeItem[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].id !== b[i].id) return false;
        if ((a[i].rawText || "").length !== (b[i].rawText || "").length) return false;
        if (a[i].score !== b[i].score) return false;
    }
    return true;
}

function formatDisplayName(rawName?: string, rawEmail?: string) {
    if (rawName && rawName.trim()) {
        return rawName
            .trim()
            .split(/\s+/)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");
    }
    if (rawEmail && rawEmail.trim()) {
        const namePart = rawEmail.split("@")[0].replace(/[._-]/g, " ");
        return namePart
            .trim()
            .split(/\s+/)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");
    }
    return "User";
}

export default function Dashboard() {
    const router = useRouter();
    // Prevent browser back on dashboard from landing back on transient pages (resume-feedback / interview / feedback)
    useEffect(() => {
        // Replace current history entry so back does not return to interview/resume-feedback
        window.history.replaceState(null, "", "/dashboard");
        const onPopState = () => {
            // Defer check until navigation completes
            setTimeout(() => {
                const path = window.location.pathname;
                if (path === "/interview" || path === "/resume-feedback" || path === "/feedback") {
                    router.replace("/");
                }
            }, 50);
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, [router]);
    const [user, setUser] = useState<UserProfile | null>(() => {
        if (typeof window === "undefined") return null;
        try {
            const raw = localStorage.getItem("useladder_user");
            if (raw) return JSON.parse(raw);
        } catch {}
        return null;
    });
    const [loading, setLoading] = useState(true);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [stats, setStats] = useState<UserStats | null>(null);

    // Location detection & dynamic jobs state
    const [userLocation, setUserLocation] = useState<UserLocation | null>(() => {
        if (typeof window === "undefined") return null;
        try {
            const raw = localStorage.getItem("useladder_user_location");
            if (raw) return JSON.parse(raw);
        } catch {}
        return null;
    });
    const [jobs, setJobs] = useState<JobItem[]>([]);
    const [selectedJobDesc, setSelectedJobDesc] = useState<JobItem | null>(null);
    const [activeMobileTab, setActiveMobileTab] = useState<"home" | "recruiter" | "coach">("home");
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const { updateSettings } = useInterview();

    // All resumes – run match against every available resume whenever job finder runs
    const [allResumes, setAllResumes] = useState<StoredResumeItem[]>(() => {
        if (typeof window === "undefined") return [];
        return parseStoredResumes(localStorage.getItem("useladder_user"));
    });
    const [jobMatches, setJobMatches] = useState<Record<string, { bestResumeId: string; bestResumeName: string; bestScore: number; summary: string }>>(() => {
        if (typeof window !== "undefined") {
            try {
                const raw = localStorage.getItem("useladder_job_matches");
                if (raw) {
                    const parsed = JSON.parse(raw);
                    // Support both {matches:{}} wrapper and direct map
                    return parsed.matches || parsed || {};
                }
            } catch {}
        }
        return {};
    });
    const [isMatchingResumes, setIsMatchingResumes] = useState(false);
    const prevResumeIdsRef = React.useRef<string>("");

    // Persist matches to localStorage so refresh doesn't re-run for same jobs
    useEffect(() => {
        try {
            if (Object.keys(jobMatches).length > 0) {
                localStorage.setItem("useladder_job_matches", JSON.stringify(jobMatches));
            }
        } catch {}
    }, [jobMatches]);

    useEffect(() => {
        const init = async () => {
            const raw = localStorage.getItem("useladder_user");
            if (!raw) {
                router.push("/onboarding");
                return;
            }
            try {
                const parsed: UserProfile = JSON.parse(raw);
                if (parsed.role) {
                    const canonicalFamily = normalizeUserRoleFamily(parsed.role);
                    if (parsed.roleFamily !== canonicalFamily) {
                        parsed.roleFamily = canonicalFamily;
                        parsed.specialization = parsed.role;
                        try {
                            localStorage.setItem("useladder_user", JSON.stringify(parsed));
                        } catch {
                            // Ignore
                        }
                    }
                }
                setUser(parsed);
                const realStats = await db.getUserStats(parsed.email || "anonymous");
                setStats(realStats);

                // Detect user location
                const loc = await detectUserLocation();
                setUserLocation(loc);

                // Fetch dynamic jobs
                try {
                    const jobsRes = await fetch("/api/jobs");
                    if (jobsRes.ok) {
                        const data = await jobsRes.json();
                        setJobs(data.jobs || []);
                    }
                } catch {
                    // Ignore jobs fetch error
                }
            } catch {
                router.push("/onboarding");
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [router]);



    // Load all available resumes from localStorage + backend (kept in sync with SettingsModal)
    useEffect(() => {
        const loadResumes = () => {
            try {
                const raw = localStorage.getItem("useladder_user");
                if (!raw) return;
                const parsed = JSON.parse(raw);
                const localResumes = parseStoredResumes(raw);
                if (localResumes.length > 0) {
                    setAllResumes((prev) => (areResumesEquivalent(prev, localResumes) ? prev : localResumes));
                }
                if (parsed.email) {
                    fetch(`/api/auth/user?email=${encodeURIComponent(parsed.email)}`)
                        .then((r) => r.json())
                        .then((data) => {
                            if (data.user?.resumes && Array.isArray(data.user.resumes) && data.user.resumes.length > 0) {
                                const fetched: StoredResumeItem[] = data.user.resumes
                                    .map((r: any, idx: number) => ({
                                        id: r.id || `resume_${idx}`,
                                        name: r.name || `Resume_${idx + 1}.pdf`,
                                        data: r.rawText || "",
                                        rawText: r.rawText || "",
                                        updatedAt: r.updatedAt || "",
                                        score: r.score,
                                    }))
                                    .filter((r: StoredResumeItem) => {
                                        const t = resolveResumeTextForMatch(r);
                                        return t && t.length >= 30;
                                    });
                                if (fetched.length > 0) {
                                    setAllResumes((prev) => {
                                        if (areResumesEquivalent(prev, fetched)) return prev;
                                        try {
                                            const currentRaw = localStorage.getItem("useladder_user");
                                            if (currentRaw) {
                                                const currentParsed = JSON.parse(currentRaw);
                                                currentParsed.resumes = fetched;
                                                localStorage.setItem("useladder_user", JSON.stringify(currentParsed));
                                            }
                                        } catch {}
                                        return fetched;
                                    });
                                }
                            }
                        })
                        .catch(() => {});
                }
            } catch {}
        };
        loadResumes();
        const handler = () => loadResumes();
        window.addEventListener("useladder_resume_scanned", handler);
        window.addEventListener("focus", handler);
        return () => {
            window.removeEventListener("useladder_resume_scanned", handler);
            window.removeEventListener("focus", handler);
        };
    }, [user?.email]);

    // Run match against ALL available resumes every time job finder runs (jobs change) – cached, fast local evaluation
    const jobMatchesRef = React.useRef(jobMatches);
    jobMatchesRef.current = jobMatches;

    useEffect(() => {
        if (!jobs.length || !allResumes.length || !user?.role) {
            setIsMatchingResumes(false);
            return;
        }

        // Hash includes id + score + text length so improved resume (same id, new score/text) is detected
        const currentResumeHash = allResumes
            .map((r) => `${r.id}:${r.score ?? ""}:${(r.rawText || r.data || "").length}:${r.updatedAt || ""}`)
            .sort()
            .join("|");
        const resumesChanged = prevResumeIdsRef.current !== "" && prevResumeIdsRef.current !== currentResumeHash;
        prevResumeIdsRef.current = currentResumeHash;

        const currentMatches = jobMatchesRef.current;

        // Candidate jobs matching the user's role and location eligibility
        const candidateJobs = jobs.filter((j) => {
            if (userLocation && scoreJobForLocation(j.location, userLocation) === 0) return false;
            return isJobRoleMatch(j.roleFamily, j.title, user.role);
        });

        // Target up to 40 candidate jobs for this user
        const targetJobs = candidateJobs.slice(0, 40);

        // Determine which candidate jobs actually need matching
        const jobsNeedingMatch = targetJobs.filter((job) => {
            const key = getJobStableKey(job);
            const cached = currentMatches[key];
            if (!cached) return true;
            if (resumesChanged) return true;
            if (!allResumes.some((r) => r.id === cached.bestResumeId)) return true;
            return false;
        });

        if (jobsNeedingMatch.length === 0) {
            setIsMatchingResumes(false);
            return;
        }

        setIsMatchingResumes(true);

        try {
            // Fast, accurate in-memory ATS matching across candidate resumes
            const resumesToUse = allResumes.slice(0, 5);
            const results: Record<string, { bestResumeId: string; bestResumeName: string; bestScore: number; summary: string }> = {};

            for (const job of jobsNeedingMatch) {
                const key = getJobStableKey(job);
                const prevEntry = currentMatches[key];
                for (const resume of resumesToUse) {
                    const resumeText = resolveResumeTextForMatch(resume);
                    if (!resumeText || resumeText.length < 30) continue;
                    try {
                        const match = matchResumeToJob(
                            resumeText,
                            {
                                title: job.title,
                                company: job.company,
                                description: job.description,
                                responsibilities: deriveJobResponsibilities(job),
                                roleFamily: job.roleFamily,
                            },
                            user?.role
                        );
                        const score = match.overallMatch;
                        const existing = results[key] || prevEntry;
                        if (!existing || score > existing.bestScore) {
                            results[key] = {
                                bestResumeId: resume.id,
                                bestResumeName: resume.name,
                                bestScore: score,
                                summary: match.summary,
                            };
                        }
                    } catch (err) {
                        console.warn("ATS match error for job:", job.title, err);
                    }
                }
                // Retain previous valid match rather than degrading score or defaulting to 50
                if (!results[key]) {
                    if (prevEntry) {
                        results[key] = prevEntry;
                    } else {
                        results[key] = {
                            bestResumeId: resumesToUse[0]?.id || "res_fallback",
                            bestResumeName: resumesToUse[0]?.name || "Active Resume",
                            bestScore: 50,
                            summary: `Specialization alignment for ${job.title}`,
                        };
                    }
                }
            }

            setJobMatches((prev) => {
                let hasChanges = false;
                for (const k in results) {
                    if (!prev[k] || prev[k].bestScore !== results[k].bestScore) {
                        hasChanges = true;
                        break;
                    }
                }
                if (!hasChanges) return prev;
                const merged = { ...prev, ...results };
                try {
                    localStorage.setItem("useladder_job_matches", JSON.stringify(merged));
                } catch {}
                return merged;
            });
        } finally {
            setIsMatchingResumes(false);
        }
    }, [jobs, allResumes, user?.role, userLocation, deriveJobResponsibilities]);

    const handleSwitchLocation = useCallback((preset: { country: string; countryCode: string; city?: string; continent: string; isAfrica: boolean; isNigeria: boolean }) => {
        setUserLocation((prev) => {
            const updated: UserLocation = {
                ...preset,
                timezone: prev?.timezone || "UTC",
                source: "manual",
            };
            try {
                localStorage.setItem("useladder_user_location", JSON.stringify(updated));
            } catch {
                // Ignore storage errors
            }
            return updated;
        });
    }, []);

    const [isInterviewSetupOpen, setIsInterviewSetupOpen] = useState(false);
    const [setupModalContext, setSetupModalContext] = useState<{
        role?: string;
        company?: string;
        isSpecificJob?: boolean;
        jobTitle?: string;
        interviewTypeTitle?: string;
        jobResponsibilities?: string[];
        jobDescription?: string;
    }>({});

    const handleOpenPayment = useCallback(() => setIsPaymentModalOpen(true), []);
    const handleClosePayment = useCallback(() => setIsPaymentModalOpen(false), []);
    const handleOpenJobDesc = useCallback((job: JobItem) => setSelectedJobDesc(job), []);
    const handleCloseJobDesc = useCallback(() => setSelectedJobDesc(null), []);

    const handleOpenInterviewSetup = useCallback(
        (context?: JobItem | { company?: string; title?: string; description?: string; responsibilities?: string[]; roundTitle?: string; interviewTypeTitle?: string }) => {
            if (context) {
                if ((context as any).company) {
                    const derived = deriveJobResponsibilities({
                        responsibilities: (context as any).responsibilities,
                        description: (context as any).description,
                        title: context.title || "Target Role",
                    });
                    setSetupModalContext({
                        role: user?.role || "Software Engineer",
                        company: context.company,
                        isSpecificJob: true,
                        jobTitle: context.title,
                        interviewTypeTitle: `${context.company} ${context.title || user?.role || "Interview"}`,
                        jobResponsibilities: derived,
                        jobDescription: (context as any).description || "",
                    });
                } else if ((context as any).roundTitle || (context as any).interviewTypeTitle) {
                    const raw = ((context as any).roundTitle || (context as any).interviewTypeTitle || "").replace(/\n/g, " ").trim();
                    const clean = raw.toLowerCase().endsWith("interview") ? raw : `${raw} Interview`;
                    const roleTitle = (context as any).title || user?.role || "Product Manager";
                    setSetupModalContext({
                        role: roleTitle,
                        company: (context as any).company || "Target Role",
                        isSpecificJob: true,
                        jobTitle: roleTitle,
                        interviewTypeTitle: clean,
                        jobResponsibilities: Array.isArray((context as any).responsibilities) ? (context as any).responsibilities : [],
                    });
                } else {
                    const roleTitle = (context as any).title || user?.role || "Product Manager";
                    setSetupModalContext({
                        role: roleTitle,
                        company: (context as any).company || "Target Role",
                        isSpecificJob: true,
                        jobTitle: roleTitle,
                        interviewTypeTitle: (context as any).title ? `${(context as any).title} Interview` : "Role Interview",
                        jobResponsibilities: Array.isArray((context as any).responsibilities) ? (context as any).responsibilities : [],
                    });
                }
            } else {
                const roleTitle = user?.role || "Product Manager";
                setSetupModalContext({
                    role: roleTitle,
                    company: "Target Role",
                    isSpecificJob: true,
                    jobTitle: roleTitle,
                    interviewTypeTitle: "Role Interview",
                    jobResponsibilities: [],
                });
            }
            setIsInterviewSetupOpen(true);
        },
        [user?.role]
    );

    const handleRoleChange = useCallback((newRole: string, newDomain: string) => {
        const family = normalizeUserRoleFamily(newRole);
        setUser((prev) => {
            if (!prev) return prev;
            const updated: UserProfile = {
                ...prev,
                role: newRole,
                domain: newDomain,
                roleFamily: family,
                specialization: newRole,
            };
            try {
                localStorage.setItem("useladder_user", JSON.stringify(updated));
            } catch {
                // Ignore storage errors
            }
            return updated;
        });
        updateSettings({
            role: newRole,
            domain: newDomain,
        });
    }, [updateSettings]);

    // Compute tailored hero module cards for current role
    const dynamicModuleCards = useMemo(() => {
        return getInterviewRoundsForRole(user?.role, user?.roleFamily);
    }, [user?.role, user?.roleFamily]);

    // Compute up to 4 matched jobs strictly locked to user's specialization and region + resume match ≥50% across all resumes
    const displayedJobs = useMemo(() => {
        if (!jobs || jobs.length === 0) return [];
        if (!userLocation) return [];

        const currentRole = user?.role?.trim() || "";
        const targetFamily = currentRole ? normalizeUserRoleFamily(currentRole) : (user?.roleFamily || "");

        // 1. Filter strictly by the user's specialization AND regional eligibility
        let matched = jobs.filter((j) => {
            // Regional accessibility check (no overseas-locked roles)
            const locScore = scoreJobForLocation(j.location, userLocation);
            if (locScore === 0) return false;

            // Strict specialization check: role MUST match accurately
            if (currentRole) {
                return isJobRoleMatch(j.roleFamily, j.title, currentRole);
            }
            if (targetFamily && targetFamily !== "general") {
                return isJobRoleMatch(j.roleFamily, j.title, targetFamily);
            }
            return false;
        });

        // 2. Resume matching filter & prioritization:
        // Prioritize jobs that match >= 50% against candidate resumes.
        // If high matches exist, show those. If matches are still computing or if
        // the user's uploaded CV scored slightly below 50% for a new role, do NOT wipe the screen:
        // preserve the candidate jobs so newly fetched roles always appear on page refresh!
        if (allResumes.length > 0) {
            const highMatches = matched.filter((j) => {
                const m = jobMatches[getJobStableKey(j)];
                return m && m.bestScore >= 50;
            });
            if (highMatches.length > 0) {
                matched = highMatches;
            } else {
                // If matching is computing or no job met 50% yet, keep candidate role matches
                const candidateMatches = matched.filter((j) => {
                    const m = jobMatches[getJobStableKey(j)];
                    return !m || m.bestScore >= 35;
                });
                if (candidateMatches.length > 0) {
                    matched = candidateMatches;
                }
            }
        }

        // Sort: resume bestScore desc (if available) → location relevance → datePosted → stable job key
        matched.sort((a, b) => {
            if (allResumes.length > 0 && Object.keys(jobMatches).length > 0) {
                const scoreA = jobMatches[getJobStableKey(a)]?.bestScore ?? -1;
                const scoreB = jobMatches[getJobStableKey(b)]?.bestScore ?? -1;
                if (scoreA !== -1 || scoreB !== -1) {
                    if (scoreB !== scoreA) return scoreB - scoreA;
                }
            }
            const scoreB = scoreJobForLocation(b.location, userLocation);
            const scoreA = scoreJobForLocation(a.location, userLocation);
            if (scoreB !== scoreA) return scoreB - scoreA;
            const dateCmp = (b.datePosted || "").localeCompare(a.datePosted || "");
            if (dateCmp !== 0) return dateCmp;
            const keyA = a.id || `${a.company}-${a.title}`;
            const keyB = b.id || `${b.company}-${b.title}`;
            return keyA.localeCompare(keyB);
        });

        return matched.slice(0, 15);
    }, [jobs, userLocation, user?.role, user?.roleFamily, allResumes, jobMatches]);

    if (loading) {
        return (
            <div className={styles.loadingScreen}>
                <div className={styles.spinner} />
            </div>
        );
    }

    if (!user) return null;

    const userName = formatDisplayName(user.name, user.email);

    const nameParts = userName.split(" ").filter(Boolean);
    const initials = nameParts.length >= 2
        ? (nameParts[0].charAt(0) + nameParts[1].charAt(0)).toUpperCase()
        : userName.slice(0, 2).toUpperCase();

    const handleLogout = () => {
        localStorage.removeItem("useladder_user");
        router.push("/");
    };

    return (
        <div className={styles.dashboardPage}>
            {/* ── Navbar ── */}
            <nav className={styles.navbar}>
                <div className={styles.navLeft}>
                    <div
                        className={styles.logo}
                        style={{
                            display: "inline-flex",
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "nowrap",
                            whiteSpace: "nowrap",
                            gap: "0.85rem",
                            flexShrink: 0,
                        }}
                    >
                        <div
                            className={styles.logoIcon}
                            style={{
                                width: 25,
                                height: 25,
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                overflow: "visible",
                                transform: "translateY(1px)",
                            }}
                        >
                            <img
                                src="https://res.cloudinary.com/dyg7neetr/image/upload/v1790510817/Vector_10_thljja.png"
                                alt="get prepped"
                                className={styles.logoImg}
                            />
                        </div>
                        <span
                            className={styles.brandName}
                            style={{
                                display: "inline-block",
                                whiteSpace: "nowrap",
                                lineHeight: 1,
                                fontFamily: "'Inter', sans-serif",
                                fontSize: "1.02rem",
                                fontWeight: 400,
                            }}
                        >
                            get prepped
                        </span>
                    </div>
                </div>

                <div className={styles.navRight}>
                    {(() => {
                        const readinessVal = stats && stats.interviewsCompleted > 0 ? Math.min(100, Math.max(0, Math.round(stats.averageScore))) : 0;
                        const ringRadius = 7;
                        const ringCircumference = 2 * Math.PI * ringRadius;
                        const ringOffset = ringCircumference - (readinessVal / 100) * ringCircumference;
                        return (
                            <div className={`${styles.xpBadge} ${styles.tabularNums}`} title={`Interview Readiness: ${readinessVal}%`}>
                                <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 20 20"
                                    style={{ transform: "rotate(-90deg)", flexShrink: 0 }}
                                    aria-hidden="true"
                                >
                                    <circle
                                        cx="10"
                                        cy="10"
                                        r={ringRadius}
                                        fill="none"
                                        stroke="#BFDBFE"
                                        strokeWidth="2.4"
                                    />
                                    <circle
                                        cx="10"
                                        cy="10"
                                        r={ringRadius}
                                        fill="none"
                                        stroke="#2563EB"
                                        strokeWidth="2.4"
                                        strokeDasharray={ringCircumference}
                                        strokeDashoffset={ringOffset}
                                        strokeLinecap="round"
                                    />
                                </svg>
                                <span>Readiness <span className={styles.tabularNums}>{readinessVal}%</span></span>
                            </div>
                        );
                    })()}
                    <button
                        className={styles.settingsNavBtn}
                        onClick={() => setIsSettingsOpen(true)}
                        aria-label="Update Credentials"
                        title="Update Credentials"
                    >
                        <FileText size={18} weight="bold" />
                    </button>
                    <button
                        className={styles.logoutBtn}
                        onClick={handleLogout}
                        aria-label="Logout"
                    >
                        <SignOut size={16} weight="bold" />
                    </button>
                    <button className={styles.notificationBtn} aria-label="Notifications">
                        <Bell size={18} weight="bold" />
                    </button>
                    <div className={styles.avatar}>{initials}</div>
                </div>
            </nav>

            {/* ── Main Dashboard Content ── */}
            <main className={styles.mainContent}>
                <PaymentModal
                    isOpen={isPaymentModalOpen}
                    onClose={handleClosePayment}
                />

                {/* ── Desktop View (Side-by-side Recruiter + Coach Panels with Hero Section) ── */}
                <div className={styles.desktopViewContainer}>
                    {/* ── Hero / Suggested Interviews Section – keyed to role so cards swap immediately on role switch */}
                    <section key={user?.role || "default-role"} className={styles.heroSection}>
                        <div className={styles.heroTextBlock}>
                            <span className={styles.heroGreeting}>Welcome back, {userName}</span>
                            <h1 className={styles.heroHeading}>Ready to ace your next<br />interview?</h1>
                            <button
                                className={styles.heroProgressBtn}
                                onClick={() => handleOpenInterviewSetup()}
                            >
                                Start Interview <ArrowRight size={16} weight="bold" className={styles.heroProgressArrow} />
                            </button>
                        </div>

                        <div className={styles.moduleCardsScroll}>
                            {dynamicModuleCards.map((card) => (
                                <ModuleCardItem
                                    key={card.number}
                                    card={card}
                                    onSelect={() => handleOpenInterviewSetup({ roundTitle: card.title })}
                                />
                            ))}
                        </div>
                    </section>

                    <div className={styles.dashboardGrid}>
                        <TopJobsPanel
                            userLocation={userLocation}
                            jobs={displayedJobs}
                            userRole={user?.role}
                            userRoleFamily={user?.roleFamily}
                            onSwitchLocation={handleSwitchLocation}
                            onOpenJob={handleOpenJobDesc}
                            onPractice={handleOpenInterviewSetup}
                            jobMatches={jobMatches}
                            isMatching={isMatchingResumes && allResumes.length > 0}
                        />

                        <ChatsPanel
                            userRole={user?.role}
                            userRoleFamily={user?.roleFamily}
                            displayedJobs={displayedJobs}
                            onPractice={() => handleOpenInterviewSetup()}
                            onOpenJob={handleOpenJobDesc}
                        />
                    </div>
                </div>

                {/* ── Mobile View (PWA-style Tabbed Pages without upper dashboard clutter) ── */}
                <div className={styles.mobileViewContainer}>
                    {/* Home: Upper section converted into Tinder-style cards */}
                    {activeMobileTab === "home" && (
                        <div className={styles.mobileHomeWrap}>
                            <div className={styles.mobileHomeHeader}>
                                <span className={styles.mobileHomeGreeting}>Welcome back, {userName}</span>
                                <h1 className={styles.mobileHomeHeading}>Ready to ace your next interview?</h1>
                            </div>
                            <TinderCardDeck
                                key={user?.role || "default-role-mobile"}
                                onPractice={(round) => handleOpenInterviewSetup(round)}
                                userRole={user?.role}
                                userRoleFamily={user?.roleFamily}
                            />
                        </div>
                    )}

                    {/* Recruiter / Jobs: Matched job opportunities without messages/jobs distinction */}
                    {activeMobileTab === "recruiter" && (
                        <TopJobsPanel
                            userLocation={userLocation}
                            jobs={displayedJobs}
                            userRole={user?.role}
                            userRoleFamily={user?.roleFamily}
                            onSwitchLocation={handleSwitchLocation}
                            onOpenJob={handleOpenJobDesc}
                            onPractice={handleOpenInterviewSetup}
                            jobMatches={jobMatches}
                            isMatching={isMatchingResumes && allResumes.length > 0}
                        />
                    )}

                    {/* Coach: Separate standalone page for Interview Coach Messages & Drills */}
                    {activeMobileTab === "coach" && (
                        <ChatsPanel
                            userRole={user?.role}
                            userRoleFamily={user?.roleFamily}
                            displayedJobs={displayedJobs}
                            onPractice={() => handleOpenInterviewSetup()}
                            onOpenJob={handleOpenJobDesc}
                        />
                    )}
                </div>
            </main>

            {/* ── Mobile Bottom Navigation ── */}
            <nav className={styles.bottomNav}>
                <button
                    id="mobile-nav-home"
                    className={`${styles.bottomNavBtn} ${activeMobileTab === "home" ? styles.bottomNavBtnActive : ""}`}
                    onClick={() => setActiveMobileTab("home")}
                    type="button"
                    aria-label="Home"
                >
                    <House size={20} weight={activeMobileTab === "home" ? "fill" : "bold"} />
                    <span>Home</span>
                </button>
                <button
                    id="mobile-nav-recruiter"
                    className={`${styles.bottomNavBtn} ${activeMobileTab === "recruiter" ? styles.bottomNavBtnActive : ""}`}
                    onClick={() => setActiveMobileTab("recruiter")}
                    type="button"
                    aria-label="Recruiter"
                >
                    <div className={styles.bottomNavAvatarWrap}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={RECRUITER_AVATAR}
                            alt="Recruiter"
                            className={`${styles.bottomNavAvatar} ${activeMobileTab === "recruiter" ? styles.bottomNavAvatarActive : ""}`}
                            draggable={false}
                        />
                        <span className={styles.bottomNavDot} />
                    </div>
                    <span>Recruiter</span>
                </button>
                <button
                    id="mobile-nav-coach"
                    className={`${styles.bottomNavBtn} ${activeMobileTab === "coach" ? styles.bottomNavBtnActive : ""}`}
                    onClick={() => setActiveMobileTab("coach")}
                    type="button"
                    aria-label="Interview Coach"
                >
                    <div className={styles.bottomNavAvatarWrap}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={COACH_AVATAR}
                            alt="Coach"
                            className={`${styles.bottomNavAvatar} ${activeMobileTab === "coach" ? styles.bottomNavAvatarActive : ""}`}
                            draggable={false}
                        />
                        <span className={styles.bottomNavDot} style={{ background: "#10B981" }} />
                    </div>
                    <span>Coach</span>
                </button>
            </nav>

            {/* ── Job Description Modal ── */}
            {selectedJobDesc && (
                <JobDescModal
                    job={selectedJobDesc}
                    onClose={handleCloseJobDesc}
                    onPractice={() => {
                        const job = selectedJobDesc;
                        setSelectedJobDesc(null);
                        handleOpenInterviewSetup(job);
                    }}
                    userRole={user?.role}
                    resumes={allResumes}
                    activeResumeId={user?.selectedResumeId}
                />
            )}

            {/* ── Interview Launch Setup Modal (Settings Design System) ── */}
            <InterviewSetupModal
                isOpen={isInterviewSetupOpen}
                onClose={() => setIsInterviewSetupOpen(false)}
                initialRole={setupModalContext.role || user?.role}
                initialCompany={setupModalContext.company}
                isSpecificJob={setupModalContext.isSpecificJob}
                jobTitle={setupModalContext.jobTitle}
                interviewTypeTitle={setupModalContext.interviewTypeTitle}
                jobResponsibilities={setupModalContext.jobResponsibilities}
                jobDescription={setupModalContext.jobDescription}
                userRole={user?.role}
            />

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                currentRole={user?.role}
                currentDomain={user?.domain}
                userEmail={user?.email}
                onRoleChange={handleRoleChange}
            />
        </div>
    );
}
