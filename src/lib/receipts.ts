/**
 * Receipts for paid pass purchases: the number shown on them, and the email
 * sent when a payment goes through. The receipt page (/payment/receipt/…)
 * shows the same details.
 */

import { renderEmail } from "@/lib/emailLayout";

export interface ReceiptDetails {
    reference: string;
    label: string;
    passes: number;
    /** Total paid, in naira. */
    amount: number;
    currency: string;
    paidAt: Date | string;
    name: string;
    email: string;
}

/** "gp_m2x9k1_a1b2c3d4e5f6" → "GP-M2X9K1-A1B2C3": short enough to read out, still unique. */
export function receiptNumber(reference: string): string {
    const parts = reference.replace(/^gp_/i, "").split("_");
    const [time = "", random = ""] = parts;
    return `GP-${time.toUpperCase()}-${random.slice(0, 6).toUpperCase()}`.replace(/-+$/, "");
}

export function formatNaira(amount: number): string {
    return `₦${Math.round(amount).toLocaleString("en-NG")}`;
}

/** Price per pass, for the line on the receipt; whole naira. */
export function pricePerPass(amount: number, passes: number): number {
    return passes > 0 ? Math.round(amount / passes) : amount;
}

export function receiptDate(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
}

/** The receipt email, in the shared email layout. */
export function receiptEmail(details: ReceiptDetails, receiptUrl: string): { subject: string; text: string; html: string } {
    const number = receiptNumber(details.reference);
    const total = formatNaira(details.amount);
    const passWord = details.passes === 1 ? "pass" : "passes";
    const { html, text } = renderEmail({
        preheader: `${details.passes} ${passWord} added. Total paid ${total}.`,
        title: "Payment received",
        subtitle: `Receipt ${number}`,
        greeting: details.name ? `Hi ${details.name.split(/\s+/)[0]},` : "Hi,",
        paragraphs: [
            `Thanks for your payment. ${details.passes} ${passWord} ${details.passes === 1 ? "has" : "have"} been added to your account.`,
            "Each pass gives you 24 hours of interviews, starting when you begin the first one, so you can save them for the days you need them.",
        ],
        rows: [
            { label: "Date paid", value: receiptDate(details.paidAt) },
            { label: `${details.label} (${details.passes} ${passWord} × ${formatNaira(pricePerPass(details.amount, details.passes))})`, value: total },
            { label: "Total paid", value: total, strong: true },
        ],
        button: { label: "View or save your receipt", url: receiptUrl },
        reason: `Sent to ${details.email} because you bought passes on get prepped.`,
    });
    return { subject: `Your get prepped receipt ${number}`, text, html };
}
