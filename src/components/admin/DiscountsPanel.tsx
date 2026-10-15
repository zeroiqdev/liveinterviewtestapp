"use client";

import React, { useCallback, useEffect, useState } from "react";
import styles from "@/components/admin.module.css";
import m from "./metrics.module.css";

interface CodeRow {
    id: string;
    code: string;
    kind: "percent" | "free_passes";
    value: number;
    description: string;
    maxUses: number | null;
    uses: number;
    expiresAt: string | null;
    active: boolean;
    note: string;
    createdAt: string;
}

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: "0.8rem", color: "#334155", minWidth: 0 };

/** Admin: make discount codes (a percentage off, or free passes) and switch them off. */
export function DiscountsPanel({ onToast }: { onToast?: (message: string) => void }) {
    const [codes, setCodes] = useState<CodeRow[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [kind, setKind] = useState<"percent" | "free_passes">("percent");
    const [value, setValue] = useState("20");
    const [code, setCode] = useState("");
    const [maxUses, setMaxUses] = useState("");
    const [expiresAt, setExpiresAt] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/discounts", { cache: "no-store" });
            if (!res.ok) throw new Error();
            setCodes((await res.json()).codes ?? []);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, []);

    useEffect(() => {
        const start = window.setTimeout(() => void load(), 0);
        return () => window.clearTimeout(start);
    }, [load]);

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        const res = await fetch("/api/admin/discounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                kind,
                value: Number(value),
                code: code.trim() || undefined,
                maxUses: maxUses.trim() ? Number(maxUses) : null,
                // End of the chosen day, Lagos time.
                expiresAt: expiresAt ? `${expiresAt}T23:59:59+01:00` : null,
                note,
            }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        setBusy(false);
        if (!res?.ok) return setError(data.error || "Couldn't create that code.");
        onToast?.(`Created ${data.code}`);
        setCode("");
        setNote("");
        void load();
    };

    const setActive = async (row: CodeRow, active: boolean) => {
        const res = await fetch("/api/admin/discounts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, active }) }).catch(() => null);
        if (!res?.ok) return onToast?.("Couldn't change that code");
        setCodes((current) => (current ?? []).map((c) => (c.id === row.id ? { ...c, active } : c)));
    };

    const remove = async (row: CodeRow) => {
        const res = await fetch(`/api/admin/discounts?id=${row.id}`, { method: "DELETE" }).catch(() => null);
        if (!res?.ok) return onToast?.("Couldn't delete that code");
        setCodes((current) => (current ?? []).filter((c) => c.id !== row.id));
        onToast?.(`Deleted ${row.code}`);
    };

    const copy = async (row: CodeRow) => {
        try {
            await navigator.clipboard.writeText(row.code);
            onToast?.(`Copied ${row.code}`);
        } catch {
            onToast?.(row.code);
        }
    };

    return (
        <div className={m.wrap}>
            <form className={m.card} onSubmit={create}>
                <h3 className={m.cardTitle}>New discount code</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.85rem", alignItems: "end" }}>
                    <label style={field}>
                        What it gives
                        <select className={styles.filterSelect} value={kind} onChange={(e) => { setKind(e.target.value as "percent" | "free_passes"); setValue(e.target.value === "percent" ? "20" : "1"); }}>
                            <option value="percent">Percentage off a pass</option>
                            <option value="free_passes">Free passes</option>
                        </select>
                    </label>
                    <label style={field}>
                        {kind === "percent" ? "Percent off (1–100)" : "Number of free passes"}
                        <input className={styles.searchInput} style={{ paddingLeft: 10 }} type="number" min={1} max={kind === "percent" ? 100 : 50} value={value} onChange={(e) => setValue(e.target.value)} />
                    </label>
                    <label style={field}>
                        Code (leave empty to make one up)
                        <input className={styles.searchInput} style={{ paddingLeft: 10, textTransform: "uppercase" }} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. LAUNCH20" maxLength={24} />
                    </label>
                    <label style={field}>
                        Use limit (optional)
                        <input className={styles.searchInput} style={{ paddingLeft: 10 }} type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="No limit" />
                    </label>
                    <label style={field}>
                        Expires (optional)
                        <input className={styles.searchInput} style={{ paddingLeft: 10 }} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                    </label>
                    <label style={field}>
                        Note (only you see it)
                        <input className={styles.searchInput} style={{ paddingLeft: 10 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Campus ambassadors" maxLength={200} />
                    </label>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "1rem" }}>
                    <button type="submit" className={styles.filterSelect} style={{ cursor: "pointer", background: "#4782F6", color: "#FFFFFF", borderColor: "#4782F6" }} disabled={busy}>
                        {busy ? "Creating…" : "Create code"}
                    </button>
                    <span style={{ fontSize: "0.78rem", color: "#64748B" }}>Each person can use a code once.</span>
                    {error && <span style={{ fontSize: "0.82rem", color: "#B91C1C" }}>{error}</span>}
                </div>
            </form>

            {failed ? (
                <p className={m.empty}>Couldn&rsquo;t load discount codes.</p>
            ) : !codes ? (
                <p className={m.empty}>Loading codes…</p>
            ) : codes.length === 0 ? (
                <p className={m.empty}>No codes yet.</p>
            ) : (
                <div className={styles.tableCard}>
                    <div className={styles.tableWrap}>
                        <table className={styles.adminTable}>
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Gives</th>
                                    <th className={m.num}>Used</th>
                                    <th>Expires</th>
                                    <th>Note</th>
                                    <th>Status</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {codes.map((row) => {
                                    const expired = row.expiresAt ? new Date(row.expiresAt).getTime() < Date.now() : false;
                                    const usedUp = row.maxUses !== null && row.uses >= row.maxUses;
                                    const status = !row.active ? "Off" : expired ? "Expired" : usedUp ? "Used up" : "Live";
                                    return (
                                        <tr key={row.id}>
                                            <td style={{ fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 600 }}>{row.code}</td>
                                            <td>{row.description}</td>
                                            <td className={m.num}>
                                                {row.uses}
                                                {row.maxUses !== null ? ` / ${row.maxUses}` : ""}
                                            </td>
                                            <td style={{ fontSize: "0.82rem", color: "#475569", whiteSpace: "nowrap" }}>
                                                {row.expiresAt ? new Date(row.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Never"}
                                            </td>
                                            <td style={{ fontSize: "0.82rem", color: "#475569" }}>{row.note || "—"}</td>
                                            <td>
                                                <span style={{ fontSize: "0.75rem", fontWeight: 500, padding: "2px 8px", borderRadius: 999, background: status === "Live" ? "#DCFCE7" : "#F1F5F9", color: status === "Live" ? "#15803D" : "#475569" }}>{status}</span>
                                            </td>
                                            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                                <span style={{ display: "inline-flex", gap: "0.4rem" }}>
                                                    <button type="button" className={styles.filterSelect} style={{ cursor: "pointer" }} onClick={() => void copy(row)}>Copy</button>
                                                    <button type="button" className={styles.filterSelect} style={{ cursor: "pointer" }} onClick={() => void setActive(row, !row.active)}>
                                                        {row.active ? "Switch off" : "Switch on"}
                                                    </button>
                                                    <button type="button" className={styles.filterSelect} style={{ cursor: "pointer", color: "#B91C1C" }} onClick={() => void remove(row)}>Delete</button>
                                                </span>
                                            </td>
                                        </tr>
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
