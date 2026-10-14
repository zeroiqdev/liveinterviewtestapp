import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import InterviewReport from "@/models/InterviewReport";
import PassPurchase from "@/models/PassPurchase";
import PassWallet from "@/models/PassWallet";
import TrySession from "@/models/TrySession";
import { EngineSessionModel } from "@/models/EngineSession";
import { requireAdmin } from "@/lib/session";
import { serverError } from "@/lib/apiError";
import { computeProductMetrics } from "@/lib/productMetrics";

export const dynamic = "force-dynamic";

/** GET /api/admin/metrics — activation, retention and revenue, from the records already kept. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        await dbConnect();

        const [users, sessions, reports, purchases, wallets, tries] = await Promise.all([
            User.find().select("email createdAt provider role").lean(),
            EngineSessionModel.find().select("ownerId doc.startedAt").lean<Array<{ ownerId?: string | null; doc?: { startedAt?: number } }>>(),
            InterviewReport.find().select("email createdAt mode").lean(),
            PassPurchase.find({ status: "paid" }).select("email amount paidAt createdAt").lean(),
            PassWallet.find().select("email freeInterviewsUsed").lean(),
            TrySession.find().select("createdAt answers claimedBy").lean(),
        ]);

        const metrics = computeProductMetrics({
            users: users.map((u) => ({
                ids: [String(u._id), u.email],
                email: u.email,
                createdAt: new Date(u.createdAt),
                provider: u.provider,
                role: u.role,
            })),
            interviews: sessions
                .filter((s) => s.ownerId && typeof s.doc?.startedAt === "number")
                .map((s) => ({ ownerId: s.ownerId as string, startedAt: new Date(s.doc!.startedAt as number) })),
            reports: reports.map((r) => ({ email: r.email, createdAt: new Date(r.createdAt), mode: r.mode })),
            purchases: purchases.map((p) => ({ email: p.email, amount: p.amount, paidAt: new Date(p.paidAt ?? p.createdAt) })),
            wallets: wallets.map((w) => ({ email: w.email, freeInterviewsUsed: w.freeInterviewsUsed ?? 0 })),
            tries: tries.map((t) => ({ createdAt: new Date(t.createdAt), answers: t.answers?.length ?? 0, claimed: Boolean(t.claimedBy) })),
        });
        return NextResponse.json(metrics);
    } catch (err) {
        return serverError("api/admin/metrics", err, "Couldn't work out the metrics.");
    }
}
