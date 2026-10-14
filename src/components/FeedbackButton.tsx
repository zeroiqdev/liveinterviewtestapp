"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ChatCircleDots, CheckCircle, X } from "@phosphor-icons/react";
import { captureFeedbackContext } from "@/lib/feedbackContext";
import { GENERAL_PICKS, QUICK_PICKS, sectionForPath } from "@/lib/feedbackScreens";
import styles from "./feedbackButton.module.css";

const RATINGS: Array<{ value: 1 | 2 | 3; label: string; face: string }> = [
    { value: 1, label: "Not good", face: "😕" },
    { value: 2, label: "It was okay", face: "🙂" },
    { value: 3, label: "Really good", face: "😀" },
];

interface FeedbackButtonProps {
    /** Class for the trigger, so it matches the buttons it sits beside. */
    className?: string;
    /** Shown beside the icon; leave out for an icon-only button. */
    label?: string;
    iconSize?: number;
    /** Overrides the section worked out from the address ("Interview set-up"). */
    section?: string;
    /** Extra context the screen knows ("Question 3 · Mock Interview"). */
    detail?: string;
    interviewSessionId?: string | null;
    /** Ask for a one-tap rating first ("How was this interview?"). */
    ratingQuestion?: string;
    /** A line shown at the top of the form ("Your interview is paused…"). */
    notice?: string;
    /** Told when the form opens and closes, so the screen can pause what it's doing. */
    onOpenChange?: (open: boolean) => void;
}

/**
 * "Send feedback": a button that opens a short form. What screen the person
 * is on, the interview they're in and their device are attached for them, so
 * all they write is what they noticed.
 */
export function FeedbackButton({ className, label, iconSize = 18, section, detail, interviewSessionId, ratingQuestion, notice, onOpenChange }: FeedbackButtonProps) {
    const pathname = usePathname() || "";
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState("");
    const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
    const [error, setError] = useState<string | null>(null);
    const [tags, setTags] = useState<string[]>([]);
    const [rating, setRating] = useState<1 | 2 | 3 | null>(null);
    const textRef = useRef<HTMLTextAreaElement>(null);

    const openChangeRef = useRef(onOpenChange);
    openChangeRef.current = onOpenChange;
    const wasOpenRef = useRef(false);
    useEffect(() => {
        if (open === wasOpenRef.current) return;
        wasOpenRef.current = open;
        openChangeRef.current?.(open);
    }, [open]);
    // Closing with the screen (the interview ending) counts as closing the form.
    useEffect(
        () => () => {
            if (wasOpenRef.current) openChangeRef.current?.(false);
        },
        []
    );

    const about = section || sectionForPath(pathname);
    const picks = QUICK_PICKS[about] ?? GENERAL_PICKS;
    const canSend = message.trim().length >= 3 || tags.length > 0 || rating !== null;

    const toggleTag = (tag: string) => setTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]));

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    const openForm = () => {
        setStatus("idle");
        setError(null);
        setTags([]);
        setRating(null);
        setOpen(true);
    };

    const send = async () => {
        if (!canSend || status === "sending") return;
        setStatus("sending");
        setError(null);
        try {
            // Device, recent steps, errors and what this screen knows: gathered here, not asked for.
            const context = await captureFeedbackContext().catch(() => undefined);
            const res = await fetch("/api/app-feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    // A picked reason is a problem report; a free note could be anything.
                    kind: tags.length > 0 ? "problem" : "other",
                    message: message.trim(),
                    section: about,
                    path: pathname,
                    detail,
                    interviewSessionId: interviewSessionId || undefined,
                    viewport: `${window.innerWidth}x${window.innerHeight}`,
                    tags,
                    rating: rating ?? undefined,
                    context,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "We couldn't send your feedback. Please try again.");
            setStatus("sent");
            setMessage("");
        } catch (e) {
            setStatus("idle");
            setError(e instanceof Error ? e.message : "We couldn't send your feedback. Please try again.");
        }
    };

    const prompt = "Tell us in your own words.";

    return (
        <>
            <button type="button" className={className ?? styles.trigger} onClick={openForm} aria-label="Send feedback" title="Send feedback">
                <ChatCircleDots size={iconSize} weight="bold" />
                {label && <span>{label}</span>}
            </button>

            {open &&
                createPortal(
                    <div className={styles.overlay} onClick={() => setOpen(false)}>
                        <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="feedback-title" onClick={(e) => e.stopPropagation()}>
                            <div className={styles.header}>
                                <h2 id="feedback-title" className={styles.title}>Send feedback</h2>
                                <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close">
                                    <X size={16} weight="bold" />
                                </button>
                            </div>

                            {status === "sent" ? (
                                <div className={styles.sent}>
                                    <CheckCircle size={36} weight="fill" color="#22C55E" />
                                    <p className={styles.sentTitle}>Thank you. We&rsquo;ve got it.</p>
                                    <p className={styles.sentText}>We read every message, and it goes straight to the people building get prepped.</p>
                                </div>
                            ) : (
                                <div className={styles.body}>
                                    {notice && <p className={styles.notice}>{notice}</p>}
                                    {ratingQuestion && (
                                        <div>
                                            <p className={styles.groupLabel}>{ratingQuestion}</p>
                                            <div className={styles.ratings} role="radiogroup" aria-label={ratingQuestion}>
                                                {RATINGS.map((option) => (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={rating === option.value}
                                                        className={`${styles.rating} ${rating === option.value ? styles.ratingOn : ""}`}
                                                        onClick={() => setRating(option.value)}
                                                    >
                                                        <span className={styles.ratingFace} aria-hidden="true">{option.face}</span>
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <p className={styles.groupLabel}>Tap anything that applies</p>
                                        <div className={styles.kinds}>
                                            {picks.map((pick) => (
                                                <button
                                                    key={pick}
                                                    type="button"
                                                    aria-pressed={tags.includes(pick)}
                                                    className={`${styles.kind} ${tags.includes(pick) ? styles.kindOn : ""}`}
                                                    onClick={() => toggleTag(pick)}
                                                >
                                                    {pick}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <p className={styles.groupLabel}>Anything to add? (optional)</p>
                                    <textarea
                                        ref={textRef}
                                        className={styles.textarea}
                                        placeholder={prompt}
                                        aria-label={prompt}
                                        value={message}
                                        maxLength={2000}
                                        rows={3}
                                        onChange={(e) => setMessage(e.target.value)}
                                    />
                                    {error && <p className={styles.error} role="alert">{error}</p>}
                                </div>
                            )}

                            <div className={styles.footer}>
                                {status === "sent" ? (
                                    <button type="button" className={styles.primary} onClick={() => setOpen(false)}>Done</button>
                                ) : (
                                    <>
                                        <button type="button" className={styles.secondary} onClick={() => setOpen(false)}>Cancel</button>
                                        <button type="button" className={styles.primary} onClick={send} disabled={!canSend || status === "sending"}>
                                            {status === "sending" ? "Sending…" : "Send feedback"}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
