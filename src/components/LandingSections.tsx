"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
    ArrowRight,
    Bank,
    CalendarCheck,
    CaretDown,
    ChartBar,
    Check,
    Code,
    Drop,
    Handshake,
    Headset,
    Lightbulb,
    Play,
    Plus,
    type Icon,
} from "@phosphor-icons/react";
import styles from "./landingSections.module.css";
import tryStyles from "./tryInterview.module.css";
import { FeedbackMock, Reveal } from "./LandingExtras";

/* ══════════════════════════════════════
   How it works — a heading over a grid of
   numbered cards, each with a small picture
   of that step.
   ══════════════════════════════════════ */

const STEPS: Array<{ title: string; body: string; visual: ReactNode }> = [
    {
        title: "Choose Your Role",
        body: "Practise for customer service, sales, banking, virtual assistance, engineering, and more.",
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
        title: "Pick Your Practice Mode",
        body: "Use Interactive Practice to get feedback after every answer, or choose Real Interview to complete an interview from start to finish without hints.",
        visual: (
            <div className={styles.vModes}>
                <span className={`${styles.vMode} ${styles.vModeOn}`}>Interactive Practice</span>
                <span className={styles.vMode}>Real Interview</span>
            </div>
        ),
    },
    {
        title: "Speak in Real Time",
        body: "Have a natural, uninterrupted conversation with questions tailored to your role and experience, with follow-up questions based on what you say.",
        visual: (
            <div className={styles.vChat}>
                <span className={`${styles.vBubble} ${styles.vBubbleYou}`}>…it went from 42% to 61%.</span>
                <span className={styles.vBubble}>Why that measure?</span>
            </div>
        ),
    },
    {
        title: "Review Your Feedback",
        body: "See what you did well, where you can improve, and what you can do differently next time.",
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
        title: "Retry Difficult Questions",
        body: "Go back to the questions you struggled with and practise until you feel more comfortable answering them.",
        visual: (
            <div className={styles.vRetry}>
                <span className={styles.vRetryNote}>
                    <span className={styles.vRetryLabel}>
                        <Lightbulb size={12} weight="fill" />
                        Coach suggestion
                    </span>
                    Add a real example
                </span>
                <span className={styles.vRetryBtn}>Try again</span>
            </div>
        ),
    },
    {
        title: "Track Your Progress",
        body: "Follow your scores across sessions and see how you improve over time.",
        visual: (
            <div className={styles.vTrend}>
                {[34, 48, 44, 62, 74, 88].map((height, i) => (
                    <span key={i} className={styles.vTrendBar} style={{ height: `${height}%` }} />
                ))}
            </div>
        ),
    },
];

/** A sample of what the job-description preview shows, so the picture matches the product. */
const TRY_SAMPLE = {
    job: "Product Manager, Payments · Moniepoint",
    themes: ["Setting a roadmap for merchant payments", "Deciding with data", "Working with engineers and compliance"],
    question: "Tell me about a time merchants kept reporting failed transfers. What did you do first?",
};

/**
 * The job-description preview, as its own invitation: it leads to /try, a
 * page of its own, and has nothing to do with the "Practice" sign-up buttons.
 */
