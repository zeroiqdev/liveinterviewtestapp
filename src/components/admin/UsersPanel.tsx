"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CaretDown, MagnifyingGlass, X } from "@phosphor-icons/react";
import styles from "@/components/admin.module.css";

interface UserRow {
    email: string;
    name: string;
    role: string;
    experience: string;
    provider: string;
    joined: string;
    lastSeenAt: string | null;
    country: string | null;
    city: string | null;
    interviews: number;
    storedReports: number;
    lastInterviewAt: string | null;
    prepScore: number;
    resumes: number;
    coachMessagesOpened: number;
}
interface Interview {
    sessionId: string;
    score: number;
    minutes: number;
    role: string | null;
    company: string | null;
    interviewType: string | null;
    mode: string | null;
    createdAt: string;
    transcript: Array<{ role: string; text: string }>;
}
interface Detail {
    interviews: Interview[];
    coachReads: Array<{ kind: string; label: string | null; readAt: string }>;
}

const EXPERIENCE: Record<string, string> = { none: "No job experience", "0-3": "0–3 years", "3-5": "3–5 years", "5+": "5+ years" };

/** A country's name from its two-letter code ("NG" → "Nigeria"). */
function countryName(code: string | null): string {
    if (!code) return "Unknown";
    try {
        return new Intl.DisplayNames(undefined, { type: "region" }).of(code) || code;
    } catch {
        return code;
    }
}
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
function ago(value: string | null): string {
    if (!value) return "Never";
    const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    if (minutes < 60) return minutes <= 1 ? "Just now" : `${minutes} min ago`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
    const days = Math.round(minutes / 1440);
    return days === 1 ? "Yesterday" : `${days} days ago`;
}

