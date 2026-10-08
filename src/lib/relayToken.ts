/**
 * Short-lived token that lets the browser connect to the realtime voice relay
 * for one interview session. The relay holds the Azure key; the browser only
 * ever sees this token.
 */

import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { getJwtSecretKey } from "@/lib/session";

const AUDIENCE = "voice-relay";
const EXPIRY = "2m"; // only needs to survive the connection handshake

export interface RelayTokenPayload {
    sessionId: string;
    ownerId: string;
}

export async function signRelayToken(payload: RelayTokenPayload): Promise<string> {
    return new SignJWT({ sid: payload.sessionId, oid: payload.ownerId })
        .setProtectedHeader({ alg: "HS256" })
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(EXPIRY)
        .sign(getJwtSecretKey());
}

export async function verifyRelayToken(token: string): Promise<RelayTokenPayload | null> {
    try {
        const { payload } = await jwtVerify(token, getJwtSecretKey(), { audience: AUDIENCE });
        if (typeof payload.sid !== "string" || typeof payload.oid !== "string") return null;
        return { sessionId: payload.sid, ownerId: payload.oid };
    } catch {
        return null;
    }
}
