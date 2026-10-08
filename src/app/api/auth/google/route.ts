import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { normalizeUserRoleFamily } from "@/utils/locationDetector";
import { loginResponse } from "@/lib/session";
import { LIMITS, clientIp, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

interface GoogleIdentity {
    email: string;
    name?: string;
    picture?: string;
    sub: string;
}

/**
 * Verify a Google OAuth access token server-side: it must be live, issued to
 * *our* client ID, and carry a Google-verified email. Profile fields come from
 * Google, never from the request body.
 */
async function verifyGoogleAccessToken(accessToken: string, clientId: string): Promise<GoogleIdentity | null> {
    const infoRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
        { signal: AbortSignal.timeout(8000) }
    );
    if (!infoRes.ok) return null;
    const info = await infoRes.json();
    const audience = info.aud || info.azp;
    if (audience !== clientId) return null;
    if (info.email_verified !== "true" && info.email_verified !== true) return null;
    if (typeof info.email !== "string" || typeof info.sub !== "string") return null;

    let name: string | undefined;
    let picture: string | undefined;
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
    });
    if (profileRes.ok) {
        const profile = await profileRes.json();
        if (profile.sub === info.sub) {
            name = profile.name || profile.given_name;
            picture = profile.picture;
        }
    }

    return { email: info.email, sub: info.sub, name, picture };
}

/**
 * POST /api/auth/google
 * Body: { accessToken, role?, domain?, seniority?, experience? }
 * The optional profile fields only seed a brand-new account.
 */
export async function POST(req: NextRequest) {
    try {
        const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        if (!clientId) {
            return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 503 });
        }

        const limited = await rateLimit(LIMITS.login, `ip:${clientIp(req)}`);
        if (limited) return limited;

        const body = await req.json().catch(() => ({}));
        const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
        if (!accessToken) {
            return NextResponse.json({ error: "Missing Google access token." }, { status: 400 });
        }

        const identity = await verifyGoogleAccessToken(accessToken, clientId);
        if (!identity) {
            return NextResponse.json({ error: "Google sign-in could not be verified. Please try again." }, { status: 401 });
        }

        await dbConnect();
        const email = identity.email.toLowerCase().trim();
        let user = await User.findOne({ email });
        const isNewUser = !user;

        if (!user) {
            const initialRole = typeof body.role === "string" && body.role ? body.role : "Software Engineer";
            user = await User.create({
                email,
                name: identity.name?.trim() || email.split("@")[0],
                avatar: identity.picture || "",
                googleId: identity.sub,
                provider: "google",
                emailVerified: true,
                role: initialRole,
                domain: typeof body.domain === "string" && body.domain ? body.domain : "Software & Engineering",
                roleFamily: normalizeUserRoleFamily(initialRole),
                seniority: typeof body.seniority === "string" && body.seniority ? body.seniority : "professional",
                experienceInRole: typeof body.experience === "string" && body.experience ? body.experience : "professional",
                resumes: [],
            });
        } else {
            if (user.googleId && user.googleId !== identity.sub) {
                return NextResponse.json({ error: "This email is linked to a different Google account." }, { status: 401 });
            }
            if (!user.name && identity.name) user.name = identity.name;
            if (!user.avatar && identity.picture) user.avatar = identity.picture;
            if (!user.googleId) user.googleId = identity.sub;
            if (user.emailVerified === false) {
                // An unverified sign-up may have been made by someone else:
                // drop anything they set before the real owner took over.
                user.password = "";
                user.resumes = [];
            }
            user.emailVerified = true;
            await user.save();
        }

        return loginResponse(user, { isNewUser });
    } catch (err) {
        return serverError("api/auth/google", err, "Failed to authenticate with Google");
    }
}
