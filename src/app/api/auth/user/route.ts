import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { normalizeUserRoleFamily } from "@/utils/locationDetector";
import { hashPassword } from "@/lib/password";
import {
    requireAuth,
    signSessionToken,
    setSessionCookie,
    toSafeUser,
    isConfiguredAdmin,
} from "@/lib/session";

export async function GET(req: NextRequest) {
    try {
        const authResult = await requireAuth(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }
        const { session } = authResult;

        const { searchParams } = new URL(req.url);
        const queryEmail = searchParams.get("email");
        const targetEmail = queryEmail ? queryEmail.toLowerCase().trim() : session.email;

        // Authorization check: non-admin users cannot inspect other accounts
        if (targetEmail !== session.email && !session.isAdmin) {
            return NextResponse.json(
                { error: "Forbidden: You are not authorized to view another user's profile" },
                { status: 403 }
            );
        }

        await dbConnect();
        const user = await User.findOne({ email: targetEmail });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            user: toSafeUser(user),
        });
    } catch (err) {
        console.error("[api/auth/user GET] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to fetch user" },
            { status: 500 }
        );
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const authResult = await requireAuth(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }
        const { session } = authResult;

        await dbConnect();
        const body = await req.json();
        const { email, role, domain, seniority, portfolioUrl, linkedinUrl, password, name, avatar } = body;

        const targetEmail = email ? email.toLowerCase().trim() : session.email;

        // Authorization check: non-admin users cannot update other users
        if (targetEmail !== session.email && !session.isAdmin) {
            return NextResponse.json(
                { error: "Forbidden: You are not authorized to update another user's profile" },
                { status: 403 }
            );
        }

        const user = await User.findOne({ email: targetEmail });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (name) user.name = name.trim();
        if (avatar !== undefined) user.avatar = avatar;
        if (role) {
            user.role = role;
            user.roleFamily = normalizeUserRoleFamily(role);
        }
        if (domain) user.domain = domain;
        if (seniority) user.seniority = seniority;
        if (portfolioUrl !== undefined) user.portfolioUrl = portfolioUrl;
        if (linkedinUrl !== undefined) user.linkedinUrl = linkedinUrl;
        if (password) {
            user.password = await hashPassword(password.trim());
        }

        await user.save();

        return NextResponse.json({
            success: true,
            user: toSafeUser(user),
        });
    } catch (err) {
        console.error("[api/auth/user PATCH] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to update user" },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const authResult = await requireAuth(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }
        const { session } = authResult;

        const { searchParams } = new URL(req.url);
        const queryEmail = searchParams.get("email");
        const resumeId = searchParams.get("resumeId");

        if (!resumeId) {
            return NextResponse.json({ error: "resumeId query param required" }, { status: 400 });
        }

        const targetEmail = queryEmail ? queryEmail.toLowerCase().trim() : session.email;

        // Authorization check
        if (targetEmail !== session.email && !session.isAdmin) {
            return NextResponse.json(
                { error: "Forbidden: You are not authorized to delete another user's resume" },
                { status: 403 }
            );
        }

        await dbConnect();
        const user = await User.findOne({ email: targetEmail });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const beforeCount = user.resumes.length;
        user.resumes = user.resumes.filter((r) => r.id !== resumeId);

        if (user.resumes.length === beforeCount) {
            return NextResponse.json({ error: "Resume not found" }, { status: 404 });
        }

        await user.save();

        return NextResponse.json({
            success: true,
            resumes: user.resumes,
        });
    } catch (err) {
        console.error("[api/auth/user DELETE] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to delete resume" },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        await dbConnect();
        const body = await req.json();
        const {
            email,
            role,
            domain,
            seniority,
            experienceInRole,
            password,
            name,
            avatar,
            resume,
            portfolioUrl,
            linkedinUrl,
        } = body;

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();
        let user = await User.findOne({ email: normalizedEmail });

        const hashedPassword = password ? await hashPassword(password.trim()) : "";
        const isAdmin = isConfiguredAdmin(normalizedEmail);

        if (!user) {
            const roleVal = role || "Software Engineer";
            user = await User.create({
                email: normalizedEmail,
                name: name ? name.trim() : normalizedEmail.split("@")[0],
                avatar: avatar || "",
                role: roleVal,
                domain: domain || "Software & Engineering",
                roleFamily: normalizeUserRoleFamily(roleVal),
                seniority: seniority || "professional",
                experienceInRole: experienceInRole || seniority || "professional",
                password: hashedPassword,
                portfolioUrl: portfolioUrl || "",
                linkedinUrl: linkedinUrl || "",
                resumes: resume ? [resume] : [],
                systemRole: isAdmin ? "admin" : "user",
                isAdmin,
            });
        } else {
            if (role) {
                user.role = role;
                user.roleFamily = normalizeUserRoleFamily(role);
            }
            if (domain) user.domain = domain;
            if (seniority) user.seniority = seniority;
            if (experienceInRole) user.experienceInRole = experienceInRole;
            if (hashedPassword) user.password = hashedPassword;
            if (name) user.name = name.trim();
            if (avatar) user.avatar = avatar;
            if (portfolioUrl !== undefined) user.portfolioUrl = portfolioUrl;
            if (linkedinUrl !== undefined) user.linkedinUrl = linkedinUrl;
            if (isAdmin && (!user.isAdmin || user.systemRole !== "admin")) {
                user.isAdmin = true;
                user.systemRole = "admin";
            }

            if (resume) {
                const existingIdx = user.resumes.findIndex((r) => r.id === resume.id);
                if (existingIdx >= 0) {
                    user.resumes[existingIdx] = {
                        ...user.resumes[existingIdx],
                        ...resume,
                        updatedAt: new Date(),
                    };
                } else {
                    user.resumes.push({ ...resume, createdAt: new Date(), updatedAt: new Date() });
                }
            }

            await user.save();
        }

        const userIsAdmin = isConfiguredAdmin(user.email, user.systemRole, user.isAdmin);

        // Sign session token and issue HTTP-only cookie
        const sessionToken = await signSessionToken({
            userId: user._id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            domain: user.domain,
            roleFamily: user.roleFamily,
            seniority: user.seniority,
            systemRole: user.systemRole || (userIsAdmin ? "admin" : "user"),
            isAdmin: userIsAdmin,
            provider: user.provider || "credentials",
        });

        const safeUser = toSafeUser(user);

        const response = NextResponse.json({
            success: true,
            user: safeUser,
        });

        setSessionCookie(response, sessionToken);

        return response;
    } catch (err) {
        console.error("[api/auth/user POST] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to update user" },
            { status: 500 }
        );
    }
}
