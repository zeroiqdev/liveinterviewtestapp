/** Wording for the emailed one-time codes, in the shared email layout. */

import { renderEmail } from "@/lib/emailLayout";
import { FREE_INTERVIEWS } from "@/lib/passes";
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

/** Sent once, when a new account is ready to use. */
export function welcomeEmail(opts: { name?: string; role?: string; siteUrl: string }): { subject: string; text: string; html: string } {
    const first = opts.name?.trim().split(/\s+/)[0];
    const role = opts.role?.trim();
    const free = FREE_INTERVIEWS > 0;
    const { html, text } = renderEmail({
        preheader: free ? "Your first interview is on us. Here's how to get the most from it." : "Here's how to get the most from your practice.",
        title: "Welcome to get prepped",
        greeting: first ? `Hi ${first},` : "Hi,",
        paragraphs: [`Your account is ready. Here's how to get ready for your next ${role ? `${role} ` : ""}interview:`],
        steps: [
            `Practise a real interview. The interviewer asks follow-up questions on your answers, then you get a report on what to fix.${free ? " Your first one is free." : ""}`,
            "Add your resume. You'll get a score out of 100 and ready-made fixes for anything holding it back.",
            "See the jobs matched to you, and practise for the one you want.",
        ],
        button: { label: "Start your first interview", url: `${opts.siteUrl.replace(/\/$/, "")}/dashboard` },
        reason: "You're getting this because you created a get prepped account with this address.",
    });
    return { subject: "Welcome to get prepped", text, html };
}

/** To someone whose invited friends have bought enough passes to earn them one. */
export function referralRewardEmail(opts: { name?: string; friends: number; siteUrl: string }): { subject: string; text: string; html: string } {
    const first = opts.name?.trim().split(/\s+/)[0];
    const { html, text } = renderEmail({
        preheader: "A free pass has been added to your account.",
        title: "You've earned a free pass",
        greeting: first ? `Hi ${first},` : "Hi,",
        paragraphs: [
            `${opts.friends} ${opts.friends === 1 ? "person" : "people"} you invited ${opts.friends === 1 ? "has" : "have"} bought a pass, so we've added a free pass to your account. Thank you for sharing get prepped.`,
            "It gives you 24 hours of interviews, starting when you begin the first one. Keep inviting: every three friends who buy a pass earn you another.",
        ],
        button: { label: "Use your free pass", url: `${opts.siteUrl.replace(/\/$/, "")}/dashboard` },
        reason: "You're getting this because people you invited to get prepped bought passes.",
    });
    return { subject: "You've earned a free get prepped pass", text, html };
}
