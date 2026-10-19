"use client";

import React, { useEffect, useState } from "react";
import styles from "./profile.module.css";

interface Summary {
    link: string;
    joined: number;
    bought: number;
    rewards: number;
    toNextPass: number;
    perPass: number;
}

/** Your invite link, and how close you are to your next free pass. */
export function InviteFriends() {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [failed, setFailed] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetch("/api/referrals", { cache: "no-store" })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then(setSummary)
            .catch(() => setFailed(true));
    }, []);

    if (failed) return <p className={styles.empty}>We couldn&rsquo;t load your invite link. Try again in a moment.</p>;
    if (!summary) return <p className={styles.empty}>Loading…</p>;

    const towardNext = summary.perPass - summary.toNextPass;
    const message = `I've been practising interviews on get prepped: a recruiter asks follow-up questions on your answers, then you get a report on what to fix. Try it: ${summary.link}`;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(summary.link);
        } catch {
            // Clipboard blocked: the link is selectable in the box.
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
    };

    return (
        <>
            <div className={styles.passBox}>
                <div>
                    <b>
                        {towardNext} of {summary.perPass} friends {towardNext === 1 ? "has" : "have"} bought a pass
                    </b>
                    <span>
                        {summary.toNextPass === 1 ? "One more" : `${summary.toNextPass} more`} and you get a free pass.
                        {summary.rewards > 0 ? ` You've earned ${summary.rewards} free ${summary.rewards === 1 ? "pass" : "passes"} so far.` : ""}
                    </span>
                </div>
                <div className={styles.inviteDots} aria-hidden="true">
                    {Array.from({ length: summary.perPass }, (_, i) => (
                        <i key={i} className={i < towardNext ? styles.inviteDotOn : undefined} />
                    ))}
                </div>
            </div>

            <label className={styles.field}>
                <span className={styles.label}>Your invite link</span>
                <input className={styles.input} value={summary.link} readOnly onFocus={(e) => e.currentTarget.select()} />
            </label>
            <div className={styles.buttonRow}>
                <button type="button" className={styles.primary} onClick={() => void copy()}>
                    {copied ? "Copied" : "Copy link"}
                </button>
                <a className={styles.secondary} href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
                    Share on WhatsApp
                </a>
            </div>
            <p className={styles.hint}>
                {summary.joined === 0
                    ? "Nobody has joined with your link yet."
                    : `${summary.joined} ${summary.joined === 1 ? "person has" : "people have"} joined with your link, and ${summary.bought} bought a pass.`}{" "}
                A friend counts once, when they buy their first pass. Free codes don&rsquo;t count.
            </p>
        </>
    );
}
