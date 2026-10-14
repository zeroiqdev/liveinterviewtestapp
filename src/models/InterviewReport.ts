import mongoose, { Schema, Document } from "mongoose";

/**
 * A finished interview's report, kept on the server so it is the same on any
 * device and can't be lost with a browser's saved data. One per interview.
 */
export interface IInterviewReport extends Document {
    email: string;
    sessionId: string;
    /** The report as the page shows it. */
    report: Record<string, unknown>;
    overallScore: number;
    /** How long the interview ran, in minutes. */
    minutes: number;
    role?: string;
    company?: string;
    /** The round ("Product Sense Interview"). */
    interviewType?: string;
    /** "Real Interview" or "Interactive Practice" (older reports: "Mock Interview" or "Live Coaching"). */
    mode?: string;
    /** What was said, in order. */
    transcript?: Array<{ role: string; text: string }>;
    createdAt: Date;
}

const InterviewReportSchema = new Schema<IInterviewReport>({
    email: { type: String, required: true, index: true },
    sessionId: { type: String, required: true },
    report: { type: Schema.Types.Mixed, required: true },
    overallScore: { type: Number, required: true },
    minutes: { type: Number, default: 1 },
    role: { type: String },
    company: { type: String },
    interviewType: { type: String },
    mode: { type: String },
    transcript: [{ _id: false, role: { type: String }, text: { type: String } }],
    createdAt: { type: Date, default: Date.now, index: true },
});
InterviewReportSchema.index({ email: 1, sessionId: 1 }, { unique: true });

export default (mongoose.models.InterviewReport as mongoose.Model<IInterviewReport>) ||
    mongoose.model<IInterviewReport>("InterviewReport", InterviewReportSchema);
