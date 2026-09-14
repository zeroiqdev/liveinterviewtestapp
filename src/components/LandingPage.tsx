"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
    Play,
    Code,
    PaintBrush,
    Briefcase,
    ChartBar,
    ArrowRight,
    ArrowUp,
} from "@phosphor-icons/react";
import styles from "./landing.module.css";

/* ── Small doodle for the contacts block ── */
function ContactDoodle() {
    return (
        <svg viewBox="0 0 420 300" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {/* laptop with chat bubbles */}
            <g stroke="#141414" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
                <path d="M96 90 L250 90 L250 210 L96 210 Z" fill="#ffffff" />
                <path d="M70 210 L276 210 L300 244 L46 244 Z" fill="#ffffff" />
                <rect x="120" y="222" width="60" height="8" rx="4" fill="#141414" stroke="none" />
            </g>
            <g stroke="#141414" strokeWidth="4" strokeLinejoin="round">
                <path d="M120 116 L196 116 L196 152 L152 152 L138 166 L140 152 L120 152 Z" fill="#ffffff" />
                <path d="M226 140 L296 140 L296 178 L238 178 L226 190 L228 178 L226 178 Z" fill="#4793f7" />
            </g>
            <g stroke="#141414" strokeWidth="3.5" strokeLinecap="round">
                <line x1="132" y1="130" x2="184" y2="130" />
                <line x1="132" y1="141" x2="170" y2="141" />
                <line x1="240" y1="154" x2="284" y2="154" />
                <line x1="240" y1="165" x2="268" y2="165" />
            </g>
            {/* sparkles */}
            <g fill="#141414">
                <path d="M320 60 L326 76 L342 82 L326 88 L320 104 L314 88 L298 82 L314 76 Z" />
                <path d="M76 30 L80 40 L90 44 L80 48 L76 58 L72 48 L62 44 L72 40 Z" />
                <circle cx="352" cy="150" r="6" />
                <circle cx="52" cy="130" r="5" />
            </g>
            <g stroke="#141414" strokeWidth="3.5" strokeLinecap="round">
                <path d="M330 236 C346 228 364 228 378 236" />
                <path d="M20 258 C44 250 72 250 96 258" />
                <path d="M310 262 C330 254 356 254 376 262" />
            </g>
        </svg>
    );
}

const FEATURES = [
    { name: "mock interviews", detail: "video interview sessions tailored to the role you're preparing for", note: "/voice + video" },
    { name: "instant performance reports", detail: "figure out what went well and what needs work after every session", note: "/scores & insights" },
    { name: "session replays", detail: "review every interview to identify habits, improve delivery, and track progress", note: "/spot your habits" },
    { name: "built around your career goals", detail: "every interview aligns with where you are in your career.", note: "/always relevant" },
];

const DOMAINS = [
    { icon: Code, name: "software & engineering", desc: "frontend to ml — system design and live coding included." },
    { icon: PaintBrush, name: "product & design", desc: "pm cases, ux critiques and portfolio walkthroughs." },
    { icon: Briefcase, name: "business & operations", desc: "strategy, ops and consulting drills that push back." },
    { icon: ChartBar, name: "data & analytics", desc: "sql, statistics and ml theory under real pressure." },
];

const ROLES_FOOTER = ["frontend developer", "product manager", "data scientist", "business analyst"];

