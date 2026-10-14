import mongoose, { Schema, Document } from "mongoose";

/** A user's passes: how many they hold, and whether one is running now. */
export interface IPassWallet extends Document {
    email: string;
    /** Passes bought and not yet started. */
    unused: number;
    /** When the pass now running ends. */
    activeUntil?: Date | null;
    /** Free interviews already taken. */
    freeInterviewsUsed: number;
    updatedAt: Date;
}

const PassWalletSchema = new Schema<IPassWallet>(
    {
        email: { type: String, required: true, unique: true, index: true },
        unused: { type: Number, default: 0, min: 0 },
        activeUntil: { type: Date, default: null },
        freeInterviewsUsed: { type: Number, default: 0 },
    },
    { timestamps: true }
);

export default (mongoose.models.PassWallet as mongoose.Model<IPassWallet>) || mongoose.model<IPassWallet>("PassWallet", PassWalletSchema);
