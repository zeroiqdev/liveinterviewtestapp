/**
 * Passes: what people buy, and the rule for when one is needed.
 *
 * A pass is 24 hours of interviews. Its clock starts when the first interview
 * under it begins, not when it is bought, so a pass bought today can be used
 * next week. A bundle is simply several passes.
 *
 * The first interview on every account is free: people pay once they have
 * seen what an interview and its report are like.
 */

/** Interviews an account can do before a pass is needed. */
export const FREE_INTERVIEWS = 1;
export const PASS_HOURS = 24;
export const PASS_CURRENCY = "NGN";
export const MAX_PASSES_PER_PURCHASE = 50;

export interface PassOffer {
    /** How many passes the purchase adds. */
    passes: number;
    /** Total price in naira. */
    amount: number;
    label: string;
}

/**
 * The price of `passes` passes, in naira: ₦1,500 for one, ₦6,500 for seven,
 * falling to ₦600 each from thirty. The pricing page shows the same numbers.
 */
export function priceForPasses(passes: number): number {
    const n = Math.max(1, Math.min(MAX_PASSES_PER_PURCHASE, Math.floor(passes)));
    if (n === 1) return 1500;
    if (n <= 7) return Math.round((1500 + (n - 1) * (5000 / 6)) / 100) * 100;
    if (n <= 30) return Math.round((6500 + (n - 7) * ((18000 - 6500) / (30 - 7))) / 100) * 100;
    return n * 600;
}

/** What a purchase request is for. Returns null for anything that isn't on sale. */
export function offerFor(request: { product?: unknown; passes?: unknown }): PassOffer | null {
    if (request.product === "day") return { passes: 1, amount: priceForPasses(1), label: "Day Pass" };
    if (request.product === "week") return { passes: 7, amount: priceForPasses(7), label: "1-Week Bundle (7 passes)" };
    if (request.product === "flexible") {
        const passes = Number(request.passes);
        if (!Number.isInteger(passes) || passes < 2 || passes > MAX_PASSES_PER_PURCHASE) return null;
        return { passes, amount: priceForPasses(passes), label: `${passes} passes` };
    }
    return null;
}

export interface Wallet {
    unused: number;
    activeUntil: Date | null;
    freeInterviewsUsed: number;
}

export type StartDecision =
    | { allowed: true; using: "active-pass" | "new-pass" | "free" | "admin" }
    | { allowed: false; reason: "pass_required" };

/** Whether this account may start an interview now, and what that uses up. */
export function decideStart(wallet: Wallet, now: Date, isAdmin = false): StartDecision {
    if (isAdmin) return { allowed: true, using: "admin" };
    if (wallet.activeUntil && wallet.activeUntil.getTime() > now.getTime()) return { allowed: true, using: "active-pass" };
    if (wallet.unused > 0) return { allowed: true, using: "new-pass" };
    if (wallet.freeInterviewsUsed < FREE_INTERVIEWS) return { allowed: true, using: "free" };
    return { allowed: false, reason: "pass_required" };
}
