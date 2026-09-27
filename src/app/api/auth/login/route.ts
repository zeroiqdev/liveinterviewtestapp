import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

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

        // If user set a password during signup and password is provided in login
        if (user.password && password && user.password !== password.trim()) {
            return NextResponse.json(
                { error: "Incorrect password. Please verify your password and try again." },
                { status: 401 }
            );
        }

        const userResponse = {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            avatar: user.avatar || "",
            role: user.role,
            domain: user.domain,
            roleFamily: user.roleFamily,
            seniority: user.seniority,
            experienceInRole: user.experienceInRole || user.seniority || "professional",
            portfolioUrl: user.portfolioUrl || "",
            linkedinUrl: user.linkedinUrl || "",
            resumes: user.resumes || [],
            onboarded: Boolean(user.role && user.domain),
            provider: user.provider || "email",
        };

        return NextResponse.json({
            success: true,
            user: userResponse,
        });
    } catch (err) {
        console.error("[api/auth/login POST] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to log in" },
            { status: 500 }
        );
    }
}
