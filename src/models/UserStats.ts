import mongoose, { Schema, Document } from "mongoose";

export interface IUserStats extends Document {
    userId: string; // email or unique id
    interviewsCompleted: number;
    averageScore: number;
    totalPracticeTime: number; // in hours
    skills: {
        name: string;
        value: number;
    }[];
    /** The most recent interviews, newest last (what the Prep Score is worked out from). */
    recentSessions: { score: number; minutes: number; at: Date }[];
    updatedAt: Date;
}

const UserStatsSchema: Schema = new Schema({
    userId: { type: String, required: true, unique: true },
    interviewsCompleted: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    totalPracticeTime: { type: Number, default: 0 },
    skills: [
        {
            name: { type: String, required: true },
            value: { type: Number, default: 0 },
        }
    ],
    recentSessions: [
        {
            _id: false,
            score: { type: Number, required: true },
            minutes: { type: Number, required: true },
            at: { type: Date, required: true },
        }
    ],
    updatedAt: { type: Date, default: Date.now }
});

export default mongoose.models.UserStats || mongoose.model<IUserStats>("UserStats", UserStatsSchema);
