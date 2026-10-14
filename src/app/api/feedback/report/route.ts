import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import InterviewReport from "@/models/InterviewReport";
import { requireAuth } from "@/lib/session";
import { serverError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/**
 * GET /api/feedback/report?sessionId= — the signed-in user's stored report for
 * that interview, or their most recent one when no interview is named.
 * `report` is null when they have none.
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const sessionId = new URL(req.url).searchParams.get("sessionId");
        await dbConnect();
        const found = sessionId
            ? await InterviewReport.findOne({ email: auth.session.email, sessionId }).lean()
            : await InterviewReport.findOne({ email: auth.session.email }).sort({ createdAt: -1 }).lean();
        if (!found) return NextResponse.json({ report: null });
        return NextResponse.json({ report: found.report, sessionId: found.sessionId, createdAt: found.createdAt, role: found.role ?? null });
    } catch (err) {
        return serverError("api/feedback/report", err, "Couldn't load your report.");
    }
}
