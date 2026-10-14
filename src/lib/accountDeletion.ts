/**
 * Deleting an account: the person and everything kept about them.
 *
 * What goes: their profile and resumes, practice stats, interview reports and
 * conversations, any interview in progress, saved job matches, the record of
 * coach messages they opened, feedback they sent, and unused email codes.
 * Their unused passes go too.
 * What stays: the record of payments they made (amount, date, their email),
 * which a business has to keep for its accounts. Shared things they never
 * owned, such as jobs and recorded interviewer audio, are untouched.
 */

import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import UserStats from "@/models/UserStats";
import InterviewReport from "@/models/InterviewReport";
import CoachRead from "@/models/CoachRead";
import JobMatchCache from "@/models/JobMatchCache";
import AppFeedback from "@/models/AppFeedback";
import EmailCode from "@/models/EmailCode";
import PassWallet from "@/models/PassWallet";
import TrySession from "@/models/TrySession";
import RoleRequest from "@/models/RoleRequest";
import { EngineProfileModel, EngineSessionModel, PreparedTurnModel } from "@/models/EngineSession";

export interface DeletionSummary {
    account: number;
    reports: number;
    interviewsInProgress: number;
    other: number;
}

export async function deleteAccount(email: string, userId?: string): Promise<DeletionSummary> {
    await dbConnect();
    const address = email.toLowerCase().trim();
    // Interviews are owned by the account's id or, on older ones, its email.
    const owners = [address, userId].filter((owner): owner is string => Boolean(owner));

    const sessions = await EngineSessionModel.find({ ownerId: { $in: owners } }).select("_id").lean();
    const sessionIds = sessions.map((session) => String(session._id));

    const [reports, inProgress, ...rest] = await Promise.all([
        InterviewReport.deleteMany({ email: address }),
        EngineSessionModel.deleteMany({ ownerId: { $in: owners } }),
        sessionIds.length ? PreparedTurnModel.deleteMany({ sessionId: { $in: sessionIds } }) : Promise.resolve({ deletedCount: 0 }),
        EngineProfileModel.deleteMany({ _id: { $in: owners } }),
        UserStats.deleteMany({ userId: address }),
        CoachRead.deleteMany({ email: address }),
        JobMatchCache.deleteMany({ email: address }),
        AppFeedback.deleteMany({ email: address }),
        EmailCode.deleteMany({ email: address }),
        PassWallet.deleteMany({ email: address }),
        TrySession.deleteMany({ claimedBy: address }),
    ]);
    // Taken off any "tell me when this role is added" lists.
    await RoleRequest.updateMany({ emails: address }, { $pull: { emails: address } });
    // The account itself goes last: if anything above failed, they can still sign in and try again.
    const account = await User.deleteOne({ email: address });

    return {
        account: account.deletedCount ?? 0,
        reports: reports.deletedCount ?? 0,
        interviewsInProgress: inProgress.deletedCount ?? 0,
        other: rest.reduce((sum, result) => sum + (result.deletedCount ?? 0), 0),
    };
}
