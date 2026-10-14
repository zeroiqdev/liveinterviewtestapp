import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import UserStats from "@/models/UserStats";
import InterviewReport from "@/models/InterviewReport";
import CoachRead from "@/models/CoachRead";
import { requireAdmin } from "@/lib/session";
import { serverError } from "@/lib/apiError";
import { prepScore, sessionsFromTotals } from "@/lib/prepScore";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users
 *   (no query)   everyone, with where they are, what they've done and when they were last here
 *   ?email=      one person's interviews (with what was said) and the coach messages they opened
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        await dbConnect();
        const email = new URL(req.url).searchParams.get("email")?.toLowerCase().trim();

        if (email) {
            const [interviews, reads] = await Promise.all([
                InterviewReport.find({ email }).sort({ createdAt: -1 }).limit(50).select("sessionId overallScore minutes role company interviewType mode transcript createdAt").lean(),
                CoachRead.find({ email }).sort({ readAt: -1 }).limit(100).lean(),
            ]);
            return NextResponse.json({
                interviews: interviews.map((interview) => ({
                    sessionId: interview.sessionId,
                    score: interview.overallScore,
                    minutes: interview.minutes,
                    role: interview.role ?? null,
                    company: interview.company ?? null,
                    interviewType: interview.interviewType ?? null,
                    mode: interview.mode ?? null,
                    createdAt: interview.createdAt,
                    transcript: interview.transcript ?? [],
                })),
                coachReads: reads.map((read) => ({ kind: read.kind, label: read.label ?? null, readAt: read.readAt })),
            });
        }

        const [users, stats, interviewCounts, readCounts, messageKinds] = await Promise.all([
            User.find().select("email name role experienceInRole seniority provider createdAt lastSeenAt location resumes.id").sort({ createdAt: -1 }).limit(2000).lean(),
            UserStats.find().select("userId interviewsCompleted averageScore recentSessions").lean(),
            InterviewReport.aggregate<{ _id: string; count: number; last: Date }>([{ $group: { _id: "$email", count: { $sum: 1 }, last: { $max: "$createdAt" } } }]),
            CoachRead.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$email", count: { $sum: 1 } } }]),
            CoachRead.aggregate<{ _id: string; people: number }>([{ $group: { _id: "$kind", people: { $sum: 1 } } }, { $sort: { people: -1 } }]),
        ]);
        const statsBy = new Map(stats.map((row) => [row.userId, row]));
        const interviewsBy = new Map(interviewCounts.map((row) => [row._id, row]));
        const readsBy = new Map(readCounts.map((row) => [row._id, row.count]));

        const rows = users.map((user) => {
            const stat = statsBy.get(user.email);
            const sessions = stat?.recentSessions?.length
                ? stat.recentSessions.map((session: { score: number; minutes: number; at: Date }) => ({ score: session.score, minutes: session.minutes, at: new Date(session.at).toISOString() }))
                : sessionsFromTotals(stat?.interviewsCompleted ?? 0, stat?.averageScore ?? 0);
            return {
                email: user.email,
                name: user.name,
                role: user.role,
                experience: user.experienceInRole || user.seniority || "",
                provider: user.provider,
                joined: user.createdAt,
                lastSeenAt: user.lastSeenAt ?? null,
                country: user.location?.country ?? null,
                city: user.location?.city ?? null,
                interviews: stat?.interviewsCompleted ?? 0,
                storedReports: interviewsBy.get(user.email)?.count ?? 0,
                lastInterviewAt: interviewsBy.get(user.email)?.last ?? null,
                prepScore: prepScore(sessions).score,
                resumes: user.resumes?.length ?? 0,
                coachMessagesOpened: readsBy.get(user.email) ?? 0,
            };
        });

        const byCountry = new Map<string, number>();
        for (const row of rows) byCountry.set(row.country ?? "Unknown", (byCountry.get(row.country ?? "Unknown") ?? 0) + 1);

        return NextResponse.json({
            users: rows,
            total: rows.length,
            byCountry: [...byCountry].map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count),
            coachMessages: messageKinds.map((kind) => ({ kind: kind._id, people: kind.people })),
        });
    } catch (err) {
        return serverError("api/admin/users", err, "Couldn't load users.");
    }
}
