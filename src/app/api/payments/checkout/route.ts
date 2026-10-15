import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import PassPurchase from "@/models/PassPurchase";
import { requireAuth } from "@/lib/session";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";
import { offerFor, PASS_CURRENCY } from "@/lib/passes";
import { createCheckout, PaymentsNotConfiguredError } from "@/lib/bachs";
import { SITE_URL } from "@/lib/site";
import { discountedAmount, normalizeDiscountCode } from "@/lib/discounts";
import { findUsableCode, grantPasses } from "@/lib/passWallet";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/checkout — opens a Bachs checkout for a pass purchase.
 * Body: { product: "day" | "week" | "flexible", passes? }
 * The price is worked out here from the product; nothing the browser sends sets it.
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const limited = await rateLimit(LIMITS.checkout, `user:${auth.session.email}`);
        if (limited) return limited;

        const body = await req.json().catch(() => ({}));
        const offer = offerFor(body);
        if (!offer) return NextResponse.json({ error: "That pass isn't available." }, { status: 400 });

        // A percentage code lowers the price; it's counted as used once the payment goes through.
        let amount = offer.amount;
        let discountCode: string | undefined;
        const typed = normalizeDiscountCode(body.discountCode);
        if (typed) {
            const found = await findUsableCode(typed, auth.session.email);
            if ("problem" in found) return NextResponse.json({ error: found.problem }, { status: 400 });
            if (found.rule.kind !== "percent") {
                return NextResponse.json({ error: "That code gives free passes: press Use code instead." }, { status: 400 });
            }
            amount = discountedAmount(offer.amount, found.rule);
            discountCode = found.rule.code;
            // Nothing left to pay: the passes are given straight away.
            if (amount === 0) {
                const granted = await grantPasses({
                    email: auth.session.email,
                    passes: offer.passes,
                    label: `${offer.label} (code ${found.rule.code})`,
                    code: found.rule.code,
                    fullAmount: offer.amount,
                });
                if (!granted) return NextResponse.json({ error: "That code has just been used up." }, { status: 400 });
                return NextResponse.json({ granted: true, reference: granted.reference });
            }
        }

        const reference = `gp_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
        // Bachs won't send buyers back to a localhost address; on a developer's machine they return by hand.
        const publicSite = SITE_URL.startsWith("https://") && !/localhost|127\.0\.0\.1/.test(SITE_URL);
        const session = await createCheckout({
            amountNaira: amount,
            reference,
            customer: { email: auth.session.email, name: auth.session.name },
            description: discountCode ? `${offer.label} (code ${discountCode})` : offer.label,
            successUrl: publicSite ? `${SITE_URL}/payment/complete` : undefined,
            cancelUrl: publicSite ? `${SITE_URL}/pricing` : undefined,
        });
        if (!session.checkout_url || !session.checkout_id) throw new Error("Bachs returned no checkout address");

        await dbConnect();
        await PassPurchase.create({ email: auth.session.email, reference, checkoutId: session.checkout_id, passes: offer.passes, amount, currency: PASS_CURRENCY, label: discountCode ? `${offer.label} (code ${discountCode})` : offer.label, ...(discountCode ? { discountCode, fullAmount: offer.amount } : {}) });
        return NextResponse.json({ url: session.checkout_url, checkoutId: session.checkout_id });
    } catch (err) {
        if (err instanceof PaymentsNotConfiguredError) {
            return NextResponse.json({ error: "Payments aren't available yet. Please try again later." }, { status: 503 });
        }
        return serverError("api/payments/checkout", err, "We couldn't open the payment page. Please try again.");
    }
}
