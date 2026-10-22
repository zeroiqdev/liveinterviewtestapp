import { createHmac, timingSafeEqual } from "crypto";
import { SITE_URL } from "@/lib/site";
import { getJwtSecretKey } from "@/lib/sessionToken";

/**
 * Links that stop tips and reminders for one address. Signed, so nobody can
 * turn off someone else's emails by guessing a link.
 */
function sign(email: string): string {
    // Throws when the secret is missing, rather than signing with an empty key.
    const secret = getJwtSecretKey();
    return createHmac("sha256", secret).update(`email-opt-out:${email.toLowerCase()}`).digest("base64url").slice(0, 32);
}

export function optOutUrl(email: string): string {
    const e = Buffer.from(email.toLowerCase()).toString("base64url");
    return `${SITE_URL}/api/email/stop?e=${e}&t=${sign(email)}`;
}

/** The address a link is for, if its signature is right. */
export function emailFromOptOut(e: string | null, t: string | null): string | null {
    if (!e || !t) return null;
    let email = "";
    try {
        email = Buffer.from(e, "base64url").toString("utf8");
    } catch {
        return null;
    }
    const expected = Buffer.from(sign(email));
    const given = Buffer.from(t);
    return expected.length === given.length && timingSafeEqual(expected, given) ? email : null;
}
