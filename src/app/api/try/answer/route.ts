import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import TrySession from "@/models/TrySession";
import { LIMITS, clientIp, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";
import { TRY_COOKIE, TRY_QUESTIONS, cleanAnswer, scoreAnswer } from "@/lib/tryInterview";

export const dynamic = "force-dynamic";

/**
 * POST /api/try/answer — no account needed; the try is the one in the visitor's cookie.
 * Body: { index, answer }
 * After the first answer: the second question. After the second: feedback on
 * the first, which is all that's shown before sign-up.
 */
export async function POST(req: NextRequest) {
    try {
        const tryId = req.cookies.get(TRY_COOKIE)?.value;
        if (!tryId) return NextResponse.json({ error: "Your practice has expired. Please start again.", code: "no_try" }, { status: 404 });
        const limited = await rateLimit(LIMITS.tryAnswer, `ip:${clientIp(req)}`, `try:${tryId}`);
        if (limited) return limited;

        const body = await req.json().catch(() => ({}));
        const index = Number(body.index);
        const answer = cleanAnswer(body.answer);
        if (!Number.isInteger(index) || index < 0 || index >= TRY_QUESTIONS) return NextResponse.json({ error: "Unknown question." }, { status: 400 });
        if (answer.split(" ").length < 3) return NextResponse.json({ error: "Say or type a little more so there's something to give feedback on." }, { status: 400 });

        await dbConnect();
        const session = await TrySession.findOne({ tryId });
        if (!session || session.claimedBy) {
            return NextResponse.json({ error: "Your practice has expired. Please start again.", code: "no_try" }, { status: 404 });
        }
        // Answers go in order, once each.
        if (session.answers.length !== index) {
            return NextResponse.json({ error: "That question has already been answered.", code: "out_of_order", answered: session.answers.length }, { status: 409 });
        }
        session.answers.push({ text: answer, at: new Date() });
        await session.save();

        // Its audio comes from /api/try/audio, usually recorded while they answered the last one.
        if (index + 1 < TRY_QUESTIONS) {
            return NextResponse.json({ question: { index: index + 1, text: session.questions[index + 1], audioUrl: null } });
        }

        const feedback = await scoreAnswer({ title: session.title, company: session.company, question: session.questions[0], answer: session.answers[0].text });
        if (feedback) {
            session.firstFeedback = feedback;
            await session.save();
        }
        return NextResponse.json({ done: true, feedback, question: session.questions[0], secondQuestion: session.questions[1] });
    } catch (err) {
        return serverError("api/try/answer", err, "We couldn't save that answer. Please try again.");
    }
}
