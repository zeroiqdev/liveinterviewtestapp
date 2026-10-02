import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "useladder_session";
const SESSION_EXPIRY = "7d";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface SessionPayload {
    userId: string;
    email: string;
    name: string;
    role: string;
    domain: string;
    roleFamily: string;
    seniority: string;
    systemRole: "user" | "admin";
    isAdmin: boolean;
    provider?: string;
}

/**
 * Returns HMAC secret key as Uint8Array for jose
 */
function getJwtSecretKey(): Uint8Array {
    const secret =
        process.env.AUTH_SECRET ||
        process.env.JWT_SECRET ||
        "useladder-super-secure-session-secret-key-32-chars-minimum!";
    return new TextEncoder().encode(secret);
}

/**
 * Checks if a given email or user flags qualify as Admin
 */
export function isConfiguredAdmin(
    email: string,
    systemRole?: string,
    isAdmin?: boolean
): boolean {
    if (isAdmin === true || systemRole === "admin") {
        return true;
    }

    const adminEmails = (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

    return Boolean(email && adminEmails.includes(email.trim().toLowerCase()));
}

/**
 * Sign a new session JWT
 */
export async function signSessionToken(
    payload: {
        userId: string;
        email: string;
        name: string;
        role: string;
        domain: string;
        roleFamily: string;
        seniority: string;
        systemRole?: "user" | "admin";
        isAdmin?: boolean;
        provider?: string;
    }
): Promise<string> {
    const secretKey = getJwtSecretKey();
    const isAdmin = isConfiguredAdmin(
        payload.email,
        payload.systemRole,
        payload.isAdmin
    );

    return new SignJWT({
        ...payload,
        systemRole: isAdmin ? "admin" : payload.systemRole || "user",
        isAdmin,
    })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(SESSION_EXPIRY)
        .sign(secretKey);
}

/**
 * Verify and decode a session token
 */
export async function verifySessionToken(
    token: string
): Promise<SessionPayload | null> {
    try {
        const secretKey = getJwtSecretKey();
        const { payload } = await jwtVerify(token, secretKey);

        const email = String(payload.email || "");
        const systemRole = (payload.systemRole as "user" | "admin") || "user";
        const isAdmin = isConfiguredAdmin(
            email,
            systemRole,
            Boolean(payload.isAdmin)
        );

        return {
            userId: String(payload.userId || ""),
            email,
            name: String(payload.name || ""),
            role: String(payload.role || "Software Engineer"),
            domain: String(payload.domain || "Software & Engineering"),
            roleFamily: String(payload.roleFamily || "engineering"),
            seniority: String(payload.seniority || "professional"),
            systemRole: isAdmin ? "admin" : systemRole,
            isAdmin,
            provider: payload.provider ? String(payload.provider) : undefined,
        };
    } catch {
        return null;
    }
}

/**
 * Extract token from a NextRequest or standard Request
 */
export function extractTokenFromRequest(req: NextRequest | Request): string | null {
    if ("cookies" in req && typeof req.cookies?.get === "function") {
        const cookie = req.cookies.get(SESSION_COOKIE_NAME);
        if (cookie?.value) return cookie.value;
    }

    const cookieHeader = req.headers.get("cookie");
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const c of cookies) {
        if (c.startsWith(`${SESSION_COOKIE_NAME}=`)) {
            return decodeURIComponent(c.substring(SESSION_COOKIE_NAME.length + 1));
        }
    }

    return null;
}

/**
 * Retrieve session from request
 */
export async function getSession(
    req: NextRequest | Request
): Promise<SessionPayload | null> {
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
export function toSafeUser(user: any) {
    if (!user) return null;
    const email = user.email || "";
    const systemRole = user.systemRole || "user";
    const isAdmin = isConfiguredAdmin(email, systemRole, user.isAdmin);

    return {
        id: user._id ? user._id.toString() : user.id,
        email,
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
        systemRole: isAdmin ? "admin" : systemRole,
        isAdmin,
    };
}

/**
 * Enforce authentication on API route. Returns session or error Response
 */
export async function requireAuth(
    req: NextRequest | Request
): Promise<{ session: SessionPayload } | { errorResponse: NextResponse }> {
    const session = await getSession(req);
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
    if (!session.isAdmin) {
        return {
            errorResponse: NextResponse.json(
                { error: "Forbidden. Admin authorization required." },
                { status: 403 }
            ),
        };
    }

    return { session };
}