export default function LandingPage() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        localStorage.setItem(
            "useladder_draft",
            JSON.stringify({ name: name.trim(), email: email.trim() })
        );
        router.push("/onboarding");
    };

    return (
        <div className={styles.lpWrapper} id="top">
            <div className={styles.topBar} />

            {/* ── Nav ── */}
            <div className={styles.inner}>
                <header className={styles.nav}>
                    <a href="#top" className={styles.logo}>
                        <span className={styles.logoMark}>
                            <Play size={16} fill="currentColor" />
                        </span>
                        <span className={styles.logoText}>useladder</span>
                    </a>
                    <nav className={styles.menu}>
                        <a href="#features">features</a>
                        <a href="#about">about</a>
                        <a href="#why">why it works</a>
                        <a href="#who">who it&apos;s for</a>
                        <a href="#contact">contacts</a>
                    </nav>
                    <a href="/onboarding" className={styles.navCta}>
                        • start practicing
                    </a>
                </header>

                {/* ── Hero ── */}
                <section className={styles.hero}>
                    <div className={styles.heroDoodle}>
                        <Image
                            src="https://res.cloudinary.com/dyg7neetr/image/upload/v1784900659/7cfa3869a618b36ca8c00daed73f305a-removebg-preview_z8s6ui.png"
                            alt="Person practicing interview questions on a laptop, seated on a beanbag"
                            width={499}
                            height={500}
                            className={styles.doodleImg}
                            priority
                        />
                    </div>
                    <h1 className={styles.heroTitle}>
                        Land your dream{" "}
                        <span className={styles.markerWord}>
                            role
                            <svg
                                className={styles.markerUnderline}
                                viewBox="0 0 300 20"
                                preserveAspectRatio="none"
                                aria-hidden="true"
                            >
                                <path
                                    d="M4 12 C60 6 150 4 296 10 M30 16 C100 10 200 8 280 13"
                                    stroke="#4793f7"
                                    strokeWidth="6"
                                    strokeLinecap="round"
                                    fill="none"
                                />
                            </svg>
                        </span>
                    </h1>
                    <div className={styles.heroTitleRow}>
                        <div className={styles.heroSide}>
                            <p className={styles.heroTagline}>
                                the best way to rehearse before the real thing
                            </p>
                            <div className={styles.chips}>
                                <span className={styles.chipsLabel}>suitable for levels:</span>
                                <span className={styles.chip}>entry-level to senior/lead</span>
                                <span className={`${styles.chip} ${styles.chipAccent}`}>
                                    from ₦1,500 / session
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Features ── */}
                <section id="features">
                    <div className={styles.sectionHead}>
                        <h2 className={styles.parenTitle}>
                            {"<features>"}</h2>
                        <span className={styles.asteriskNum}>
                            <span className={styles.ast}>**</span>01
                        </span>
                    </div>
                    <div className={styles.rows}>
                        {FEATURES.map((f) => (
                            <div key={f.name} className={styles.row}>
                                <span className={styles.rowName}>{f.name}</span>
                                <span className={styles.rowDetail}>{f.detail}</span>
                                <span className={styles.rowNote}>{f.note}</span>
                                <a href="/onboarding" className={styles.brutalBtn}>
                                    try it <ArrowRight size={17} />
                                </a>
                            </div>
                        ))}
                    </div>
                    <p className={styles.rowsFootnote}>
                        15-minute sessions + instant feedback (right after each one)
                    </p>
                </section>

                {/* ── About ── */}
                <section id="about">
                    <div className={styles.sectionHead}>
                        <h2 className={styles.parenTitle}>
                            {"<about>"}</h2>
                    </div>
                    <p className={styles.aboutText}>
                        <span className={styles.hl}>
                            more than 10,000 questions across 40+ roles,
                        </span>{" "}
                        realistic ai interviewers, instant feedback and video replays.
                        both first-timers and seasoned pros level up here equally.
                    </p>
                    <div className={styles.statCards}>
                        <div className={styles.statCard}>
                            <span className={styles.statNum}>10k+</span>
                            <span className={styles.statLabel}>questions in the bank</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statNum}>40+</span>
                            <span className={styles.statLabel}>roles across 4 domains</span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statNum}>24/7</span>
                            <span className={styles.statLabel}>practice on your schedule</span>
                        </div>
                    </div>
                </section>
            </div>

            {/* ── Why It Works ── */}
            <section className={styles.orangeSection} id="why">
                <div className={styles.inner}>
                    <div className={styles.whyCard}>
                        <div className={styles.whyHead}>
                            <span className={styles.whyDots}>
                                <span />
                                <span />
                            </span>
                            <h2 className={styles.whyTitle}>(why it works)</h2>
                        </div>
                        <p className={styles.whyText}>
                            preparing alone means reading question lists and reciting answers
                            to the mirror. useladder puts you in the room instead: an ai
                            interviewer that adapts to your role, asks follow-ups and pushes
                            back — pressure included.
                        </p>
                        <p className={styles.whyText}>
                            your personal training ground — the role-play engine — works
                            precisely on your weak spots. that&apos;s why every session
                            compounds into visible, measurable progress.
                        </p>
                        <div className={styles.whyDivider} />
                        <div className={styles.demoRow}>
                            <div className={styles.videoBlock}>
                                <span className={styles.playCircle}>
                                    <Play size={26} fill="currentColor" />
                                </span>
                            </div>
                            <div className={styles.demoMeta}>
                                <h3>#demo</h3>
                                <p>from a real session — 2 min watch</p>
                                <div className={styles.demoCta}>
                                    <a href="/onboarding" className={styles.brutalBtn}>
                                        try a session <ArrowRight size={17} />
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Who It's For ── */}
            <section className={styles.whoSection} id="who">
                <div className={styles.inner}>
                    <div className={styles.whoGrid}>
                        <h2 className={styles.whoTitle}>
                            <span className={styles.wb}>who</span>
                            <br />
                            <span className={styles.wb}>is it</span>
                            <br />
                            <span className={styles.wb}>for</span>
                        </h2>
                        <div className={styles.whoCopy}>
                            <p>
                                pick your domain, pick your role — every session is generated
                                around your exact track: from entry-level screens to
                                senior/lead panels. no generic question lists, ever.
                            </p>
                            <p>
                                switching careers? the engine maps your experience onto the
                                role you want next and coaches you through the gap.
                            </p>
                        </div>
                    </div>
                    <div className={styles.domainCards}>
                        {DOMAINS.map((d) => (
                            <div key={d.name} className={styles.domainCard}>
                                <span className={styles.domainIcon}>
                                    <d.icon size={24} />
                                </span>
                                <h4>{d.name}</h4>
                                <p>{d.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Contacts / CTA ── */}
            <div className={styles.inner}>
                <section className={styles.contactSection} id="contact">
                    <h2 className={styles.giantTitle}>start now</h2>
                    <div className={styles.contactBlock}>
                        <div className={styles.contactFormSide}>
                            <p className={styles.contactLead}>
                                leave your contacts and we&apos;ll set up your first session
                            </p>
                            <div className={styles.contactLinks}>
                                <a href="mailto:hello@useladder.com">
                                    <span>e-mail</span> hello@useladder.com
                                </a>
                                <a href="#top">
                                    <span>x / twitter</span> @useladder
                                </a>
                            </div>
                            <form className={styles.lpForm} onSubmit={handleSubmit}>
                                <input
                                    className={styles.lpInput}
                                    type="text"
                                    placeholder="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                />
                                <input
                                    className={styles.lpInput}
                                    type="email"
                                    placeholder="e-mail"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                                <label className={styles.consent}>
                                    <input type="checkbox" required defaultChecked />
                                    <span>
                                        by clicking the button, you consent to the processing of
                                        your personal data and agree to the <u>privacy policy</u>.
                                    </span>
                                </label>
                                <button type="submit" className={`${styles.brutalBtn} ${styles.brutalBtnLight}`}>
                                    start practicing <ArrowRight size={17} />
                                </button>
                            </form>
                        </div>
                        <div className={styles.contactDoodle}>
                            <ContactDoodle />
                        </div>
                    </div>
                </section>

                {/* ── Footer ── */}
                <footer className={styles.footer}>
                    <div>
                        <h5>navigation</h5>
                        <ul>
                            <li><a href="#features">features</a></li>
                            <li><a href="#about">about</a></li>
                            <li><a href="#why">why it works</a></li>
                            <li><a href="#who">who it&apos;s for</a></li>
                            <li><a href="/login">log in</a></li>
                        </ul>
                    </div>
                    <div>
                        <h5>popular roles</h5>
                        <ul>
                            {ROLES_FOOTER.map((r) => (
                                <li key={r}><a href="/onboarding">{r}</a></li>
                            ))}
                        </ul>
                    </div>
                    <a href="#top" className={styles.backTop}>
                        back to top <ArrowUp size={15} style={{ verticalAlign: "-2px" }} />
                    </a>
                </footer>
                <div className={styles.footerBase}>
                    <span>© 2026 useladder — ai interview training</span>
                    <span>practice without the pressure</span>
                </div>
            </div>
        </div>
    );
}
