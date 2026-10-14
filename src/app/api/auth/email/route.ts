import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { loginResponse, requireAuth } from "@/lib/session";
import { verifyPassword } from "@/lib/password";
import { issueEmailCode, normalizeCode, verifyEmailCode } from "@/lib/emailCode";
import { EMAIL_RE, cleanEmail, emailTaken, moveAccountEmail } from "@/lib/changeEmail";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";
import { EmailNotConfiguredError } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/email — change the signed-in account's email address.
 *   { action: "request", newEmail, currentPassword? }  emails a code to the new address
 *   { action: "confirm", newEmail, code }               moves the account to it
 * Google accounts keep the address Google gives them.
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const limited = await rateLimit(LIMITS.emailCodeSend, `user:${auth.session.email}`);
        if (limited) return limited;

        const body = await req.json().catch(() => ({}));
        const newEmail = cleanEmail(body.newEmail);
        if (!EMAIL_RE.test(newEmail)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

        await dbConnect();
        const user = await User.findOne({ email: auth.session.email });
        if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
        if (user.provider === "google") {
            return NextResponse.json({ error: "You sign in with Google, so your email comes from your Google account." }, { status: 400 });
        }
        if (newEmail === user.email) return NextResponse.json({ error: "That's already your email address." }, { status: 400 });
        if (await emailTaken(newEmail)) return NextResponse.json({ error: "Another account already uses that email address." }, { status: 409 });

        if (body.action === "request") {
            // The password proves it's the account holder asking, not someone at an unlocked screen.
            if (user.password && !(await verifyPassword(typeof body.currentPassword === "string" ? body.currentPassword : "", user.password))) {
                return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
            }
            const sent = await issueEmailCode(newEmail, "change-email");
            return NextResponse.json({
                ok: true,
                message: sent ? `We've emailed a 6-digit code to ${newEmail}.` : `We sent a code to ${newEmail} a moment ago. Check your inbox.`,
            });
        }

        if (body.action === "confirm") {
            const code = normalizeCode(body.code);
            if (!(await verifyEmailCode(newEmail, "change-email", code))) {
                return NextResponse.json({ error: "That code didn't work. Check it, or send a new one." }, { status: 400 });
            }
            await moveAccountEmail(user.email, newEmail);
            const moved = await User.findOne({ email: newEmail });
            if (!moved) throw new Error("account missing after email change");
            // A fresh sign-in under the new address.
            return loginResponse(moved);
        }

        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    } catch (err) {
        if (err instanceof EmailNotConfiguredError) {
            return NextResponse.json({ error: "We can't send emails right now. Please try again later." }, { status: 503 });
        }
        return serverError("api/auth/email", err, "We couldn't change your email just now.");
    }
}
