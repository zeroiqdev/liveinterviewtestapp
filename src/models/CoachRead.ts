import mongoose, { Schema, Document } from "mongoose";

/** A coach message a user opened. One row per user per message. */
export interface ICoachRead extends Document {
    email: string;
    /** The message's id ("coach-welcome", "coach-tip-week-146"). */
    messageId: string;
    /** The kind of message, for counting ("Weekly tip", "Welcome"). */
    kind: string;
    /** The label it was shown with ("Weekly tip · Job search"). */
    label?: string;
    readAt: Date;
}

const CoachReadSchema = new Schema<ICoachRead>({
    email: { type: String, required: true, index: true },
    messageId: { type: String, required: true },
    kind: { type: String, required: true, index: true },
    label: { type: String },
    readAt: { type: Date, default: Date.now },
});
CoachReadSchema.index({ email: 1, messageId: 1 }, { unique: true });

export default (mongoose.models.CoachRead as mongoose.Model<ICoachRead>) || mongoose.model<ICoachRead>("CoachRead", CoachReadSchema);

/** The kind of coach message an id belongs to. */
export function coachMessageKind(messageId: string): string {
    if (messageId === "coach-welcome") return "Welcome";
    if (messageId.startsWith("coach-tip-week-")) return "Weekly tip";
    if (messageId === "coach-resume-audit-prompt") return "Add your resume";
    if (messageId.startsWith("coach-resume-feedback")) return "Resume review";
    if (messageId === "coach-interview-feedback") return "Interview report";
    if (messageId === "coach-star") return "Answer structure";
    if (messageId === "coach-domain") return "Role tip";
    return "Other";
}
