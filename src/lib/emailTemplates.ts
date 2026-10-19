/** Wording for the emailed one-time codes, in the shared email layout. */

import { renderEmail } from "@/lib/emailLayout";
import type { EmailCodePurpose } from "@/models/EmailCode";

const COPY: Record<EmailCodePurpose, { subject: string; title: string; lead: string; ifNotYou: string; reason: string }> = {
    verify: {
        subject: "Your get prepped code",
        title: "Confirm your email",
        lead: "Enter this code to finish creating your get prepped account.",
        ifNotYou: "If you didn't sign up, ignore this email. No account is made without the code.",
        reason: "You're getting this because this address was used to sign up for get prepped.",
    },
    reset: {
        subject: "Reset your get prepped password",
        title: "Reset your password",
        lead: "Enter this code to choose a new password.",
        ifNotYou: "If you didn't ask to reset your password, ignore this email. Your password stays the same.",
        reason: "You're getting this because a password reset was asked for on this account.",
    },
    "change-email": {
        subject: "Confirm your new email for get prepped",
        title: "Confirm your new email",
        lead: "Enter this code to make this your get prepped email address.",
        ifNotYou: "If you didn't ask for this, ignore this email and change your get prepped password, as someone else may know it.",
        reason: "You're getting this because someone asked to move a get prepped account to this address.",
    },
};

export function codeEmail(purpose: EmailCodePurpose, code: string, minutes: number): { subject: string; text: string; html: string } {
    const copy = COPY[purpose];
    const { html, text } = renderEmail({
        preheader: `Your code is ${code}. It expires in ${minutes} minutes.`,
        title: copy.title,
        greeting: "Hi,",
        paragraphs: [copy.lead],
        code,
        notes: [`The code expires in ${minutes} minutes and works once.`, copy.ifNotYou],
        reason: copy.reason,
    });
    // The code goes in the subject's preview, not the subject itself, so it isn't left in inbox lists.
    return { subject: copy.subject, text, html };
}
