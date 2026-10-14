"use client";

import React from "react";
import Link from "next/link";
import { COACH_AVATAR } from "./constants";
import { continueUrl } from "@/lib/tryClient";
import styles from "./finishTry.module.css";

interface FinishTryBannerProps {
    tried: { role: string; company: string; title: string };
    /** Fits the phone's home screen (edge to edge) instead of the desktop column. */
    compact?: boolean;
}

/**
 * After signing up from the try-before-sign-up interview: a reminder to carry
 * on with it, where the person lands, rather than dropping them straight in.
 */
export function FinishTryBanner({ tried, compact = false }: FinishTryBannerProps) {
    const job = [tried.title, tried.company].filter(Boolean).join(" at ");

    const remember = () => {
        // The report page reads this to label the interview.
        try {
            localStorage.setItem(
                "useladder_last_session_meta",
                JSON.stringify({ role: tried.role, companyName: tried.company || undefined, preparationTitle: `${tried.title} Interview`, interviewMode: "live_coaching", startedAt: new Date().toISOString() })
            );
        } catch {
            // Saved data is blocked: the report still works without the label.
        }
    };

    return (
        <section className={`${styles.banner} ${compact ? styles.compact : ""}`} aria-label="Finish your interview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={COACH_AVATAR} alt="" className={styles.face} draggable={false} />
            <div className={styles.text}>
                <b>Finish your {job} interview</b>
                <span>Your first two answers are saved. Pick up at question three and get your full report.</span>
            </div>
            <Link href={continueUrl(tried)} className={styles.cta} onClick={remember}>
                Continue interview
            </Link>
        </section>
    );
}
