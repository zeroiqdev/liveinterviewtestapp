import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import TrySession from "@/models/TrySession";
import { LIMITS, clientIp, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";
import { getCachedAudio } from "@/services/ttsService";
import { cleanSpokenAudioText } from "@/engine/conversationalEngine";
import { TRY_COOKIE, TRY_QUESTIONS } from "@/lib/tryInterview";

export const dynamic = "force-dynamic";

/**
 * POST /api/try/audio — no account needed; the try is the one in the visitor's cookie.
 * Body: { index }
 * Records one of the try's own questions in the recruiter's voice. Asked for
 * while the visitor reads what the job will test, so the question is ready
 * when they start. Only stored questions can be recorded, never sent text.
 */
export async function POST(req: NextRequest) {
    try {
        const tryId = req.cookies.get(TRY_COOKIE)?.value;
        if (!tryId) return NextResponse.json({ error: "Your practice has expired.", code: "no_try" }, { status: 404 });
        const limited = await rateLimit(LIMITS.tryAnswer, `ip:${clientIp(req)}`, `try:${tryId}`);
        if (limited) return limited;

        const body = await req.json().catch(() => ({}));
        const index = Number(body.index);
        if (!Number.isInteger(index) || index < 0 || index >= TRY_QUESTIONS) return NextResponse.json({ error: "Unknown question." }, { status: 400 });

        await dbConnect();
        const session = await TrySession.findOne({ tryId }).select("questions claimedBy").lean();
        if (!session || session.claimedBy || !session.questions[index]) {
            return NextResponse.json({ error: "Your practice has expired.", code: "no_try" }, { status: 404 });
        }
        const audio = await getCachedAudio(cleanSpokenAudioText(session.questions[index]), "recruiter", "nigeria");
        return NextResponse.json({ audioUrl: audio.audioUrl, voiceLabel: audio.voiceLabel });
    } catch (err) {
        return serverError("api/try/audio", err, "Couldn't prepare the question's audio.");
    }
}
