"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { CaretRight } from "@phosphor-icons/react";
import type { JobItem } from "@/app/api/jobs/route";
import styles from "./mobileHome.module.css";
import { COACH_AVATAR, RECRUITER_AVATAR, getInterviewRoundsForRole } from "./constants";
import { cleanJobTitle } from "./utils";
import { FinishTryBanner } from "./FinishTryBanner";

interface MobileHomeProps {
    userName: string;
    userRole?: string;
    userRoleFamily?: string;
    onPractice: (round?: { roundTitle: string }) => void;
    /** This week's tip, as the coach's messages show it. */
    tip: { topic: string; title: string };
    jobs: JobItem[];
    onOpenTips: () => void;
    onOpenRecruiter: () => void;
    /** An interview begun before sign-up, waiting to be carried on. */
    pendingTry?: { role: string; company: string; title: string } | null;
}

/**
 * The phone's home screen: the interview types to swipe through, then one line
 * each from the coach and the recruiter that leads to their tab.
 */
export function MobileHome({ userName, userRole, userRoleFamily, onPractice, tip, jobs, onOpenTips, onOpenRecruiter, pendingTry }: MobileHomeProps) {
    const rounds = useMemo(() => getInterviewRoundsForRole(userRole, userRoleFamily), [userRole, userRoleFamily]);
    const [current, setCurrent] = useState(0);
    const deckRef = useRef<HTMLDivElement>(null);

    // The dot follows whichever card is nearest the left edge.
    const handleScroll = useCallback(() => {
        const deck = deckRef.current;
        const first = deck?.firstElementChild as HTMLElement | null;
        if (!deck || !first) return;
        const step = first.offsetWidth + 12;
        setCurrent(Math.max(0, Math.min(rounds.length - 1, Math.round(deck.scrollLeft / step))));
    }, [rounds.length]);

    const topJob = jobs[0];
    const otherJobs = Math.max(0, jobs.length - 1);

    return (
        <div className={styles.home}>
            <section className={styles.band}>
                <p className={styles.hello}>Welcome back, {userName}</p>
                <h1 className={styles.heading}>Ready to ace your next interview?</h1>

                <div className={styles.deck} ref={deckRef} onScroll={handleScroll}>
                    {rounds.map((round, idx) => {
                        const title = round.title.replace(/\n/g, " ");
                        return (
                            <article key={round.id} className={styles.type}>
                                <span className={styles.typeNumber}>
                                    {String(idx + 1).padStart(2, "0")} of {String(rounds.length).padStart(2, "0")}
                                </span>
                                <h2 className={styles.typeTitle}>{title}</h2>
                                <span className={styles.typeTagline}>{round.tagline}</span>
                                <div className={styles.typeArt}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={round.image} alt="" draggable={false} />
                                </div>
                                <button
                                    type="button"
                                    className={styles.typeStart}
                                    onClick={() => onPractice({ roundTitle: title })}
                                    aria-label={`Start interview: ${title}`}
                                >
                                    Start interview
                                </button>
                            </article>
                        );
                    })}
                </div>

                <div className={styles.dots} aria-hidden="true">
                    {rounds.map((round, idx) => (
                        <i key={round.id} className={idx === current ? styles.dotOn : undefined} />
                    ))}
                </div>
            </section>

            {pendingTry && <FinishTryBanner tried={pendingTry} compact />}

            <div className={styles.rows}>
                <button type="button" className={styles.row} onClick={onOpenTips}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={COACH_AVATAR} alt="" className={styles.rowFace} draggable={false} />
                    <span className={styles.rowText}>
                        <small>This week&apos;s tip</small>
                        <b>{tip.title}</b>
                        <span>From your coach · {tip.topic}</span>
                    </span>
                    <CaretRight size={14} weight="bold" className={styles.rowChevron} />
                </button>
                <button type="button" className={styles.row} onClick={onOpenRecruiter}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={RECRUITER_AVATAR} alt="" className={styles.rowFace} draggable={false} />
                    <span className={styles.rowText}>
                        <small>Matched to you</small>
                        {topJob ? (
                            <>
                                <b>{cleanJobTitle(topJob.title)}</b>
                                <span>
                                    {topJob.company}
                                    {otherJobs > 0 ? ` · ${otherJobs} more ${otherJobs === 1 ? "role" : "roles"}` : ""}
                                </span>
                            </>
                        ) : (
                            <>
                                <b>Open roles you can practise for</b>
                                <span>See what the recruiter has found</span>
                            </>
                        )}
                    </span>
                    <CaretRight size={14} weight="bold" className={styles.rowChevron} />
                </button>
            </div>
        </div>
    );
}
