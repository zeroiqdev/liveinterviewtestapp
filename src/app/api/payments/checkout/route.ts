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

        const offer = offerFor(await req.json().catch(() => ({})));
        if (!offer) return NextResponse.json({ error: "That pass isn't available." }, { status: 400 });

        const reference = `gp_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
        // Bachs won't send buyers back to a localhost address; on a developer's machine they return by hand.
        const publicSite = SITE_URL.startsWith("https://") && !/localhost|127\.0\.0\.1/.test(SITE_URL);
        const session = await createCheckout({
            amountNaira: offer.amount,
            reference,
            customer: { email: auth.session.email, name: auth.session.name },
            description: offer.label,
            successUrl: publicSite ? `${SITE_URL}/payment/complete` : undefined,
            cancelUrl: publicSite ? `${SITE_URL}/pricing` : undefined,
        });
        if (!session.checkout_url || !session.checkout_id) throw new Error("Bachs returned no checkout address");

        await dbConnect();
        await PassPurchase.create({ email: auth.session.email, reference, checkoutId: session.checkout_id, passes: offer.passes, amount: offer.amount, currency: PASS_CURRENCY, label: offer.label });
        return NextResponse.json({ url: session.checkout_url, checkoutId: session.checkout_id });
    } catch (err) {
        if (err instanceof PaymentsNotConfiguredError) {
            return NextResponse.json({ error: "Payments aren't available yet. Please try again later." }, { status: 503 });
        }
        return serverError("api/payments/checkout", err, "We couldn't open the payment page. Please try again.");
    }
}
