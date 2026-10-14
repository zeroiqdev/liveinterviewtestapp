import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import TrySession from "@/models/TrySession";
import { serverError } from "@/lib/apiError";
import { TRY_COOKIE, TRY_QUESTIONS } from "@/lib/tryInterview";

export const dynamic = "force-dynamic";

/**
 * GET /api/try — the interview this browser began before signing up, if it's
 * finished its two questions and hasn't been carried on yet. The dashboard
 * uses it to offer to pick it up.
 */
export async function GET(req: NextRequest) {
    try {
        const tryId = req.cookies.get(TRY_COOKIE)?.value;
        if (!tryId) return NextResponse.json({ pending: false });
        await dbConnect();
        const tried = await TrySession.findOne({ tryId, claimedBy: null }).select("role company title answers").lean();
        if (!tried || (tried.answers?.length ?? 0) < TRY_QUESTIONS) return NextResponse.json({ pending: false });
        return NextResponse.json({ pending: true, role: tried.role, company: tried.company, title: tried.title });
    } catch (err) {
        return serverError("api/try", err, "Couldn't check for an unfinished interview.");
    }
}
