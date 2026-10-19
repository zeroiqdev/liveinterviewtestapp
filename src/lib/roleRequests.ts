/** Emails for role requests: telling people the role they asked for is now on get prepped. */

import { renderEmail } from "@/lib/emailLayout";

export function roleAddedEmail(opts: { requested: string; role: string; siteUrl: string }): { subject: string; text: string; html: string } {
    const { role, siteUrl } = opts;
    const requested = opts.requested.trim();
    const named = requested.toLowerCase() === role.toLowerCase() ? role : `${role} (you asked for ${requested})`;
    const { html, text } = renderEmail({
        preheader: `You asked for ${requested}. You can practise for it now.`,
        title: `${role} is here`,
        greeting: "Hi,",
        paragraphs: [
            `You asked us to add ${named} to get prepped. It's ready now.`,
            "Paste the description of a job you're applying to and answer two interview questions written for that job. You don't need an account to start.",
        ],
        button: { label: "Practise for a job", url: `${siteUrl}/try` },
        reason: `You're getting this because you asked to hear when ${requested} was added. We won't email you about it again.`,
    });
    return { subject: `${role} is now on get prepped`, text, html };
}
