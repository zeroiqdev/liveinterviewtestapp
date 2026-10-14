"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

interface BuyPassButtonProps {
    product: "day" | "week" | "flexible";
    /** Number of passes, for the flexible bundle. */
    passes?: number;
    className?: string;
    children: React.ReactNode;
}

/**
 * A "Get this pass" button. Signed in, it opens the payment page; signed out,
 * it sends the person to sign up first, since a pass belongs to an account.
 */
export function BuyPassButton({ product, passes, className, children }: BuyPassButtonProps) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const buy = async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/payments/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product, passes }) });
            if (res.status === 401) {
                router.push(`/onboarding?plan=${product}`);
                return;
            }
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.url) throw new Error(data.error || "We couldn't open the payment page. Please try again.");
            try {
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
            <button type="button" className={className} onClick={buy} disabled={busy} style={{ cursor: busy ? "wait" : "pointer", font: "inherit" }}>
                {busy ? "Opening…" : children}
            </button>
            {error && <p role="alert" style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "#B91C1C" }}>{error}</p>}
        </>
    );
}
