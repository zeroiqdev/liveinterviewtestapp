import mongoose, { Schema } from "mongoose";

/**
 * A worked-out match between one resume and one job, kept so the same pair
 * isn't sent to the model twice and shows the same score on every device.
 * Removed 30 days after it was last worked out.
 */
export interface IJobMatchCache {
    _id: string; // hash of the user, the resume text and the job
    email: string;
    jobTitle: string;
    jobCompany: string;
    overallMatch: number;
    result: Record<string, unknown>;
    responsibilities: string[];
    createdAt: Date;
}

const JobMatchCacheSchema = new Schema<IJobMatchCache>(
    {
        _id: { type: String, required: true },
        email: { type: String, required: true, index: true },
        jobTitle: { type: String, default: "" },
        jobCompany: { type: String, default: "" },
        overallMatch: { type: Number, default: 0 },
        result: { type: Schema.Types.Mixed, required: true },
        responsibilities: [{ type: String }],
        createdAt: { type: Date, default: Date.now, index: { expires: 30 * 24 * 60 * 60 } },
    },
    { _id: false, minimize: false }
);

export default (mongoose.models.JobMatchCache as mongoose.Model<IJobMatchCache>) ||
    mongoose.model<IJobMatchCache>("JobMatchCache", JobMatchCacheSchema);
