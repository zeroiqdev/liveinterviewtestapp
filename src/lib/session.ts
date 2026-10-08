import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User, { type IUser } from "@/models/User";
import {
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE_SECONDS,
    extractTokenFromRequest,
    signSessionToken,
    verifySessionToken,
    type SessionPayload,
} from "@/lib/sessionToken";

export {
    SESSION_COOKIE_NAME,
    extractTokenFromRequest,
    getJwtSecretKey,
    signSessionToken,
    verifySessionToken,
    type SessionPayload,
} from "@/lib/sessionToken";

type AdminFields = Pick<IUser, "email"> & Partial<Pick<IUser, "systemRole" | "isAdmin" | "emailVerified">>;

function configuredAdminEmails(): string[] {
    return (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Whether a user record has admin rights: granted explicitly in the database,
 * or listed in ADMIN_EMAILS *and* the user has proven they own that address
 * (Google sign-in or an emailed code). Without the ownership check anyone
 * could sign up with an admin's address and inherit their rights.
 */
export function isAdminUser(user: AdminFields | null | undefined): boolean {
    if (!user) return false;
    if (user.isAdmin === true || user.systemRole === "admin") return true;
    if (!user.emailVerified) return false;
    return configuredAdminEmails().includes((user.email || "").trim().toLowerCase());
}

/** Build the signed session for a user record. */
export function sessionPayloadFor(user: IUser): SessionPayload {
    const isAdmin = isAdminUser(user);
    return {
        userId: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        domain: user.domain,
        roleFamily: user.roleFamily,
        seniority: user.seniority,
        systemRole: isAdmin ? "admin" : "user",
        isAdmin,
        provider: user.provider || "credentials",
    };
}

/**
 * Sign a session for the user and return the standard login response
 * ({ success, user, ...extra }) with the session cookie attached.
 */
export async function loginResponse(user: IUser, extra: Record<string, unknown> = {}): Promise<NextResponse> {
    const token = await signSessionToken(sessionPayloadFor(user));
    const response = NextResponse.json({ success: true, user: toSafeUser(user), ...extra });
    setSessionCookie(response, token);
    return response;
}

/**
 * Retrieve session from request
 */
export async function getSession(req: NextRequest | Request): Promise<SessionPayload | null> {
    const token = extractTokenFromRequest(req);
    if (!token) return null;
    return verifySessionToken(token);
}

/**
 * Attach HTTP-only session cookie to response
 */
export function setSessionCookie(res: NextResponse, token: string): void {
    res.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
    });
}

/**
 * Clear session cookie from response
 */
export function clearSessionCookie(res: NextResponse): void {
    res.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: "",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        expires: new Date(0),
    });
}

/**
 * Sanitize user object for client response (strips password, ensures admin flags)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts docs and lean objects
export function toSafeUser(user: any) {
    if (!user) return null;
    const isAdmin = isAdminUser(user);

    return {
        id: user._id ? user._id.toString() : user.id,
        email: user.email || "",
        name: user.name || "",
        avatar: user.avatar || "",
        role: user.role || "Software Engineer",
        domain: user.domain || "Software & Engineering",
        roleFamily: user.roleFamily || "engineering",
        seniority: user.seniority || "professional",
        experienceInRole: user.experienceInRole || user.seniority || "professional",
        portfolioUrl: user.portfolioUrl || "",
        linkedinUrl: user.linkedinUrl || "",
        resumes: user.resumes || [],
        onboarded: Boolean(user.role && user.domain),
        provider: user.provider || "credentials",
        hasPassword: Boolean(user.password),
        systemRole: isAdmin ? "admin" : "user",
        isAdmin,
    };
}

/**
 * Enforce authentication on API route. Returns session or error Response
 */
/**
 * Sessions are stateless JWTs, so revocation is a per-user cutoff: tokens
 * issued before `sessionsValidAfter` (set when the password is reset or
 * changed) are rejected.
 */
export function issuedBeforeCutoff(session: SessionPayload, user: Pick<IUser, "sessionsValidAfter"> | null): boolean {
    if (!user?.sessionsValidAfter) return false;
    return (session.iat ?? 0) * 1000 < new Date(user.sessionsValidAfter).getTime();
}

/** Start of the current second; tokens issued from now on stay valid. */
export function revocationCutoff(): Date {
    return new Date(Math.floor(Date.now() / 1000) * 1000);
}

export async function requireAuth(
    req: NextRequest | Request
): Promise<{ session: SessionPayload } | { errorResponse: NextResponse }> {
    let session = await getSession(req);
    if (session?.email) {
        try {
            await dbConnect();
            const user = await User.findOne({ email: session.email.toLowerCase().trim() })
                .select("sessionsValidAfter")
                .lean<Pick<IUser, "sessionsValidAfter">>();
            if (!user || issuedBeforeCutoff(session, user)) session = null;
        } catch (err) {
            // The signature already proves the session; during a database outage
            // keep interviews running rather than failing every request.
            console.warn("[session] revocation check skipped:", (err as Error).message);
        }
    }
    if (!session || !session.email) {
        return {
            errorResponse: NextResponse.json(
                { error: "Unauthorized. Please log in to continue." },
                { status: 401 }
            ),
        };
    }
    return { session };
}

/**
 * Re-check admin rights against the database. The flag inside a session
 * token can be up to 7 days old, so revoking an admin must not wait for it.
 */
export async function isAdminSession(session: SessionPayload): Promise<boolean> {
    if (!session.isAdmin) return false;
    await dbConnect();
    const user = await User.findOne({ email: session.email.toLowerCase().trim() })
        .select("email systemRole isAdmin emailVerified")
        .lean<AdminFields>();
    return isAdminUser(user);
}

/**
 * Enforce admin role on API route. Returns session or error Response (401 or 403)
 */
export async function requireAdmin(
    req: NextRequest | Request
): Promise<{ session: SessionPayload } | { errorResponse: NextResponse }> {
    const authResult = await requireAuth(req);
    if ("errorResponse" in authResult) {
        return authResult;
    }

    const { session } = authResult;
    if (!(await isAdminSession(session))) {
        return {
            errorResponse: NextResponse.json(
                { error: "Forbidden. Admin authorization required." },
                { status: 403 }
            ),
        };
    }

    return { session };
}
