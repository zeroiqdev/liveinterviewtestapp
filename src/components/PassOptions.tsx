"use client";

import React, { useState } from "react";
import { Check } from "@phosphor-icons/react";
import styles from "./dashboard.module.css";
import { priceForPasses } from "@/lib/passes";
import { discountedAmount } from "@/lib/discounts";

type Product = "day" | "week";

const OFFERS: Array<{ product: Product; name: string; amount: number; detail: string; note?: string }> = [
    { product: "day", name: "Day Pass", amount: priceForPasses(1), detail: "24 hours of interviews, starting when you begin your first one." },
    { product: "week", name: "1-Week Bundle", amount: priceForPasses(7), detail: "Seven Day Passes. Use them on any seven days you like.", note: "Save ₦4,000" },
];

const naira = (amount: number) => `₦${amount.toLocaleString("en-NG")}`;

interface AppliedCode {
    code: string;
    kind: "percent" | "free_passes";
    value: number;
    description: string;
}

interface PassOptionsProps {
    /** Passes were added without paying (a code): carry on, e.g. start the interview. */
    onGranted?: () => void;
    /** What the button says once passes are added. */
    grantedLabel?: string;
    /** Padding around the options, to fit the dialog or the set-up modal. */
    padding?: string;
    /** Class for the row holding the main button (the dialog uses its footer). */
    actionClassName?: string;
    /** Locks closing while a payment page is opening. */
    onBusyChange?: (busy: boolean) => void;
}

/**
 * Choosing a pass: the passes, a discount code, and the button that pays (on
 * Bachs' page) or, for a free-passes code, adds the passes straight away.
 * Used in the pass dialog and as the last step of setting up an interview.
 */
