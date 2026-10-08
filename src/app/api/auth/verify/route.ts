import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { verifyPassword } from "@/lib/password";
import { normalizeCode, verifyEmailCode } from "@/lib/emailCode";
import { loginResponse } from "@/lib/session";
import { LIMITS, clientIp, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

/**
 * POST /api/auth/verify
 * Body: { email, code, password }
 *
 * Finishes a sign-up: checks the emailed verification code, marks the email
 * verified and signs the user in.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
        const password = typeof body.password === "string" ? body.password : "";
        const code = normalizeCode(body.code);

        if (!email || !code) {
            return NextResponse.json({ error: "Email and verification code are required." }, { status: 400 });
        }

        const limited = await rateLimit(LIMITS.login, `ip:${clientIp(req)}`, `email:${email}`);
        if (limited) return limited;

        await dbConnect();
        const user = await User.findOne({ email });
        // Check the code even when no user exists, so timing doesn't leak accounts.
        const valid = await verifyEmailCode(email, "verify", code);
        if (!valid || !user || user.emailVerified !== false) {
            return NextResponse.json(
                { error: "That code is incorrect or has expired. Request a new one and try again." },
                { status: 401 }
            );
        }

        // Anyone could have created this unverified account. The code proves the
        // caller owns the inbox; keep the password and data only if they also
        // prove they set it (the sign-up form sends it along).
        const setByVerifier = Boolean(password && user.password && (await verifyPassword(password, user.password)));
        if (!setByVerifier) {
            user.password = "";
            user.resumes = [];
        }
        user.emailVerified = true;
        await user.save();

        return loginResponse(user, { needsPassword: !user.password });
    } catch (err) {
        return serverError("api/auth/verify", err, "Failed to verify email");
    }
}
