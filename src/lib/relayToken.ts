/**
 * Short-lived token that lets the browser connect to the realtime voice relay
 * for one interview session. The relay holds the Azure key; the browser only
 * ever sees this token.
 */

import { randomUUID } from "crypto";
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { getJwtSecretKey } from "@/lib/sessionToken";

const AUDIENCE = "voice-relay";
const EXPIRY = "2m"; // only needs to survive the connection handshake

export interface RelayTokenPayload {
    sessionId: string;
    ownerId: string;
}

export interface VerifiedRelayToken extends RelayTokenPayload {
    /** Unique token id; the relay accepts each one only once. */
    jti: string;
    /** Expiry, seconds since epoch. */
    exp: number;
}

export async function signRelayToken(payload: RelayTokenPayload): Promise<string> {
    return new SignJWT({ sid: payload.sessionId, oid: payload.ownerId })
        .setProtectedHeader({ alg: "HS256" })
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setJti(randomUUID())
        .setExpirationTime(EXPIRY)
        .sign(getJwtSecretKey());
}

export async function verifyRelayToken(token: string): Promise<VerifiedRelayToken | null> {
    try {
        const { payload } = await jwtVerify(token, getJwtSecretKey(), { audience: AUDIENCE });
        if (typeof payload.sid !== "string" || typeof payload.oid !== "string") return null;
        if (typeof payload.jti !== "string" || typeof payload.exp !== "number") return null;
        return { sessionId: payload.sid, ownerId: payload.oid, jti: payload.jti, exp: payload.exp };
    } catch {
        return null;
    }
}
