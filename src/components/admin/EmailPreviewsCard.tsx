"use client";

import React from "react";
import m from "./metrics.module.css";

/** When each email goes out, and links to see it with sample details. */
const EMAILS: Array<{ name: string; label: string; when: string }> = [
    { name: "verify", label: "Confirm your email", when: "Someone signs up with email and password, or asks for a new code." },
    { name: "reset", label: "Reset your password", when: "Someone asks to reset their password." },
    { name: "change-email", label: "Confirm your new email", when: "Someone changes their email in settings (sent to the new address)." },
    { name: "receipt", label: "Payment received", when: "A pass payment goes through." },
    { name: "role-added", label: "Your role is here", when: "You mark a requested role as added." },
];

export function EmailPreviewsCard() {
    return (
        <div className={m.card} style={{ marginBottom: "1.5rem" }}>
            <h3 className={m.cardTitle} style={{ marginBottom: 4 }}>Emails</h3>
            <p className={m.empty} style={{ fontSize: "0.82rem", marginBottom: 12 }}>
                Every email the site sends, with sample details. Nothing is sent from here.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {EMAILS.map((email) => (
                    <div key={email.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: "0.88rem", fontWeight: 500, color: "#0F172A" }}>{email.label}</div>
                            <div style={{ fontSize: "0.8rem", color: "#64748B" }}>{email.when}</div>
                        </div>
                        <div style={{ display: "flex", gap: 12, fontSize: "0.82rem" }}>
                            <a href={`/api/admin/email-preview?name=${email.name}`} target="_blank" rel="noreferrer" style={{ color: "#2563EB" }}>
                                Preview
                            </a>
                            <a href={`/api/admin/email-preview?name=${email.name}&format=text`} target="_blank" rel="noreferrer" style={{ color: "#64748B" }}>
                                Plain text
                            </a>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
