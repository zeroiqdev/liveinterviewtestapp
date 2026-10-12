"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
    ArrowRight,
    Bank,
    CalendarCheck,
    ChartBar,
    Check,
    Code,
    Drop,
    Handshake,
    Headset,
    Plus,
    type Icon,
} from "@phosphor-icons/react";
import styles from "./landingSections.module.css";
import { FeedbackMock, InterviewMock, Reveal } from "./LandingExtras";

/* ══════════════════════════════════════
   How it works — a heading over a grid of
   numbered cards, each with a small picture
   of that step.
   ══════════════════════════════════════ */

const STEPS: Array<{ title: string; body: string; visual: ReactNode }> = [
    {
        title: "Pick your role",
        body: "Customer service, sales, banking, virtual assistant, engineering and more.",
        visual: (
            <div className={styles.vChips}>
                <span className={styles.vChip}>Customer service</span>
                <span className={`${styles.vChip} ${styles.vChipOn}`}>Sales</span>
                <span className={styles.vChip}>Banking</span>
                <span className={styles.vChip}>Engineering</span>
            </div>
        ),
    },
    {
        title: "Choose a mode",
        body: "Interactive practice gives you feedback after each answer. Live interview runs start to finish, no hints.",
        visual: (
            <div className={styles.vModes}>
                <span className={`${styles.vMode} ${styles.vModeOn}`}>Interactive practice</span>
                <span className={styles.vMode}>Live interview</span>
            </div>
        ),
    },
    {
        title: "Talk, don't type",
        body: "You speak. The recruiter listens and asks follow-ups based on what you said.",
        visual: (
            <div className={styles.vChat}>
                <span className={`${styles.vBubble} ${styles.vBubbleYou}`}>…and activation went up.</span>
                <span className={styles.vBubble}>By how much?</span>
            </div>
        ),
    },
    {
        title: "Get your feedback",
        body: "What you did well, what was weak, and how to fix it.",
        visual: (
            <div className={styles.vBars}>
                {[100, 66, 66, 33].map((width, i) => (
                    <span key={i} className={styles.vBarTrack}>
                        <span className={styles.vBarFill} style={{ width: `${width}%` }} />
                    </span>
                ))}
            </div>
        ),
    },
    {
        title: "Redo the hard ones",
        body: "Retry any question until the answer lands.",
        visual: (
            <div className={styles.vRetry}>
                <span className={styles.vRetryNote}>Give the number.</span>
                <span className={styles.vRetryBtn}>Try again</span>
            </div>
        ),
    },
    {
        title: "Track your scores",
        body: "Watch them go up between sessions.",
        visual: (
            <div className={styles.vTrend}>
                {[34, 48, 44, 62, 74, 88].map((height, i) => (
                    <span key={i} className={styles.vTrendBar} style={{ height: `${height}%` }} />
                ))}
            </div>
        ),
    },
];

export function HowItWorks() {
    return (
        <section id="features" className={styles.how}>
            <Reveal className={styles.sectionHead}>
                <h2 className={styles.title}>How it works</h2>
                <p className={styles.lead}>Choose the role you&rsquo;re interviewing for, answer the questions out loud, see what to fix, then go again until you&rsquo;re ready.</p>
            </Reveal>
            <ol className={styles.howGrid}>
                {STEPS.map((step, i) => (
                    <li key={step.title} className={styles.howCard}>
                        <div className={styles.howVisual} aria-hidden="true">
                            <span className={styles.howNumber}>{i + 1}</span>
                            {step.visual}
                        </div>
                        <h3 className={styles.howTitle}>{step.title}</h3>
                        <p className={styles.howBody}>{step.body}</p>
                    </li>
                ))}
            </ol>
        </section>
    );
}

/* ══════════════════════════════════════
   Industries — who the practice is for, as
   a grid of industries with the roles each
   covers. Sits after "How it works", whose
   first step is picking a role.
   ══════════════════════════════════════ */

// The role tracks the dashboard offers, grouped by industry.
const INDUSTRIES: Array<{ name: string; roles: string; icon: Icon }> = [
    { name: "Technology", roles: "Software engineering, product management, product and UI design, data analysis, DevOps", icon: Code },
    { name: "Banking & finance", roles: "Financial analysis, investment banking", icon: Bank },
    { name: "Sales", roles: "Sales, business development, account management", icon: Handshake },
    { name: "Customer service", roles: "Customer support, call centre", icon: Headset },
    { name: "Administration", roles: "Virtual assistant, executive assistant", icon: CalendarCheck },
    { name: "Oil & gas", roles: "Engineering, field operations, safety", icon: Drop },
    { name: "Business & operations", roles: "Business analysis, operations", icon: ChartBar },
];

