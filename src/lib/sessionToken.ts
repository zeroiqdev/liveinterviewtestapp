/**
 * Session JWT signing and verification.
 *
 * Kept free of database imports so middleware (which may run on the edge)
 * can verify sessions. Route handlers should import from "@/lib/session",
 * which re-exports everything here plus the DB-aware helpers.
 */

import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE_NAME = "useladder_session";
export const SESSION_EXPIRY = "7d";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

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
    /** Issue time in seconds (from the token; never signed into it). */
    iat?: number;
}

/**
 * HMAC secret for session and relay tokens. There is deliberately no
 * fallback: a default secret would let anyone forge sessions.
 */
export function getJwtSecretKey(): Uint8Array {
    const secret = process.env.AUTH_SECRET || process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error("AUTH_SECRET must be set to a random string of at least 32 characters");
    }
    return new TextEncoder().encode(secret);
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- iat is set by setIssuedAt
    const { iat, ...claims } = payload;
    return new SignJWT({ ...claims })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(SESSION_EXPIRY)
        .sign(getJwtSecretKey());
}

/**
 * Verify and decode a session token. The admin flag is taken from the signed
 * token for page gating only; admin API routes re-check it against the
 * database (see requireAdmin) so revocation takes effect immediately.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, getJwtSecretKey());
        // Tokens with an audience (e.g. voice relay tokens) are not sessions.
        if (payload.aud !== undefined) return null;

        const isAdmin = payload.isAdmin === true;
        return {
            userId: String(payload.userId || ""),
            email: String(payload.email || ""),
            name: String(payload.name || ""),
            role: String(payload.role || "Software Engineer"),
            domain: String(payload.domain || "Software & Engineering"),
            roleFamily: String(payload.roleFamily || "engineering"),
            seniority: String(payload.seniority || "professional"),
            systemRole: isAdmin ? "admin" : "user",
            isAdmin,
            provider: payload.provider ? String(payload.provider) : undefined,
            iat: typeof payload.iat === "number" ? payload.iat : undefined,
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
