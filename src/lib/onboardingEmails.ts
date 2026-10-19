/**
 * The emails that go with a new account's first coach messages, a day apart:
 * day 1, a nudge to add a resume or the review of the one they added; day 2,
 * this week's tip for their role. The welcome on day 0 is sent at sign-up
 * (lib/welcome). The daily job (/api/cron/onboarding-emails) sends these.
 *
 * Each account is marked before its email is sent, so nobody gets one twice,
 * and accounts more than two weeks old are left alone.
 */

import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { sendEmail } from "@/lib/email";
import { resumeNudgeEmail, resumeReviewEmail, weeklyTipEmail } from "@/lib/emailTemplates";
import { optOutUrl } from "@/lib/emailOptOut";
import { approvedTipFor } from "@/lib/weeklyTipDrafts";
import { weekNumber } from "@/lib/weeklyTips";
import { calculateAtsScore, scoreGaps } from "@/lib/atsScorer";
import { hasReadableResumeText } from "@/lib/resumeParser";
import { SITE_URL } from "@/lib/site";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Accounts older than this never get the first-days emails. */
const WINDOW_DAYS = 14;
const BATCH = 200;

interface Candidate {
    email: string;
    name?: string;
    role?: string;
    roleFamily?: string;
    resumes?: Array<{ rawText?: string; score?: number; updatedAt?: Date }>;
}

/** The newest resume they've added, with the score and the main thing to fix. */
export function resumeStanding(user: Candidate): { score: number; topFix?: string } | null {
    const latest = [...(user.resumes || [])].sort((a, b) => (b.updatedAt?.getTime?.() ?? 0) - (a.updatedAt?.getTime?.() ?? 0))[0];
    if (!latest || !hasReadableResumeText(latest.rawText)) return null;
    const ats = calculateAtsScore(latest.rawText!, user.role || "Product Manager");
    const top = scoreGaps(ats)[0];
    return { score: ats.overallScore, topFix: top ? `${top.title.toLowerCase()}. ${top.detail}` : undefined };
}

/** Claims one account for a step and returns it, or null when there are none left. */
async function claimNext(field: "onboardingResumeEmailAt" | "onboardingTipEmailAt", olderThan: Date, newerThan: Date): Promise<Candidate | null> {
    return User.findOneAndUpdate(
        { emailVerified: true, tipEmailsOff: { $ne: true }, [field]: { $exists: false }, createdAt: { $lte: olderThan, $gte: newerThan } },
        { $set: { [field]: new Date() } },
        { new: true }
    )
        .select("email name role roleFamily resumes.rawText resumes.score resumes.updatedAt")
        .lean<Candidate>();
}

export async function sendOnboardingEmails(now: Date = new Date()): Promise<{ resume: number; tip: number; failed: number }> {
    await dbConnect();
    const newest = new Date(now.getTime() - WINDOW_DAYS * DAY);
    let resume = 0;
    let tip = 0;
    let failed = 0;

    // Day 1: a day after sign-up.
    for (let i = 0; i < BATCH; i++) {
        const user = await claimNext("onboardingResumeEmailAt", new Date(now.getTime() - DAY), newest);
        if (!user) break;
        try {
            const standing = resumeStanding(user);
            const unsubscribeUrl = optOutUrl(user.email);
            const email = standing
                ? resumeReviewEmail({ name: user.name, role: user.role, score: standing.score, topFix: standing.topFix, siteUrl: SITE_URL, unsubscribeUrl })
                : resumeNudgeEmail({ name: user.name, role: user.role, siteUrl: SITE_URL, unsubscribeUrl });
            await sendEmail({ to: user.email, ...email });
            resume++;
        } catch (err) {
            failed++;
            console.warn("[onboarding] Resume email not sent:", (err as Error).message);
        }
    }

    // Day 2: two days after sign-up.
    const week = weekNumber(now);
    for (let i = 0; i < BATCH; i++) {
        const user = await claimNext("onboardingTipEmailAt", new Date(now.getTime() - 2 * DAY), newest);
        if (!user) break;
        try {
            const thisWeek = await approvedTipFor(user.roleFamily || "", week);
            await sendEmail({ to: user.email, ...weeklyTipEmail({ name: user.name, tip: thisWeek, siteUrl: SITE_URL, unsubscribeUrl: optOutUrl(user.email) }) });
            tip++;
        } catch (err) {
            failed++;
            console.warn("[onboarding] Tip email not sent:", (err as Error).message);
        }
    }
    return { resume, tip, failed };
}