export function Industries() {
    return (
        <section className={styles.industries} aria-labelledby="industries-title">
            <Reveal className={styles.sectionHead}>
                <h2 id="industries-title" className={styles.title}>Practice for your industry</h2>
                <p className={styles.lead}>Each role comes with its own interview rounds.</p>
            </Reveal>
            <ul className={styles.industryGrid}>
                {INDUSTRIES.map(({ name, roles, icon: IndustryIcon }, i) => (
                    <li key={name} className={`${styles.industryCard} ${i === 0 ? styles.industryCardWide : ""}`}>
                        <span className={styles.industryIcon} aria-hidden="true">
                            <IndustryIcon size={22} weight="regular" />
                        </span>
                        <h3 className={styles.industryName}>{name}</h3>
                        <p className={styles.industryRoles}>{roles}</p>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/* ══════════════════════════════════════
   Showcase — a full-height dark panel that
   stays in place while the page scrolls
   through four numbered slides.
   ══════════════════════════════════════ */

function CoachTipMock() {
    return (
        <div className={styles.tipMock} role="img" aria-label="Interactive practice: the coach comments on your answer straight away">
            <p className={styles.tipLabel}>Instant feedback</p>
            <p className={styles.tipQuestion}>&ldquo;Tell me about a time you had to pivot a strategy when unexpected data surfaced.&rdquo;</p>
            <div className={styles.tipNote}>
                <p className={styles.tipWho}>The Coach</p>
                <p className={styles.tipText}>
                    Great STAR structure! Emphasize the quantifiable metrics you achieved post-pivot to make your leadership impact clear.
                </p>
            </div>
            <span className={styles.tipRetry}>Try again</span>
        </div>
    );
}

function JoinMock() {
    return (
        <div className={styles.joinMock} role="img" aria-label="Live interview: your interviewer joins the call, then the interview runs start to finish">
            <p className={styles.joinTitle}>Your interviewer is joining the call</p>
            <ul className={styles.joinSteps}>
                <li className={styles.joinStep}><Check size={13} weight="bold" /> Connecting your camera and microphone</li>
                <li className={styles.joinStep}><Check size={13} weight="bold" /> Preparing your interview questions</li>
                <li className={`${styles.joinStep} ${styles.joinStepNow}`}><span className={styles.joinDot} /> Your interviewer is getting ready</li>
            </ul>
        </div>
    );
}

const SLIDES: Array<{ tab: string; title: string; body: string; question: string; answer: string; visual: ReactNode }> = [
    {
        tab: "The Recruiter",
        title: "A recruiter who listens",
        body: "Say something vague and it asks for specifics. Mention a result and it asks how you got it.",
        question: "Are the questions the same every time?",
        answer: "No. Follow-ups depend on what you say.",
        visual: <InterviewMock />,
    },
    {
        tab: "The Coach",
        title: "A coach who tells you what to fix",
        body: "No generic tips. Feedback on your actual answers, with what to change next time.",
        question: "What do I get?",
        answer: "What worked, what was weak, and how to fix it before your next try.",
        visual: <FeedbackMock />,
    },
    {
        tab: "Interactive practice",
        title: "Interactive practice",
        body: "Answer a question. Get feedback on it right away. Try again.",
        question: "Can I redo an answer?",
        answer: "Yes. After the feedback, try the same question again.",
        visual: <CoachTipMock />,
    },
    {
        tab: "Live interview",
        title: "Live interview",
        body: "The full interview, start to finish. No hints, no pauses. Feedback at the end.",
        question: "Is there any coaching during it?",
        answer: "No. That's the point. It runs like the real thing.",
        visual: <JoinMock />,
    },
];

export function Showcase() {
    const wrapRef = useRef<HTMLElement>(null);
    const [active, setActive] = useState(0);
    const [open, setOpen] = useState(false);

    // The panel is pinned while the page scrolls the wrapper's extra height;
    // how far through that scroll we are picks the slide.
    useEffect(() => {
        const onScroll = () => {
            const wrap = wrapRef.current;
            if (!wrap) return;
            const rect = wrap.getBoundingClientRect();
            const distance = rect.height - window.innerHeight;
            if (distance <= 0) return;
            const progress = Math.min(0.999, Math.max(0, -rect.top / distance));
            // The bars fill from this, straight in CSS: no re-render per scroll frame.
            wrap.style.setProperty("--progress", String(progress * SLIDES.length));
            const next = Math.floor(progress * SLIDES.length);
            setActive((current) => {
                if (current !== next) setOpen(false);
                return next;
            });
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, []);

    const goTo = (index: number) => {
        const wrap = wrapRef.current;
        if (!wrap) return;
        const top = wrap.getBoundingClientRect().top + window.scrollY;
        const distance = wrap.offsetHeight - window.innerHeight;
        window.scrollTo({ top: top + (distance * (index + 0.5)) / SLIDES.length, behavior: "smooth" });
    };

    return (
        <section ref={wrapRef} id="benchmark" className={styles.showcase} style={{ height: `${SLIDES.length * 80 + 100}vh` }}>
            <div className={styles.showcasePin}>
                <div className={styles.showcasePanel}>
                    <div className={styles.showcaseTabs} role="tablist" aria-label="What you get">
                        {SLIDES.map((slide, i) => (
                            <button
                                key={slide.tab}
                                type="button"
                                role="tab"
                                aria-selected={i === active}
                                aria-label={slide.tab}
                                className={styles.showcaseTab}
                                onClick={() => goTo(i)}
                            >
                                <span className={styles.showcaseBar}>
                                    <span className={styles.showcaseBarFill} style={{ "--i": i } as CSSProperties} />
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className={styles.showcaseStage}>
                        {SLIDES.map((slide, i) => (
                            <div
                                key={slide.tab}
                                role="tabpanel"
                                aria-hidden={i !== active}
                                className={`${styles.slide} ${i === active ? styles.slideOn : ""}`}
                            >
                                <div className={styles.slideText}>
                                    <h2 className={styles.slideTitle}>{slide.title}</h2>
                                    <p className={styles.slideBody}>{slide.body}</p>
                                </div>
                                {/* The picture, with its question underneath. */}
                                <div className={styles.slideSide}>
                                    <div className={styles.slideVisual}>{slide.visual}</div>
                                    <div className={styles.faq}>
                                        <button
                                            type="button"
                                            className={styles.faqButton}
                                            aria-expanded={i === active && open}
                                            tabIndex={i === active ? 0 : -1}
                                            onClick={() => setOpen((value) => !value)}
                                        >
                                            <span>{slide.question}</span>
                                            <Plus size={14} weight="bold" className={`${styles.faqIcon} ${i === active && open ? styles.faqIconOpen : ""}`} />
                                        </button>
                                        {i === active && open && <p className={styles.faqAnswer}>{slide.answer}</p>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

/* ══════════════════════════════════════
   What a pass includes — a headline
   over striped rows.
   ══════════════════════════════════════ */

// The Day Pass feature list from the pricing page, with a short gloss each.
const INCLUDED: Array<[string, string]> = [
    ["Live interview with the Recruiter", "Real questions for your role, with follow-ups"],
    ["Instant feedback from your Coach", "After every answer"],
    ["Interview scorecards and delivery tips", "What went well, what to fix"],
    ["Resume ATS scan and keyword feedback", "What your resume is missing"],
    ["Interviews tailored to any job posting", "Practice for the exact job"],
    ["Flexible pass", "Your 24 hours start when you say so"],
];

export function Included() {
    return (
        <section className={styles.included}>
            <Reveal className={styles.sectionHead}>
                <h2 className={styles.title}>
                    A full day of interview practice <br className={styles.desktopBr} />
                    for ₦1,500
                </h2>
                <p className={styles.lead}>One pass. Everything below.</p>
            </Reveal>
            <Reveal className={styles.includedInner}>
                <ul className={styles.includedList}>
                    {INCLUDED.map(([feature, detail]) => (
                        <li key={feature} className={styles.includedRow}>
                            <span className={styles.includedFeature}>{feature}</span>
                            <span className={styles.includedDetail}>{detail}</span>
                        </li>
                    ))}
                </ul>
                <div className={styles.includedActions}>
                    <a href="/onboarding" className={styles.pillDark}>Get your pass</a>
                    <a href="/pricing" className={styles.pillLight}>See all passes</a>
                </div>
            </Reveal>
        </section>
    );
}

/* ══════════════════════════════════════
   The pass — a picture on the left, price
   and checklist on the right.
   ══════════════════════════════════════ */

export function PassCard() {
    return (
        <section id="pricing" className={styles.pass}>
            <div className={styles.passInner}>
                <Reveal className={styles.passVisual}>
                    <FeedbackMock />
                </Reveal>
                <Reveal className={styles.passText} delayMs={100}>
                    <h2 className={styles.passTitle}>Lock in and show up ready</h2>
                    <p className={styles.passLead}>Day Pass. 24 hours of full access, starting when you activate it.</p>
                    <p className={styles.passPrice}>
                        <span className={styles.passAmount}>₦1,500</span>
                        <span className={styles.passPeriod}>/pass</span>
                    </p>
                    <ul className={styles.passList}>
                        {INCLUDED.map(([feature]) => (
                            <li key={feature} className={styles.passItem}>
                                <span className={styles.passCheck}><Check size={11} weight="bold" /></span>
                                {feature}
                            </li>
                        ))}
                    </ul>
                    <a href="/onboarding" className={`${styles.pillDark} ${styles.pillWide}`}>
                        Get Your Pass — ₦1,500 <ArrowRight size={15} weight="bold" />
                    </a>
                    <p className={styles.passNote}>
                        Interviewing all week? <a href="/pricing" className={styles.passLink}>Get the 1-week bundle</a>
                    </p>
                </Reveal>
            </div>
        </section>
    );
}
