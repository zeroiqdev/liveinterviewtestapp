"use client";

import Image from "next/image";
import styles from "./landing.module.css";

export default function LandingPage() {

    return (
        <div className={styles.page}>
            {/* ── Nav ── */}
            <header className={styles.nav}>
                <div className={styles.navInner}>
                    <a href="#top" className={styles.logo}>
                        <div className={styles.logoMark}>
                            <img
                                src="https://res.cloudinary.com/dyg7neetr/image/upload/v1789904880/Gemini_Generated_Image_k81ahgk81ahgk81a-removebg-preview_fby74s.png"
                                alt="onscript"
                                className={styles.logoImg}
                            />
                        </div>
                        <span className={styles.logoType}>onscript</span>
                    </a>
                    <nav className={styles.navLinks}>
                        <a href="#pricing">Pricing</a>
                        <a href="#faqs">FAQs</a>
                    </nav>
                    <div className={styles.navActions}>
                        <a href="/login" className={styles.navLogin}>Log In</a>
                        <a href="/onboarding" className={styles.navCta}>Start Practicing</a>
                    </div>
                </div>
            </header>

            {/* ── Hero – very bold, like Curastory POWER YOUR VIDEO BUSINESS ── */}
            <section className={styles.hero}>
                <div className={styles.heroInner}>
                    <p className={styles.heroEyebrow}>
                        We&apos;re making it easier than ever before
                        <br />
                        to ace interviews and land offers.
                    </p>
                    <div className={styles.heroTitleRow}>
                        <h1 className={styles.heroTitle}>
                            ACE YOUR{" "}
                            <span style={{ display: "inline-block", verticalAlign: "middle" }}>
                                <Image
                                    src="https://res.cloudinary.com/dyg7neetr/image/upload/v1785485049/Screenshot_2026-07-31_at_7.49.19_AM_qujtzo.png"
                                    alt="Recruiter"
                                    width={132}
                                    height={72}
                                    className={styles.heroInlineImg}
                                    priority
                                />
                            </span>{" "}
                            NEXT
                            <br />
                            <span className={styles.heroInterviewRow}>
                                <span>INTERVIEW</span>
                                <a href="/onboarding" className={styles.heroBtn}>
                                    Get Started
                                </a>
                            </span>
                        </h1>
                    </div>
                </div>
            </section>
        </div>
    );
}
