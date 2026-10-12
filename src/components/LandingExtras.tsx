"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./landingExtras.module.css";

/**
 * Fades its children in (with a slight blur and rise) the first time they
 * scroll into view. Content is visible by default: it's only hidden once the
 * script has confirmed it starts below the fold, so nothing depends on JS to
 * be readable, and reduced-motion users never see it move.
 */
export function Reveal({ children, className = "", delayMs = 0 }: { children: ReactNode; className?: string; delayMs?: number }) {
    const ref = useRef<HTMLDivElement>(null);

    // Classes are toggled on the element directly: this is presentation only,
    // so it doesn't need to re-render the children.
    useEffect(() => {
        const el = ref.current;
        if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return; // already on screen
        el.classList.add(styles.revealHidden);
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) return;
                el.classList.replace(styles.revealHidden, styles.revealShown);
                observer.disconnect();
            },
            { rootMargin: "0px 0px -12% 0px" }
        );
        observer.observe(el);
        return () => {
            observer.disconnect();
            el.classList.remove(styles.revealHidden, styles.revealShown);
        };
    }, []);

    return (
        <div ref={ref} className={`${styles.reveal} ${className}`} style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}>
            {children}
        </div>
    );
}

/** The window bar every product picture sits under. */
function WindowBar({ title, right }: { title: string; right?: ReactNode }) {
    return (
        <div className={styles.winBar}>
            <span className={styles.winDots} aria-hidden="true">
                <i /><i /><i />
            </span>
            <span className={styles.winTitle}>{title}</span>
            <span className={styles.winRight}>{right}</span>
        </div>
    );
}

/** A picture of the interview as a conversation: a question, your answer, and the follow-up it leads to. */
export function InterviewMock() {
    return (
        <div className={styles.mock} role="img" aria-label="An interview conversation: the recruiter asks a follow-up question based on your answer">
            <WindowBar title="Execution & Metrics interview" right={<span className={styles.winTag}>Question 2</span>} />
            <div className={styles.talk}>
                <div className={styles.talkRow}>
                    <span className={styles.talkAvatar}>T</span>
                    <div className={styles.talkBody}>
                        <p className={styles.talkWho}>Ava · Recruiter</p>
                        <p className={styles.talkText}>Walk me through a product you&rsquo;ve worked on and how you knew whether it was succeeding.</p>
                    </div>
                </div>
                <div className={`${styles.talkRow} ${styles.talkRowYou}`}>
                    <span className={`${styles.talkAvatar} ${styles.talkAvatarYou}`}>You</span>
                    <div className={styles.talkBody}>
                        <p className={styles.talkWho}>You</p>
                        <p className={styles.talkText}>We cut checkout from five screens to two, and activation went up.</p>
                    </div>
                </div>
                <div className={`${styles.talkRow} ${styles.talkRowFollow}`}>
                    <span className={styles.talkAvatar}>T</span>
                    <div className={styles.talkBody}>
                        <p className={styles.talkWho}>Ava · Recruiter <span className={styles.talkTag}>Follow-up</span></p>
                        <p className={styles.talkText}>You said activation went up. By how much, and how did you know the redesign caused it?</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

const SCORES = [
    { label: "Specificity", value: 3 },
    { label: "Ownership", value: 2 },
    { label: "Depth", value: 2 },
    { label: "Evidence", value: 1 },
];
const SCORE_TOTAL = SCORES.reduce((sum, score) => sum + score.value, 0);
const SCORE_MAX = SCORES.length * 3;
const RING = 2 * Math.PI * 26;

/** A picture of the coach's feedback: an overall score, four scored dimensions and what to fix next. */
export function FeedbackMock() {
    return (
        <div className={styles.mock} role="img" aria-label="A feedback report: scores for specificity, ownership, depth and evidence, with what worked and what to fix next">
            <WindowBar title="Coach feedback" right={<span className={styles.winTag}>Question 3</span>} />
            <div className={styles.reportBody}>
                <div className={styles.reportTop}>
                    <div className={styles.reportRing}>
                        <svg viewBox="0 0 64 64" width="84" height="84" aria-hidden="true">
                            <circle cx="32" cy="32" r="26" fill="none" stroke="#E8EDF6" strokeWidth="6" />
                            <circle
                                cx="32" cy="32" r="26" fill="none" stroke="#4782F6" strokeWidth="6" strokeLinecap="round"
                                strokeDasharray={`${(SCORE_TOTAL / SCORE_MAX) * RING} ${RING}`} transform="rotate(-90 32 32)"
                            />
                        </svg>
                        <span className={styles.reportRingValue}>{SCORE_TOTAL}<small>/{SCORE_MAX}</small></span>
                    </div>
                    <ul className={styles.reportScores}>
                        {SCORES.map((score) => (
                            <li key={score.label} className={styles.reportRow}>
                                <span className={styles.reportLabel}>{score.label}</span>
                                <span className={styles.reportTrack}>
                                    <span className={styles.reportFill} style={{ width: `${(score.value / 3) * 100}%` }} />
                                </span>
                                <span className={styles.reportValue}>{score.value}/3</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className={styles.reportNotes}>
                    <div className={styles.reportNote}>
                        <p className={styles.reportNoteTitle}><i className={styles.noteGood} />What worked</p>
                        <p className={styles.reportNoteText}>You named the exact step where users dropped off and what you changed.</p>
                    </div>
                    <div className={styles.reportNote}>
                        <p className={styles.reportNoteTitle}><i className={styles.noteFix} />Fix next</p>
                        <p className={styles.reportNoteText}>Give the number. &ldquo;Activation went up&rdquo; needs a figure and how you measured it.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
