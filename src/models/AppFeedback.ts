import mongoose, { Schema, Document } from "mongoose";

export const FEEDBACK_KINDS = ["problem", "idea", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** A note a signed-in user sent about the product, with where they were when they sent it. */
export interface IAppFeedback extends Document {
    email: string;
    name: string;
    role: string;
    kind: FeedbackKind;
    message: string;
    /** The screen they were on, in words ("Interview", "Jobs"). */
    section: string;
    /** The page address, without its query string. */
    path: string;
    /** The interview they were in or looking at, when there was one. */
    interviewSessionId?: string;
    /** Extra detail the screen added ("Question 3", "Live Coaching"). */
    detail?: string;
    viewport?: string;
    userAgent?: string;
    /** Quick-pick reasons chosen instead of (or as well as) typing. */
    tags: string[];
    /** One-tap rating of the screen or interview: 1 (bad) to 3 (good). */
    rating?: number;
    /** What the app captured by itself: device, recent steps, errors, screen state. */
    context?: Record<string, unknown>;
    resolved: boolean;
    createdAt: Date;
}

const AppFeedbackSchema = new Schema<IAppFeedback>({
    email: { type: String, required: true, index: true },
    name: { type: String, default: "" },
    role: { type: String, default: "" },
    kind: { type: String, enum: FEEDBACK_KINDS, default: "other" },
    message: { type: String, default: "" },
    section: { type: String, required: true, index: true },
    path: { type: String, default: "" },
    interviewSessionId: { type: String },
    detail: { type: String },
    viewport: { type: String },
    userAgent: { type: String },
    tags: [{ type: String }],
    rating: { type: Number },
    context: { type: Schema.Types.Mixed },
    resolved: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, index: true },
});

export default (mongoose.models.AppFeedback as mongoose.Model<IAppFeedback>) ||
    mongoose.model<IAppFeedback>("AppFeedback", AppFeedbackSchema);