/** Admin: who uses the product, where from, and what they have done in it. */
export function UsersPanel() {
    const [users, setUsers] = useState<UserRow[]>([]);
    const [byCountry, setByCountry] = useState<Array<{ country: string; count: number }>>([]);
    const [coachMessages, setCoachMessages] = useState<Array<{ kind: string; people: number }>>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [search, setSearch] = useState("");
    const [country, setCountry] = useState("all");
    const [selected, setSelected] = useState<UserRow | null>(null);
    const [detail, setDetail] = useState<Detail | null>(null);
    const [openInterview, setOpenInterview] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/admin/users", { cache: "no-store" })
            .then((res) => (res.ok ? res.json() : Promise.reject()))
            .then((data) => {
                setUsers(data.users ?? []);
                setByCountry(data.byCountry ?? []);
                setCoachMessages(data.coachMessages ?? []);
            })
            .catch(() => setFailed(true))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!selected) return;
        let cancelled = false;
        fetch(`/api/admin/users?email=${encodeURIComponent(selected.email)}`, { cache: "no-store" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!cancelled && data) setDetail(data);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [selected]);

    // Opening someone clears what was showing for the person before them.
    const openUser = (user: UserRow) => {
        setDetail(null);
        setOpenInterview(null);
        setSelected(user);
    };

    const shown = useMemo(() => {
        const query = search.trim().toLowerCase();
        return users.filter(
            (user) =>
                (country === "all" || (user.country ?? "Unknown") === country) &&
                (!query || user.email.toLowerCase().includes(query) || user.name.toLowerCase().includes(query) || user.role.toLowerCase().includes(query))
        );
    }, [users, search, country]);

    if (loading) return <div className={styles.emptyState}>Loading users…</div>;
    if (failed) return <div className={styles.emptyState}>Couldn&rsquo;t load users. Refresh to try again.</div>;

    const located = users.filter((user) => user.country).length;

    return (
        <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "0 0 0.5rem" }}>
                {byCountry.slice(0, 8).map((row) => (
                    <button
                        key={row.country}
                        type="button"
                        className={styles.badgeCategory}
                        style={{ cursor: "pointer", border: country === row.country ? "1px solid #2563EB" : undefined }}
                        onClick={() => setCountry(country === row.country ? "all" : row.country)}
                    >
                        {countryName(row.country === "Unknown" ? null : row.country)} · {row.count}
                    </button>
                ))}
            </div>
            <p style={{ margin: "0 0 1rem", fontSize: "0.8rem", color: "#64748B" }}>
                {located} of {users.length} people have a location. It is filled in the next time each person opens the app on the live site.
            </p>

            {coachMessages.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: "0 0 1rem" }}>
                    <span style={{ fontSize: "0.82rem", color: "#475569" }}>Coach messages opened:</span>
                    {coachMessages.map((row) => (
                        <span key={row.kind} className={styles.badgeDomain}>{row.kind} · {row.people}</span>
                    ))}
                </div>
            )}

            <div className={styles.actionRow}>
                <div className={styles.searchFilterGroup}>
                    <div className={styles.searchInputWrap}>
                        <MagnifyingGlass size={16} className={styles.searchIcon} />
                        <input className={styles.searchInput} placeholder="Search by name, email or role" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" />
                    </div>
                    <select className={styles.filterSelect} value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
                        <option value="all">All countries</option>
                        {byCountry.map((row) => (
                            <option key={row.country} value={row.country}>{countryName(row.country === "Unknown" ? null : row.country)} ({row.count})</option>
                        ))}
                    </select>
                </div>
                <span style={{ fontSize: "0.85rem", color: "#475569" }}>{shown.length} of {users.length} people</span>
            </div>

            <div className={styles.tableCard}>
                <div className={styles.tableWrap}>
                    <table className={styles.adminTable}>
                        <thead>
                            <tr>
                                <th>Person</th>
                                <th>Role</th>
                                <th>Location</th>
                                <th>Interviews</th>
                                <th>Prep Score</th>
                                <th>Last here</th>
                                <th>Joined</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((user) => (
                                <tr key={user.email} onClick={() => openUser(user)} style={{ cursor: "pointer" }} title="See their interviews">
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{user.name || user.email}</div>
                                        <div style={{ fontSize: "0.78rem", color: "#64748B" }}>{user.email}</div>
                                    </td>
                                    <td>
                                        <div>{user.role}</div>
                                        <div style={{ fontSize: "0.78rem", color: "#64748B" }}>{EXPERIENCE[user.experience] || ""}</div>
                                    </td>
                                    <td>{user.country ? [user.city, countryName(user.country)].filter(Boolean).join(", ") : <span style={{ color: "#94A3B8" }}>Not known yet</span>}</td>
                                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{user.interviews}</td>
                                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{user.interviews > 0 ? user.prepScore : "—"}</td>
                                    <td style={{ fontSize: "0.82rem", color: "#475569", whiteSpace: "nowrap" }}>{ago(user.lastSeenAt)}</td>
                                    <td style={{ fontSize: "0.82rem", color: "#475569", whiteSpace: "nowrap" }}>{day(user.joined)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {selected && (
                <div className={styles.modalBackdrop} onClick={() => setSelected(null)}>
                    <div className={styles.modalBox} style={{ maxWidth: 760, width: "100%" }} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h3 className={styles.modalTitle}>{selected.name || selected.email}</h3>
                                <div style={{ fontSize: "0.82rem", color: "#64748B" }}>
                                    {selected.email} · {selected.role}
                                    {selected.country ? ` · ${[selected.city, countryName(selected.country)].filter(Boolean).join(", ")}` : ""}
                                </div>
                            </div>
                            <button type="button" className={styles.closeBtn} onClick={() => setSelected(null)} aria-label="Close">
                                <X size={16} />
                            </button>
                        </div>
                        <div className={styles.modalBody} style={{ maxHeight: "70vh", overflowY: "auto" }}>
                            {!detail ? (
                                <div className={styles.emptyState}>Loading…</div>
                            ) : (
                                <>
                                    <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>Interviews ({detail.interviews.length})</h4>
                                    {detail.interviews.length === 0 && (
                                        <p style={{ fontSize: "0.85rem", color: "#64748B", margin: "0 0 1rem" }}>
                                            {selected.interviews > 0 ? "Their interviews were done before conversations were kept, so there is nothing to read here." : "No interviews yet."}
                                        </p>
                                    )}
                                    {detail.interviews.map((interview) => {
                                        const open = openInterview === interview.sessionId;
                                        return (
                                            <div key={interview.sessionId} style={{ border: "1px solid #E2E8F0", borderRadius: 10, marginBottom: 8 }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setOpenInterview(open ? null : interview.sessionId)}
                                                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0.7rem 0.9rem", background: "none", border: 0, cursor: "pointer", textAlign: "left" }}
                                                >
                                                    <span>
                                                        <span style={{ fontWeight: 500 }}>{interview.interviewType || interview.role || "Interview"}</span>
                                                        <span style={{ display: "block", fontSize: "0.78rem", color: "#64748B" }}>
                                                            {[day(interview.createdAt), `${interview.minutes} min`, interview.mode, interview.company].filter(Boolean).join(" · ")}
                                                        </span>
                                                    </span>
                                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                                        <span className={styles.badgeCategory}>{interview.score}/100</span>
                                                        <CaretDown size={12} weight="bold" style={{ transform: open ? "rotate(180deg)" : "none" }} />
                                                    </span>
                                                </button>
                                                {open && (
                                                    <div style={{ padding: "0 0.9rem 0.9rem", display: "grid", gap: 8 }}>
                                                        {interview.transcript.length === 0 && <p style={{ fontSize: "0.82rem", color: "#64748B", margin: 0 }}>The conversation wasn&rsquo;t kept for this interview.</p>}
                                                        {interview.transcript.map((turn, index) => (
                                                            <div key={index} style={{ fontSize: "0.85rem", lineHeight: 1.5, background: turn.role === "candidate" ? "#F8FAFC" : "#EFF6FF", borderRadius: 8, padding: "0.5rem 0.7rem" }}>
                                                                <div style={{ fontSize: "0.72rem", fontWeight: 600, color: turn.role === "candidate" ? "#475569" : "#2563EB", marginBottom: 2 }}>
                                                                    {turn.role === "candidate" ? "Candidate" : "Interviewer"}
                                                                </div>
                                                                {turn.text}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    <h4 style={{ margin: "1.25rem 0 0.5rem", fontSize: "0.9rem" }}>Coach messages opened ({detail.coachReads.length})</h4>
                                    {detail.coachReads.length === 0 ? (
                                        <p style={{ fontSize: "0.85rem", color: "#64748B", margin: 0 }}>None recorded yet.</p>
                                    ) : (
                                        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                                            {detail.coachReads.map((read, index) => (
                                                <li key={index} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.85rem" }}>
                                                    <span>{read.label || read.kind}</span>
                                                    <span style={{ color: "#64748B", whiteSpace: "nowrap" }}>{ago(read.readAt)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
