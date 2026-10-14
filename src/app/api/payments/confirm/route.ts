import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import PassPurchase from "@/models/PassPurchase";
import { requireAuth } from "@/lib/session";
import { serverError } from "@/lib/apiError";
import { passSummary, settleCheckout } from "@/lib/passWallet";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments/confirm?checkout_id= — the buyer is back from the payment
 * page. Asks Bachs whether their checkout was paid (the webhook may not have
 * arrived yet) and returns their passes. Without an id, checks their most
 * recent unpaid checkout.
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        await dbConnect();
        const asked = new URL(req.url).searchParams.get("checkout_id");
        // Only their own checkouts: an id from the address bar can't settle someone else's.
        const purchase = asked
            ? await PassPurchase.findOne({ email: auth.session.email, checkoutId: asked }).lean()
            : await PassPurchase.findOne({ email: auth.session.email, status: "pending" }).sort({ createdAt: -1 }).lean();
        let outcome: "paid" | "not-paid" | "unknown" = "unknown";
        if (purchase?.checkoutId) outcome = await settleCheckout(purchase.checkoutId);
        return NextResponse.json({ outcome, passes: purchase?.passes ?? 0, label: purchase?.label ?? "", reference: outcome === "paid" ? purchase?.reference ?? null : null, pass: await passSummary(auth.session.email) });
    } catch (err) {
        return serverError("api/payments/confirm", err, "We couldn't check your payment just now. If you paid, your pass will appear shortly.");
    }
}
