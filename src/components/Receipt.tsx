"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, Printer } from "@phosphor-icons/react";
import { formatNaira, pricePerPass, receiptDate } from "@/lib/receipts";
import styles from "./payment.module.css";

interface ReceiptData {
    number: string;
    reference: string;
    label: string;
    passes: number;
    amount: number;
    currency: string;
    paidAt: string;
    name: string;
    email: string;
}

/** A receipt for a paid pass, on the dashboard's surface; prints as a clean page (and so saves as a PDF). */
export default function Receipt({ reference }: { reference: string }) {
    const router = useRouter();
    const [receipt, setReceipt] = useState<ReceiptData | null>(null);
    const [missing, setMissing] = useState(false);

    useEffect(() => {
        fetch(`/api/payments/receipt?reference=${encodeURIComponent(reference)}`, { cache: "no-store" })
            .then((res) => {
                if (res.status === 401) {
                    router.replace(`/login?redirect=${encodeURIComponent(`/payment/receipt/${reference}`)}`);
                    return null;
                }
                return res.ok ? res.json() : Promise.reject();
            })
            .then((data) => data && setReceipt(data))
            .catch(() => setMissing(true));
    }, [reference, router]);

    const passWord = receipt?.passes === 1 ? "pass" : "passes";

    return (
        <div className={styles.page}>
            <header className={styles.top}>
                <Link href="/profile#billing" className={styles.back}>
                    <ArrowLeft size={16} weight="bold" /> <span className={styles.backLong}>Passes and payments</span>
                    <span className={styles.backShort}>Back</span>
                </Link>
                {receipt && (
                    <button type="button" className={styles.action} onClick={() => window.print()}>
                        <Printer size={16} weight="bold" /> <span className={styles.backLong}>Print or save as PDF</span>
                        <span className={styles.backShort}>Save PDF</span>
                    </button>
                )}
            </header>

            <main className={styles.receiptWrap}>
                {missing ? (
                    <p className={styles.note}>We couldn&rsquo;t find that receipt. Receipts are only made for payments that went through.</p>
                ) : !receipt ? (
                    <p className={styles.note} aria-busy="true">Loading your receipt…</p>
                ) : (
                    <article className={styles.receipt} aria-label={`Receipt ${receipt.number}`}>
                        <header className={styles.receiptHead}>
                            <div className={styles.brand}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="https://res.cloudinary.com/dyg7neetr/image/upload/v1790510817/Vector_10_thljja.png" alt="" className={styles.brandMark} />
                                <span>get prepped</span>
                            </div>
                            <span className={styles.paidBadge}>
                                <CheckCircle size={14} weight="fill" /> Paid
                            </span>
                        </header>

                        <div className={styles.receiptTitleRow}>
                            <div>
                                <h1 className={styles.receiptTitle}>Receipt</h1>
                                <p className={styles.receiptNumber}>{receipt.number}</p>
                            </div>
                            <div className={styles.receiptTotalTop}>
                                <span>Total paid</span>
                                <b>{formatNaira(receipt.amount)}</b>
                            </div>
                        </div>

                        <dl className={styles.meta}>
                            <div>
                                <dt>Date paid</dt>
                                <dd>{receiptDate(receipt.paidAt)}</dd>
                            </div>
                            <div>
                                <dt>Billed to</dt>
                                <dd>
                                    {receipt.name && <span>{receipt.name}</span>}
                                    <span>{receipt.email}</span>
                                </dd>
                            </div>
                            <div>
                                <dt>Payment reference</dt>
                                <dd className={styles.mono}>{receipt.reference}</dd>
                            </div>
                        </dl>

                        <table className={styles.lines}>
                            <thead>
                                <tr>
                                    <th scope="col">Item</th>
                                    <th scope="col" className={styles.num}>Qty</th>
                                    <th scope="col" className={styles.num}>Price</th>
                                    <th scope="col" className={styles.num}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>
                                        <b>{receipt.label}</b>
                                        <span>24 hours of interviews per pass, starting when you begin the first one</span>
                                    </td>
                                    <td className={styles.num}>{receipt.passes}</td>
                                    <td className={styles.num}>{formatNaira(pricePerPass(receipt.amount, receipt.passes))}</td>
                                    <td className={styles.num}>{formatNaira(receipt.amount)}</td>
                                </tr>
                            </tbody>
                            <tfoot>
                                <tr>
                                    <th scope="row" colSpan={3}>Total paid ({receipt.currency})</th>
                                    <td className={styles.num}>{formatNaira(receipt.amount)}</td>
                                </tr>
                            </tfoot>
                        </table>

                        <footer className={styles.receiptFoot}>
                            <p>
                                {receipt.passes} {passWord} added to your account. Questions about this payment? Use Send feedback in the app and include the receipt number.
                            </p>
                        </footer>
                    </article>
                )}
            </main>
        </div>
    );
}
