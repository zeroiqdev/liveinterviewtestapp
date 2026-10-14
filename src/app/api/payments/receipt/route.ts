import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import PassPurchase from "@/models/PassPurchase";
import User from "@/models/User";
import { requireAuth } from "@/lib/session";
import { serverError } from "@/lib/apiError";
import { receiptNumber } from "@/lib/receipts";

export const dynamic = "force-dynamic";

/** GET /api/payments/receipt?reference= — the receipt for one of the signed-in user's paid purchases. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const reference = new URL(req.url).searchParams.get("reference") ?? "";
        if (!/^gp_[a-z0-9_]{4,60}$/i.test(reference)) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });

        await dbConnect();
        // Only their own, and only once paid: there's no receipt for a payment that didn't go through.
        const purchase = await PassPurchase.findOne({ reference, email: auth.session.email, status: "paid" }).lean();
        if (!purchase) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
        const user = await User.findOne({ email: purchase.email }).select("name").lean<{ name?: string }>();

        return NextResponse.json({
            number: receiptNumber(purchase.reference),
            reference: purchase.reference,
            label: purchase.label,
            passes: purchase.passes,
            amount: purchase.amount,
            currency: purchase.currency,
            paidAt: purchase.paidAt ?? purchase.createdAt,
            name: user?.name ?? "",
            email: purchase.email,
        });
    } catch (err) {
        return serverError("api/payments/receipt", err, "Couldn't load that receipt.");
    }
}
