import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";
import { normalizeDiscountCode } from "@/lib/discounts";
import { passSummary, redeemFreePasses } from "@/lib/passWallet";

export const dynamic = "force-dynamic";

/** POST /api/payments/redeem — { code }: adds a free-passes code's passes to the account. */
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const limited = await rateLimit(LIMITS.checkout, `user:${auth.session.email}`);
        if (limited) return limited;
        const body = await req.json().catch(() => ({}));
        const result = await redeemFreePasses(auth.session.email, normalizeDiscountCode(body.code));
        if ("problem" in result) return NextResponse.json({ error: result.problem }, { status: 400 });
        return NextResponse.json({ ...result, pass: await passSummary(auth.session.email) });
    } catch (err) {
        return serverError("api/payments/redeem", err, "We couldn't use that code. Please try again.");
    }
}
