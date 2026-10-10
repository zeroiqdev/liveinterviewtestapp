"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Image from "next/image";
import { Play } from "@phosphor-icons/react";
import styles from "./landing.module.css";
import { InterviewMock, Reveal } from "./LandingExtras";
import { HowItWorks, Included, Industries, PassCard, Showcase } from "./LandingSections";

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
    const whoWeAreRef = useRef<HTMLElement>(null);
    const [whoWeAreLinesActive, setWhoWeAreLinesActive] = useState(false);

    useEffect(() => {
        document.documentElement.setAttribute('data-recent-cursor', 'true');
        return () => {
            document.documentElement.removeAttribute('data-recent-cursor');
        };
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

    // Past the hero, the full-width bar collapses into a floating pill.
    const heroRef = useRef<HTMLElement>(null);
    const [navCompact, setNavCompact] = useState(false);
    useEffect(() => {
        const update = () => {
            const hero = heroRef.current;
            if (!hero) return;
            // A little before the hero has fully left, so the change lands as
            // the next section arrives rather than after it.
            setNavCompact(hero.getBoundingClientRect().bottom <= 72);
        };
        update();
        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update, { passive: true });
        return () => {
            window.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, []);

    return (
        <div className={styles.page}>
            {/* ── Nav ── */}
            <header className={`${styles.nav} ${navCompact ? styles.navCompact : ""}`}>
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
            <section className={styles.hero} ref={heroRef}>
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
                            <span className={styles.heroNoWrap}>Big career moves</span> <br className={styles.heroDesktopBr} />
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


                    <h2 className={styles.whoWeAreTitle} aria-label="Stop winging your interviews.">
                        {/* Base outline layer (visible as an outline) */}
                        <span className={styles.whoWeAreTitleOutline} aria-hidden="true">
                            <span className={styles.whoWeAreTitleLine}>Stop winging your interviews.</span>
                        </span>

                        {/* Color fill layer (reveals slowly as user scrolls into section) */}
                        <span className={styles.whoWeAreTitleFill} aria-hidden="true">
                            <span className={styles.whoWeAreTitleLine}>Stop winging your interviews.</span>
                        </span>
                    </h2>
                </div>


                <div className={styles.whoWeAreGrid}>
                    <div className={styles.whoWeAreMediaCol}>
                        <InterviewMock />
                    </div>
                    <Reveal className={styles.whoWeAreContentCol}>
                        <h3 className={styles.whoWeAreSubheading}>
                            Get closer to your dream offer with every practice session.
                        </h3>
                        <p className={styles.whoWeAreParagraph}>
                            Confidence comes from having done it before. Practice the questions for your role out loud, hear where you stumble, and fix it. Walk into the real interview knowing what you&rsquo;ll say.
                        </p>
                    </Reveal>
                </div>

            </section>

            <HowItWorks />

            <Industries />

            <Showcase />

            <Included />

            {/* ── Live Job Opportunities Section (matching reference screenshot) ── */}
            <section id="job-opportunities" className={styles.jobsBenchmarkSection}>
                <div className={styles.jobsBenchmarkInner}>
                    <Reveal className={styles.jobsBenchmarkHeader}>
                        <h2 className={styles.jobsBenchmarkTitle}>Practice for real jobs</h2>
                        <p className={styles.jobsBenchmarkLead}>
                            Found a job you want? Practice that interview.
                        </p>
                        <p className={styles.jobsBenchmarkSubtitle}>
                            Upload your resume. We match you to open roles and build the interview from the job post.
                        </p>
                    </Reveal>

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

            <PassCard />

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
