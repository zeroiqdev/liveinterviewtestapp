import mongoose, { Schema, Document, Model } from "mongoose";

export interface IJob extends Document {
    id: string;
    title: string;
    company: string;
    companyLogo?: string;
    location: string;
    roleFamily: string;
    url: string;
    employmentType: string;
    salaryRange?: string;
    /** A short summary, shown in lists. */
    description?: string;
    /** The posting's full text (never sent in lists; see GET /api/jobs?id=). */
    fullDescription?: string;
    responsibilities?: string[];
    source: "manual" | "scraped";
    datePosted: string;
    status: "active" | "expired";
    isRemoteGlobal?: boolean;
    isAfrica?: boolean;
    isNigeria?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

const JobSchema = new Schema<IJob>(
    {
        id: { type: String, required: true, unique: true, index: true },
        title: { type: String, required: true },
        company: { type: String, required: true, index: true },
        companyLogo: { type: String },
        location: { type: String, required: true },
        roleFamily: { type: String, required: true, index: true },
        url: { type: String, required: true, index: true },
        employmentType: { type: String, default: "Full-time" },
        salaryRange: { type: String, default: "Competitive" },
        description: { type: String },
        fullDescription: { type: String },
        responsibilities: [{ type: String }],
        source: { type: String, enum: ["manual", "scraped"], default: "scraped", index: true },
        datePosted: { type: String, required: true, index: true },
        status: { type: String, enum: ["active", "expired"], default: "active", index: true },
        isRemoteGlobal: { type: Boolean },
        isAfrica: { type: Boolean },
        isNigeria: { type: Boolean },
    },
    {
        timestamps: true,
        id: false,
    }
);

JobSchema.index({ status: 1, datePosted: -1 });
JobSchema.index({ company: 1, url: 1 });

const Job: Model<IJob> = mongoose.models.Job || mongoose.model<IJob>("Job", JobSchema);
export default Job;
