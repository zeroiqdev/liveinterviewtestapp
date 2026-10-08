"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
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
    { title: "UI Designer", domain: "Product & Design" },
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
const MIN_PASSWORD_LENGTH = 8;

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
    const [cvText, setCvText] = useState<string>("");
    const [checkingAuth, setCheckingAuth] = useState(true);
    // Signed in with Google during onboarding: the account already exists and
    // finishing just saves the profile.
    const [googleSignedIn, setGoogleSignedIn] = useState(false);
    // Email sign-up: after submitting, the user enters the emailed code.
    const [awaitingCode, setAwaitingCode] = useState(false);
    const [code, setCode] = useState("");
    const [authError, setAuthError] = useState<string | null>(null);
    const [authInfo, setAuthInfo] = useState<string | null>(null);
    const pendingProfileRef = useRef<Record<string, unknown> | null>(null);
    const codeFormRef = useRef<HTMLFormElement>(null);

    // The code form appears below the step-4 fields; bring it into view.
    useEffect(() => {
        if (awaitingCode) codeFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [awaitingCode]);
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
        let cancelled = false;
        (async () => {
            // Only skip onboarding for a *server-confirmed* session. A stale
            // localStorage profile (expired or missing cookie) used to bounce
            // here → /dashboard → /login while this page rendered nothing.
            let onboardedUser: { role?: string; domain?: string } | null = null;
            try {
                const res = await fetch("/api/auth/me");
                if (res.ok) {
                    const data = await res.json();
                    if (data?.authenticated && data.user) {
                        onboardedUser = data.user;
                        try {
                            localStorage.setItem("useladder_user", JSON.stringify(data.user));
                        } catch { /* ignore */ }
                    }
                } else if (res.status === 401) {
                    localStorage.removeItem("useladder_user");
                } else {
                    // Server-side problem (e.g. database unreachable): fall
                    // back to the locally saved profile.
                    onboardedUser = JSON.parse(localStorage.getItem("useladder_user") || "null");
                }
            } catch {
                try {
                    onboardedUser = JSON.parse(localStorage.getItem("useladder_user") || "null");
                } catch { /* ignore */ }
            }
            if (cancelled) return;

            if (onboardedUser?.domain && onboardedUser?.role) {
                router.replace("/dashboard");
                // Never leave a blank page if navigation stalls.
                setTimeout(() => {
                    if (!cancelled) setCheckingAuth(false);
                }, 4000);
                return;
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
        })();
        return () => {
            cancelled = true;
        };
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
        (step === 1 &&
            fullName.trim().length >= 2 &&
            EMAIL_RE.test(email.trim()) &&
            // Email sign-ups need a password; Google sign-ups skip this step.
            password.trim().length >= MIN_PASSWORD_LENGTH) ||
        (step === 2 && !!selectedRole) ||
        (step === 3 && !!experience) ||
        step === 4;

    const handleFile = (file: File | undefined) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            const result = typeof reader.result === "string" ? reader.result : "";
            const payload = result.startsWith("data:") ? result.split(",")[1] || "" : result;
            setCvData(payload);
            setCvName(file.name);

            // Extract plain text via /api/resume/parse
            try {
                const parseRes = await fetch("/api/resume/parse", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        fileData: result,
                        resumeText: file.type.startsWith("text/") ? result : "",
                        resumeName: file.name,
                    }),
                });
                const parseData = await parseRes.json();
                if (parseData.success && parseData.text) {
                    setCvText(parseData.text);
                } else if (file.type.startsWith("text/")) {
                    setCvText(result);
                }
            } catch {
                if (file.type.startsWith("text/")) setCvText(result);
            }
        };
        if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
            reader.readAsText(file);
        } else {
            reader.readAsDataURL(file);
        }
    };

    const [submitting, setSubmitting] = useState(false);
    const [googleAuthLoading, setGoogleAuthLoading] = useState(false);

    // Load Google Identity Services script
    useEffect(() => {
        const scriptId = "google-gsi-client";
        if (!document.getElementById(scriptId)) {
            const script = document.createElement("script");
            script.id = scriptId;
            script.src = "https://accounts.google.com/gsi/client";
            script.async = true;
            script.defer = true;
            document.body.appendChild(script);
        }
    }, []);

    const finish = async () => {
        if (submitting) return;
        setSubmitting(true);
        const domainVal = selectedRole?.domain || "Software & Engineering";
        const roleVal = selectedRole?.role || "Software Engineer";

        let existing: { id?: string; resumes?: { id: string; name: string; data: string; rawText?: string }[] } = {};
        try {
            existing = JSON.parse(localStorage.getItem("useladder_user") || "{}");
        } catch { /* ignore */ }

        const resumes = [...(existing.resumes || [])];
        let selectedResumeId: string | undefined;
        const cleanResumeText = cvText || (cvData && !cvData.startsWith("data:") && cvData.length < 50000 ? cvData : "");

        if (cvData && cvName) {
            selectedResumeId = `cv_${Date.now()}`;
            resumes.push({
                id: selectedResumeId,
                name: cvName,
                data: cvData,
                rawText: cleanResumeText,
            });
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

        setAuthError(null);
        try {
            // Signed out this creates the account and emails a code; signed in
            // (Google) it saves the profile on the existing account.
            const res = await fetch("/api/auth/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: userProfile.email,
                    name: userProfile.name,
                    role: userProfile.role,
                    domain: userProfile.domain,
                    seniority: userProfile.seniority,
                    experienceInRole: userProfile.experienceInRole,
                    password: googleSignedIn ? undefined : password.trim(),
                    portfolioUrl: userProfile.portfolioUrl,
                    linkedinUrl: userProfile.linkedinUrl,
                    resume: selectedResumeId && cvData && cvName ? {
                        id: selectedResumeId,
                        name: cvName,
                        rawText: cleanResumeText,
                        score: 80,
                    } : undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                throw new Error(data.error || "Could not create your account. Please try again.");
            }
            pendingProfileRef.current = { ...userProfile, ...(data.user || {}), onboarded: true };

            if (data.verificationRequired) {
                setAwaitingCode(true);
                setCode("");
                setAuthInfo(data.message || `We've emailed a 6-digit code to ${userProfile.email}.`);
                setSubmitting(false);
                return;
            }
            completeOnboarding();
        } catch (err) {
            setAuthError(err instanceof Error ? err.message : "Could not create your account. Please try again.");
            setSubmitting(false);
        }
    };

    const completeOnboarding = (serverUser?: Record<string, unknown>) => {
        const profile = { ...(pendingProfileRef.current || {}), ...(serverUser || {}), onboarded: true };
        localStorage.setItem("useladder_user", JSON.stringify(profile));
        updateSettings({
            domain: (selectedRole?.domain || "Software & Engineering"),
            role: (selectedRole?.role || "Software Engineer") as InterviewRole,
        });
        router.replace("/dashboard");
    };

    const verifyCode = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (submitting || code.length !== 6) return;
        setSubmitting(true);
        setAuthError(null);
        try {
            const res = await fetch("/api/auth/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // The password proves this browser made the sign-up, so it is kept.
                body: JSON.stringify({ email: email.trim(), code, password: password.trim() }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) throw new Error(data.error || "That code didn't work. Please try again.");
            completeOnboarding(data.user);
        } catch (err) {
            setAuthError(err instanceof Error ? err.message : "That code didn't work. Please try again.");
            setSubmitting(false);
        }
    };

    const resendCode = async () => {
        setAuthError(null);
        try {
            const res = await fetch("/api/auth/verify/resend", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim() }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) throw new Error(data.error || "Could not resend the code");
            setAuthInfo("We've sent a new code. It may take a minute to arrive.");
        } catch (err) {
            setAuthError(err instanceof Error ? err.message : "Could not resend the code");
        }
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
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        setAuthError(null);

        if (!clientId || !window.google?.accounts?.oauth2) {
            setAuthError("Google sign-in isn't available right now. Please sign up with your email instead.");
            return;
        }

        setGoogleAuthLoading(true);
        try {
            const tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: "email profile openid",
                callback: async (tokenRes: { access_token?: string; error?: string }) => {
                    if (tokenRes.error || !tokenRes.access_token) {
                        setGoogleAuthLoading(false);
                        if (tokenRes.error !== "popup_closed_by_user") {
                            setAuthError("Google sign-in was canceled or failed. Please try again.");
                        }
                        return;
                    }
                    try {
                        // The server verifies the token with Google and signs the user in.
                        const res = await fetch("/api/auth/google", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ accessToken: tokenRes.access_token }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok || data.error) throw new Error(data.error || "Google sign-in failed");

                        localStorage.setItem("useladder_user", JSON.stringify(data.user));
                        if (!data.isNewUser) {
                            router.replace("/dashboard");
                            return;
                        }

                        setGoogleSignedIn(true);
                        setFullName(data.user.name || "");
                        setEmail(data.user.email || "");
                        setStep(2);
                    } catch (err) {
                        setAuthError(err instanceof Error ? err.message : "Google sign-in failed");
                    } finally {
                        setGoogleAuthLoading(false);
                    }
                },
            });
            tokenClient.requestAccessToken({ prompt: "select_account" });
        } catch (err) {
            console.warn("GIS oauth2 init failed:", err);
            setAuthError("Google sign-in failed to start. Please try again.");
            setGoogleAuthLoading(false);
        }
    };

    const handleBack = () => {
        if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3 | 4);
    };

    if (checkingAuth) return null;

    return (
        <div className={styles.splitWrapper}>
            {/* ════════ LEFT HERO PANEL ════════ */}
            <div className={styles.leftHeroPanel}>

                <div className={styles.leftHeroCenter}>
                    <h1 className={styles.welcomeHeading}>
                        <span className={styles.welcomeRow}>
                            Welcome
                            <svg className={styles.sparkleIcon} viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
                            </svg>
                        </span>
                        <span>to get prepped</span>
                    </h1>
                    <p className={styles.lockInSubtitle}>
                        Let’s lock in
                    </p>
                </div>

                <div />
            </div>

            {/* ════════ RIGHT CONTENT PANEL ════════ */}
            <div className={styles.rightContentPanel}>

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

                {authError && !awaitingCode && (
                    <div className={styles.authErrorBanner} role="alert">
                        <span>{authError}</span>
                    </div>
                )}

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
                            disabled={googleAuthLoading}
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
                                <label className={styles.inputLabel}>
                                    Password{" "}
                                    <span style={{ fontWeight: 400, color: "#94A3B8" }}>
                                        ({MIN_PASSWORD_LENGTH}+ characters, or use Continue with Google)
                                    </span>
                                </label>
                                <input
                                    type="password"
                                    className={styles.formInput}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="new-password"
                                    minLength={MIN_PASSWORD_LENGTH}
                                    required
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

                        <p className={styles.switchAuthPrompt}>
                            Already have an account?{" "}
                            <Link href="/login" className={styles.switchAuthLink}>
                                Sign in
                            </Link>
                        </p>
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

                            {!awaitingCode && (
                                <button
                                    type="button"
                                    className={styles.continueSubmitBtn}
                                    onClick={finish}
                                    disabled={submitting}
                                >
                                    {submitting ? "Creating your account..." : "Continue"}
                                </button>
                            )}
                        </div>

                        {awaitingCode && (
                            <form ref={codeFormRef} onSubmit={verifyCode} className={styles.inputFormStack} style={{ marginTop: "1.5rem" }}>
                                {authError ? (
                                    <div className={styles.authErrorBanner} role="alert">
                                        <span>{authError}</span>
                                    </div>
                                ) : authInfo && (
                                    <div className={styles.authInfoBanner} role="status">
                                        <span>{authInfo}</span>
                                    </div>
                                )}
                                <div className={styles.inputGroup}>
                                    <label className={styles.inputLabel} htmlFor="signup-code">Verification code</label>
                                    <input
                                        id="signup-code"
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        maxLength={6}
                                        className={`${styles.formInput} ${styles.codeInput}`}
                                        placeholder="123456"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                        autoComplete="one-time-code"
                                        autoFocus
                                        required
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className={styles.continueSubmitBtn}
                                    disabled={submitting || code.length !== 6}
                                >
                                    {submitting ? "Verifying..." : "Verify & continue"}
                                </button>
                                <button type="button" className={styles.textLinkBtn} onClick={resendCode}>
                                    Resend code
                                </button>
                            </form>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
