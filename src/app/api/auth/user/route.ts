import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { normalizeUserRoleFamily } from "@/utils/locationDetector";

export async function GET(req: NextRequest) {
    try {
        await dbConnect();
        const { searchParams } = new URL(req.url);
        const email = searchParams.get("email");

        if (!email) {
            return NextResponse.json({ error: "Email query param required" }, { status: 400 });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            user: {
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
                provider: user.provider,
            },
        });
    } catch (err) {
        console.error("[api/auth/user GET] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to fetch user" },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        await dbConnect();
        const body = await req.json();
        const { email, role, domain, seniority, name, avatar, resume } = body;

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();
        let user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            const roleVal = role || "Software Engineer";
            user = await User.create({
                email: normalizedEmail,
                name: name || normalizedEmail.split("@")[0],
                avatar: avatar || "",
                role: roleVal,
                domain: domain || "Software & Engineering",
                roleFamily: normalizeUserRoleFamily(roleVal),
                seniority: seniority || "professional",
                resumes: resume ? [resume] : [],
            });
        } else {
            if (role) {
                user.role = role;
                user.roleFamily = normalizeUserRoleFamily(role);
            }
            if (domain) user.domain = domain;
            if (seniority) user.seniority = seniority;
            if (name) user.name = name;
            if (avatar) user.avatar = avatar;

            if (resume) {
                // If resume with same id exists, update it, otherwise push
                const existingIdx = user.resumes.findIndex((r) => r.id === resume.id);
                if (existingIdx >= 0) {
                    user.resumes[existingIdx] = { ...user.resumes[existingIdx], ...resume, updatedAt: new Date() };
                } else {
                    user.resumes.push({ ...resume, createdAt: new Date(), updatedAt: new Date() });
                }
            }

            await user.save();
        }

        return NextResponse.json({
            success: true,
            user: {
                id: user._id.toString(),
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                role: user.role,
                domain: user.domain,
                roleFamily: user.roleFamily,
                seniority: user.seniority,
                resumes: user.resumes,
            },
        });
    } catch (err) {
        console.error("[api/auth/user POST] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to update user" },
            { status: 500 }
        );
    }
}
