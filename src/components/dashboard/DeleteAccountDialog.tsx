"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Warning, X } from "@phosphor-icons/react";
import styles from "../dashboard.module.css";

/**
 * Deleting your account: says plainly what goes, asks for the password (or,
 * for a Google sign-in, the word DELETE), and only then deletes.
 */
export function DeleteAccountDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const [hasPassword, setHasPassword] = useState<boolean | null>(null);
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setPassword("");
        setConfirm("");
        setError(null);
        fetch("/api/auth/me", { cache: "no-store" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => setHasPassword(Boolean(data?.user?.hasPassword)))
            .catch(() => setHasPassword(true));
    }, [isOpen]);

    if (!isOpen) return null;

    const ready = hasPassword === null ? false : hasPassword ? password.length > 0 : confirm.trim() === "DELETE";

    const deleteNow = async () => {
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/auth/account", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(hasPassword ? { password } : { confirm: confirm.trim() }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "We couldn't delete your account just now. Please try again.");
            // Nothing of theirs is left in this browser either.
            try {
                Object.keys(localStorage).filter((key) => key.startsWith("useladder_")).forEach((key) => localStorage.removeItem(key));
                sessionStorage.clear();
            } catch {
                // Saved data is blocked: the account is deleted all the same.
            }
            window.location.href = "/";
        } catch (err) {
            setError(err instanceof Error ? err.message : "We couldn't delete your account just now. Please try again.");
            setBusy(false);
        }
    };

    return createPortal(
        <div className={styles.settingsModalOverlay} style={{ zIndex: 10001 }} onClick={busy ? undefined : onClose}>
            <div className={`${styles.settingsModalContent} ${styles.unboldedModal}`} role="dialog" aria-modal="true" aria-labelledby="delete-account-title" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
                <div className={styles.settingsModalHeader}>
                    <h2 id="delete-account-title" className={styles.settingsModalTitle} style={{ fontSize: "1.25rem" }}>Delete your account</h2>
                    <button className={styles.settingsCloseBtn} onClick={onClose} disabled={busy} aria-label="Close">
                        <X size={18} weight="bold" />
                    </button>
                </div>

                <div style={{ padding: "1.1rem 2rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "0.75rem 0.9rem", color: "#991B1B", fontSize: "0.86rem", lineHeight: 1.5 }}>
                        <Warning size={18} weight="fill" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span>This is permanent. We can&rsquo;t bring your account back once it&rsquo;s deleted.</span>
                    </div>
                    <div style={{ fontSize: "0.88rem", lineHeight: 1.55, color: "#334155" }}>
                        <p style={{ margin: "0 0 0.4rem" }}>This removes:</p>
                        <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                            <li>your profile and every resume you uploaded</li>
                            <li>your interview reports, the conversations behind them, and your Prep Score</li>
                            <li>your saved job matches and any feedback you sent us</li>
                            <li>any passes you haven&rsquo;t used</li>
                        </ul>
                        <p style={{ margin: "0.6rem 0 0", color: "#64748B" }}>We keep a record of payments you made, as we&rsquo;re required to.</p>
                    </div>

                    {hasPassword === null ? (
                        <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748B" }}>Checking your account…</p>
                    ) : hasPassword ? (
                        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.82rem", color: "#334155" }}>
                            Enter your password to confirm
                            <input
                                type="password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && deleteNow()}
                                style={{ height: 42, borderRadius: 8, border: "1px solid #CBD5E1", padding: "0 12px", fontSize: 16 }}
                            />
                        </label>
                    ) : (
                        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.82rem", color: "#334155" }}>
                            Type DELETE to confirm
                            <input
                                type="text"
                                autoComplete="off"
                                autoCapitalize="characters"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && deleteNow()}
                                style={{ height: 42, borderRadius: 8, border: "1px solid #CBD5E1", padding: "0 12px", fontSize: 16 }}
                            />
                        </label>
                    )}
                    {error && <p role="alert" style={{ margin: 0, fontSize: "0.84rem", color: "#B91C1C" }}>{error}</p>}
                </div>

                <div className={styles.settingsModalFooter} style={{ justifyContent: "flex-end" }}>
                    <button type="button" className={styles.settingsCancelFooterBtn} onClick={onClose} disabled={busy}>Keep my account</button>
                    <button
                        type="button"
                        onClick={deleteNow}
                        disabled={!ready || busy}
                        style={{ background: "#DC2626", color: "#FFFFFF", border: 0, borderRadius: 8, padding: "0.6rem 1.2rem", fontSize: "0.85rem", cursor: ready && !busy ? "pointer" : "not-allowed", opacity: ready && !busy ? 1 : 0.5 }}
                    >
                        {busy ? "Deleting…" : "Delete my account"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
