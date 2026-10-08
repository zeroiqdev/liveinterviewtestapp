/**
 * Transactional email via Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 *
 * Env: RESEND_API_KEY, EMAIL_FROM (e.g. "get prepped <login@yourdomain.com>").
 * Outside production, when no key is set, emails are printed to the server
 * console instead so verification and reset codes still work locally.
 */

export class EmailNotConfiguredError extends Error {
    constructor() {
        super("Email sending is not configured (set RESEND_API_KEY and EMAIL_FROM)");
    }
}

interface Email {
    to: string;
    subject: string;
    text: string;
    html: string;
}

export async function sendEmail(email: Email): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;

    if (!apiKey || !from) {
        if (process.env.NODE_ENV === "production") throw new EmailNotConfiguredError();
        console.info(`[email] (not sent — RESEND_API_KEY unset) to=${email.to} subject="${email.subject}"\n${email.text}`);
        return;
    }

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
        throw new Error(`Email provider returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
}
