import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { serverError } from "@/lib/apiError";
import { passSummary } from "@/lib/passWallet";

export const dynamic = "force-dynamic";

/** GET /api/payments/pass — the signed-in user's passes. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        return NextResponse.json(await passSummary(auth.session.email));
    } catch (err) {
        return serverError("api/payments/pass", err, "Couldn't load your pass.");
    }
}
