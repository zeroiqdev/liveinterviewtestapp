import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { issueEmailCode } from "@/lib/emailCode";
import { EmailSendError } from "@/lib/email";
import { LIMITS, clientIp, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/verify/resend
 * Body: { email }
 *
 * Re-sends the sign-up verification code for an account that hasn't been
 * verified yet. The response is the same whether or not one was sent.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
        if (!EMAIL_RE.test(email)) {
            return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
        }

        const limited = await rateLimit(LIMITS.emailCodeSend, `ip:${clientIp(req)}`, `email:${email}`);
        if (limited) return limited;

        await dbConnect();
        if (await User.exists({ email, emailVerified: false })) await issueEmailCode(email, "verify");

        return NextResponse.json({
            success: true,
            message: "If that account is waiting for verification, we've emailed a new 6-digit code.",
        });
    } catch (err) {
        if (err instanceof EmailSendError) {
            return serverError("api/auth/verify/resend", err, "We couldn't send a new code right now. Please try again in a few minutes.", 503);
        }
        return serverError("api/auth/verify/resend", err, "Could not send a verification code");
    }
}