export default function PassOptions({ onGranted, grantedLabel = "Start practising", padding = "1.1rem 2rem 1.25rem", actionClassName, onBusyChange }: PassOptionsProps) {
    const [product, setProduct] = useState<Product>("day");
    const [busy, setBusyState] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Discount codes: typed, checked, then either applied to the price or used for free passes.
    const [showCode, setShowCode] = useState(false);
    const [codeInput, setCodeInput] = useState("");
    const [applied, setApplied] = useState<AppliedCode | null>(null);
    const [codeError, setCodeError] = useState<string | null>(null);
    const [codeBusy, setCodeBusy] = useState(false);
    const [granted, setGranted] = useState<{ passes: number; reference: string } | null>(null);

    const setBusy = (value: boolean) => {
        setBusyState(value);
        onBusyChange?.(value);
    };

    const applyCode = async () => {
        if (codeBusy || !codeInput.trim()) return;
        setCodeBusy(true);
        setCodeError(null);
        try {
            const res = await fetch("/api/payments/discount", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: codeInput, product }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "That code isn't valid.");
            setApplied({ code: data.code, kind: data.kind, value: data.value, description: data.description });
        } catch (err) {
            setApplied(null);
            setCodeError(err instanceof Error ? err.message : "That code isn't valid.");
        } finally {
            setCodeBusy(false);
        }
    };

    const redeem = async () => {
        if (!applied || busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/payments/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: applied.code }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "We couldn't use that code.");
            setGranted({ passes: data.passes, reference: data.reference });
        } catch (err) {
            setError(err instanceof Error ? err.message : "We couldn't use that code.");
        } finally {
            setBusy(false);
        }
    };

    const freePasses = applied?.kind === "free_passes";

    const pay = async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/payments/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product, discountCode: applied?.kind === "percent" ? applied.code : undefined }) });
            const data = await res.json().catch(() => ({}));
            // The code took the price to nothing: the passes are already on the account.
            if (res.ok && data.granted) {
                setGranted({ passes: product === "week" ? 7 : 1, reference: data.reference });
                setBusy(false);
                return;
            }
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

    return (
        <>
                {granted ? (
                    <div style={{ padding, display: "flex", flexDirection: "column", gap: "0.9rem" }} role="status">
                        <p style={{ margin: 0, fontSize: "1rem", color: "#0F172A" }}>
                            {granted.passes} {granted.passes === 1 ? "pass has" : "passes have"} been added to your account. Each one gives you 24 hours of interviews, starting when you begin the first.
                        </p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button type="button" className={styles.settingsSaveFooterBtn} onClick={() => (onGranted ? onGranted() : window.location.reload())}>
                                {grantedLabel}
                            </button>
                            <a href={`/payment/receipt/${encodeURIComponent(granted.reference)}`} style={{ alignSelf: "center", fontSize: "0.86rem", color: "#2563EB" }}>
                                See receipt
                            </a>
                        </div>
                    </div>
                ) : (
                <>
                <div style={{ padding, display: "flex", flexDirection: "column", gap: "0.7rem" }} role="radiogroup" aria-label="Choose a pass">
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
                                        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, fontSize: "1rem", fontWeight: 600, color: "#0F172A", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                                            {applied?.kind === "percent" ? (
                                                <>
                                                    <s style={{ color: "#94A3B8", fontWeight: 400, fontSize: "0.8rem" }}>{naira(offer.amount)}</s>
                                                    {naira(discountedAmount(offer.amount, applied))}
                                                </>
                                            ) : (
                                                naira(offer.amount)
                                            )}
                                        </span>
                                    </span>
                                    <span style={{ display: "block", fontSize: "0.84rem", color: "#64748B", lineHeight: 1.45, marginTop: 2 }}>{offer.detail}</span>
                                    {offer.note && <span style={{ display: "inline-block", marginTop: 6, fontSize: "0.72rem", color: "#15803D", background: "#DCFCE7", borderRadius: 999, padding: "2px 8px" }}>{offer.note}</span>}
                                </span>
                            </button>
                        );
                    })}
                    {!showCode && !applied ? (
                        <button type="button" onClick={() => setShowCode(true)} style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, fontFamily: "inherit", fontSize: "0.84rem", color: "#2563EB", cursor: "pointer" }}>
                            Have a discount code?
                        </button>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <label htmlFor="pass-code" style={{ fontSize: "0.8rem", fontWeight: 500, color: "#334155" }}>Discount code</label>
                            <div style={{ display: "flex", gap: 8 }}>
                                <input
                                    id="pass-code"
                                    value={codeInput}
                                    onChange={(e) => {
                                        setCodeInput(e.target.value.toUpperCase());
                                        setApplied(null);
                                        setCodeError(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") void applyCode();
                                    }}
                                    placeholder="e.g. LAUNCH20"
                                    autoComplete="off"
                                    maxLength={24}
                                    style={{ flex: 1, minWidth: 0, height: 40, padding: "0 12px", border: "1px solid #D9E0EC", borderRadius: 8, fontFamily: "inherit", fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.04em" }}
                                />
                                <button
                                    type="button"
                                    onClick={() => void applyCode()}
                                    disabled={codeBusy || !codeInput.trim()}
                                    style={{ height: 40, padding: "0 14px", borderRadius: 8, border: "1px solid #CBD5E1", background: "#FFFFFF", fontFamily: "inherit", fontSize: "0.86rem", cursor: "pointer" }}
                                >
                                    {codeBusy ? "Checking…" : "Apply"}
                                </button>
                            </div>
                            {codeError && <p role="alert" style={{ margin: 0, fontSize: "0.8rem", color: "#B91C1C" }}>{codeError}</p>}
                            {applied && (
                                <p role="status" style={{ margin: 0, fontSize: "0.8rem", color: "#15803D" }}>
                                    {applied.code}: {applied.description}
                                    {freePasses ? ". No payment needed." : " applied to the price above."}
                                </p>
                            )}
                        </div>
                    )}

                    {error && <p role="alert" style={{ margin: 0, fontSize: "0.84rem", color: "#B91C1C" }}>{error}</p>}
                </div>

                <div className={actionClassName} style={actionClassName ? undefined : { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "0 0 0.5rem" }}>
                    <span style={{ fontSize: "0.78rem", color: "#64748B" }}>{freePasses ? "Your free passes are added straight away." : "Pay by card or bank transfer on the next screen."}</span>
                    <button type="button" className={styles.settingsSaveFooterBtn} onClick={freePasses ? redeem : pay} disabled={busy} style={busy ? { opacity: 0.6, cursor: "wait" } : undefined}>
                        {busy ? (freePasses ? "Adding…" : "Opening…") : freePasses ? "Use code" : "Continue to payment"}
                    </button>
                </div>
                </>
                )}
        </>
    );
}
