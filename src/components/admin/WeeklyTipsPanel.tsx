"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowsClockwise, CheckCircle, PencilSimple } from "@phosphor-icons/react";
import styles from "@/components/admin.module.css";

interface Tip {
    id: string;
    topic: string;
    title: string;
    body: string;
    tryThis: string;
    action: string;
    status: "draft" | "approved";
    edited: boolean;
}
interface FamilyRow {
    family: string;
    label: string;
    tip: Tip | null;
}

const TOPICS = ["Job search", "Interviews", "Career growth", "Your CV"];
/** What the button under a tip does, in the words users see on it. */
const ACTIONS: Record<string, string> = {
    jobs: "Find jobs to apply for (opens the jobs board)",
    practice: "Practise this now (starts an interview)",
    resume: "Work on my resume (opens the resume review)",
    none: "No button",
};

/** The Monday a week number starts on, e.g. "Mon 19 Oct". */
function weekStart(week: number): string {
    return new Date(Date.UTC(2024, 0, 1) + week * 7 * 86400000).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Admin: the weekly tips before they go out. Each role's tip is written as a
 * draft; here it can be reworded, written again, or approved. Users only ever
 * see approved tips.
 */
export function WeeklyTipsPanel({ onToast }: { onToast: (message: string) => void }) {
    const [thisWeek, setThisWeek] = useState<number | null>(null);
    const [week, setWeek] = useState<number | null>(null);
    const [rows, setRows] = useState<FamilyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ id: string; topic: string; title: string; body: string; tryThis: string; action: string } | null>(null);

    // The page's toast function is new on every render: hold it so loading isn't restarted by it.
    const toastRef = useRef(onToast);
    toastRef.current = onToast;

    const load = useCallback(async (forWeek?: number | null) => {
        try {
            const res = await fetch(`/api/admin/weekly-tips${forWeek != null ? `?week=${forWeek}` : ""}`, { cache: "no-store" });
            if (!res.ok) throw new Error();
            const data = await res.json();
            setRows(data.families ?? []);
            setThisWeek(data.thisWeek);
            setWeek(data.week);
        } catch {
            toastRef.current("Couldn't load the weekly tips.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load(null);
    }, [load]);

    const send = async (method: "POST" | "PATCH", body: Record<string, unknown>, busyKey: string, done: string) => {
        setBusy(busyKey);
        try {
            const res = await fetch("/api/admin/weekly-tips", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "That didn't work. Please try again.");
            onToast(done);
            await load(week);
            return true;
        } catch (err) {
            onToast(err instanceof Error ? err.message : "That didn't work. Please try again.");
            return false;
        } finally {
            setBusy(null);
        }
    };

    if (loading || week === null || thisWeek === null) return <div className={styles.emptyState}>Loading weekly tips…</div>;

    const drafts = rows.filter((row) => row.tip?.status === "draft").length;
    const approved = rows.filter((row) => row.tip?.status === "approved").length;
    const missing = rows.filter((row) => !row.tip).length;
    const isThisWeek = week === thisWeek;

    return (
        <div>
            <div className={styles.actionRow}>
                <div className={styles.searchFilterGroup}>
                    <select
                        className={styles.filterSelect}
                        value={week}
                        aria-label="Week"
                        onChange={(e) => {
                            setEditing(null);
                            setLoading(true);
                            void load(Number(e.target.value));
                        }}
                    >
                        <option value={thisWeek}>This week (from {weekStart(thisWeek)})</option>
                        <option value={thisWeek + 1}>Next week (from {weekStart(thisWeek + 1)})</option>
                    </select>
                    <span style={{ fontSize: "0.85rem", color: "#475569" }}>
                        {approved} approved · {drafts} waiting for you · {missing} not written
                    </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className={styles.secondaryBtn} disabled={busy !== null} onClick={() => send("POST", { week }, "write", "Tips written. Review them below.")}>
                        <ArrowsClockwise size={14} /> {busy === "write" ? "Writing…" : missing === rows.length ? "Write this week's tips" : "Write the missing tips"}
                    </button>
                    <button type="button" className={styles.primaryBtn} disabled={busy !== null || drafts === 0} onClick={() => send("PATCH", { week, approveAll: true }, "approveAll", "All drafts approved.")}>
                        <CheckCircle size={14} /> Approve all {drafts > 0 ? `(${drafts})` : ""}
                    </button>
                </div>
            </div>

            <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748B", maxWidth: 760 }}>
                {isThisWeek
                    ? "People see a tip here as soon as you approve it. A role with nothing approved shows the standard tip for the week instead, never a draft."
                    : "These go out on Monday. Next week's tips are written every Thursday so you have time to read them. Anything not approved by Monday is replaced by the standard tip for the week."}
            </p>

            <div style={{ display: "grid", gap: "0.75rem" }}>
                {rows.map(({ family, label, tip }) => {
                    const isEditing = tip && editing?.id === tip.id;
                    return (
                        <div key={family} className={styles.tableCard} style={{ padding: "1rem 1.15rem" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: tip ? 10 : 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <strong style={{ fontSize: "0.95rem" }}>{label}</strong>
                                    {tip ? (
                                        <span className={tip.status === "approved" ? styles.badgeScraped : styles.badgeManual}>{tip.status === "approved" ? "Approved" : "Waiting for you"}</span>
                                    ) : (
                                        <span className={styles.badgeCategory}>Not written</span>
                                    )}
                                    {tip?.edited && <span className={styles.badgeDomain}>Edited by you</span>}
                                </div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <button type="button" className={styles.secondaryBtn} disabled={busy !== null} onClick={() => send("POST", { week, family }, `write-${family}`, `New tip written for ${label}.`)}>
                                        <ArrowsClockwise size={14} /> {busy === `write-${family}` ? "Writing…" : tip ? "Write another" : "Write"}
                                    </button>
                                    {tip && !isEditing && (
                                        <button type="button" className={styles.secondaryBtn} disabled={busy !== null} onClick={() => setEditing({ id: tip.id, topic: tip.topic, title: tip.title, body: tip.body, tryThis: tip.tryThis, action: tip.action })}>
                                            <PencilSimple size={14} /> Edit
                                        </button>
                                    )}
                                    {tip && !isEditing && (
                                        <button
                                            type="button"
                                            className={tip.status === "approved" ? styles.secondaryBtn : styles.primaryBtn}
                                            disabled={busy !== null}
                                            onClick={() => send("PATCH", { id: tip.id, status: tip.status === "approved" ? "draft" : "approved" }, `status-${tip.id}`, tip.status === "approved" ? "Taken back. It's a draft again." : "Approved.")}
                                        >
                                            <CheckCircle size={14} /> {tip.status === "approved" ? "Take back" : "Approve"}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {tip && !isEditing && (
                                <div style={{ fontSize: "0.9rem", lineHeight: 1.5, color: "#1E293B", maxWidth: 760 }}>
                                    <div style={{ fontSize: "0.75rem", color: "#2563EB", fontWeight: 600, marginBottom: 2 }}>{tip.topic}</div>
                                    <div style={{ fontWeight: 600 }}>{tip.title}</div>
                                    <div style={{ color: "#475569", marginTop: 2 }}>{tip.body}</div>
                                    {tip.tryThis && <div style={{ marginTop: 6, color: "#0F172A" }}><span style={{ color: "#64748B" }}>Try this: </span>{tip.tryThis}</div>}
                                    <div style={{ marginTop: 4, fontSize: "0.82rem", color: "#64748B" }}>Button: {ACTIONS[tip.action] ?? ACTIONS.none}</div>
                                </div>
                            )}

                            {tip && isEditing && editing && (
                                <div style={{ display: "grid", gap: 10, maxWidth: 760 }}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel} htmlFor={`topic-${tip.id}`}>Topic</label>
                                        <select id={`topic-${tip.id}`} className={styles.filterSelect} value={editing.topic} onChange={(e) => setEditing({ ...editing, topic: e.target.value })}>
                                            {TOPICS.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel} htmlFor={`title-${tip.id}`}>The tip in one line</label>
                                        <input id={`title-${tip.id}`} className={styles.inputField} value={editing.title} maxLength={90} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel} htmlFor={`body-${tip.id}`}>The advice ({editing.body.length}/420)</label>
                                        <textarea id={`body-${tip.id}`} className={styles.textAreaField} rows={4} value={editing.body} maxLength={420} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel} htmlFor={`try-${tip.id}`}>Try this (one small thing to do)</label>
                                        <input id={`try-${tip.id}`} className={styles.inputField} value={editing.tryThis} maxLength={140} onChange={(e) => setEditing({ ...editing, tryThis: e.target.value })} />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel} htmlFor={`action-${tip.id}`}>Button under the tip</label>
                                        <select id={`action-${tip.id}`} className={styles.filterSelect} value={editing.action} onChange={(e) => setEditing({ ...editing, action: e.target.value })}>
                                            {Object.entries(ACTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button type="button" className={styles.secondaryBtn} disabled={busy !== null} onClick={() => setEditing(null)}>Cancel</button>
                                        <button
                                            type="button"
                                            className={styles.secondaryBtn}
                                            disabled={busy !== null}
                                            onClick={async () => {
                                                if (await send("PATCH", { ...editing }, `save-${tip.id}`, "Saved.")) setEditing(null);
                                            }}
                                        >
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.primaryBtn}
                                            disabled={busy !== null}
                                            onClick={async () => {
                                                if (await send("PATCH", { ...editing, status: "approved" }, `save-${tip.id}`, "Saved and approved.")) setEditing(null);
                                            }}
                                        >
                                            <CheckCircle size={14} /> Save and approve
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
