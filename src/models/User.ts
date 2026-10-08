import mongoose, { Schema, Document, Model } from "mongoose";

export interface IResume {
    id: string;
    name: string;
    rawText: string;
    score?: number;
    summary?: string;
    strengths?: string[];
    suggestions?: Array<{
        category: string;
        feedback: string;
        recommendation: string;
    }>;
    missingKeywords?: string[];
    improvedDoc?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IUser extends Document {
    email: string;
    name: string;
    avatar?: string;
    provider: "google" | "credentials" | "email";
    googleId?: string;
    role: string;
    domain: string;
    roleFamily: string;
    seniority: string;
    experienceInRole?: string;
    systemRole?: "user" | "admin";
    isAdmin?: boolean;
    /** True once the user has proven they own the address (Google or an emailed code). */
    emailVerified?: boolean;
    password?: string;
    /** Sessions issued before this time are rejected (set on password reset/change). */
    sessionsValidAfter?: Date;
    portfolioUrl?: string;
    linkedinUrl?: string;
    resumes: IResume[];
    createdAt: Date;
    updatedAt: Date;
}

const ResumeSchema = new Schema<IResume>(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        rawText: { type: String, required: true },
        score: { type: Number, default: 0 },
        summary: { type: String, default: "" },
        strengths: [{ type: String }],
        suggestions: [
            {
                category: { type: String },
                feedback: { type: String },
                recommendation: { type: String },
            },
        ],
        missingKeywords: [{ type: String }],
        improvedDoc: { type: String, default: "" },
    },
    { timestamps: true }
);

const UserSchema = new Schema<IUser>(
    {
        email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
        name: { type: String, required: true, trim: true },
        avatar: { type: String, default: "" },
        provider: { type: String, enum: ["google", "credentials", "email"], default: "google" },
        googleId: { type: String, default: "" },
        systemRole: { type: String, enum: ["user", "admin"], default: "user" },
        isAdmin: { type: Boolean, default: false },
        // No default: accounts created before verification existed have no
        // value and keep password login; new sign-ups start explicitly false.
        emailVerified: { type: Boolean },
        role: { type: String, default: "Software Engineer" },
        domain: { type: String, default: "Software & Engineering" },
        roleFamily: { type: String, default: "engineering" },
        seniority: { type: String, default: "professional" },
        experienceInRole: { type: String, default: "professional" },
        password: { type: String, default: "" },
        sessionsValidAfter: { type: Date },
        portfolioUrl: { type: String, default: "" },
        linkedinUrl: { type: String, default: "" },
        resumes: [ResumeSchema],
    },
    { timestamps: true }
);

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
export default User;
