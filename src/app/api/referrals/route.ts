import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { serverError } from "@/lib/apiError";
import { referralSummary } from "@/lib/referrals";

export const dynamic = "force-dynamic";

/** GET /api/referrals — your invite link and how many friends have joined and bought. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const summary = await referralSummary(auth.session.email);
        if (!summary) return NextResponse.json({ error: "Account not found." }, { status: 404 });
        return NextResponse.json(summary);
    } catch (err) {
        return serverError("api/referrals", err, "Couldn't load your invite link.");
    }
}
