"use client";

import React from "react";
import { COACH_AVATAR } from "./constants";
import styles from "./finishTry.module.css";

export interface ResumeStanding {
    /** Out of 100, worked out the same way as on the review page. */
    score: number;
    /** Things costing points, and how many points they're worth together. */
    fixes: number;
    points: number;
}

interface ResumeBannerProps {
    role?: string;
    /** Null when there's no resume yet. */
    standing: ResumeStanding | null;
    onImprove: () => void;
    onAdd: () => void;
}

/**
 * The resume review, where people can find it: the score and what's left to
 * fix, or a prompt to add a resume. Shown between the interview cards and the
 * jobs and chats on a desktop.
 */
export function ResumeBanner({ role, standing, onImprove, onAdd }: ResumeBannerProps) {
    const forRole = role ? ` for ${role}` : "";

    if (!standing) {
        return (
            <section className={styles.banner} aria-label="Your resume">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={COACH_AVATAR} alt="" className={styles.face} draggable={false} />
                <div className={styles.text}>
                    <b>Get your resume reviewed{forRole}</b>
                    <span>Add it to see a score out of 100 and exactly what to change before you apply.</span>
                </div>
                <button type="button" className={styles.cta} onClick={onAdd}>
                    Add your resume
                </button>
            </section>
        );
    }

    const detail =
        standing.fixes === 0
            ? "Nothing is costing you points. Open it to tailor it for a job you want."
            : `${standing.fixes} ${standing.fixes === 1 ? "thing" : "things"} to fix, worth up to ${standing.points} more points.`;

    return (
        <section className={styles.banner} aria-label="Your resume">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={COACH_AVATAR} alt="" className={styles.face} draggable={false} />
            <div className={styles.text}>
                <b>
                    Your resume scores {standing.score}/100{forRole}
                </b>
                <span>{detail}</span>
            </div>
            <button type="button" className={styles.cta} onClick={onImprove}>
                {standing.fixes === 0 ? "Open resume" : "Improve resume"}
            </button>
        </section>
    );
}
