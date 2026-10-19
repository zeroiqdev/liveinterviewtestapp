/** Reading and changing a user's passes in the database. Server only. */

import dbConnect from "@/lib/mongodb";
import { countReferralPurchase } from "@/lib/referrals";
import PassWallet from "@/models/PassWallet";
import PassPurchase from "@/models/PassPurchase";
import { FREE_INTERVIEWS, PASS_HOURS, decideStart, type StartDecision } from "@/lib/passes";
import { getCheckout, isPaidInFull } from "@/lib/bachs";
import User from "@/models/User";
import { sendEmail } from "@/lib/email";
import { receiptEmail } from "@/lib/receipts";
import { SITE_URL } from "@/lib/site";
import { randomBytes } from "crypto";
import DiscountCode from "@/models/DiscountCode";
import { PASS_CURRENCY } from "@/lib/passes";
import { describeDiscount, discountProblem, type DiscountRule } from "@/lib/discounts";

export interface PassSummary {
    active: boolean;
    expiresAt: string | null;
    unused: number;
    freeInterviewsLeft: number;
}

export async function passSummary(email: string): Promise<PassSummary> {
    await dbConnect();
    const wallet = await PassWallet.findOne({ email }).lean();
    const activeUntil = wallet?.activeUntil ? new Date(wallet.activeUntil) : null;
    const active = Boolean(activeUntil && activeUntil.getTime() > Date.now());
    return {
        active,
        expiresAt: active && activeUntil ? activeUntil.toISOString() : null,
        unused: wallet?.unused ?? 0,
        freeInterviewsLeft: Math.max(0, FREE_INTERVIEWS - (wallet?.freeInterviewsUsed ?? 0)),
    };
}

/**
 * Called when an interview is about to start. Lets it through and uses up
 * what it needs (starting a pass, or taking the free interview), or says a
 * pass is required. Each change is a single conditional update, so two tabs
 * starting at once can't spend the same pass or free interview twice.
 */
export async function claimInterviewStart(email: string, isAdmin: boolean): Promise<StartDecision> {
    await dbConnect();
    const now = new Date();
    await PassWallet.updateOne({ email }, { $setOnInsert: { email, unused: 0, activeUntil: null, freeInterviewsUsed: 0 } }, { upsert: true });
    const wallet = await PassWallet.findOne({ email }).lean();
    const decision = decideStart({ unused: wallet?.unused ?? 0, activeUntil: wallet?.activeUntil ? new Date(wallet.activeUntil) : null, freeInterviewsUsed: wallet?.freeInterviewsUsed ?? 0 }, now, isAdmin);
    if (!decision.allowed || decision.using === "admin" || decision.using === "active-pass") return decision;

    if (decision.using === "new-pass") {
        const started = await PassWallet.updateOne({ email, unused: { $gt: 0 } }, { $inc: { unused: -1 }, $set: { activeUntil: new Date(now.getTime() + PASS_HOURS * 3600_000) } });
        return started.modifiedCount > 0 ? decision : claimInterviewStart(email, isAdmin);
    }
    const taken = await PassWallet.updateOne({ email, freeInterviewsUsed: { $lt: FREE_INTERVIEWS } }, { $inc: { freeInterviewsUsed: 1 } });
    return taken.modifiedCount > 0 ? decision : claimInterviewStart(email, isAdmin);
}

/**
 * Checks a checkout with Bachs and, if it was paid, adds the passes. Safe to
 * call any number of times for the same checkout (the webhook and the buyer's
 * return both call it): passes are added exactly once.
 */
export async function settleCheckout(checkoutId: string): Promise<"paid" | "not-paid" | "unknown"> {
    await dbConnect();
    const purchase = await PassPurchase.findOne({ checkoutId });
    if (!purchase) return "unknown";
    if (purchase.status === "paid") return "paid";

    const session = await getCheckout(checkoutId);
    if (!isPaidInFull(session, purchase.amount)) return "not-paid";

    // Only the call that flips it from pending adds the passes.
    const flipped = await PassPurchase.updateOne({ _id: purchase._id, status: "pending" }, { $set: { status: "paid", paidAt: new Date() } });
    if (flipped.modifiedCount > 0) {
        await PassWallet.updateOne({ email: purchase.email }, { $inc: { unused: purchase.passes }, $setOnInsert: { email: purchase.email, activeUntil: null, freeInterviewsUsed: 0 } }, { upsert: true });
        if (purchase.discountCode) await markCodeUsed(purchase.discountCode, purchase.email);
        await emailReceipt(purchase.reference);
        // A first paid pass counts toward whoever invited them.
        await countReferralPurchase(purchase.email, purchase.amount);
    }
    return "paid";
}

