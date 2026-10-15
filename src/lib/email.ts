/**
 * Transactional email via Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 *
 * Env: RESEND_API_KEY, EMAIL_FROM (e.g. "get prepped <login@yourdomain.com>").
 * Outside production, when no key is set, emails are printed to the server
 * console instead so verification and reset codes still work locally.
 */

/** Any failure to send an email; routes show users a friendly message for it. */
export class EmailSendError extends Error {}

export class EmailNotConfiguredError extends EmailSendError {
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
    const apiKey = process.env.RESEND_API_KEY?.trim();
    // Hosting dashboards store values verbatim: tolerate pasted quote marks
    // ("get prepped <no-reply@…>"), which Resend would reject as an invalid sender.
    const from = process.env.EMAIL_FROM?.trim().replace(/^["'](.*)["']$/, "$1").trim();

    if (!apiKey || !from) {
        if (process.env.NODE_ENV === "production") {
            // For whoever reads the logs; users get a friendly message instead.
            console.error(
                `[email] Not sent: ${!apiKey ? "RESEND_API_KEY" : "EMAIL_FROM"} is not set in this environment. ` +
                    "Add it (Vercel → Settings → Environment Variables) and redeploy."
            );
            throw new EmailNotConfiguredError();
        }
        console.info(`[email] (not sent — RESEND_API_KEY unset) to=${email.to} subject="${email.subject}"\n${email.text}`);
        return;
    }

    let res: Response;
    try {
        res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch (err) {
        console.error("[email] Could not reach Resend:", (err as Error).message);
        throw new EmailSendError("Could not reach the email provider");
    }
    if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        // Resend's reason, for whoever reads the logs (users get a friendly message).
        console.error(
            `[email] Resend rejected the email (${res.status}) from "${from}": ${detail}. ` +
                "Check that EMAIL_FROM uses your verified domain, and that the API key and domain are in the same Resend account."
        );
        throw new EmailSendError(`Email provider returned ${res.status}`);
    }
}
