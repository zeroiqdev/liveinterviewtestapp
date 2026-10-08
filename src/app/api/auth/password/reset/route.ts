import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { hashPassword } from "@/lib/password";
import { passwordProblem } from "@/lib/passwordPolicy";
import { normalizeCode, verifyEmailCode } from "@/lib/emailCode";
import { loginResponse, revocationCutoff } from "@/lib/session";
import { LIMITS, clientIp, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

/**
 * POST /api/auth/password/reset
 * Body: { email, code, password }
 *
 * Sets a new password using the emailed reset code, signs out every existing
 * session for the account, and signs this browser in.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
        const password = typeof body.password === "string" ? body.password.trim() : "";
        const code = normalizeCode(body.code);

        if (!email || !code || !password) {
            return NextResponse.json({ error: "Email, reset code and new password are required." }, { status: 400 });
        }
        const problem = passwordProblem(password);
        if (problem) return NextResponse.json({ error: problem, code: "weak_password" }, { status: 400 });

        const limited = await rateLimit(LIMITS.login, `ip:${clientIp(req)}`, `email:${email}`);
        if (limited) return limited;

        await dbConnect();
        const user = await User.findOne({ email });
        // Check the code even when no user exists, so timing doesn't leak accounts.
        const valid = await verifyEmailCode(email, "reset", code);
        if (!valid || !user) {
            return NextResponse.json(
                { error: "That code is incorrect or has expired. Request a new one and try again." },
                { status: 401 }
            );
        }

        if (user.emailVerified === false) {
            // The code proves inbox ownership; anything set on this unverified
            // account may have come from someone else.
            user.resumes = [];
        }
        user.password = await hashPassword(password);
        user.emailVerified = true;
        user.sessionsValidAfter = revocationCutoff();
        await user.save();

        return loginResponse(user);
    } catch (err) {
        return serverError("api/auth/password/reset", err, "Failed to reset password");
    }
}
