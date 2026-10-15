import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";
import { offerFor } from "@/lib/passes";
import { describeDiscount, discountedAmount, normalizeDiscountCode } from "@/lib/discounts";
import { findUsableCode } from "@/lib/passWallet";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/discount — { code, product } → what the code does for this
 * person: free passes, or the new price of the pass they've chosen.
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        // Shares the checkout limit, so codes can't be guessed in bulk.
        const limited = await rateLimit(LIMITS.checkout, `user:${auth.session.email}`);
        if (limited) return limited;
        const body = await req.json().catch(() => ({}));
        const found = await findUsableCode(normalizeDiscountCode(body.code), auth.session.email);
        if ("problem" in found) return NextResponse.json({ error: found.problem }, { status: 400 });
        const offer = offerFor(body);
        return NextResponse.json({
            code: found.rule.code,
            kind: found.rule.kind,
            value: found.rule.value,
            description: describeDiscount(found.rule),
            ...(offer && found.rule.kind === "percent" ? { amount: discountedAmount(offer.amount, found.rule), fullAmount: offer.amount } : {}),
        });
    } catch (err) {
        return serverError("api/payments/discount", err, "We couldn't check that code. Please try again.");
    }
}
