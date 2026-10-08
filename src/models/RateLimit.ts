/**
 * Fixed-window request counters shared by every server instance.
 * _id is "<bucket>:<key>:<windowStart>"; rows expire with their window.
 */

import mongoose, { Schema, Model } from "mongoose";

export interface IRateLimit {
    _id: string;
    count: number;
    expiresAt: Date;
}

const RateLimitSchema = new Schema<IRateLimit>(
    {
        _id: { type: String, required: true },
        count: { type: Number, default: 0 },
        expiresAt: { type: Date, required: true, index: { expires: 0 } },
    },
    { versionKey: false }
);

const RateLimit: Model<IRateLimit> =
    mongoose.models.RateLimit || mongoose.model<IRateLimit>("RateLimit", RateLimitSchema);
export default RateLimit;
