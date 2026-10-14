import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import PassPurchase from "@/models/PassPurchase";
import { requireAuth } from "@/lib/session";
import { serverError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/** GET /api/payments/history — the signed-in user's paid pass purchases, newest first. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        await dbConnect();
        const purchases = await PassPurchase.find({ email: auth.session.email, status: "paid" })
            .sort({ paidAt: -1, createdAt: -1 })
            .limit(50)
            .select("reference label passes amount currency paidAt createdAt")
            .lean();
        return NextResponse.json({
            purchases: purchases.map((p) => ({
                reference: p.reference,
                label: p.label,
                passes: p.passes,
                amount: p.amount,
                currency: p.currency,
                paidAt: p.paidAt ?? p.createdAt,
            })),
        });
    } catch (err) {
        return serverError("api/payments/history", err, "Couldn't load your payments.");
    }
}
