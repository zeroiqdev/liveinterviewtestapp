import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/bachs";
import { settleCheckout } from "@/lib/passWallet";

export const dynamic = "force-dynamic";

/** Events that mean a checkout may now be paid. */
const PAID_EVENTS = new Set(["checkout.completed", "collection.succeeded"]);

/**
 * POST /api/payments/webhook — Bachs tells us about payments here.
 *
 * The signature is checked against the raw body before anything is read. A
 * paid event is not taken at its word either: the checkout is looked up at
 * Bachs and the passes are added only if Bachs says it was paid in full.
 * Replies: 400 to a delivery we reject, 5xx when our own work failed (so
 * Bachs retries), 2xx otherwise.
 */
export async function POST(req: NextRequest) {
    const secret = process.env.BACHS_WEBHOOK_SECRET?.trim();
    if (!secret) {
        console.error("[payments/webhook] BACHS_WEBHOOK_SECRET is not set; refusing deliveries.");
        return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }
    const rawBody = await req.text();
    if (!verifyWebhook(rawBody, req.headers, secret)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    let event: { type?: string; data?: { checkout_id?: string } };
    try {
        event = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const checkoutId = event?.data?.checkout_id;
    if (!event?.type || !PAID_EVENTS.has(event.type) || typeof checkoutId !== "string") {
        return NextResponse.json({ received: true });
    }

    try {
        const outcome = await settleCheckout(checkoutId);
        if (outcome === "unknown") console.warn(`[payments/webhook] ${event.type} for a checkout we didn't open: ${checkoutId}`);
        return NextResponse.json({ received: true, outcome });
    } catch (err) {
        console.error("[payments/webhook] settling failed:", err);
        return NextResponse.json({ error: "Try again" }, { status: 500 });
    }
}