/**
 * Emails the receipt for a purchase that has just been paid. Sent once, by
 * the call that marked it paid; a failed email never undoes the payment, and
 * the receipt is always on the receipt page.
 */
async function emailReceipt(reference: string): Promise<void> {
    try {
        const purchase = await PassPurchase.findOne({ reference }).lean();
        if (!purchase || purchase.status !== "paid") return;
        const user = await User.findOne({ email: purchase.email }).select("name").lean<{ name?: string }>();
        const { subject, text, html } = receiptEmail(
            {
                reference: purchase.reference,
                label: purchase.label,
                passes: purchase.passes,
                amount: purchase.amount,
                currency: purchase.currency,
                paidAt: purchase.paidAt ?? new Date(),
                name: user?.name ?? "",
                email: purchase.email,
            },
            `${SITE_URL}/payment/receipt/${encodeURIComponent(purchase.reference)}`
        );
        await sendEmail({ to: purchase.email, subject, text, html });
    } catch (err) {
        console.warn("[passWallet] Receipt email not sent:", (err as Error).message);
    }
}

/* ── discount codes ── */

/** A code someone typed, if they can use it now; otherwise the reason they can't. */
export async function findUsableCode(code: string, email: string): Promise<{ rule: DiscountRule } | { problem: string }> {
    if (!code) return { problem: "Enter a code." };
    await dbConnect();
    const doc = await DiscountCode.findOne({ code }).lean();
    const rule: DiscountRule | null = doc
        ? {
              code: doc.code,
              kind: doc.kind,
              value: doc.value,
              maxUses: doc.maxUses ?? null,
              uses: doc.uses ?? 0,
              redeemedBy: doc.redeemedBy ?? [],
              expiresAt: doc.expiresAt ? new Date(doc.expiresAt) : null,
              active: doc.active,
          }
        : null;
    const problem = discountProblem(rule, email);
    return problem || !rule ? { problem: problem ?? "That code isn't valid." } : { rule };
}

/**
 * Counts one use of a code by this person. A single conditional update, so two
 * tabs can't both use the last place on a capped code. False if it couldn't be used.
 */
export async function markCodeUsed(code: string, email: string): Promise<boolean> {
    await dbConnect();
    const address = email.toLowerCase();
    const result = await DiscountCode.updateOne(
        {
            code,
            active: true,
            redeemedBy: { $ne: address },
            $and: [
                { $or: [{ maxUses: null }, { $expr: { $lt: ["$uses", "$maxUses"] } }] },
                { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
            ],
        },
        { $inc: { uses: 1 }, $push: { redeemedBy: address } }
    );
    return result.modifiedCount === 1;
}

/**
 * Passes given without payment: a free-passes code, or a percentage code that
 * takes the price to nothing. Recorded like a purchase (₦0), so it shows in
 * their payment history and has a receipt.
 */
export async function grantPasses(opts: { email: string; passes: number; label: string; code: string; fullAmount: number }): Promise<{ reference: string } | null> {
    if (!(await markCodeUsed(opts.code, opts.email))) return null;
    await dbConnect();
    const reference = `gp_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
    await PassPurchase.create({
        email: opts.email,
        reference,
        passes: opts.passes,
        amount: 0,
        fullAmount: opts.fullAmount,
        currency: PASS_CURRENCY,
        label: opts.label,
        status: "paid",
        paidAt: new Date(),
        discountCode: opts.code,
    });
    await PassWallet.updateOne({ email: opts.email }, { $inc: { unused: opts.passes }, $setOnInsert: { email: opts.email, activeUntil: null, freeInterviewsUsed: 0 } }, { upsert: true });
    return { reference };
}

/** Redeems a free-passes code for this person. */
export async function redeemFreePasses(email: string, code: string): Promise<{ passes: number; reference: string; label: string } | { problem: string }> {
    const found = await findUsableCode(code, email);
    if ("problem" in found) return found;
    if (found.rule.kind !== "free_passes") return { problem: "That code takes money off a pass: choose a pass and press Continue to payment." };
    const label = `${describeDiscount(found.rule)} (code ${found.rule.code})`;
    const granted = await grantPasses({ email, passes: found.rule.value, label, code: found.rule.code, fullAmount: 0 });
    if (!granted) return { problem: "That code has just been used up." };
    return { passes: found.rule.value, reference: granted.reference, label };
}

