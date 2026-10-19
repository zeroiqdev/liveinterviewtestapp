/**
 * Moving an account to a new email address. The address is how most of what
 * we keep is filed, so everything filed under the old one moves with it.
 * Payment records move too, so receipts stay with the account.
 */

import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import UserStats from "@/models/UserStats";
import InterviewReport from "@/models/InterviewReport";
import CoachRead from "@/models/CoachRead";
import JobMatchCache from "@/models/JobMatchCache";
import AppFeedback from "@/models/AppFeedback";
import PassWallet from "@/models/PassWallet";
import ResumeFile from "@/models/ResumeFile";
import PassPurchase from "@/models/PassPurchase";
import TrySession from "@/models/TrySession";
import RoleRequest from "@/models/RoleRequest";
import EmailCode from "@/models/EmailCode";
import { EngineProfileModel, EngineSessionModel } from "@/models/EngineSession";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(value: unknown): string {
    return typeof value === "string" ? value.trim().toLowerCase().slice(0, 200) : "";
}

/** Whether another account already uses this address. */
export async function emailTaken(email: string): Promise<boolean> {
    await dbConnect();
    return Boolean(await User.exists({ email }));
}

export async function moveAccountEmail(oldEmail: string, newEmail: string): Promise<void> {
    await dbConnect();
    const from = oldEmail.toLowerCase().trim();
    const to = newEmail.toLowerCase().trim();

    // The account first: if this fails nothing else has moved.
    await User.updateOne({ email: from }, { $set: { email: to, emailVerified: true } });

    await Promise.all([
        InterviewReport.updateMany({ email: from }, { $set: { email: to } }),
        UserStats.updateMany({ userId: from }, { $set: { userId: to } }),
        CoachRead.updateMany({ email: from }, { $set: { email: to } }),
        JobMatchCache.updateMany({ email: from }, { $set: { email: to } }),
        AppFeedback.updateMany({ email: from }, { $set: { email: to } }),
        PassWallet.updateMany({ email: from }, { $set: { email: to } }),
        ResumeFile.updateMany({ email: from }, { $set: { email: to } }),
        PassPurchase.updateMany({ email: from }, { $set: { email: to } }),
        TrySession.updateMany({ claimedBy: from }, { $set: { claimedBy: to } }),
        // Older interviews were filed by email rather than account id.
        EngineSessionModel.updateMany({ ownerId: from }, { $set: { ownerId: to } }),
        RoleRequest.updateMany({ emails: from }, { $addToSet: { emails: to } }).then(() =>
            RoleRequest.updateMany({ emails: from }, { $pull: { emails: from } })
        ),
        EmailCode.deleteMany({ email: from }),
    ]);

    // A resume profile filed under the old address: its id is the address, so it is re-filed.
    const profile = await EngineProfileModel.findById(from).lean();
    if (profile) {
        await EngineProfileModel.updateOne({ _id: to }, { $set: { ...profile, _id: to } }, { upsert: true });
        await EngineProfileModel.deleteOne({ _id: from });
    }
}
