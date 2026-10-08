/**
 * One-time codes emailed to users, bound to a purpose so a sign-up code can't
 * reset a password (and vice versa). Only a keyed hash of the code is stored;
 * MongoDB's TTL index removes rows once they expire.
 */

import mongoose, { Schema, Model } from "mongoose";

export type EmailCodePurpose = "verify" | "reset";

export interface IEmailCode {
    email: string;
    purpose: EmailCodePurpose;
    codeHash: string;
    attempts: number;
    expiresAt: Date;
    createdAt: Date;
}

const EmailCodeSchema = new Schema<IEmailCode>({
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, required: true, enum: ["verify", "reset"] },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    createdAt: { type: Date, default: Date.now },
});
EmailCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });

const EmailCode: Model<IEmailCode> =
    mongoose.models.EmailCode || mongoose.model<IEmailCode>("EmailCode", EmailCodeSchema);
export default EmailCode;
