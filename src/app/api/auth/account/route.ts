import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { clearSessionCookie, requireAuth } from "@/lib/session";
import { verifyPassword } from "@/lib/password";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";
import { deleteAccount } from "@/lib/accountDeletion";

export const dynamic = "force-dynamic";

/** What someone without a password types to confirm. */
const CONFIRM_WORD = "DELETE";

/**
 * DELETE /api/auth/account — permanently deletes the signed-in user's account
 * and everything kept about them. It can't be undone, so it has to be meant:
 * an account with a password must give it; one without (Google sign-in) must
 * type the confirmation word. Body: { password?, confirm? }
 */
export async function DELETE(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        // The same limit as sign-in: this checks a password too.
        const limited = await rateLimit(LIMITS.login, `user:${auth.session.email}`);
        if (limited) return limited;

        const body = await req.json().catch(() => ({}));
        await dbConnect();
        const user = await User.findOne({ email: auth.session.email.toLowerCase().trim() });
        if (!user) {
            const gone = NextResponse.json({ success: true });
            clearSessionCookie(gone);
            return gone;
        }

        if (user.password) {
            const password = typeof body.password === "string" ? body.password : "";
            if (!password || !(await verifyPassword(password, user.password))) {
                return NextResponse.json({ error: "That password isn't right. Your account has not been deleted." }, { status: 403 });
            }
        } else if (body.confirm !== CONFIRM_WORD) {
            return NextResponse.json({ error: `Type ${CONFIRM_WORD} to confirm.` }, { status: 400 });
        }

        const summary = await deleteAccount(user.email, user._id.toString());
        console.info(`[api/auth/account] account deleted (${summary.reports} reports, ${summary.interviewsInProgress} sessions, ${summary.other} other records)`);
        const res = NextResponse.json({ success: true });
        clearSessionCookie(res);
        return res;
    } catch (err) {
        return serverError("api/auth/account", err, "We couldn't delete your account just now. Nothing has been removed. Please try again.");
    }
}
