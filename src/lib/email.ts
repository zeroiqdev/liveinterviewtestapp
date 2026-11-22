/**
 * Transactional email via Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 *
 * Env:
 *   RESEND_API_KEY
 *   EMAIL_FROM          "get prepped <hello@yourdomain.com>": the hello sender, and the
 *                       fallback for any sender below that isn't set
 *   EMAIL_FROM_ACCOUNT  "get prepped <login@yourdomain.com>": sign-up and reset codes
 *   EMAIL_FROM_BILLING  "get prepped <billing@yourdomain.com>": payment receipts
 *   NEXT_PUBLIC_CONTACT_EMAIL  where replies to account emails go (login@ has no inbox)
 *
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

/**
 * Which address an email comes from:
 * - account: sign-up, password-reset and change-email codes
 * - billing: payment receipts
 * - hello:   welcome, onboarding series, weekly tips, referral rewards, role-request replies
 */
export type EmailSender = "account" | "billing" | "hello";

interface Email {
    to: string;
    subject: string;
    text: string;
    html: string;
    sender: EmailSender;
}

const SENDER_ENV: Record<EmailSender, string | null> = {
    account: "EMAIL_FROM_ACCOUNT",
    billing: "EMAIL_FROM_BILLING",
    hello: null, // EMAIL_FROM itself
};

/**
 * Hosting dashboards store values verbatim: tolerate pasted quote marks
 * ("get prepped <hello@…>"), which Resend would reject as an invalid sender.
 */
function envValue(name: string): string {
    return (process.env[name] || "").trim().replace(/^["'](.*)["']$/, "$1").trim();
}

/** The From address for a sender, falling back to EMAIL_FROM. Empty when neither is set. */
export function fromAddress(sender: EmailSender): string {
    const own = SENDER_ENV[sender];
    return (own && envValue(own)) || envValue("EMAIL_FROM");
}

/**
 * Where replies should go, or undefined to reply to the From address. Account
 * emails come from a send-only address, so replies go to the contact inbox.
 */
export function replyToAddress(sender: EmailSender): string | undefined {
    if (sender !== "account") return undefined;
    return envValue("NEXT_PUBLIC_CONTACT_EMAIL") || undefined;
}

export async function sendEmail(email: Email): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = fromAddress(email.sender);
    const replyTo = replyToAddress(email.sender);

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
            body: JSON.stringify({
                from,
                to: [email.to],
                ...(replyTo ? { reply_to: replyTo } : {}),
                subject: email.subject,
                text: email.text,
                html: email.html,
            }),
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
            `[email] Resend rejected the ${email.sender} email (${res.status}) from "${from}": ${detail}. ` +
                "Check that the sender uses your verified domain, and that the API key and domain are in the same Resend account."
        );
        throw new EmailSendError(`Email provider returned ${res.status}`);
    }
}
