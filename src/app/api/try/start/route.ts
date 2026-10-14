import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import TrySession from "@/models/TrySession";
import { LIMITS, clientIp, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";
import { getRoles } from "@/lib/adminStorage";
import { MAX_ROLE_CHARS, TRY_COOKIE, TRY_QUESTIONS, cleanDescription, descriptionProblem, readJob } from "@/lib/tryInterview";

export const dynamic = "force-dynamic";

/**
 * POST /api/try/start — no account needed.
 * Body: { role, description }
 * Reads the job description and returns what it will test and the first of two questions.
 * The question's audio is recorded separately (/api/try/audio) while they read, so
 * this answers as soon as the description is read.
 */
export async function POST(req: NextRequest) {
    try {
        const ip = clientIp(req);
        const limited = await rateLimit(LIMITS.tryStart, `ip:${ip}`);
        if (limited) return limited;

        const body = await req.json().catch(() => ({}));
        const role = typeof body.role === "string" ? body.role.trim().slice(0, MAX_ROLE_CHARS) : "";
        // Only roles the app supports: the full interview after sign-up is built around them.
        const roles = await getRoles();
        const known = roles.find((r) => r.title.toLowerCase() === role.toLowerCase());
        if (!known) return NextResponse.json({ error: "Choose your role from the list." }, { status: 400 });

        const description = cleanDescription(body.description);
        const problem = descriptionProblem(description);
        if (problem) return NextResponse.json({ error: problem }, { status: 400 });

        const reading = await readJob(known.title, description);
        if (!reading) {
            return NextResponse.json({ error: "We couldn't prepare questions from that description. Please try again." }, { status: 502 });
        }

        const tryId = randomBytes(24).toString("hex");
        await dbConnect();
        await TrySession.create({ tryId, ip, role: known.title, description, ...reading, answers: [] });

        const res = NextResponse.json({
            role: known.title,
            domain: known.domain,
            company: reading.company,
            title: reading.title,
            themes: reading.themes,
            total: TRY_QUESTIONS,
            question: { index: 0, text: reading.questions[0], audioUrl: null },
        });
        res.cookies.set(TRY_COOKIE, tryId, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 7 * 24 * 60 * 60,
        });
        return res;
    } catch (err) {
        return serverError("api/try/start", err, "We couldn't start your practice. Please try again.");
    }
}
