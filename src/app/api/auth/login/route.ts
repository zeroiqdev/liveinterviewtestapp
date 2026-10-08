import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { verifyPassword } from "@/lib/password";
import { loginResponse } from "@/lib/session";
import { LIMITS, clientIp, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

/**
 * POST /api/auth/login
 * Body: { email, password }
 *
 * Password sign-in. The only passwordless option is Google
 * (/api/auth/google); accounts without a password set one through
 * /api/auth/password/forgot. Failures share one message so responses don't
 * reveal which emails have accounts.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
        const password = typeof body.password === "string" ? body.password : "";

        if (!email || !password) {
            return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
        }

        const limited = await rateLimit(LIMITS.login, `ip:${clientIp(req)}`, `email:${email}`);
        if (limited) return limited;

        await dbConnect();
        const user = await User.findOne({ email });
        const valid = user?.password ? await verifyPassword(password, user.password) : false;
        if (!user || !valid) {
            return NextResponse.json(
                {
                    error: "Incorrect email or password. Signed up with Google? Use Continue with Google, or reset your password.",
                },
                { status: 401 }
            );
        }

        if (user.emailVerified === false) {
            return NextResponse.json(
                { error: "Please verify your email to finish setting up your account.", code: "email_unverified" },
                { status: 403 }
            );
        }

        return loginResponse(user);
    } catch (err) {
        return serverError("api/auth/login", err, "Failed to log in");
    }
}
