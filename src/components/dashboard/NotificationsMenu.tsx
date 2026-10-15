"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "@phosphor-icons/react";
import type { AppNotification } from "@/lib/notifications";
import styles from "./notifications.module.css";

/** "Just now", "3h ago", "Yesterday", or a date. */
function when(iso: string, now = Date.now()): string {
    const ms = now - new Date(iso).getTime();
    const minutes = Math.round(ms / 60_000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    if (hours < 48) return "Yesterday";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * The bell in the dashboard header: recent purchases and what happened on the
 * account. Opening it marks everything read.
 */
export function NotificationsMenu({ className }: { className?: string }) {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<AppNotification[] | null>(null);
    const [unread, setUnread] = useState(0);
    const [failed, setFailed] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/notifications", { cache: "no-store" });
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            setItems(data.notifications ?? []);
            setUnread(data.unread ?? 0);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    // Close on a click outside or Escape.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next) {
            // Fresh list first, so its dots show what's new; then it counts as read.
            // The dots stay until the list is next opened.
            void load().then(() => {
                setUnread(0);
                fetch("/api/notifications", { method: "POST" }).catch(() => undefined);
            });
        }
    };

    return (
        <div className={styles.wrap} ref={wrapRef}>
            <button
                type="button"
                className={className}
                onClick={toggle}
                aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
                aria-expanded={open}
                aria-haspopup="dialog"
            >
                <Bell size={18} weight="bold" />
                {unread > 0 && <span className={styles.badge}>{unread > 9 ? "9+" : unread}</span>}
            </button>

            {open && (
                <div className={styles.panel} role="dialog" aria-label="Notifications">
                    <div className={styles.head}>Notifications</div>
                    {items === null && !failed ? (
                        <p className={styles.empty}>Loading…</p>
                    ) : failed && !items ? (
                        <p className={styles.empty}>We couldn&rsquo;t load your notifications. Try again in a moment.</p>
                    ) : items && items.length === 0 ? (
                        <p className={styles.empty}>Nothing yet. Your payments, reports and resume reviews will show here.</p>
                    ) : (
                        <ul className={styles.list}>
                            {items!.map((item) => {
                                const body = (
                                    <>
                                        <span className={`${styles.dot} ${item.unread ? styles.dotOn : ""}`} aria-hidden="true" />
                                        <span className={styles.text}>
                                            <b>{item.title}</b>
                                            <span>{item.detail}</span>
                                            <time dateTime={item.at}>{when(item.at)}</time>
                                        </span>
                                    </>
                                );
                                return (
                                    <li key={item.id}>
                                        {item.href ? (
                                            <Link href={item.href} className={styles.item} onClick={() => setOpen(false)}>
                                                {body}
                                            </Link>
                                        ) : (
                                            <div className={styles.item}>{body}</div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
