"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
    MagnifyingGlass,
    Check,
    ArrowLeft,
    UploadSimple,
} from "@phosphor-icons/react";
import { useInterview, type InterviewRole } from "../context/InterviewContext";
import { normalizeUserRoleFamily } from "@/utils/locationDetector";
import styles from "./onboarding.module.css";

/* ── Personas Assets ── */
const TEAM = {
    coach: {
        name: "Interview Coach",
        avatar: "/char1.png",
        desc: "I will help you master your responses, align your story with your resume, and give you honest, real-time feedback during mock interviews.",
    },
    recruiter: {
        name: "Recruiter",
        avatar: "/char2.png",
        desc: "I will help you find the right job opportunities, give you the insider edge, and show you how to stand out to hiring managers.",
    },
} as const;

export type Domain = string;

const FALLBACK_ROLES = [
    { title: "Product Manager", domain: "Product & Design" },
    { title: "Product Designer", domain: "Product & Design" },
    { title: "Product Marketer", domain: "Product & Design" },
    { title: "Software Engineer", domain: "Software & Engineering" },
    { title: "Frontend Developer", domain: "Software & Engineering" },
    { title: "Backend Engineer", domain: "Software & Engineering" },
    { title: "Full Stack Developer", domain: "Software & Engineering" },
    { title: "DevOps / SRE", domain: "Software & Engineering" },
    { title: "Cloud Solutions Architect", domain: "Software & Engineering" },
    { title: "Data Scientist", domain: "Data & Analytics" },
    { title: "Data Analyst", domain: "Data & Analytics" },
    { title: "Business Analyst", domain: "Business & Operations" },
    { title: "Banking & Finance", domain: "Banking & Finance" },
    { title: "Investment Banker", domain: "Banking & Finance" },
    { title: "Financial Analyst", domain: "Banking & Finance" },
    { title: "Sales & Business Development", domain: "Sales & Commercial" },
    { title: "Account Executive", domain: "Sales & Commercial" },
    { title: "Customer Service Representative", domain: "Customer Service & Support" },
    { title: "Virtual Assistant", domain: "Administrative & Support" },
    { title: "Executive Assistant", domain: "Administrative & Support" },
    { title: "Engineering — Oil & Gas", domain: "Engineering & Energy" },
    { title: "HSE / Safety Officer", domain: "Engineering & Energy" },
];

