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
    /** Which version of the review made the score's feedback (see lib/resumeReviewVersion). */
    reviewVersion?: number;
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
    /** When they last opened the app. */
    lastSeenAt?: Date;
    /** When the day-1 resume email went out (sent once). */
    onboardingResumeEmailAt?: Date;
    /** When the day-2 weekly tip email went out (sent once). */
    onboardingTipEmailAt?: Date;
    /** They asked to stop tips and reminders (account, payment and security emails still go out). */
    tipEmailsOff?: boolean;
    /** When the welcome email went out (it's sent once). */
    welcomeEmailSentAt?: Date;
    /** When they last opened the notifications list. */
    notificationsSeenAt?: Date;
    /** Where they last used the app from, as the hosting network reports it (never typed in). */
    location?: { country?: string; region?: string; city?: string; updatedAt?: Date };
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
        reviewVersion: { type: Number },
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
        lastSeenAt: { type: Date },
        notificationsSeenAt: { type: Date },
        welcomeEmailSentAt: { type: Date },
        onboardingResumeEmailAt: { type: Date },
        onboardingTipEmailAt: { type: Date },
        tipEmailsOff: { type: Boolean },
        location: {
            country: { type: String },
            region: { type: String },
            city: { type: String },
            updatedAt: { type: Date },
        },
    },
    { timestamps: true }
);

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
export default User;
