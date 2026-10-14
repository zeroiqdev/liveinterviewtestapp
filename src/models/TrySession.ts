import mongoose, { Schema, Document } from "mongoose";

/**
 * A try-before-sign-up interview: a visitor pastes a job description, answers
 * two questions and sees feedback on the first. Signing up carries it into
 * their first full interview. Unclaimed ones are removed after a week.
 */
export interface ITrySession extends Document {
    /** Random id, also kept in the visitor's cookie: knowing it is what proves the try is theirs. */
    tryId: string;
    ip: string;
    role: string;
    description: string;
    company: string;
    title: string;
    /** What the job will test: four or five short themes. */
    themes: string[];
    /** Written from the description. The first two are asked here, the rest in the full interview. */
    questions: string[];
    answers: Array<{ text: string; at: Date }>;
    /** Feedback on the first answer: the taste shown before sign-up. */
    firstFeedback?: { score: number; working: string; fix: string } | null;
    claimedBy?: string | null;
    claimedSessionId?: string | null;
    createdAt: Date;
}

const TrySessionSchema = new Schema<ITrySession>({
    tryId: { type: String, required: true, unique: true },
    ip: { type: String, default: "" },
    role: { type: String, required: true },
    description: { type: String, required: true },
    company: { type: String, default: "" },
    title: { type: String, default: "" },
    themes: [{ type: String }],
    questions: [{ type: String }],
    answers: [{ text: { type: String }, at: { type: Date, default: Date.now }, _id: false }],
    firstFeedback: { type: Schema.Types.Mixed, default: null },
    claimedBy: { type: String, default: null },
    claimedSessionId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, expires: 7 * 24 * 60 * 60 },
});

export default (mongoose.models.TrySession as mongoose.Model<ITrySession>) || mongoose.model<ITrySession>("TrySession", TrySessionSchema);