const EXPERIENCE_OPTIONS = [
    { value: "internship", label: "Internship" },
    { value: "professional", label: "Professional" },
    { value: "projects", label: "Project experience" },
    { value: "transitioning", label: "Career Transition" },
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function OnboardingPage() {
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [roleQuery, setRoleQuery] = useState("");
    const [fetchedRoles, setFetchedRoles] = useState<{ role: string; domain: Domain }[]>([]);
    const [selectedRole, setSelectedRole] = useState<{ role: string; domain: Domain } | null>(null);
    const [experience, setExperience] = useState<string | null>(null);
    const [portfolioUrl, setPortfolioUrl] = useState("");
    const [linkedinUrl, setLinkedinUrl] = useState("");
    const [cvName, setCvName] = useState<string | null>(null);
    const [cvData, setCvData] = useState<string | null>(null);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const { updateSettings } = useInterview();
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch roles dynamically from backend API route (/api/roles)
    useEffect(() => {
        fetch("/api/roles")
            .then((res) => res.json())
            .then((data) => {
                if (data.roles && Array.isArray(data.roles)) {
                    const formatted = data.roles.map((r: { title: string; domain: string }) => ({
                        role: r.title,
                        domain: (r.domain as Domain) || "Software & Engineering",
                    }));
                    setFetchedRoles(formatted);
                }
            })
            .catch(() => {
                // fallback if API is unreachable
                setFetchedRoles(FALLBACK_ROLES.map((r) => ({ role: r.title, domain: r.domain as Domain })));
            });
    }, []);

    useEffect(() => {
        Promise.resolve().then(() => {
            const userSession = localStorage.getItem("useladder_user");
            if (userSession) {
                const user = JSON.parse(userSession);
                if (user.domain && user.role) {
                    router.push("/dashboard");
                    return;
                }
            }
            const draft = localStorage.getItem("useladder_draft");
            if (draft) {
                try {
                    const { name, email: savedEmail } = JSON.parse(draft);
                    if (name) setFullName(name);
                    if (savedEmail) setEmail(savedEmail);
                } catch { /* ignore */ }
                localStorage.removeItem("useladder_draft");
            }
            setCheckingAuth(false);
        });
    }, [router]);

    const activeRolesList = useMemo(() => {
        return fetchedRoles.length > 0
            ? fetchedRoles
            : FALLBACK_ROLES.map((r) => ({ role: r.title, domain: r.domain as Domain }));
    }, [fetchedRoles]);

    const visibleRoles = useMemo(() => {
        const q = roleQuery.trim().toLowerCase();
        if (!q) {
            return activeRolesList;
        }
        return activeRolesList.filter((r) => r.role.toLowerCase().includes(q));
    }, [activeRolesList, roleQuery]);

    const firstName = useMemo(() => {
        return fullName.trim().split(/\s+/)[0] || "Allen";
    }, [fullName]);

    const step4Message = useMemo(() => {
        const roleTitle = selectedRole?.role || "Product Manager";
        if (experience === "professional") {
            return `You’ve got some real skin in the game as a ${roleTitle}`;
        }
        return `Starting out as a ${roleTitle} is a great move`;
    }, [experience, selectedRole]);

    const stepValid =
        (step === 1 && fullName.trim().length >= 2 && EMAIL_RE.test(email.trim())) ||
        (step === 2 && !!selectedRole) ||
        (step === 3 && !!experience) ||
        step === 4;

    const handleFile = (file: File | undefined) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const result = typeof reader.result === "string" ? reader.result : "";
            const payload = result.startsWith("data:") ? result.split(",")[1] || "" : result;
            setCvData(payload);
            setCvName(file.name);
        };
        if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
            reader.readAsText(file);
        } else {
            reader.readAsDataURL(file);
        }
    };

    const finish = () => {
        const domainVal = selectedRole?.domain || "Software & Engineering";
        const roleVal = selectedRole?.role || "Software Engineer";

        let existing: { id?: string; resumes?: { id: string; name: string; data: string }[] } = {};
        try {
            existing = JSON.parse(localStorage.getItem("useladder_user") || "{}");
        } catch { /* ignore */ }

        const resumes = [...(existing.resumes || [])];
        let selectedResumeId: string | undefined;
        if (cvData && cvName) {
            selectedResumeId = `cv_${Date.now()}`;
            resumes.push({ id: selectedResumeId, name: cvName, data: cvData });
        }

        const roleFamily = normalizeUserRoleFamily(roleVal);
        const userProfile = {
            id: existing.id || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            email: email.trim(),
            name: fullName.trim(),
            domain: domainVal,
            role: roleVal,
            roleFamily,
            specialization: roleVal,
            seniority: experience || "professional",
            experienceInRole: experience || "professional",
            portfolioUrl: portfolioUrl.trim(),
            linkedinUrl: linkedinUrl.trim(),
            resumes,
            ...(selectedResumeId ? { selectedResumeId } : {}),
            onboarded: true,
        };
        localStorage.setItem("useladder_user", JSON.stringify(userProfile));

        // Persist credentials & profile to MongoDB
        fetch("/api/auth/user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: userProfile.email,
                name: userProfile.name,
                role: userProfile.role,
                domain: userProfile.domain,
                seniority: userProfile.seniority,
                resume: selectedResumeId && cvData && cvName ? {
                    id: selectedResumeId,
                    name: cvName,
                    rawText: cvData,
                    score: 80,
                } : undefined,
            }),
        }).catch((err) => console.warn("Could not sync user to DB:", err));

        updateSettings({
            domain: domainVal,
            role: roleVal as InterviewRole,
        });
        router.push("/dashboard");
    };

    const handleNext = () => {
        if (!stepValid) return;
        if (step < 4) {
            setStep((s) => (s + 1) as 1 | 2 | 3 | 4);
        } else {
            finish();
        }
    };

    const handleGoogleLogin = () => {
        const dummyName = fullName.trim() || "Allen";
        const dummyEmail = email.trim() || "user@example.com";
        setFullName(dummyName);
        setEmail(dummyEmail);
        setStep(2);
    };

    const handleBack = () => {
        if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3 | 4);
    };

    if (checkingAuth) return null;

    return (
        <div className={styles.splitWrapper}>
            {/* ════════ LEFT HERO PANEL ════════ */}
            <div className={styles.leftHeroPanel}>
                <div className={styles.leftLogoHeader}>
                    <Image
                        src="/useladder_logo.png"
                        alt="useladder logo"
                        width={115}
                        height={38}
                        className={styles.leftLogoImg}
                        priority
                    />
                </div>

                <div className={styles.leftHeroCenter}>
                    <h1 className={styles.welcomeHeading}>
                        <span className={styles.welcomeRow}>
                            Welcome
                            <svg className={styles.sparkleIcon} viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
                            </svg>
                        </span>
                        <span>to useladder</span>
                    </h1>
                    <p className={styles.lockInSubtitle}>
                        Let’s lock in
                    </p>
                </div>

                <div />
            </div>

            {/* ════════ RIGHT CONTENT PANEL ════════ */}
            <div className={styles.rightContentPanel}>
                {/* Mobile Logo */}
                <div className={styles.mobileLogoHeader}>
                    <Image
                        src="/useladder_logo.png"
                        alt="useladder logo"
                        width={115}
                        height={38}
                        className={styles.leftLogoImg}
                        priority
                    />
                </div>

                {/* Square back arrow button */}
                {step > 1 && (
                    <button
                        type="button"
                        className={styles.topBackSquareBtn}
                        onClick={handleBack}
                        aria-label="Go back"
                    >
                        <ArrowLeft size={18} />
                    </button>
                )}

                {/* Progress bar */}
                <div className={styles.topProgressBar}>
                    {[1, 2, 3, 4].map((s) => (
                        <span
                            key={s}
                            className={`${styles.progressSegment} ${s <= step ? styles.progressSegmentActive : ""}`}
                        />
                    ))}
                </div>

                {/* STEP 1: Sign up & Team Cards */}
                {step === 1 && (
                    <>
                        <div className={styles.teamSection}>
                            <h2 className={styles.teamSectionTitle}>First thing first, meet your team</h2>
                            <div className={styles.teamCardsGrid}>
                                <div className={styles.teamCard}>
                                    <div className={styles.teamAvatar}>
                                        <Image src={TEAM.coach.avatar} alt="Interview Coach" width={48} height={48} />
                                    </div>
                                    <div className={styles.teamInfo}>
                                        <div className={styles.teamRoleTitle}>{TEAM.coach.name}</div>
                                        <p className={styles.teamRoleDesc}>{TEAM.coach.desc}</p>
                                    </div>
                                </div>

                                <div className={styles.teamCard}>
                                    <div className={styles.teamAvatar}>
                                        <Image src={TEAM.recruiter.avatar} alt="Recruiter" width={48} height={48} />
                                    </div>
                                    <div className={styles.teamInfo}>
                                        <div className={styles.teamRoleTitle}>{TEAM.recruiter.name}</div>
                                        <p className={styles.teamRoleDesc}>{TEAM.recruiter.desc}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={styles.formHeader}>
                            <h2 className={styles.formMainTitle}>Let’s get you started</h2>
                            <p className={styles.formSubTitle}>Just a few details to get started</p>
                        </div>

                        <button
                            type="button"
                            className={styles.googleSsoBtn}
                            onClick={handleGoogleLogin}
                        >
                            <svg viewBox="0 0 24 24" width="20" height="20">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Continue with Google
                        </button>

                        <div className={styles.orDivider}>
                            <span className={styles.orLine} />
                            <span className={styles.orText}>or</span>
                            <span className={styles.orLine} />
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleNext();
                            }}
                            className={styles.inputFormStack}
                        >
                            <div className={styles.inputGroup}>
                                <label className={styles.inputLabel}>Name</label>
                                <input
                                    type="text"
                                    className={styles.formInput}
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <label className={styles.inputLabel}>Email</label>
                                <input
                                    type="email"
                                    className={styles.formInput}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <label className={styles.inputLabel}>Password</label>
                                <input
                                    type="password"
                                    className={styles.formInput}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>

                            <button
                                type="submit"
                                className={styles.continueSubmitBtn}
                                disabled={!stepValid}
                            >
                                Continue
                            </button>
                        </form>
                    </>
                )}

                {/* STEP 2: Role selection (matches reference screenshot) */}
                {step === 2 && (
                    <div>
                        <div className={styles.greetingChipRow}>
                            <Image
                                src={TEAM.recruiter.avatar}
                                alt="Recruiter"
                                width={34}
                                height={34}
                                className={styles.greetingCharImg}
                            />
                            <div className={styles.greetingBadge}>
                                Hi, {firstName}
                            </div>
                        </div>

                        <h2 className={styles.stepTitleParabole}>Let’s match you to the right role</h2>
                        <p className={styles.stepSubtitle}>
                            I am ready to find your next gig. What’s your dream title?
                        </p>

                        <div className={styles.searchBoxWrap}>
                            <input
                                type="text"
                                className={styles.searchBoxInput}
                                placeholder="Product"
                                value={roleQuery}
                                onChange={(e) => setRoleQuery(e.target.value)}
                                autoFocus
                            />
                            <MagnifyingGlass size={18} className={styles.searchBoxRightIcon} />
                        </div>

                        <div className={styles.resultsHeaderLabel}>Results</div>

                        <div className={styles.roleResultsList}>
                            {visibleRoles.map((r) => {
                                const selected = selectedRole?.role === r.role;
                                return (
                                    <button
                                        key={r.role}
                                        type="button"
                                        className={`${styles.roleTintRow} ${selected ? styles.roleTintRowSelected : ""}`}
                                        onClick={() => setSelectedRole(r)}
                                    >
                                        <span>{r.role}</span>
                                        {selected && (
                                            <span className={styles.selectedCheckCircle}>
                                                <Check size={12} strokeWidth={3} />
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                            {visibleRoles.length === 0 && (
                                <p className={styles.noResults}>No roles match &quot;{roleQuery}&quot;</p>
                            )}
                        </div>

                        <button
                            type="button"
                            className={styles.continueSubmitBtn}
                            onClick={handleNext}
                            disabled={!stepValid}
                        >
                            Continue
                        </button>
                    </div>
                )}

                {/* STEP 3: Experience level (Career Stage) */}
                {step === 3 && (
                    <div>
                        <div className={styles.greetingChipRow}>
                            <Image
                                src={TEAM.coach.avatar}
                                alt="Interview Coach"
                                width={36}
                                height={36}
                                className={styles.greetingCharImg}
                            />
                            <div className={styles.greetingBadge}>
                                You&apos;ll be a great fit for {selectedRole?.role || "Product Manager"}
                            </div>
                        </div>

                        <h2 className={styles.stepTitleParabole}>what stage of your career are you in?</h2>
                        <p className={styles.stepSubtitle} style={{ marginBottom: "1.5rem" }}>
                            I&apos;ll shape your mock interviews to match where you are in your career and give you great feedback to standout
                        </p>

                        <div className={styles.roleResultsList}>
                            {EXPERIENCE_OPTIONS.map((opt) => {
                                const selected = experience === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        className={`${styles.roleTintRow} ${selected ? styles.roleTintRowSelected : ""}`}
                                        onClick={() => setExperience(opt.value)}
                                    >
                                        <span>{opt.label}</span>
                                        {selected && (
                                            <span className={styles.selectedCheckCircle}>
                                                <Check size={12} strokeWidth={3} />
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            type="button"
                            className={styles.continueSubmitBtn}
                            onClick={handleNext}
                            disabled={!stepValid}
                        >
                            Continue
                        </button>
                    </div>
                )}

                {/* STEP 4: Track Record / Resume, Portfolio, LinkedIn */}
                {step === 4 && (
                    <div>
                        <div className={styles.greetingChipRow}>
                            <Image
                                src={TEAM.recruiter.avatar}
                                alt="Recruiter"
                                width={36}
                                height={36}
                                className={styles.greetingCharImg}
                            />
                            <div className={styles.greetingBadge}>
                                {step4Message}
                            </div>
                        </div>

                        <h2 className={styles.stepTitleParabole}>Give us a quick look at your track record</h2>
                        <p className={styles.stepSubtitle} style={{ marginBottom: "1rem" }}>
                            Share your credentials so I can find the best opportunities for you. If you&apos;re in a hurry, you can skip this and submit them later.
                        </p>

                        <div className={styles.optionalTag}>(Optional)</div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.doc,.docx,.txt,.md"
                            className={styles.hiddenInput}
                            onChange={(e) => handleFile(e.target.files?.[0])}
                        />

                        <div
                            className={styles.uploadDropzone}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <UploadSimple size={22} className={styles.uploadIcon} style={{ marginBottom: "4px" }} />
                            <div className={styles.uploadDropzoneTitle}>
                                {cvName ? cvName : "Drag and drop your resume here,"}
                            </div>
                            <div className={styles.uploadDropzoneTitle} style={{ color: "#4782F6" }}>
                                {cvName ? "Tap to replace file" : "or browse files"}
                            </div>
                            <div className={styles.uploadDropzoneSub}>
                                Supports PDF, DOCX (Max size: 10MB)
                            </div>
                        </div>

                        <div className={styles.inputFormStack}>
                            <div className={styles.inputGroup}>
                                <label className={styles.inputLabel}>
                                    Portfolio <span style={{ fontWeight: 400, color: "#94A3B8" }}>(Optional)</span>
                                </label>
                                <input
                                    type="url"
                                    className={styles.formInput}
                                    value={portfolioUrl}
                                    onChange={(e) => setPortfolioUrl(e.target.value)}
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <label className={styles.inputLabel}>
                                    LinkedIn URL <span style={{ fontWeight: 400, color: "#94A3B8" }}>(Optional)</span>
                                </label>
                                <input
                                    type="url"
                                    className={styles.formInput}
                                    value={linkedinUrl}
                                    onChange={(e) => setLinkedinUrl(e.target.value)}
                                />
                            </div>

                            <button
                                type="button"
                                className={styles.continueSubmitBtn}
                                onClick={finish}
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
