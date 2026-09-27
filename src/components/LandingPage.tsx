"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Image from "next/image";
import {
    Play,
    ArrowRight
} from "@phosphor-icons/react";
import styles from "./landing.module.css";

const TICKER_ITEMS = [
    { word: "Offers", color: "#10B981" },
    { word: "Confidence", color: "#4782F6" },
    { word: "Feedback", color: "#F59E0B" },
    { word: "Mastery", color: "#8B5CF6" },
    { word: "Outcomes", color: "#06B6D4" },
];

const CALIBRATED_COMPANIES = [
    { id: "google", name: "Google" },
    { id: "meta", name: "Meta" },
    { id: "apple", name: "Apple" },
    { id: "amazon", name: "Amazon" },
    { id: "microsoft", name: "Microsoft" },
    { id: "netflix", name: "Netflix" },
    { id: "stripe", name: "Stripe" },
    { id: "airbnb", name: "Airbnb" },
    { id: "uber", name: "Uber" },
    { id: "spotify", name: "Spotify" },
    { id: "figma", name: "Figma" },
    { id: "tesla", name: "Tesla" },
    { id: "openai", name: "OpenAI" },
    { id: "github", name: "GitHub" },
    { id: "reddit", name: "Reddit" },
    { id: "coinbase", name: "Coinbase" },
    { id: "databricks", name: "Databricks" },
    { id: "doordash", name: "DoorDash" },
    { id: "adobe", name: "Adobe" },
    { id: "salesforce", name: "Salesforce" },
    { id: "linkedin", name: "LinkedIn" },
    { id: "slack", name: "Slack" },
    { id: "nvidia", name: "NVIDIA" },
    { id: "tiktok", name: "TikTok" },
    { id: "discord", name: "Discord" },
    { id: "dropbox", name: "Dropbox" },
    { id: "notion", name: "Notion" },
    { id: "x", name: "X" },
];

const BENCHMARK_JOBS = [
    {
        id: "stripe-swe",
        company: "Stripe",
        logo: "/companies/stripe.svg",
        title: "Senior Software Engineer",
        location: "San Francisco, CA (Remote)",
        salary: "$190k – $245k",
        barWidth: "99.0%",
        score: "99.0%",
        isTop: true,
    },
    {
        id: "openai-mts",
        company: "OpenAI",
        logo: "/companies/openai.svg",
        title: "Member of Technical Staff",
        location: "San Francisco, CA",
        salary: "$240k – $320k",
        barWidth: "97.7%",
        score: "97.7%",
        isTop: false,
    },
    {
        id: "google-swe",
        company: "Google",
        logo: "/companies/google.svg",
        title: "Staff Frontend Engineer",
        location: "Mountain View, CA (Hybrid)",
        salary: "$210k – $275k",
        barWidth: "92.8%",
        score: "92.8%",
        isTop: false,
    },
    {
        id: "airbnb-pm",
        company: "Airbnb",
        logo: "/companies/airbnb.svg",
        title: "Senior Product Manager",
        location: "Remote",
        salary: "$185k – $230k",
        barWidth: "84.0%",
        score: "84.0%",
        isTop: false,
    },
    {
        id: "meta-em",
        company: "Meta",
        logo: "/companies/meta.svg",
        title: "Engineering Manager",
        location: "Menlo Park, CA (Hybrid)",
        salary: "$230k – $310k",
        barWidth: "70.0%",
        score: "70.0%",
        isTop: false,
    },
];

