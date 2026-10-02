import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { verifyPassword, hashPassword } from "@/lib/password";
import { signSessionToken, setSessionCookie, toSafeUser, isConfiguredAdmin } from "@/lib/session";

export async function POST(req: NextRequest) {
    try {
        await dbConnect();
        const body = await req.json();
        const { email, password } = body;

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return NextResponse.json(
                { error: "No account found with this email. Please check your email or sign up." },
                { status: 404 }
            );
        }

        // Verify password if user has a password set
        if (user.password) {
            if (!password) {
                return NextResponse.json(
                    { error: "Password is required for this account." },
                    { status: 401 }
                );
            }

            const { valid, needsUpgrade } = await verifyPassword(password, user.password);
            if (!valid) {
                return NextResponse.json(
                    { error: "Incorrect password. Please verify your password and try again." },
                    { status: 401 }
                );
            }

            // Transparently upgrade legacy plain text password to bcrypt hash
            if (needsUpgrade) {
                user.password = await hashPassword(password.trim());
                await user.save();
            }
        }

        // Check if user qualifies as admin
        const isAdmin = isConfiguredAdmin(user.email, user.systemRole, user.isAdmin);
        if (isAdmin && (!user.isAdmin || user.systemRole !== "admin")) {
            user.isAdmin = true;
            user.systemRole = "admin";
            await user.save();
        }

        // Generate signed JWT session
        const sessionToken = await signSessionToken({
            userId: user._id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            domain: user.domain,
            roleFamily: user.roleFamily,
            seniority: user.seniority,
            systemRole: user.systemRole || (isAdmin ? "admin" : "user"),
            isAdmin,
            provider: user.provider || "credentials",
        });

        const safeUser = toSafeUser(user);

        const response = NextResponse.json({
            success: true,
            user: safeUser,
        });

        // Set secure HTTP-only session cookie
        setSessionCookie(response, sessionToken);

        return response;
    } catch (err) {
        console.error("[api/auth/login POST] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to log in" },
            { status: 500 }
        );
    }
}
