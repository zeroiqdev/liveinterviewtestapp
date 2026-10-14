"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CaretDown, CheckCircle } from "@phosphor-icons/react";
import styles from "@/components/admin.module.css";

interface CapturedContext {
    device?: string;
    viewport?: string;
    connection?: string;
    online?: boolean;
    timezone?: string;
    permissions?: Record<string, string>;
    steps?: Array<{ secondsAgo: number; what: string }>;
    errors?: Array<{ secondsAgo: number; message: string }>;
    screens?: Record<string, Record<string, string | number | boolean | null>>;
}

interface FeedbackItem {
    id: string;
    email: string;
    name: string;
    role: string;
    message: string;
    section: string;
    path: string;
    interviewSessionId?: string;
    tags?: string[];
    rating?: number;
    context?: CapturedContext;
    resolved: boolean;
    createdAt: string;
}

const RATING_LABEL: Record<number, string> = { 1: "😕 Not good", 2: "🙂 Okay", 3: "😀 Really good" };

function ago(seconds: number): string {
    return seconds < 60 ? `${seconds}s before` : `${Math.round(seconds / 60)} min before`;
}

/** Admin: what users have sent through "Send feedback", with what the app captured alongside. */
export function FeedbackPanel({ onCount }: { onCount?: (open: number) => void }) {
    const [items, setItems] = useState<FeedbackItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [section, setSection] = useState("all");
    const [showResolved, setShowResolved] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/app-feedback", { cache: "no-store" });
            if (!res.ok) throw new Error();
            const data = await res.json();
            setItems(data.items ?? []);
            onCount?.(data.open ?? 0);
            setFailed(false);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [onCount]);

    useEffect(() => {
        void load();
    }, [load]);

    const setResolved = async (item: FeedbackItem, resolved: boolean) => {
        setItems((current) => current.map((other) => (other.id === item.id ? { ...other, resolved } : other)));
        const res = await fetch("/api/app-feedback", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id, resolved }),
        }).catch(() => null);
        if (!res?.ok) void load();
        else onCount?.(items.filter((other) => (other.id === item.id ? !resolved : !other.resolved)).length);
    };

    const sections = useMemo(() => [...new Set(items.map((item) => item.section))].sort(), [items]);
    const shown = items.filter((item) => (section === "all" || item.section === section) && (showResolved || !item.resolved));

    // What people pick most, so the commonest problem is obvious at a glance.
    const topReasons = useMemo(() => {
        const counts = new Map<string, number>();
        for (const item of items) if (!item.resolved) for (const tag of item.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5);
    }, [items]);

    if (loading) return <div className={styles.emptyState}>Loading feedback…</div>;
    if (failed) return <div className={styles.emptyState}>Couldn&rsquo;t load feedback. Refresh to try again.</div>;

    return (
        <div>
            <div className={styles.actionRow}>
                <div className={styles.searchFilterGroup}>
                    <select className={styles.filterSelect} value={section} onChange={(e) => setSection(e.target.value)} aria-label="Screen">
                        <option value="all">All screens</option>
                        {sections.map((name) => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "#475569" }}>
                        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
                        Show resolved
                    </label>
                </div>
            </div>

            {topReasons.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "0 0 1rem" }}>
                    {topReasons.map(([reason, count]) => (
                        <span key={reason} className={styles.badgeCategory}>{reason} · {count}</span>
                    ))}
                </div>
            )}

            {shown.length === 0 ? (
                <div className={styles.emptyState}>{items.length === 0 ? "No feedback yet. It appears here as soon as someone sends some." : "Nothing matches these filters."}</div>
            ) : (
                <div className={styles.tableCard}>
                    <div className={styles.tableWrap}>
                        <table className={styles.adminTable}>
                            <thead>
                                <tr>
                                    <th>Feedback</th>
                                    <th>Screen</th>
                                    <th>From</th>
                                    <th>Device</th>
                                    <th>When</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((item) => {
                                    const context = item.context ?? {};
                                    const open = expanded === item.id;
                                    return (
                                        <React.Fragment key={item.id}>
                                            <tr style={item.resolved ? { opacity: 0.55 } : undefined}>
                                                <td style={{ maxWidth: 420 }}>
                                                    {item.rating ? <div style={{ fontSize: "0.82rem", marginBottom: 4 }}>{RATING_LABEL[item.rating]}</div> : null}
                                                    {(item.tags ?? []).length > 0 && (
                                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: item.message ? 6 : 0 }}>
                                                            {item.tags!.map((tag) => (
                                                                <span key={tag} className={styles.badgeCategory}>{tag}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {item.message && <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{item.message}</div>}
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpanded(open ? null : item.id)}
                                                        style={{ marginTop: 6, background: "none", border: 0, padding: 0, color: "#2563EB", fontSize: "0.8rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                                                    >
                                                        What they were doing <CaretDown size={11} weight="bold" style={{ transform: open ? "rotate(180deg)" : "none" }} />
                                                    </button>
                                                </td>
                                                <td><span className={styles.badgeDomain}>{item.section}</span></td>
                                                <td>
                                                    <div>{item.name || item.email}</div>
                                                    <div style={{ fontSize: "0.78rem", color: "#64748B" }}>{item.email}{item.role ? ` · ${item.role}` : ""}</div>
                                                </td>
                                                <td style={{ fontSize: "0.82rem", color: "#475569" }}>{context.device || "—"}</td>
                                                <td style={{ fontSize: "0.82rem", color: "#475569", whiteSpace: "nowrap" }}>
                                                    {new Date(item.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                                </td>
                                                <td>
                                                    <button type="button" className={styles.secondaryBtn} onClick={() => setResolved(item, !item.resolved)}>
                                                        <CheckCircle size={14} /> {item.resolved ? "Reopen" : "Resolve"}
                                                    </button>
                                                </td>
                                            </tr>
                                            {open && (
                                                <tr>
                                                    <td colSpan={6} style={{ background: "#F8FAFC", fontSize: "0.82rem", color: "#334155" }}>
                                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem 2rem", padding: "0.5rem 0" }}>
                                                            <div>
                                                                <strong>Device</strong>
                                                                <div>{context.device || "Unknown"}</div>
                                                                <div>Screen {context.viewport || "?"}{context.connection ? ` · ${context.connection}` : ""}{context.online === false ? " · offline" : ""}</div>
                                                                {context.timezone && <div>{context.timezone}</div>}
                                                                {context.permissions && <div>{Object.entries(context.permissions).map(([name, state]) => `${name}: ${state}`).join(" · ")}</div>}
                                                                <div style={{ color: "#64748B" }}>{item.path}</div>
                                                            </div>
                                                            {Object.entries(context.screens ?? {}).map(([screen, values]) => (
                                                                <div key={screen}>
                                                                    <strong style={{ textTransform: "capitalize" }}>{screen}</strong>
                                                                    {Object.entries(values).filter(([, value]) => value !== null && value !== "" && value !== undefined).map(([key, value]) => (
                                                                        <div key={key}>{key}: {String(value)}</div>
                                                                    ))}
                                                                </div>
                                                            ))}
                                                            <div>
                                                                <strong>Last steps</strong>
                                                                {(context.steps ?? []).length === 0 && <div>None recorded.</div>}
                                                                {(context.steps ?? []).slice(-12).map((step, index) => (
                                                                    <div key={index}>{step.what} <span style={{ color: "#94A3B8" }}>({ago(step.secondsAgo)})</span></div>
                                                                ))}
                                                            </div>
                                                            {(context.errors ?? []).length > 0 && (
                                                                <div>
                                                                    <strong style={{ color: "#B91C1C" }}>Errors the app hit</strong>
                                                                    {context.errors!.map((error, index) => (
                                                                        <div key={index}>{error.message} <span style={{ color: "#94A3B8" }}>({ago(error.secondsAgo)})</span></div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
