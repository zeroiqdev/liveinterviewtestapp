"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "@phosphor-icons/react";
import styles from "./dashboard.module.css";

type Product = "day" | "week";

const OFFERS: Array<{ product: Product; name: string; price: string; detail: string; note?: string }> = [
    { product: "day", name: "Day Pass", price: "₦1,500", detail: "24 hours of interviews, starting when you begin your first one." },
    { product: "week", name: "1-Week Bundle", price: "₦6,500", detail: "Seven Day Passes. Use them on any seven days you like.", note: "Save ₦4,000" },
];

interface PassDialogProps {
    isOpen: boolean;
    onClose: () => void;
    /** Why it opened: sets the heading. */
    reason?: "used-free" | "browse";
}

/**
 * Getting a pass. Picks a pass and sends the person to Bachs' payment page;
 * they come back to /payment/complete, where the payment is confirmed.
 */
export default function PassDialog({ isOpen, onClose, reason = "browse" }: PassDialogProps) {
    const [product, setProduct] = useState<Product>("day");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setBusy(false);
            setError(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const pay = async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/payments/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.url) throw new Error(data.error || "We couldn't open the payment page. Please try again.");
            try {
                // So the return page can confirm this checkout even if the address loses its id.
                sessionStorage.setItem("useladder_checkout_id", data.checkoutId);
            } catch {
                // Saved data is blocked: the return page falls back to the latest checkout.
            }
            window.location.href = data.url;
        } catch (err) {
            setError(err instanceof Error ? err.message : "We couldn't open the payment page. Please try again.");
            setBusy(false);
        }
    };

    return createPortal(
        <div className={styles.settingsModalOverlay} style={{ zIndex: 10001 }} onClick={busy ? undefined : onClose}>
            <div className={`${styles.settingsModalContent} ${styles.unboldedModal}`} role="dialog" aria-modal="true" aria-labelledby="pass-title" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
                <div className={styles.settingsModalHeader}>
                    <div>
                        <h2 id="pass-title" className={styles.settingsModalTitle} style={{ fontSize: "1.3rem" }}>
                            {reason === "used-free" ? "Keep practising with a pass" : "Get a pass"}
                        </h2>
                        {reason === "used-free" && (
                            <p style={{ margin: "0.35rem 0 0", fontSize: "0.86rem", color: "#64748B", lineHeight: 1.45 }}>
                                You&rsquo;ve used your free interview. A pass gives you as many interviews as you like for 24 hours.
                            </p>
                        )}
                    </div>
                    <button className={styles.settingsCloseBtn} onClick={onClose} disabled={busy} aria-label="Close">
                        <X size={18} weight="bold" />
                    </button>
                </div>

                <div style={{ padding: "1.1rem 2rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.7rem" }} role="radiogroup" aria-label="Choose a pass">
                    {OFFERS.map((offer) => {
                        const selected = product === offer.product;
                        return (
                            <button
                                key={offer.product}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => setProduct(offer.product)}
                                style={{ textAlign: "left", fontFamily: "inherit", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start", padding: "0.9rem 1rem", borderRadius: 12, background: selected ? "#EEF4FF" : "#FFFFFF", border: `1px solid ${selected ? "#4782F6" : "#E2E8F0"}` }}
                            >
                                <span style={{ flex: "0 0 20px", height: 20, marginTop: 2, borderRadius: "50%", border: `1.5px solid ${selected ? "#4782F6" : "#CBD5E1"}`, background: selected ? "#4782F6" : "#FFFFFF", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    {selected && <Check size={12} weight="bold" />}
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                                        <span style={{ fontSize: "0.98rem", fontWeight: 500, color: "#1E2540" }}>{offer.name}</span>
                                        <span style={{ fontSize: "1rem", fontWeight: 600, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>{offer.price}</span>
                                    </span>
                                    <span style={{ display: "block", fontSize: "0.84rem", color: "#64748B", lineHeight: 1.45, marginTop: 2 }}>{offer.detail}</span>
                                    {offer.note && <span style={{ display: "inline-block", marginTop: 6, fontSize: "0.72rem", color: "#15803D", background: "#DCFCE7", borderRadius: 999, padding: "2px 8px" }}>{offer.note}</span>}
                                </span>
                            </button>
                        );
                    })}
                    {error && <p role="alert" style={{ margin: 0, fontSize: "0.84rem", color: "#B91C1C" }}>{error}</p>}
                </div>

                <div className={styles.settingsModalFooter}>
                    <span style={{ fontSize: "0.78rem", color: "#64748B" }}>Pay by card or bank transfer on the next screen.</span>
                    <button type="button" className={styles.settingsSaveFooterBtn} onClick={pay} disabled={busy} style={busy ? { opacity: 0.6, cursor: "wait" } : undefined}>
                        {busy ? "Opening…" : "Continue to payment"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
