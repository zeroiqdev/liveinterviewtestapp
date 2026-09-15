"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    SignOut,
    Bell,
    ArrowRight,
    House,
    Lightning,
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
import { useInterview } from "../context/InterviewContext";

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
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [stats, setStats] = useState<UserStats | null>(null);

    // Location detection & dynamic jobs state
    const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
    const [jobs, setJobs] = useState<JobItem[]>([]);
    const [selectedJobDesc, setSelectedJobDesc] = useState<JobItem | null>(null);
    const [activeMobileTab, setActiveMobileTab] = useState<"home" | "recruiter" | "coach">("home");
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const { updateSettings } = useInterview();

    useEffect(() => {
        const init = async () => {
            const raw = localStorage.getItem("useladder_user");
            if (!raw) {
                router.push("/onboarding");
                return;
            }
            try {
                const parsed: UserProfile = JSON.parse(raw);
                if (parsed.role && !parsed.roleFamily) {
                    parsed.roleFamily = normalizeUserRoleFamily(parsed.role);
                    parsed.specialization = parsed.role;
                    try {
                        localStorage.setItem("useladder_user", JSON.stringify(parsed));
                    } catch {
                        // Ignore
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

    const handleOpenPayment = useCallback(() => setIsPaymentModalOpen(true), []);
    const handleClosePayment = useCallback(() => setIsPaymentModalOpen(false), []);
    const handleOpenJobDesc = useCallback((job: JobItem) => setSelectedJobDesc(job), []);
    const handleCloseJobDesc = useCallback(() => setSelectedJobDesc(null), []);

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

    // Compute up to 4 matched jobs strictly locked to user's specialization and region
    const displayedJobs = useMemo(() => {
        if (!jobs || jobs.length === 0) return [];
        if (!userLocation) return [];

        const targetFamily = user?.roleFamily || (user?.role ? normalizeUserRoleFamily(user.role) : undefined);

        // Filter strictly by the user's specialization AND regional eligibility
        const matched = jobs.filter((j) => {
            // 1. Regional accessibility check (no overseas-locked roles)
            const locScore = scoreJobForLocation(j.location, userLocation);
            if (locScore === 0) return false;

            // 2. Strict specialization check (NO unrelated roles allowed)
            if (targetFamily) {
                return j.roleFamily === targetFamily || (user?.role ? isJobRoleMatch(j.roleFamily, j.title, user.role) : false);
            }
            return true;
        });

        // Sort by location relevance score descending, then datePosted descending
        matched.sort((a, b) => {
            const scoreB = scoreJobForLocation(b.location, userLocation);
            const scoreA = scoreJobForLocation(a.location, userLocation);
            if (scoreB !== scoreA) return scoreB - scoreA;
            return (b.datePosted || "").localeCompare(a.datePosted || "");
        });

        return matched.slice(0, 15);
    }, [jobs, userLocation, user?.role, user?.roleFamily]);

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
                    <div className={styles.logo}>
                        <div className={styles.logoIcon}>L</div>
                        useladder
                    </div>
                </div>

                <div className={styles.navRight}>
                    <div className={styles.xpBadge}>
                        <Lightning size={14} weight="fill" />
                        {(stats?.averageScore || 0) * 10} Points
                    </div>
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
                    {/* ── Hero / Suggested Interviews Section ── */}
                    <section className={styles.heroSection}>
                        <div className={styles.heroTextBlock}>
                            <span className={styles.heroGreeting}>Welcome back, {userName}</span>
                            <h1 className={styles.heroHeading}>Ready to ace your next<br />interview?</h1>
                            <button
                                className={styles.heroProgressBtn}
                                onClick={handleOpenPayment}
                            >
                                Start Interview <ArrowRight size={16} weight="bold" className={styles.heroProgressArrow} />
                            </button>
                        </div>

                        <div className={styles.moduleCardsScroll}>
                            {dynamicModuleCards.map((card) => (
                                <ModuleCardItem
                                    key={card.number}
                                    card={card}
                                    onSelect={handleOpenPayment}
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
                            onPractice={handleOpenPayment}
                        />

                        <ChatsPanel
                            userRole={user?.role}
                            userRoleFamily={user?.roleFamily}
                            displayedJobs={displayedJobs}
                            onPractice={handleOpenPayment}
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
                                onPractice={handleOpenPayment}
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
                            onPractice={handleOpenPayment}
                        />
                    )}

                    {/* Coach: Separate standalone page for Interview Coach Messages & Drills */}
                    {activeMobileTab === "coach" && (
                        <ChatsPanel
                            userRole={user?.role}
                            userRoleFamily={user?.roleFamily}
                            displayedJobs={displayedJobs}
                            onPractice={handleOpenPayment}
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
                        setSelectedJobDesc(null);
                        setIsPaymentModalOpen(true);
                    }}
                />
            )}

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
