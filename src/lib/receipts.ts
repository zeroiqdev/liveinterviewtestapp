/**
 * Receipts for paid pass purchases: the number shown on them, and the email
 * sent when a payment goes through. The receipt page (/payment/receipt/…)
 * shows the same details.
 */

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

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** The receipt email: the brand's blue and plain type, readable in any mail app. */
export function receiptEmail(details: ReceiptDetails, receiptUrl: string): { subject: string; text: string; html: string } {
    const number = receiptNumber(details.reference);
    const date = receiptDate(details.paidAt);
    const total = formatNaira(details.amount);
    const each = formatNaira(pricePerPass(details.amount, details.passes));
    const greeting = details.name ? `Hi ${details.name.split(/\s+/)[0]},` : "Hi,";
    const passWord = details.passes === 1 ? "pass" : "passes";

    const text = [
        greeting,
        "",
        `Thanks for your payment. ${details.label} has been added to your account. Each pass gives you 24 hours of interviews, starting when you begin the first one.`,
        "",
        `Receipt ${number}`,
        `Date paid: ${date}`,
        `${details.label}: ${details.passes} ${passWord} × ${each}`,
        `Total paid: ${total}`,
        "",
        `View or save your receipt: ${receiptUrl}`,
        "",
        "get prepped",
    ].join("\n");

    const row = (label: string, value: string, strong = false) =>
        `<tr><td style="padding:10px 0;color:#64748B;font-size:14px;">${escapeHtml(label)}</td><td style="padding:10px 0;text-align:right;font-size:14px;color:#0F172A;${strong ? "font-weight:600;" : ""}">${escapeHtml(value)}</td></tr>`;

    const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#F4F6FA;font-family:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0F172A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden;">
<tr><td style="background:#4782F6;padding:22px 28px;color:#FFFFFF;">
<div style="font-size:15px;letter-spacing:-0.01em;">get prepped</div>
<div style="margin-top:14px;font-size:24px;font-weight:600;letter-spacing:-0.02em;">Payment received</div>
<div style="margin-top:4px;font-size:14px;opacity:0.9;">Receipt ${escapeHtml(number)}</div>
</td></tr>
<tr><td style="padding:24px 28px 8px;">
<p style="margin:0 0 6px;font-size:15px;">${escapeHtml(greeting)}</p>
<p style="margin:0;font-size:15px;line-height:1.55;color:#334155;">Thanks for your payment. ${escapeHtml(details.label)} has been added to your account. Each pass gives you 24 hours of interviews, starting when you begin the first one.</p>
</td></tr>
<tr><td style="padding:12px 28px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #F1F5F9;">
${row("Date paid", date)}
${row(`${details.label} (${details.passes} ${passWord} × ${each})`, total)}
<tr><td colspan="2" style="border-top:1px solid #E2E8F0;"></td></tr>
${row("Total paid", total, true)}
</table>
</td></tr>
<tr><td style="padding:16px 28px 28px;">
<a href="${escapeHtml(receiptUrl)}" style="display:inline-block;background:#4782F6;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:500;padding:11px 18px;border-radius:8px;">View or save your receipt</a>
</td></tr>
</table>
<p style="max-width:520px;margin:14px auto 0;font-size:12px;color:#94A3B8;text-align:center;">Sent to ${escapeHtml(details.email)} because you bought a pass on get prepped.</p>
</body></html>`;

    return { subject: `Your get prepped receipt ${number}`, text, html };
}
