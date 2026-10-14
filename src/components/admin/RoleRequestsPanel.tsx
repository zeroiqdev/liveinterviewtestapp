"use client";

import React, { useCallback, useEffect, useState } from "react";
import styles from "@/components/admin.module.css";

interface RoleRequestItem {
    id: string;
    role: string;
    count: number;
    emails: string[];
    lastRequestedAt: string;
}

/** Admin: roles visitors asked for that aren't on the list, most requested first. */
export function RoleRequestsPanel({ onToast }: { onToast?: (message: string) => void }) {
    const [items, setItems] = useState<RoleRequestItem[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [roles, setRoles] = useState<string[]>([]);
    const [telling, setTelling] = useState<{ id: string; role: string } | null>(null);
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/role-requests", { cache: "no-store" });
            if (!res.ok) throw new Error();
            const data = await res.json();
            setItems(data.requests ?? []);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, []);

    useEffect(() => {
        fetch("/api/roles")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => Array.isArray(data?.roles) && setRoles(data.roles.map((r: { title: string }) => r.title)))
            .catch(() => undefined);
        const start = window.setTimeout(() => void load(), 0);
        return () => window.clearTimeout(start);
    }, [load]);

    const remove = async (item: RoleRequestItem) => {
        const res = await fetch(`/api/admin/role-requests?id=${item.id}`, { method: "DELETE" }).catch(() => null);
        if (res?.ok) {
            setItems((current) => (current ?? []).filter((r) => r.id !== item.id));
            onToast?.(`Cleared the request for ${item.role}`);
        } else {
            onToast?.("Couldn't clear that request");
        }
    };

    const startTelling = (item: RoleRequestItem) => {
        const match = roles.find((title) => title.toLowerCase() === item.role.toLowerCase());
        setTelling({ id: item.id, role: match ?? "" });
    };

    const tell = async (item: RoleRequestItem) => {
        if (!telling?.role || sending) return;
        setSending(true);
        const res = await fetch("/api/admin/role-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id, role: telling.role }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        setSending(false);
        if (!res?.ok) return onToast?.(data.error || "Couldn't send those emails");
        setTelling(null);
        if (data.failed > 0) {
            onToast?.(`Sent ${data.sent}, ${data.failed} failed. The request is kept so you can try again.`);
        } else {
            setItems((current) => (current ?? []).filter((r) => r.id !== item.id));
            onToast?.(data.sent > 0 ? `Told ${data.sent} ${data.sent === 1 ? "person" : "people"} about ${telling.role}` : `Cleared the request for ${item.role}`);
        }
    };

    if (failed) return <p style={{ fontSize: "0.85rem", color: "#B91C1C", margin: "0 0 1.25rem" }}>Couldn&rsquo;t load role requests.</p>;
    if (!items || items.length === 0) return null;

    return (
        <div style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ margin: "0 0 0.25rem", fontSize: "1rem", fontWeight: 600, color: "#0F172A" }}>Requested roles</h3>
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "#475569" }}>
                Roles people looked for and couldn&rsquo;t find. Add the popular ones below, then choose Mark as added to email everyone who asked to be told.
            </p>
            <div className={styles.tableCard}>
                <div className={styles.tableWrap}>
                    <table className={styles.adminTable}>
                        <thead>
                            <tr>
                                <th>Role</th>
                                <th>Requests</th>
                                <th>Wants to be told</th>
                                <th>Last asked</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item) => (
                                <tr key={item.id}>
                                    <td style={{ fontWeight: 500 }}>{item.role}</td>
                                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{item.count}</td>
                                    <td style={{ fontSize: "0.82rem", color: "#475569" }}>{item.emails.length > 0 ? item.emails.join(", ") : "—"}</td>
                                    <td style={{ fontSize: "0.82rem", color: "#475569", whiteSpace: "nowrap" }}>
                                        {new Date(item.lastRequestedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                                    </td>
                                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                        {telling?.id === item.id ? (
                                            <span style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
                                                <select
                                                    className={styles.filterSelect}
                                                    value={telling.role}
                                                    onChange={(e) => setTelling({ id: item.id, role: e.target.value })}
                                                    aria-label="The role it was added as"
                                                >
                                                    <option value="">Added as…</option>
                                                    {roles.map((title) => (
                                                        <option key={title} value={title}>{title}</option>
                                                    ))}
                                                </select>
                                                <button type="button" className={styles.filterSelect} style={{ cursor: "pointer" }} onClick={() => void tell(item)} disabled={!telling.role || sending}>
                                                    {sending ? "Sending…" : item.emails.length > 0 ? `Email ${item.emails.length}` : "Done"}
                                                </button>
                                                <button type="button" className={styles.filterSelect} style={{ cursor: "pointer" }} onClick={() => setTelling(null)}>
                                                    Cancel
                                                </button>
                                            </span>
                                        ) : (
                                            <span style={{ display: "inline-flex", gap: "0.4rem" }}>
                                                <button type="button" className={styles.filterSelect} style={{ cursor: "pointer" }} onClick={() => startTelling(item)} title="The role is on the list now: tell the people who asked">
                                                    Mark as added
                                                </button>
                                                <button type="button" className={styles.filterSelect} style={{ cursor: "pointer" }} onClick={() => remove(item)}>
                                                    Clear
                                                </button>
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