export default function LandingPage() {
    const benchmarkRef = useRef<HTMLElement>(null);
    const whoWeAreRef = useRef<HTMLElement>(null);
    const bentoWrapperRef = useRef<HTMLElement>(null);
    const [benchmarkVisible, setBenchmarkVisible] = useState(false);
    const [bentoProgress, setBentoProgress] = useState(0);
    const [bentoStickyTop, setBentoStickyTop] = useState<number | null>(null);
    const [bentoPast, setBentoPast] = useState(false);
    const [whoWeAreLinesActive, setWhoWeAreLinesActive] = useState(false);
    const [tickerIndex, setTickerIndex] = useState(0);
    const [activePracticeMode, setActivePracticeMode] = useState<'guided' | 'real'>('guided');

    useEffect(() => {
        document.documentElement.setAttribute('data-recent-cursor', 'true');
        return () => {
            document.documentElement.removeAttribute('data-recent-cursor');
        };
    }, []);

    useEffect(() => {
        const el = benchmarkRef.current;
        if (!el) return;

        const handleCheck = () => {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            // Reveal as soon as the section top enters within 85% of viewport
            if (rect.top <= window.innerHeight * 0.85) {
                setBenchmarkVisible(true);
            } else if (rect.top > window.innerHeight) {
                setBenchmarkVisible(false);
            }
        };

        // Check on mount
        handleCheck();

        // Scroll listener for immediate real-time response
        window.addEventListener("scroll", handleCheck, { passive: true });
        window.addEventListener("resize", handleCheck, { passive: true });

        // IntersectionObserver with positive intersection check
        const obs = new IntersectionObserver(
            ([entry]) => {
                if (entry && entry.isIntersecting) {
                    setBenchmarkVisible(true);
                } else if (entry && entry.boundingClientRect.top > window.innerHeight) {
                    setBenchmarkVisible(false);
                }
            },
            { threshold: 0.1 }
        );
        obs.observe(el);

        return () => {
            window.removeEventListener("scroll", handleCheck);
            window.removeEventListener("resize", handleCheck);
            obs.disconnect();
        };
    }, []);

    useEffect(() => {
        const benchmarkEl = benchmarkRef.current;
        if (!benchmarkEl) return;

        const onScroll = () => {
            const bRect = benchmarkEl.getBoundingClientRect();
            const windowH = window.innerHeight;
            // Benchmark sheet moves from windowH (bottom of viewport) up to 0 (fully covering Bento)
            const progress = Math.min(1, Math.max(0, (windowH - bRect.top) / windowH));
            setBentoProgress(progress);
            // Hide bento once benchmark has fully taken over and reached top of viewport
            setBentoPast(bRect.top <= 0);
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });
        onScroll();
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, []);

    useEffect(() => {
        const el = bentoWrapperRef.current;
        if (!el) return;

        const updateBentoTop = () => {
            if (!el) return;
            const diff = window.innerHeight - el.offsetHeight;
            setBentoStickyTop(Math.min(0, diff));
        };

        updateBentoTop();

        const ro = new ResizeObserver(updateBentoTop);
        ro.observe(el);

        window.addEventListener("resize", updateBentoTop);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", updateBentoTop);
        };
    }, []);


    useEffect(() => {
        const interval = setInterval(() => {
            setTickerIndex((prev) => (prev + 1) % TICKER_ITEMS.length);
        }, 2400);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        let ticking = false;

        const handleScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const el = whoWeAreRef.current;
                    if (!el) {
                        ticking = false;
                        return;
                    }

                    const scrollY = window.scrollY;
                    const rect = el.getBoundingClientRect();
                    const windowH = window.innerHeight;

                    // When at the hero section or scrolling back up to it:
                    // The lines and fill MUST NOT be applied (stay in outline/hidden state)
                    if (scrollY < 80 || rect.top > windowH * 0.8) {
                        setWhoWeAreLinesActive(false);
                    } else if (rect.top <= windowH * 0.68 && scrollY >= 100) {
                        // When scrolling down into the Who We Are section:
                        setWhoWeAreLinesActive(true);
                    }

                    ticking = false;
                });
                ticking = true;
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleScroll, { passive: true });

        // Initial check on mount: guarantees lines are not applied while on hero
        handleScroll();

        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleScroll);
        };
    }, []);

    const [countdownSeconds, setCountdownSeconds] = useState(160);

    useEffect(() => {
        const timer = setInterval(() => {
            setCountdownSeconds((prev) => (prev > 0 ? prev - 1 : 180));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const formatCountdown = (totalSecs: number) => {
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    return (
        <div className={styles.page}>
            {/* ── Nav ── */}
            <header className={styles.nav}>
                <div className={styles.navInner}>
                    <a href="#top" className={styles.logo}>
                        <div className={styles.logoMark}>
                            <img
                                src="https://res.cloudinary.com/dyg7neetr/image/upload/v1790510817/Vector_10_thljja.png"
                                alt="get prepped"
                                className={styles.logoImg}
                            />
                        </div>
                        <span className={styles.logoType}>get prepped</span>
                    </a>
                    <nav className={styles.navLinks}>
                        <a href="#products">Products</a>
                        <a href="/pricing">Pricing</a>
                        <a href="#resources">Resources</a>
                    </nav>
                    <div className={styles.navActions}>
                        <a href="/onboarding" className={styles.navCta}>Practice</a>
                    </div>
                </div>
            </header>

            {/* ── Hero ── */}
            <section className={styles.hero}>
                <div className={styles.heroFrame}>
                    <video
                        src="https://res.cloudinary.com/dyg7neetr/video/upload/v1790187325/16508214_3840_2160_30fps_mzg1hs.mp4"
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="auto"
                        poster="https://res.cloudinary.com/dyg7neetr/image/upload/v1790181121/e913cd8fa1dc985d6423518f84b4c1d4_u94p8g.jpg"
                        className={styles.heroVideo}
                    />
                    <div className={styles.heroOverlay} aria-hidden="true" />
                    <div className={styles.heroInner}>
                        <h1 className={styles.heroTitle}>
                            <span className={styles.heroNoWrap}>Big career moves</span><br className={styles.heroDesktopBr} />
                            <span>start with showing up prepared.</span>
                        </h1>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            whoWeAreRef.current?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className={styles.scrollIndicator}
                        aria-label="Learn more, scroll to next section"
                    >
                        <span className={styles.scrollText}>Learn more</span>
                        <span className={styles.scrollArrow} aria-hidden="true">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 5v14M19 12l-7 7-7-7" />
                            </svg>
                        </span>
                    </button>
                </div>
            </section>

            {/* ── Who We Are Section (Reference Replica) ── */}
            <section id="products" ref={whoWeAreRef} className={`${styles.whoWeAreSection} ${whoWeAreLinesActive ? styles.linesActive : ''}`}>
                <div className={styles.whoWeAreHeader}>
                    {/* SVG Filters to eliminate variable font contour intersections (e.g. crossbars in 'e' and 't') */}
                    <svg width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }} aria-hidden="true">
                        <defs>
                            <filter id="cleanTitleOutline" x="-20%" y="-20%" width="140%" height="140%">
                                <feMorphology in="SourceAlpha" result="eroded" operator="erode" radius="1.5" />
                                <feComposite in="SourceAlpha" in2="eroded" operator="out" result="outline" />
                                <feFlood floodColor="rgba(38, 40, 42, 0.45)" result="color" />
                                <feComposite in="color" in2="outline" operator="in" />
                            </filter>
                            <filter id="cleanTitleOutlineAccent" x="-20%" y="-20%" width="140%" height="140%">
                                <feMorphology in="SourceAlpha" result="eroded" operator="erode" radius="1.5" />
                                <feComposite in="SourceAlpha" in2="eroded" operator="out" result="outline" />
                                <feFlood floodColor="#4782F6" result="color" />
                                <feComposite in="color" in2="outline" operator="in" />
                            </filter>
                        </defs>
                    </svg>


                    <h2 className={styles.whoWeAreTitle} aria-label="Get closer to your dream offer with every practice session.">
                        {/* Base outline layer (visible as an outline) */}
                        <span className={styles.whoWeAreTitleOutline} aria-hidden="true">
                            <span className={styles.whoWeAreTitleLine}>Get closer to your dream offer</span>
                            <span className={`${styles.whoWeAreTitleLine} ${styles.whoWeAreTitleAccent}`}>
                                with every practice session.
                            </span>
                        </span>

                        {/* Color fill layer (reveals slowly as user scrolls into section) */}
                        <span className={styles.whoWeAreTitleFill} aria-hidden="true">
                            <span className={styles.whoWeAreTitleLine}>Get closer to your dream offer</span>
                            <span className={`${styles.whoWeAreTitleLine} ${styles.whoWeAreTitleAccent}`}>
                                with every practice session.
                            </span>
                        </span>
                    </h2>
                </div>

                <div className={styles.whoWeAreDivider} aria-hidden="true" />

                <div className={styles.whoWeAreGrid}>
                    <div className={styles.whoWeAreMediaCol}>
                        <img
                            src="https://res.cloudinary.com/dyg7neetr/image/upload/c_crop,h_725,w_736,x_0,y_0/v1790246088/0eea607fc451a0100a8ddce0fa93aa2f_1_tmkkli.jpg"
                            alt="The Get Prepped Team"
                            className={styles.whoWeAreImage}
                        />
                    </div>
                    <div className={styles.whoWeAreVerticalLine} aria-hidden="true" />
                    <div className={styles.whoWeAreContentCol}>
                        <h3 className={styles.whoWeAreSubheading}>
                            Stop winging your interviews.
                        </h3>
                        <p className={styles.whoWeAreParagraph}>
                            Get Prepped recreates the pressure and structure of a real interview, walking you through the questions you are likely to face for your target role and giving you quality feedback to help you communicate your experience, strengths, and value clearly to recruiters.
                        </p>
                    </div>
                </div>

                <div className={styles.whoWeAreBottomDivider} aria-hidden="true" />
            </section>

            {/* ── Scale-style Bento / Features Section (Reference Replica) ── */}
            <section
                id="features"
                ref={bentoWrapperRef}
                className={`${styles.scaleBentoWrapper} ${bentoPast ? styles.scaleBentoHidden : ''}`}
                style={bentoStickyTop !== null ? { top: `${bentoStickyTop}px` } : undefined}
            >
                <div
                    className={styles.scaleBentoInner}
                    style={{
                        transform: `scale(${1 - bentoProgress * 0.08}) translateY(${bentoProgress * 20}px)`,
                        opacity: 1 - bentoProgress * 0.45,
                        filter: `brightness(${1 - bentoProgress * 0.15})`,
                    }}
                >
                        <div className={styles.scaleBentoSection}>
                            <div className={styles.bentoSpecHeader}>
                                <h2 className={styles.bentoSpecTitle}>
                                    How it works
                                </h2>
                            </div>

                            <div className={styles.bentoSpecList}>
                                <div className={styles.bentoSpecRow}>
                                    <div className={styles.bentoSpecItem}>
                                        <span className={styles.bentoSpecNumber}>01</span>
                                        <div className={styles.bentoSpecContent}>
                                            <h3 className={styles.bentoSpecHeading}>Pick your role</h3>
                                            <p className={styles.bentoSpecDesc}>
                                                Choose what you are preparing for, from customer service and sales to banking, virtual assistance, engineering, and more.
                                            </p>
                                        </div>
                                    </div>
                                    <div className={styles.bentoSpecItem}>
                                        <span className={styles.bentoSpecNumber}>02</span>
                                        <div className={styles.bentoSpecContent}>
                                            <h3 className={styles.bentoSpecHeading}>Choose how you want to practice</h3>
                                            <p className={styles.bentoSpecDesc}>
                                                Use interactive practice when you want coaching along the way, or live interview when you want to see how you would perform without interruptions.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.bentoSpecRow}>
                                    <div className={styles.bentoSpecItem}>
                                        <span className={styles.bentoSpecNumber}>03</span>
                                        <div className={styles.bentoSpecContent}>
                                            <h3 className={styles.bentoSpecHeading}>Have a real conversation</h3>
                                            <p className={styles.bentoSpecDesc}>
                                                The recruiter does not follow a fixed list of questions. It listens to your answers and asks relevant follow-ups based on what you actually say.
                                            </p>
                                        </div>
                                    </div>
                                    <div className={styles.bentoSpecItem}>
                                        <span className={styles.bentoSpecNumber}>04</span>
                                        <div className={styles.bentoSpecContent}>
                                            <h3 className={styles.bentoSpecHeading}>Know exactly what to improve</h3>
                                            <p className={styles.bentoSpecDesc}>
                                                After the interview, your coach reviews your responses, highlights what worked, identifies what needs work, and gives you practical ways to improve before your next attempt.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.bentoSpecRow}>
                                    <div className={styles.bentoSpecItem}>
                                        <span className={styles.bentoSpecNumber}>05</span>
                                        <div className={styles.bentoSpecContent}>
                                            <h3 className={styles.bentoSpecHeading}>Refine and re-attempt</h3>
                                            <p className={styles.bentoSpecDesc}>
                                                Put your coach&apos;s feedback into practice by re-running challenging questions and polishing your answers until they flow effortlessly.
                                            </p>
                                        </div>
                                    </div>
                                    <div className={styles.bentoSpecItem}>
                                        <span className={styles.bentoSpecNumber}>06</span>
                                        <div className={styles.bentoSpecContent}>
                                            <h3 className={styles.bentoSpecHeading}>Track progress and land the offer</h3>
                                            <p className={styles.bentoSpecDesc}>
                                                Track your progress across sessions as your scores improve, so you can see where you are getting better, where you still need work, and when you are ready for the live interview.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

            {/* ── Benchmark Section – replica of Scale cards ── */}
            <section
                id="benchmark"
                ref={benchmarkRef}
                className={`${styles.benchmarkSection} ${styles.benchmarkReveal} ${benchmarkVisible ? styles.benchmarkRevealActive : ''}`}
            >
                <div className={styles.benchmarkInner}>
                    <h2 className={styles.benchmarkTitle}>
                        Meet your interview team
                    </h2>
                    <div className={styles.benchmarkGrid}>
                        {/* Card 1 – The Recruiter */}
                        <div className={styles.benchmarkCard}>
                            <div className={styles.benchmarkCharacterBadge}>
                                <img
                                    src="/char2.png"
                                    alt="The Recruiter"
                                    className={styles.benchmarkCharacterImg}
                                />
                            </div>
                            <div className={styles.benchmarkCardContent}>
                                <h3 className={styles.benchmarkCardTitle}>
                                    The Recruiter
                                </h3>
                                <p className={styles.benchmarkCardBody}>
                                    The Recruiter conducts your interview, asks role-specific questions, follows up on your responses, and evaluates your answers against what the role requires. Once the interview is complete, your responses are passed to the coach for detailed feedback and guidance on how to improve.
                                </p>
                            </div>
                            <div className={styles.benchmarkCardFooter}>
                                <a href="/onboarding" className={styles.benchmarkBtn}>Learn More</a>
                            </div>
                        </div>

                        {/* Card 2 – The Coach */}
                        <div className={styles.benchmarkCard}>
                            <div className={styles.benchmarkCharacterBadge}>
                                <img
                                    src="/char1.png"
                                    alt="The Coach"
                                    className={styles.benchmarkCharacterImg}
                                />
                            </div>
                            <div className={styles.benchmarkCardContent}>
                                <h3 className={styles.benchmarkCardTitle}>
                                    The Coach
                                </h3>
                                <p className={styles.benchmarkCardBody}>
                                    The Coach gives you detailed feedback after every interview, helps you improve how you communicate your experience, and gives you weekly career tips and reviews your resume to help you present your experience more clearly and strengthen your applications.
                                </p>
                            </div>
                            <div className={styles.benchmarkCardFooter}>
                                <a href="/onboarding" className={styles.benchmarkBtn}>Learn More</a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Two ways to practice (Ondo-style cards section) ── */}
            <section id="practice-modes" className={styles.twoWaysSection}>
                <div className={styles.twoWaysInner}>
                    <div className={styles.twoWaysHeader}>
                        <h2 className={styles.twoWaysTitle}>Two ways to practice</h2>
                    </div>

                    <div className={styles.twoWaysGrid}>
                        {/* ── Left Column: Mode Selector Cards ── */}
                        <div className={styles.twoWaysModeCol}>
                            {activePracticeMode === 'guided' ? (
                                <>
                                    {/* Expanded: Interactive practice */}
                                    <div className={styles.twoWaysExpandedCard}>
                                        <div className={styles.twoWaysCardTop}>
                                            <h3 className={styles.twoWaysCardHeading}>Interactive practice</h3>
                                            <p className={styles.twoWaysTagline}>Get feedback as you go.</p>
                                            <p className={styles.twoWaysCardBody}>
                                                Your coach gives you instant feedback after every answer, with suggestions and the chance to try again.
                                            </p>
                                        </div>
                                        <div className={styles.twoWaysCardFooter}>
                                            <div className={styles.twoWaysAvatarGroup}>
                                                <img src="/char1.png" alt="Coach" className={styles.twoWaysAvatarCoin} />
                                                <img src="/char2.png" alt="Recruiter" className={styles.twoWaysAvatarCoin} />
                                            </div>
                                            <a href="/onboarding" className={styles.twoWaysActionBtn}>
                                                Discover Interactive practice
                                            </a>
                                        </div>
                                    </div>

                                    {/* Collapsed: Live interview */}
                                    <button
                                        type="button"
                                        onClick={() => setActivePracticeMode('real')}
                                        className={styles.twoWaysCollapsedCard}
                                        aria-label="Switch to Live interview"
                                    >
                                        <span className={styles.twoWaysCollapsedTitle}>Live interview</span>
                                    </button>
                                </>
                            ) : (
                                <>
                                    {/* Collapsed: Interactive practice */}
                                    <button
                                        type="button"
                                        onClick={() => setActivePracticeMode('guided')}
                                        className={styles.twoWaysCollapsedCard}
                                        aria-label="Switch to Interactive practice"
                                    >
                                        <span className={styles.twoWaysCollapsedTitle}>Interactive practice</span>
                                    </button>

                                    {/* Expanded: Live interview */}
                                    <div className={styles.twoWaysExpandedCard}>
                                        <div className={styles.twoWaysCardTop}>
                                            <h3 className={styles.twoWaysCardHeading}>Live interview</h3>
                                            <p className={styles.twoWaysTagline}>See how you would perform for real.</p>
                                            <p className={styles.twoWaysCardBody}>
                                                A complete interview with no interruptions or coaching, just you and the recruiter from the first question to the last.
                                            </p>
                                        </div>
                                        <div className={styles.twoWaysCardFooter}>
                                            <div className={styles.twoWaysAvatarGroup}>
                                                <img src="/char1.png" alt="Coach" className={styles.twoWaysAvatarCoin} />
                                                <img src="/char2.png" alt="Recruiter" className={styles.twoWaysAvatarCoin} />
                                            </div>
                                            <a href="/onboarding" className={styles.twoWaysActionBtn}>
                                                Discover Live interview
                                            </a>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* ── Right Column: Rich Preview Cards (matching screenshot) ── */}
                        <div className={styles.twoWaysPreviewCol}>
                            {/* Card 1: Top Session Preview Card with Dashed Grid Lines */}
                            <div className={styles.twoWaysTopPreviewCard}>
                                <div className={styles.twoWaysTopHeader}>
                                    <div>
                                        <p className={styles.twoWaysSmallLabel}>
                                            {activePracticeMode === 'guided' ? 'Instant Feedback' : 'Uninterrupted Simulation'}
                                        </p>
                                        <div className={styles.twoWaysAccentLine} />
                                    </div>
                                </div>

                                <div className={styles.twoWaysChartBackground}>
                                    <div className={styles.twoWaysDashedLine} />
                                    <div className={styles.twoWaysDashedLine} />
                                    <div className={styles.twoWaysDashedLine} />
                                    <div className={styles.twoWaysDashedLine} />
                                    <div className={styles.twoWaysDashedLine} />
                                    <div className={styles.twoWaysDashedLine} />
                                    <div className={styles.twoWaysDashedLine} />
                                </div>

                                <div className={styles.twoWaysSimulationBox}>
                                    {activePracticeMode === 'guided' ? (
                                        <div className={styles.twoWaysSimContent}>
                                            <div className={styles.twoWaysQuestionPill}>
                                                <span className={styles.twoWaysQText}>“Tell me about a time you had to pivot a strategy when unexpected data surfaced.”</span>
                                            </div>
                                            <div className={styles.twoWaysCoachCallout}>
                                                <div className={styles.twoWaysCoachHead}>
                                                    <img src="/char1.png" alt="Coach" className={styles.twoWaysCalloutImg} />
                                                    <strong>The Coach</strong>
                                                </div>
                                                <p className={styles.twoWaysCalloutText}>
                                                    “Great STAR structure! Emphasize the quantifiable metrics you achieved post-pivot to make your leadership impact clear.”
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={styles.twoWaysSimContent}>
                                            <div className={styles.twoWaysQuestionPill}>
                                                <span className={styles.twoWaysQText}>“Walk me through your system architecture design under 100k requests/sec.”</span>
                                            </div>
                                            <div className={styles.twoWaysTimerRow}>
                                                <div className={styles.twoWaysTimerBox}>
                                                    <div className={styles.twoWaysTimerHeader}>
                                                        <span className={styles.twoWaysTimerDot} />
                                                        <span>Timer</span>
                                                    </div>
                                                    <strong>{formatCountdown(countdownSeconds)} <span className={styles.twoWaysTimerTotal}>/ 03:00</span></strong>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Cards 2 & 3: Bottom Row Grid (Assets Grid + Stepped Blue Bar Chart) */}
                            <div className={styles.twoWaysBottomGrid}>
                                {/* Left Card: Number of Assets / Calibrated Roles */}
                                <div className={styles.twoWaysGridCard}>
                                    <p className={styles.twoWaysCardLabel}>
                                        {activePracticeMode === 'guided' ? 'Critical Evaluation' : 'Calibrated Companies'}
                                    </p>
                                    {activePracticeMode === 'guided' ? (
                                        <div className={styles.twoWaysCritEvalMedia}>
                                            <img
                                                src="/critical-evaluation.jpg"
                                                alt="Critical Evaluation"
                                                className={styles.twoWaysCritEvalImg}
                                            />
                                        </div>
                                    ) : (
                                        <>
                                            <h4 className={styles.twoWaysBigNumber}>40+</h4>
                                            
                                            <div className={styles.twoWaysTilesGrid}>
                                                {CALIBRATED_COMPANIES.map((c) => (
                                                    <div
                                                        key={c.id}
                                                        className={styles.twoWaysTileItem}
                                                        title={c.name}
                                                    >
                                                        <img
                                                            src={`/companies/${c.id}.svg`}
                                                            alt={c.name}
                                                            className={styles.twoWaysCompanyLogo}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Right Card: Readiness Assessment */}
                                <div className={styles.twoWaysChartCard}>
                                    <p className={styles.twoWaysCardLabel}>Readiness Assessment</p>
                                    <div className={styles.twoWaysCritEvalMedia}>
                                        <img
                                            src="/readiness-assessment.jpg"
                                            alt="Readiness Assessment"
                                            className={styles.twoWaysCritEvalImg}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Live Job Opportunities Section (matching reference screenshot) ── */}
            <section id="job-opportunities" className={styles.jobsBenchmarkSection}>
                <div className={styles.jobsBenchmarkInner}>
                    <div className={styles.jobsBenchmarkHeader}>
                        <h2 className={styles.jobsBenchmarkTitle}>Practice for real opportunities</h2>
                        <p className={styles.jobsBenchmarkLead}>
                            Find opportunities that fit you, then practice for the interview.
                        </p>
                        <p className={styles.jobsBenchmarkSubtitle}>
                            Choose the role you are interested in and upload your resume. Get prepped uses your experience to find relevant job postings that match your background and build a tailored interview from the job posting.
                        </p>
                    </div>

                    <div className={styles.jobsBenchmarkTable}>
                        {BENCHMARK_JOBS.map((job) => (
                            <div key={job.id} className={styles.jobsBenchmarkRow}>
                                <div className={styles.jobsBenchmarkIdentity}>
                                    <div className={styles.jobsBenchmarkLogoWrap}>
                                        <img src={job.logo} alt={job.company} className={styles.jobsBenchmarkLogoImg} />
                                    </div>
                                    <div className={styles.jobsBenchmarkRoleInfo}>
                                        <div className={styles.jobsBenchmarkRoleTitle}>{job.title}</div>
                                        <div className={styles.jobsBenchmarkMeta}>
                                            <span className={styles.jobsBenchmarkCompany}>{job.company}</span>
                                            <span className={styles.jobsBenchmarkLocation}>{job.location}</span>
                                            <span className={styles.jobsBenchmarkSalary}>{job.salary}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.jobsBenchmarkBarCol}>
                                    <div className={styles.jobsBenchmarkBarTrack}>
                                        <div
                                            className={`${styles.jobsBenchmarkBarFill} ${job.isTop ? styles.jobsBenchmarkBarFillTop : styles.jobsBenchmarkBarFillRegular}`}
                                            style={{ width: job.barWidth }}
                                        />
                                    </div>
                                    <span className={styles.jobsBenchmarkScore}>{job.score}</span>
                                </div>

                                <div className={styles.jobsBenchmarkActionCol}>
                                    <a
                                        href="/onboarding"
                                        className={styles.jobsBenchmarkPracticeBtn}
                                        title={`Practice for ${job.title} at ${job.company}`}
                                    >
                                        <Play size={11} weight="fill" />
                                        Practice
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA Banner (Crafted for both human and agent) ── */}
            <section id="pricing" className={styles.ctaSection}>
                <div className={styles.ctaCard}>
                    <div className={styles.ctaContent}>
                        <h2 className={styles.ctaTitle}>
                            Lock in and show up ready
                        </h2>
                        <a href="/onboarding" className={styles.ctaDownloadBtn}>
                            <span>Get Your Pass — ₦1,500</span>
                            <ArrowRight size={15} weight="bold" className={styles.ctaBtnArrow} />
                        </a>
                    </div>
                </div>
            </section>

            {/* ── Clean 2-column Footer ── */}
            <footer className={styles.cleanFooter}>
                <div className={styles.cleanFooterInner}>
                    <div className={styles.cleanFooterColumns}>
                        <div className={styles.cleanFooterCol}>
                            <h3 className={styles.cleanFooterColTitle}>Company</h3>
                            <div className={styles.cleanFooterLinks}>
                                <a href="#products" className={styles.cleanFooterLink}>Products</a>
                                <a href="/pricing" className={styles.cleanFooterLink}>Pricing</a>
                                <a href="#resources" className={styles.cleanFooterLink}>Resources</a>
                                <a href="/onboarding" className={styles.cleanFooterLink}>Practice</a>
                            </div>
                        </div>

                        <div className={styles.cleanFooterCol}>
                            <h3 className={styles.cleanFooterColTitle}>Follow us</h3>
                            <div className={styles.cleanFooterLinks}>
                                <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className={styles.cleanFooterSocialLink}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className={styles.cleanFooterSocialIcon} aria-hidden="true">
                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                    </svg>
                                    <span>Facebook</span>
                                </a>
                                <a href="https://x.com" target="_blank" rel="noopener noreferrer" className={styles.cleanFooterSocialLink}>
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" className={styles.cleanFooterSocialIcon} aria-hidden="true">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                    </svg>
                                    <span>X(Twitter)</span>
                                </a>
                                <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className={styles.cleanFooterSocialLink}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.cleanFooterSocialIcon} aria-hidden="true">
                                        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                                        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                                    </svg>
                                    <span>Instagram</span>
                                </a>
                                <a href="https://tiktok.com" target="_blank" rel="noopener noreferrer" className={styles.cleanFooterSocialLink}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className={styles.cleanFooterSocialIcon} aria-hidden="true">
                                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.82 4.49 6.29 6.29 0 0 0 1.94-4.52v-6.9a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-.94-.16z"/>
                                    </svg>
                                    <span>Tiktok</span>
                                </a>
                            </div>
                        </div>
                    </div>

                    <div className={styles.cleanFooterBottom}>
                        <p className={styles.cleanFooterCopyright}>
                            Copyright © 2026 Zero and One Solutions Limited. All rights reserved.
                        </p>
                        <div className={styles.cleanFooterLegal}>
                            <a href="/terms" className={styles.cleanFooterLegalLink}>Terms & Conditions</a>
                            <span className={styles.cleanFooterLegalDot} aria-hidden="true">•</span>
                            <a href="/privacy" className={styles.cleanFooterLegalLink}>Privacy Policy</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
