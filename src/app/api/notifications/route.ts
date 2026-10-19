import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import PassPurchase from "@/models/PassPurchase";
import PassWallet from "@/models/PassWallet";
import InterviewReport from "@/models/InterviewReport";
import { requireAuth } from "@/lib/session";
import { serverError } from "@/lib/apiError";
import { buildNotifications, MAX_NOTIFICATIONS, NOTIFICATION_DAYS } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** GET /api/notifications — the bell's list: { notifications, unread }. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const email = auth.session.email;
        await dbConnect();
        const since = new Date(Date.now() - NOTIFICATION_DAYS * 24 * 60 * 60 * 1000);
        const [user, purchases, reports, wallet] = await Promise.all([
            User.findOne({ email }).select("createdAt resumes.id resumes.name resumes.score resumes.createdAt notificationsSeenAt").lean(),
            PassPurchase.find({ email, status: "paid", $or: [{ paidAt: { $gte: since } }, { paidAt: null, createdAt: { $gte: since } }] })
                .sort({ paidAt: -1 })
                .limit(MAX_NOTIFICATIONS)
                .select("reference passes amount discountCode label paidAt createdAt")
                .lean(),
            InterviewReport.find({ email, createdAt: { $gte: since } })
                .sort({ createdAt: -1 })
                .limit(MAX_NOTIFICATIONS)
                .select("sessionId overallScore role interviewType createdAt")
                .lean(),
            PassWallet.findOne({ email }).select("activeUntil").lean(),
        ]);
        const notifications = buildNotifications({
            accountCreatedAt: user?.createdAt,
            purchases: purchases.map((p) => ({ reference: p.reference, passes: p.passes, amount: p.amount, discountCode: p.discountCode, label: p.label, paidAt: p.paidAt ?? p.createdAt })),
            reports: reports.map((r) => ({ sessionId: r.sessionId, overallScore: r.overallScore, role: r.role, interviewType: r.interviewType, createdAt: r.createdAt })),
            resumes: (user?.resumes ?? []).map((r) => ({ id: r.id, name: r.name, score: r.score, createdAt: r.createdAt })),
            activeUntil: wallet?.activeUntil ?? null,
            seenAt: user?.notificationsSeenAt ?? null,
        });
        return NextResponse.json({ notifications, unread: notifications.filter((n) => n.unread).length });
    } catch (err) {
        return serverError("api/notifications", err, "Couldn't load your notifications.");
    }
}

/** POST /api/notifications — marks the list as read. */
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        await dbConnect();
        await User.updateOne({ email: auth.session.email }, { $set: { notificationsSeenAt: new Date() } });
        return NextResponse.json({ ok: true });
    } catch (err) {
        return serverError("api/notifications", err, "Couldn't update your notifications.");
    }
}
