"use client";

import React, { useState } from "react";
import styles from "@/components/admin.module.css";
import m from "./metrics.module.css";

interface VoiceCheck {
    ok: boolean;
    voice: string;
    voicing: string;
    saving: string;
    seconds?: number;
    suspicious: string[];
    settings: Record<string, boolean | string | null>;
}

/**
 * Admin: can this deployment voice a new line? Lines recorded ahead play from
 * storage either way; greetings with names and follow-ups need this to work.
 */
export function VoiceCheckCard() {
    const [result, setResult] = useState<VoiceCheck | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    const run = async () => {
        setBusy(true);
        setFailed(false);
        try {
            const res = await fetch("/api/admin/voice-check", { cache: "no-store" });
            if (!res.ok) throw new Error();
            setResult(await res.json());
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={m.card} style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                    <h3 className={m.cardTitle} style={{ marginBottom: 4 }}>Voice check</h3>
                    <p className={m.empty} style={{ fontSize: "0.82rem" }}>Tests whether this site can voice a new line, such as a greeting with someone&rsquo;s name or a follow-up question.</p>
                </div>
                <button type="button" className={styles.filterSelect} style={{ cursor: "pointer" }} onClick={() => void run()} disabled={busy}>
                    {busy ? "Checking…" : "Run voice check"}
                </button>
            </div>
            {failed && <p style={{ margin: "0.75rem 0 0", fontSize: "0.85rem", color: "#B91C1C" }}>The check itself didn&rsquo;t run. Refresh and try again.</p>}
            {result && (
                <div style={{ marginTop: "0.9rem", display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.86rem" }}>
                    <p style={{ margin: 0, fontWeight: 600, color: result.ok ? "#15803D" : "#B91C1C" }}>
                        {result.ok ? `Working: ${result.voice} voiced a line in ${result.seconds}s and it was saved.` : "Not working."}
                    </p>
                    {!result.ok && (
                        <>
                            <p style={{ margin: 0 }}>Voicing: {result.voicing}</p>
                            <p style={{ margin: 0 }}>Saving: {result.saving}</p>
                        </>
                    )}
                    {result.suspicious.length > 0 && (
                        <p style={{ margin: 0, color: "#B45309" }}>
                            {result.suspicious.join(" and ")} {result.suspicious.length === 1 ? "has" : "have"} spaces or quotes around the value in your deployment settings. Remove them.
                        </p>
                    )}
                    <dl style={{ margin: "0.25rem 0 0", display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.2rem 1rem", fontSize: "0.8rem", color: "#475569" }}>
                        {Object.entries(result.settings).map(([name, value]) => (
                            <React.Fragment key={name}>
                                <dt style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{name}</dt>
                                <dd style={{ margin: 0 }}>{value === true ? "set" : value === false || value === null ? <b style={{ color: "#B91C1C" }}>missing</b> : String(value)}</dd>
                            </React.Fragment>
                        ))}
                    </dl>
                </div>
            )}
        </div>
    );
}
