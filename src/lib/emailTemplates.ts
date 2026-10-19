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

type Built = { subject: string; text: string; html: string };
const firstName = (name?: string) => name?.trim().split(/\s+/)[0];
const base = (url: string) => url.replace(/\/$/, "");

/** Day 1, no resume yet: what adding one gets them. */
export function resumeNudgeEmail(opts: { name?: string; role?: string; siteUrl: string; unsubscribeUrl: string }): Built {
    const first = firstName(opts.name);
    const { html, text } = renderEmail({
        preheader: "Get a score out of 100 and ready-made fixes before you apply.",
        title: "Add your resume",
        greeting: first ? `Hi ${first},` : "Hi,",
        paragraphs: [
            `Add your resume and I'll tell you how it reads to an employer${opts.role ? ` hiring for ${opts.role}` : ""}.`,
            "You'll get a score out of 100, ready-made rewrites for anything holding it back, and a Word file with your changes in your own formatting. Your practice interviews will also ask about your own experience.",
        ],
        button: { label: "Add my resume", url: `${base(opts.siteUrl)}/dashboard` },
        reason: "You're getting this because you created a get prepped account.",
        unsubscribeUrl: opts.unsubscribeUrl,
    });
    return { subject: "Get your resume reviewed", text, html };
}

/** Day 1, resume added: its score and the main thing to fix. */
export function resumeReviewEmail(opts: { name?: string; role?: string; score: number; topFix?: string; siteUrl: string; unsubscribeUrl: string }): Built {
    const first = firstName(opts.name);
    const { html, text } = renderEmail({
        preheader: `Your resume scores ${opts.score} out of 100. Here's what will raise it.`,
        title: `Your resume scores ${opts.score}/100`,
        greeting: first ? `Hi ${first},` : "Hi,",
        paragraphs: [
            `I've gone through your resume${opts.role ? ` for ${opts.role} roles` : ""}.${opts.topFix ? ` The biggest thing holding it back: ${opts.topFix}` : ""}`,
            "Your review has ready-made fixes for each line. Apply the ones you like and download it in your own formatting.",
        ],
        button: { label: "Improve my resume", url: `${base(opts.siteUrl)}/resume-feedback` },
        reason: "You're getting this because you added a resume to get prepped.",
        unsubscribeUrl: opts.unsubscribeUrl,
    });
    return { subject: `Your resume scores ${opts.score}/100: here's what to fix`, text, html };
}

/** Day 2 (and after): this week's tip for their role. */
export function weeklyTipEmail(opts: { name?: string; tip: { topic: string; title: string; body: string; tryThis: string }; siteUrl: string; unsubscribeUrl: string }): Built {
    const first = firstName(opts.name);
    const { html, text } = renderEmail({
        preheader: opts.tip.title,
        title: opts.tip.title,
        subtitle: `This week's tip · ${opts.tip.topic}`,
        greeting: first ? `Hi ${first},` : "Hi,",
        paragraphs: [opts.tip.body],
        notes: [`Try this: ${opts.tip.tryThis}`],
        button: { label: "Practise an interview", url: `${base(opts.siteUrl)}/dashboard` },
        reason: "You're getting this because you have a get prepped account.",
        unsubscribeUrl: opts.unsubscribeUrl,
    });
    return { subject: `This week's tip: ${opts.tip.title}`, text, html };
}
