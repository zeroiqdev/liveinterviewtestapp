import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { getSession, toSafeUser, clearSessionCookie, issuedBeforeCutoff } from "@/lib/session";

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
