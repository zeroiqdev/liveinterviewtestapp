import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User, { type IResume, type IUser } from "@/models/User";
import { normalizeUserRoleFamily } from "@/utils/locationDetector";
import { hashPassword, verifyPassword } from "@/lib/password";
import { passwordProblem } from "@/lib/passwordPolicy";
import { issueEmailCode } from "@/lib/emailCode";
import { EmailSendError } from "@/lib/email";
import {
    getSession,
    isAdminSession,
    loginResponse,
    requireAuth,
    revocationCutoff,
    toSafeUser,
    type SessionPayload,
} from "@/lib/session";
import { LIMITS, clientIp, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

/**
 * Resolve which account a request may act on: the caller's own, or any
 * account for an admin (re-checked against the database).
 */
async function resolveTarget(
    session: SessionPayload,
    requestedEmail: unknown
): Promise<{ email: string; isSelf: boolean } | { errorResponse: NextResponse }> {
    const target = str(requestedEmail)?.toLowerCase().trim() || session.email;
    const isSelf = target === session.email;
    if (!isSelf && !(await isAdminSession(session))) {
        return {
            errorResponse: NextResponse.json(
                { error: "Forbidden: you can only access your own account" },
                { status: 403 }
            ),
        };
    }
    return { email: target, isSelf };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- request JSON
function applyProfileFields(user: IUser, body: any) {
    const role = str(body.role);
    if (str(body.name)?.trim()) user.name = body.name.trim();
    if (body.avatar !== undefined) user.avatar = str(body.avatar) ?? "";
    if (role) {
        user.role = role;
        user.roleFamily = normalizeUserRoleFamily(role);
    }
    if (str(body.domain)) user.domain = body.domain;
    if (str(body.seniority)) user.seniority = body.seniority;
    if (str(body.experienceInRole)) user.experienceInRole = body.experienceInRole;
    if (body.portfolioUrl !== undefined) user.portfolioUrl = str(body.portfolioUrl) ?? "";
    if (body.linkedinUrl !== undefined) user.linkedinUrl = str(body.linkedinUrl) ?? "";
}

function upsertResume(user: IUser, resume: Partial<IResume>) {
    if (!resume || typeof resume.id !== "string") return;
    const fields = {
        id: resume.id,
        name: str(resume.name) || "Resume",
        rawText: str(resume.rawText) ?? "",
        ...(typeof resume.score === "number" ? { score: resume.score } : {}),
    };
    const existing = user.resumes.find((r) => r.id === resume.id);
    if (existing) {
        Object.assign(existing, fields, { updatedAt: new Date() });
    } else {
        user.resumes.push({ ...fields, createdAt: new Date(), updatedAt: new Date() } as IResume);
    }
}

/**
 * Changing a password requires the current one when the account has one.
 * Accounts without a password (Google / email-code users) can set one while
 * signed in. Only the account owner may change it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- request JSON
async function applyPasswordChange(user: IUser, body: any, isSelf: boolean): Promise<NextResponse | null> {
    const password = str(body.password)?.trim();
    if (!password) return null;
    if (!isSelf) {
        return NextResponse.json({ error: "Passwords can only be changed by the account owner." }, { status: 403 });
    }
    const problem = passwordProblem(password);
    if (problem) return NextResponse.json({ error: problem, code: "weak_password" }, { status: 400 });
    if (user.password && !(await verifyPassword(str(body.currentPassword) || "", user.password))) {
        return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
    }
    user.password = await hashPassword(password);
    // Sign out every other session; the caller gets a fresh one below.
    user.sessionsValidAfter = revocationCutoff();
    return null;
}

export async function GET(req: NextRequest) {
    try {
        const authResult = await requireAuth(req);
        if ("errorResponse" in authResult) return authResult.errorResponse;

        const target = await resolveTarget(authResult.session, new URL(req.url).searchParams.get("email"));
        if ("errorResponse" in target) return target.errorResponse;

        await dbConnect();
        const user = await User.findOne({ email: target.email });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, user: toSafeUser(user) });
    } catch (err) {
        return serverError("api/auth/user GET", err, "Failed to fetch user");
    }
}

/** Update a profile. Body: profile fields, optional resume, optional password + currentPassword. */
export async function PATCH(req: NextRequest) {
    try {
        const authResult = await requireAuth(req);
        if ("errorResponse" in authResult) return authResult.errorResponse;

        const body = await req.json().catch(() => ({}));
        const target = await resolveTarget(authResult.session, body.email);
        if ("errorResponse" in target) return target.errorResponse;

        await dbConnect();
        const user = await User.findOne({ email: target.email });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const passwordError = await applyPasswordChange(user, body, target.isSelf);
        if (passwordError) return passwordError;
        applyProfileFields(user, body);
        if (body.resume) upsertResume(user, body.resume);
        await user.save();

        // A password change revoked older sessions, including this one: re-issue it.
        if (target.isSelf && str(body.password)) return loginResponse(user);
        return NextResponse.json({ success: true, user: toSafeUser(user) });
    } catch (err) {
        return serverError("api/auth/user PATCH", err, "Failed to update user");
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const authResult = await requireAuth(req);
        if ("errorResponse" in authResult) return authResult.errorResponse;

        const { searchParams } = new URL(req.url);
        const resumeId = searchParams.get("resumeId");
        if (!resumeId) {
            return NextResponse.json({ error: "resumeId query param required" }, { status: 400 });
        }

        const target = await resolveTarget(authResult.session, searchParams.get("email"));
        if ("errorResponse" in target) return target.errorResponse;

        await dbConnect();
        const user = await User.findOne({ email: target.email });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const beforeCount = user.resumes.length;
        user.resumes = user.resumes.filter((r) => r.id !== resumeId);
        if (user.resumes.length === beforeCount) {
            return NextResponse.json({ error: "Resume not found" }, { status: 404 });
        }

        await user.save();
        return NextResponse.json({ success: true, resumes: user.resumes });
    } catch (err) {
        return serverError("api/auth/user DELETE", err, "Failed to delete resume");
    }
}

/**
 * Signed out: sign-up. Creates the account and emails a verification code; no
 * session is issued until the code is entered at /api/auth/verify, so nobody
 * can hold a session on an address they don't own. An unverified account
 * may be replaced by a fresh sign-up; a verified one must log in instead.
 * Signed in: update the caller's own profile (same as PATCH).
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession(req);
        if (session?.email) return PATCH(req);

        const body = await req.json().catch(() => ({}));
        const email = str(body.email)?.toLowerCase().trim() || "";
        if (!EMAIL_RE.test(email)) {
            return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
        }

        const limited = await rateLimit(LIMITS.signup, `ip:${clientIp(req)}`, `email:${email}`);
        if (limited) return limited;

        // Email sign-ups always have a password; the only passwordless sign-in is Google.
        const password = str(body.password)?.trim() || "";
        if (!password) {
            return NextResponse.json(
                { error: "Choose a password, or continue with Google.", code: "weak_password" },
                { status: 400 }
            );
        }
        const problem = passwordProblem(password);
        if (problem) return NextResponse.json({ error: problem, code: "weak_password" }, { status: 400 });

        await dbConnect();
        const existing = await User.findOne({ email });
        if (existing && existing.emailVerified !== false) {
            return NextResponse.json(
                { error: "An account with this email already exists. Please log in instead.", code: "account_exists" },
                { status: 409 }
            );
        }

        const role = str(body.role) || "Software Engineer";
        const fields = {
            email,
            name: str(body.name)?.trim() || email.split("@")[0],
            avatar: "",
            role,
            domain: str(body.domain) || "Software & Engineering",
            roleFamily: normalizeUserRoleFamily(role),
            seniority: str(body.seniority) || "professional",
            experienceInRole: str(body.experienceInRole) || str(body.seniority) || "professional",
            password: await hashPassword(password),
            provider: "credentials" as const,
            emailVerified: false,
            resumes: [],
        };
        const user = existing ? Object.assign(existing, fields) : new User(fields);
        applyProfileFields(user, { portfolioUrl: body.portfolioUrl, linkedinUrl: body.linkedinUrl });
        if (body.resume) upsertResume(user, body.resume);
        await user.save();

        await issueEmailCode(email, "verify");
        return NextResponse.json({
            success: true,
            verificationRequired: true,
            message: `We've emailed a 6-digit code to ${email}. Enter it to finish creating your account.`,
        });
    } catch (err) {
        if (err instanceof EmailSendError) {
            return serverError("api/auth/user POST", err, "We couldn't send your verification email right now. Please try again in a few minutes, or continue with Google.", 503);
        }
        return serverError("api/auth/user POST", err, "Failed to create account");
    }
}
