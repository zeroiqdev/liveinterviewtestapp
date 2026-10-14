"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Warning } from "@phosphor-icons/react";
import styles from "./payment.module.css";

type Outcome = "checking" | "paid" | "not-paid" | "error";

/**
 * Where people land after the payment page. The address alone proves nothing,
 * so this asks the server, which asks Bachs, whether the checkout was paid.
 */
export default function PaymentComplete() {
    const router = useRouter();
    const [outcome, setOutcome] = useState<Outcome>("checking");
    const [label, setLabel] = useState("");
    const [receiptRef, setReceiptRef] = useState<string | null>(null);
    const [message, setMessage] = useState("");

    const check = useCallback(async (attempt = 0): Promise<void> => {
        setOutcome("checking");
        try {
            let checkoutId = new URLSearchParams(window.location.search).get("checkout_id");
            try {
                checkoutId = checkoutId || sessionStorage.getItem("useladder_checkout_id");
            } catch {
                // Saved data is blocked: the server checks their latest checkout.
            }
            const res = await fetch(`/api/payments/confirm${checkoutId ? `?checkout_id=${encodeURIComponent(checkoutId)}` : ""}`, { cache: "no-store" });
            if (res.status === 401) {
                router.replace("/login?redirect=/payment/complete");
                return;
            }
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error);
            if (data.outcome === "paid") {
                setLabel(data.label || "Your pass");
                setReceiptRef(typeof data.reference === "string" ? data.reference : null);
                setOutcome("paid");
                return;
            }
            // A bank transfer can take a moment to be confirmed: look again a few times.
            if (attempt < 5) {
                await new Promise((resolve) => setTimeout(resolve, 3000));
                return check(attempt + 1);
            }
            setOutcome("not-paid");
        } catch (err) {
            setMessage(err instanceof Error && err.message ? err.message : "We couldn't check your payment just now.");
            setOutcome("error");
        }
    }, [router]);

    useEffect(() => {
        void check();
    }, [check]);

    return (
        <div className={styles.page}>
            <main className={styles.main} style={{ paddingTop: "4rem", alignItems: "center", textAlign: "center" }}>
                {outcome === "checking" && (
                    <>
                        <h1 className={styles.name}>Confirming your payment…</h1>
                        <p className={styles.note}>This takes a few seconds. Please keep this page open.</p>
                    </>
                )}
                {outcome === "paid" && (
                    <>
                        <CheckCircle size={52} weight="fill" color="#22C55E" />
                        <h1 className={styles.name}>Payment received</h1>
                        <p className={styles.note}>{label} has been added to your account. Its 24 hours start when you begin your next interview.</p>
                        <div className={styles.actions} style={{ justifyContent: "center" }}>
                            <button type="button" className={`${styles.action} ${styles.actionPrimary}`} onClick={() => router.push("/dashboard")}>Go to my dashboard</button>
                            {receiptRef && (
                                <button type="button" className={styles.action} onClick={() => router.push(`/payment/receipt/${encodeURIComponent(receiptRef)}`)}>View receipt</button>
                            )}
                        </div>
                        <p className={styles.note}>We&rsquo;ve also emailed you a receipt.</p>
                    </>
                )}
                {outcome === "not-paid" && (
                    <>
                        <Warning size={46} weight="fill" color="#F59E0B" />
                        <h1 className={styles.name}>We haven&rsquo;t received your payment yet</h1>
                        <p className={styles.note}>If you paid by bank transfer it can take a few minutes. Your pass is added automatically as soon as it arrives. If you didn&rsquo;t finish paying, you haven&rsquo;t been charged.</p>
                        <div className={styles.actions} style={{ justifyContent: "center" }}>
                            <button type="button" className={`${styles.action} ${styles.actionPrimary}`} onClick={() => check()}>Check again</button>
                            <button type="button" className={styles.action} onClick={() => router.push("/dashboard")}>Back to dashboard</button>
                        </div>
                    </>
                )}
                {outcome === "error" && (
                    <>
                        <Warning size={46} weight="fill" color="#EF4444" />
                        <h1 className={styles.name}>We couldn&rsquo;t check your payment</h1>
                        <p className={styles.note}>{message} If you paid, your pass will still be added.</p>
                        <button type="button" className={`${styles.action} ${styles.actionPrimary}`} onClick={() => check()}>Try again</button>
                    </>
                )}
            </main>
        </div>
    );
}
