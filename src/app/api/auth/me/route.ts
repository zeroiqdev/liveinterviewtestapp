import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { getSession, toSafeUser, clearSessionCookie, issuedBeforeCutoff } from "@/lib/session";

const VISIT_NOTE_EVERY_MS = 10 * 60 * 1000;

async function noteVisit(
    email: string,
    lastSeenAt: Date | undefined,
    known: { country?: string; region?: string; city?: string } | undefined,
    req: NextRequest
) {
    const header = (name: string) => {
        const value = req.headers.get(name);
        try {
            return value ? decodeURIComponent(value).slice(0, 80) : undefined;
        } catch {
            return value?.slice(0, 80) || undefined;
        }
    };
    const country = header("x-vercel-ip-country");
    const region = header("x-vercel-ip-country-region");
    const city = header("x-vercel-ip-city");
    const moved = Boolean(country) && (country !== known?.country || city !== known?.city);
    const recentlyNoted = lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < VISIT_NOTE_EVERY_MS;
    if (recentlyNoted && !moved) return;
    await User.updateOne(
        { email },
        { $set: { lastSeenAt: new Date(), ...(country ? { location: { country, region, city, updatedAt: new Date() } } : {}) } },
        { timestamps: false }
    );
}

export async function GET(req: NextRequest) {
    try {
        const session = await getSession(req);
        if (!session || !session.email) {
            return NextResponse.json(
                { authenticated: false, user: null },
                { status: 401 }
            );
        }

        await dbConnect();
        const user = await User.findOne({ email: session.email.toLowerCase().trim() });
        if (!user || issuedBeforeCutoff(session, user)) {
            const res = NextResponse.json(
                { authenticated: false, error: user ? "Session expired. Please log in again." : "User no longer exists" },
                { status: 401 }
            );
            clearSessionCookie(res);
            return res;
        }

        // Note that they were here, and from where. The place comes from the
        // hosting network's own lookup of the connection, not from the browser.
        void noteVisit(user.email, user.lastSeenAt, user.location, req).catch(() => undefined);

        const safeUser = toSafeUser(user);
        return NextResponse.json({
            authenticated: true,
            user: safeUser,
        });
    } catch (err) {
        console.error("[api/auth/me GET] Error:", err);
        return NextResponse.json(
            { authenticated: false, error: "Failed to verify session" },
            { status: 500 }
        );
    }
}
