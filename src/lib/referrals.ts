/**
 * Inviting friends: each account has a code; someone who signs up through it
 * is linked to the inviter; when they first pay for a pass it counts, and
 * every REFERRALS_PER_PASS that count earn the inviter a free pass.
 *
 * Each step changes a record only if it hasn't been changed yet, so a friend
 * counts once and a reward is given once, however many times payments are
 * confirmed (the webhook and the buyer's return both confirm them).
 */

import { randomBytes, randomInt } from "crypto";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import PassPurchase from "@/models/PassPurchase";
import PassWallet from "@/models/PassWallet";
import { PASS_CURRENCY, priceForPasses } from "@/lib/passes";
import { sendEmail } from "@/lib/email";
import { referralRewardEmail } from "@/lib/emailTemplates";
import { SITE_URL } from "@/lib/site";
import { makeReferralCode, normalizeReferralCode, referralsToNextPass, rewardsEarned, REFERRALS_PER_PASS } from "@/lib/referralRules";

export const REFERRAL_REWARD_LABEL = "Referral reward";

export function referralLink(code: string): string {
    return `${SITE_URL}/?ref=${code}`;
}

/** This person's code, made (and kept) the first time it's asked for. */
export async function ensureReferralCode(email: string): Promise<string | null> {
    await dbConnect();
    const user = await User.findOne({ email }).select("referralCode").lean();
    if (!user) return null;
    if (user.referralCode) return user.referralCode;
    for (let attempt = 0; attempt < 6; attempt++) {
        const code = makeReferralCode((n) => randomInt(n));
        try {
            const updated = await User.findOneAndUpdate({ email, referralCode: { $exists: false } }, { $set: { referralCode: code } }, { new: true }).select("referralCode").lean();
            if (updated?.referralCode) return updated.referralCode;
            // Set by another request in the meantime.
            const again = await User.findOne({ email }).select("referralCode").lean();
            if (again?.referralCode) return again.referralCode;
        } catch {
            // That code is taken: try another.
        }
    }
    return null;
}

/**
 * Who invited a new account, from the code it arrived with. Nobody can invite
 * themselves, and an account keeps the first inviter it gets.
 */
export async function inviterFor(code: unknown, newEmail: string): Promise<string | null> {
    const normalized = normalizeReferralCode(code);
    if (!normalized) return null;
    await dbConnect();
    const inviter = await User.findOne({ referralCode: normalized }).select("email").lean();
    if (!inviter || inviter.email === newEmail.toLowerCase().trim()) return null;
    return inviter.email;
}

/**
 * Called when someone's payment goes through. Their first paid pass (not a
 * free code) counts toward their inviter, who gets a pass for every
 * REFERRALS_PER_PASS that count.
 */
export async function countReferralPurchase(buyerEmail: string, amount: number): Promise<void> {
    if (!(amount > 0)) return;
    try {
        await dbConnect();
        const buyer = await User.findOneAndUpdate(
            { email: buyerEmail, referredBy: { $exists: true, $ne: "" }, referralQualifiedAt: { $exists: false } },
            { $set: { referralQualifiedAt: new Date() } },
            { new: true }
        )
            .select("referredBy")
            .lean();
        if (!buyer?.referredBy) return;
        await grantDueRewards(buyer.referredBy);
    } catch (err) {
        // A missed reward is caught up the next time one of their friends buys.
        console.warn("[referrals] Not counted:", (err as Error).message);
    }
}

async function grantDueRewards(inviterEmail: string): Promise<void> {
    const qualified = await User.countDocuments({ referredBy: inviterEmail, referralQualifiedAt: { $exists: true } });
    const due = rewardsEarned(qualified);
    if (due === 0) return;
    for (;;) {
        // Raise the count by one only while it's behind: each raise is one pass.
        const inviter = await User.findOneAndUpdate(
            { email: inviterEmail, $or: [{ referralRewards: { $lt: due } }, { referralRewards: { $exists: false } }] },
            { $inc: { referralRewards: 1 } },
            { new: true }
        )
            .select("email name referralRewards")
            .lean();
        if (!inviter) return;
        if ((inviter.referralRewards ?? 0) > due) return;
        const reference = `gp_ref_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
        await PassPurchase.create({
            email: inviterEmail,
            reference,
            passes: 1,
            amount: 0,
            fullAmount: priceForPasses(1),
            currency: PASS_CURRENCY,
            label: REFERRAL_REWARD_LABEL,
            status: "paid",
            paidAt: new Date(),
        });
        await PassWallet.updateOne(
            { email: inviterEmail },
            { $inc: { unused: 1 }, $setOnInsert: { email: inviterEmail, activeUntil: null, freeInterviewsUsed: 0 } },
            { upsert: true }
        );
        try {
            await sendEmail({ to: inviterEmail, ...referralRewardEmail({ name: inviter.name, friends: qualified, siteUrl: SITE_URL }) });
        } catch (err) {
            console.warn("[referrals] Reward email not sent:", (err as Error).message);
        }
    }
}

export interface ReferralSummary {
    code: string;
    link: string;
    /** People who signed up with the link. */
    joined: number;
    /** Of those, people who bought a pass. */
    bought: number;
    /** Free passes earned so far. */
    rewards: number;
    /** More buyers needed for the next free pass. */
    toNextPass: number;
    perPass: number;
}

export async function referralSummary(email: string): Promise<ReferralSummary | null> {
    const code = await ensureReferralCode(email);
    if (!code) return null;
    const [joined, bought, me] = await Promise.all([
        User.countDocuments({ referredBy: email }),
        User.countDocuments({ referredBy: email, referralQualifiedAt: { $exists: true } }),
        User.findOne({ email }).select("referralRewards").lean(),
    ]);
    return { code, link: referralLink(code), joined, bought, rewards: me?.referralRewards ?? 0, toNextPass: referralsToNextPass(bought), perPass: REFERRALS_PER_PASS };
}
