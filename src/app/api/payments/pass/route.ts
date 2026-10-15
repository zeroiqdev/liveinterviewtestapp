import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, requireAuth } from "@/lib/session";
import { serverError } from "@/lib/apiError";
import { passSummary } from "@/lib/passWallet";

export const dynamic = "force-dynamic";

/** GET /api/payments/pass — the signed-in user's passes. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const [summary, isAdmin] = await Promise.all([passSummary(auth.session.email), isAdminSession(auth.session)]);
        // Whether an interview can start right now: shown before the mic check, not after it.
        const canStart = isAdmin || summary.active || summary.unused > 0 || summary.freeInterviewsLeft > 0;
        return NextResponse.json({ ...summary, canStart, isAdmin });
    } catch (err) {
        return serverError("api/payments/pass", err, "Couldn't load your pass.");
    }
}
