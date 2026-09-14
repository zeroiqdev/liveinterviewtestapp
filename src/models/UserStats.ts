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
    updatedAt: { type: Date, default: Date.now }
});

export default mongoose.models.UserStats || mongoose.model<IUserStats>("UserStats", UserStatsSchema);