export function TryJob() {
    return (
        <section id="try" className={tryStyles.trySection}>
            <div className={tryStyles.tryPanel}>
                <Reveal className={tryStyles.tryCopy}>
                    <p className={tryStyles.tryEyebrow}>No account needed</p>
                    <h2 className={tryStyles.tryTitle}>Practise for the job you&rsquo;re applying to</h2>
                    <p className={tryStyles.tryLead}>
                        Paste the job description. See what the interview will test, then answer two questions written for that exact job and find out how your first answer landed.
                    </p>
                    <a href="/try" className={styles.pillLight}>
                        Try it with a job description <ArrowRight size={15} weight="bold" />
                    </a>
                </Reveal>
                <div className={tryStyles.tryPicture} aria-hidden="true">
                    <div className={tryStyles.tryCard}>
                        <span className={tryStyles.tryCardJob}>{TRY_SAMPLE.job}</span>
                        <span className={tryStyles.tryCardTitle}>What this job will test you on</span>
                        <ul>
                            {TRY_SAMPLE.themes.map((theme, i) => (
                                <li key={theme}>
                                    <b>{i + 1}</b>
                                    {theme}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className={tryStyles.tryBubble}>
                        <span>Question 1 of 2</span>
                        {TRY_SAMPLE.question}
                    </div>
                </div>
            </div>
        </section>
    );
}

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
   Showcase — a full-height blue panel that
   stays in place while the page scrolls
   through its slides.
   ══════════════════════════════════════ */

// The recruiter and coach as they appear on the dashboard (same pictures as
// dashboard/constants, repeated here so the landing page doesn't load that file).
const RECRUITER_AVATAR = "https://res.cloudinary.com/dyg7neetr/image/upload/v1785485049/Screenshot_2026-07-31_at_7.49.19_AM_qujtzo.png";
const COACH_AVATAR = "https://res.cloudinary.com/dyg7neetr/image/upload/v1785485051/Screenshot_2026-07-31_at_7.49.46_AM_u6gpoz.png";

// Real employers and roles from the jobs board, with the logos we store for them.
const LOGOS = "https://pub-4ad4b59284444b8c87134cecbca2efb2.r2.dev/company-logos";
const MATCHED_JOBS = [
    { logo: `${LOGOS}/moniepoint-teamapt-c3e387a1ad.png`, title: "Application Security Engineer", company: "Moniepoint", place: "Remote", posted: "Today" },
    { logo: `${LOGOS}/chowdeck-f19220c63b.webp`, title: "Telesales Agent", company: "Chowdeck", place: "Lagos", posted: "Yesterday" },
    { logo: `${LOGOS}/dangote-industries-limited-fcf988e523.png`, title: "Business & Performance Data Analyst", company: "Dangote Industries", place: "Lagos", posted: "2 days ago" },
    { logo: `${LOGOS}/jumia-group-2ca1e8e1d7.svg`, title: "Inventory Manager", company: "Jumia", place: "Accra", posted: "2 days ago" },
];

/** The dashboard's Recruiter panel: the recruiter's note, then matched jobs to practise for. */
function JobsMock() {
    return (
        <div className={styles.panelMock} role="img" aria-label="The recruiter's panel: jobs that match your experience, each with a button to practise an interview for it">
            <div className={styles.panelHead}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={RECRUITER_AVATAR} alt="" className={styles.panelAvatar} loading="lazy" />
                <p className={styles.panelBubble}>These roles match your experience. Pick one and I&rsquo;ll run the interview for it.</p>
            </div>
            <ul className={styles.panelList}>
                {MATCHED_JOBS.map((job) => (
                    <li key={job.title} className={styles.panelRow}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={job.logo} alt="" className={styles.jobLogo} loading="lazy" />
                        <span className={styles.rowText}>
                            <span className={styles.rowTitle}>{job.title}</span>
                            <span className={styles.rowMeta}>{job.company} · {job.place} · {job.posted}</span>
                        </span>
                        <span className={styles.jobPractice}><Play size={10} weight="fill" /> Practice</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

const WEEKLY_TIPS = [
    { topic: "Job search", preview: "When they ask about salary, give a range you've researched, not a single number." },
    { topic: "Interviews", preview: "Open “Tell me about yourself” with where you are now, then how you got there." },
    { topic: "Career growth", preview: "After a rejection, ask for one thing you could have done better. Most people never ask." },
    { topic: "Your CV", preview: "Start each bullet with what changed because of your work." },
];

/** The dashboard's Coach panel: the coach's note, then this week's tips as messages. */
function TipsMock() {
    return (
        <div className={styles.panelMock} role="img" aria-label="The coach's panel: this week's career tips on job search, interviews, career growth and your CV">
            <div className={styles.panelHead}>
                <span className={styles.panelAvatarWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={COACH_AVATAR} alt="" className={styles.panelAvatar} loading="lazy" />
                    <span className={styles.panelBadge}>{WEEKLY_TIPS.length}</span>
                </span>
                <p className={styles.panelBubble}>Here are this week&rsquo;s tips for your job search and your next interview.</p>
            </div>
            <ul className={styles.panelList}>
                {WEEKLY_TIPS.map((tip) => (
                    <li key={tip.topic} className={styles.panelRow}>
                        <span className={styles.tipAvatarWrap}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={COACH_AVATAR} alt="" className={styles.tipAvatar} loading="lazy" />
                            <span className={styles.tipOnline} />
                        </span>
                        <span className={styles.rowText}>
                            <span className={styles.tipTopic}>{tip.topic}</span>
                            <span className={styles.rowPreview}>{tip.preview}</span>
                        </span>
                        <span className={styles.tipUnread} />
                        <CaretDown size={12} weight="bold" className={styles.tipCaret} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

const SLIDES: Array<{ tab: string; title: string; body: string; question: string; answer: string; visual: ReactNode }> = [
    {
        tab: "Jobs",
        title: "Practice For Your Next Opportunity",
        body: "Discover jobs that match your experience and practise for them with tailored interviews.",
        question: "Where do the jobs come from?",
        answer: "From company career pages and job boards, refreshed through the day.",
        visual: <JobsMock />,
    },
    {
        tab: "Career tips",
        title: "Get Better Every Week",
        body: "Get practical career tips and advice to help you navigate your job search and grow professionally.",
        question: "How often are there new tips?",
        answer: "Every week.",
        visual: <TipsMock />,
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
    ["Live Interviews with Your Recruiter", "Answer role-specific questions in a natural conversation with relevant follow-ups."],
    ["Instant Feedback from Your Coach", "Get suggestions on how to make each response clearer and more effective."],
    ["Interview Scorecards and Delivery Tips", "Review your overall performance, from the quality of your responses to how you communicate."],
    ["Resume ATS Scan and Keyword Feedback", "Identify missing keywords and areas to strengthen your resume."],
    ["Practice for Any Job Posting", "Prepare for a specific opening using its job description."],
    ["A Flexible 24-Hour Pass", "Start your 24 hours whenever it suits you."],
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
   The feedback report — its picture on the
   left, what it tells you on the right.
   ══════════════════════════════════════ */

const REPORT_POINTS: Array<[string, string]> = [
    ["Scored on What Interviewers Look For", "Every answer is rated for how specific it was, how much of the work was yours, how deep you went, and the evidence you gave."],
    ["What Worked and What Didn't", "See the answers that landed and the ones that need work, in plain words."],
    ["What to Say Differently", "Leave with clear changes to make before your next attempt."],
];

export function FeedbackSection() {
    return (
        <section className={styles.pass} aria-labelledby="report-title">
            <div className={styles.passInner}>
                <Reveal className={styles.passVisual}>
                    <FeedbackMock />
                </Reveal>
                <Reveal className={styles.passText} delayMs={100}>
                    <h2 id="report-title" className={styles.passTitle}>Know exactly what to fix</h2>
                    <p className={styles.passLead}>Every interview ends with a report on how you did. No vague advice, and no pass or fail.</p>
                    <ul className={styles.pointList}>
                        {REPORT_POINTS.map(([point, detail]) => (
                            <li key={point} className={styles.pointItem}>
                                <span className={styles.passCheck}><Check size={11} weight="bold" /></span>
                                <span>
                                    <span className={styles.pointTitle}>{point}</span>
                                    <span className={styles.pointDetail}>{detail}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </Reveal>
            </div>
        </section>
    );
}

/* ══════════════════════════════════════
   Questions people ask before they start,
   then the last call to action.
   ══════════════════════════════════════ */

const QUESTIONS: Array<[string, string]> = [
    ["What do I need to get started?", "A phone or computer with a microphone. Answering by voice works best in Google Chrome or Microsoft Edge."],
    ["How long does an interview take?", "About 20 to 30 minutes. You can end it early and still get feedback on what you answered."],
    ["What is the difference between Interactive Practice and Real Interview?", "Interactive Practice gives you feedback after every answer and lets you try again. Real Interview runs from start to finish without hints, and you get your report at the end."],
    ["Can I practise for a specific job?", "Yes. Choose a job from the jobs board and the interview is built around that role and its description."],
    ["When do my 24 hours start?", "When you activate your pass, not when you buy it. Buy it today and start it on the day you want to practise."],
    ["I have interviews all week. Is there a longer pass?", "Yes. The 1-week bundle covers seven days. You can compare the passes on the pricing page."],
];

export function Faq() {
    return (
        <section id="pricing" className={styles.questions} aria-labelledby="questions-title">
            <div className={styles.questionsInner}>
                <Reveal className={styles.questionsHead}>
                    <h2 id="questions-title" className={styles.title}>Questions before you start</h2>
                    <p className={styles.lead}>The things people ask most.</p>
                    <div className={styles.includedActions}>
                        <a href="/onboarding" className={styles.pillDark}>Get your pass <ArrowRight size={15} weight="bold" /></a>
                        <a href="/pricing" className={styles.pillLight}>See all passes</a>
                    </div>
                </Reveal>
                <Reveal className={styles.questionList} delayMs={100}>
                    {QUESTIONS.map(([question, answer]) => (
                        <details key={question} className={styles.question}>
                            <summary className={styles.questionSummary}>
                                <span>{question}</span>
                                <Plus size={14} weight="bold" className={styles.questionIcon} />
                            </summary>
                            <p className={styles.questionAnswer}>{answer}</p>
                        </details>
                    ))}
                </Reveal>
            </div>
        </section>
    );
}
