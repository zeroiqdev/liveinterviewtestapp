import mongoose, { Schema, Document } from "mongoose";

/**
 * One week's tip for one kind of role. Written by the model as a draft, then
 * edited or approved in the admin portal. Only approved tips reach users.
 */
export interface IWeeklyTipDraft extends Document {
    /** Week number (lib/weeklyTips.weekNumber): weeks start on Monday. */
    week: number;
    /** Role family the tip is for ("sales", "customer_service", … or "general"). */
    family: string;
    topic: string;
    title: string;
    body: string;
    tryThis: string;
    /** What the button under the tip does: "jobs", "practice", "resume" or "none". */
    action?: string;
    status: "draft" | "approved";
    /** True once someone has changed the model's wording. */
    edited: boolean;
    approvedBy?: string;
    approvedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const WeeklyTipDraftSchema = new Schema<IWeeklyTipDraft>(
    {
        week: { type: Number, required: true },
        family: { type: String, required: true },
        topic: { type: String, default: "Interviews" },
        title: { type: String, required: true },
        body: { type: String, required: true },
        tryThis: { type: String, default: "" },
        action: { type: String, enum: ["jobs", "practice", "resume", "none"] },
        status: { type: String, enum: ["draft", "approved"], default: "draft" },
        edited: { type: Boolean, default: false },
        approvedBy: { type: String },
        approvedAt: { type: Date },
    },
    { timestamps: true }
);
WeeklyTipDraftSchema.index({ week: 1, family: 1 }, { unique: true });

export default (mongoose.models.WeeklyTipDraft as mongoose.Model<IWeeklyTipDraft>) ||
    mongoose.model<IWeeklyTipDraft>("WeeklyTipDraft", WeeklyTipDraftSchema);
