/** Reading and changing a user's passes in the database. Server only. */

import dbConnect from "@/lib/mongodb";
import PassWallet from "@/models/PassWallet";
import PassPurchase from "@/models/PassPurchase";
import { FREE_INTERVIEWS, PASS_HOURS, decideStart, type StartDecision } from "@/lib/passes";
import { getCheckout, isPaidInFull } from "@/lib/bachs";
import User from "@/models/User";
import { sendEmail } from "@/lib/email";
import { receiptEmail } from "@/lib/receipts";
import { SITE_URL } from "@/lib/site";

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
        await emailReceipt(purchase.reference);
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
