import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { normalizeUserRoleFamily } from "@/utils/locationDetector";

function parseJwtPayload(token: string) {
    try {
        const base64Url = token.split(".")[1];
        if (!base64Url) return null;
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
            Buffer.from(base64, "base64")
                .toString("binary")
                .split("")
                .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
        );
        return JSON.parse(jsonPayload);
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        await dbConnect();
        const body = await req.json();
        const { credential, email: directEmail, name: directName, avatar: directAvatar, googleId: directSub } = body;

        let email = directEmail;
        let name = directName;
        let avatar = directAvatar;
        let googleId = directSub;

        // If Google Credential JWT is passed from Google Identity Services
        if (credential) {
            try {
                const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
                if (verifyRes.ok) {
                    const verified = await verifyRes.json();
                    email = verified.email || email;
                    name = verified.name || verified.given_name || name;
                    avatar = verified.picture || avatar;
                    googleId = verified.sub || googleId;
                } else {
                    const decoded = parseJwtPayload(credential);
                    if (decoded) {
                        email = decoded.email || email;
                        name = decoded.name || decoded.given_name || name;
                        avatar = decoded.picture || avatar;
                        googleId = decoded.sub || googleId;
                    }
                }
            } catch {
                const decoded = parseJwtPayload(credential);
                if (decoded) {
                    email = decoded.email || email;
                    name = decoded.name || decoded.given_name || name;
                    avatar = decoded.picture || avatar;
                    googleId = decoded.sub || googleId;
                }
            }
        }

        if (!email) {
            return NextResponse.json(
                { error: "Email is required for authentication" },
                { status: 400 }
            );
        }

        email = email.toLowerCase().trim();
        name = name ? name.trim() : email.split("@")[0];

        // Find or upsert user
        let user = await User.findOne({ email });

        if (!user) {
            const initialRole = body.role || "Software Engineer";
            const initialDomain = body.domain || "Software & Engineering";
            const initialRoleFamily = normalizeUserRoleFamily(initialRole);

            user = await User.create({
                email,
                name,
                avatar: avatar || "",
                googleId: googleId || "",
                provider: "google",
                role: initialRole,
                domain: initialDomain,
                roleFamily: initialRoleFamily,
                seniority: body.seniority || "professional",
                experienceInRole: body.experience || "professional",
                resumes: [],
            });
        } else {
            // Update latest basic profile info
            if (name && !user.name) user.name = name;
            if (avatar && !user.avatar) user.avatar = avatar;
            if (googleId && !user.googleId) user.googleId = googleId;
            if (body.role) {
                user.role = body.role;
                user.roleFamily = normalizeUserRoleFamily(body.role);
            }
            if (body.domain) user.domain = body.domain;
            await user.save();
        }

        const userResponse = {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            avatar: user.avatar,
            role: user.role,
            domain: user.domain,
            roleFamily: user.roleFamily,
            seniority: user.seniority,
            experienceInRole: user.experienceInRole,
            resumes: user.resumes,
            onboarded: Boolean(user.role && user.domain),
            provider: "google",
        };

        return NextResponse.json({
            success: true,
            user: userResponse,
        });
    } catch (err) {
        console.error("[api/auth/google] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to authenticate with Google" },
            { status: 500 }
        );
    }
}
