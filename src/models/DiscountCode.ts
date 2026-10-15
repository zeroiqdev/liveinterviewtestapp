import mongoose, { Schema, Document } from "mongoose";

/**
 * A code an admin makes: either a percentage off a pass, or free passes.
 * Each person can use a code once; a code can be capped, expire, or be
 * switched off.
 */
export interface IDiscountCode extends Document {
    /** Upper case, letters and numbers. */
    code: string;
    kind: "percent" | "free_passes";
    /** Percent off (1–100), or the number of free passes. */
    value: number;
    /** Most times it can be used across everyone; null for no limit. */
    maxUses: number | null;
    uses: number;
    /** People who have used it, so nobody uses it twice. */
    redeemedBy: string[];
    expiresAt: Date | null;
    active: boolean;
    note: string;
    createdBy: string;
    createdAt: Date;
}

const DiscountCodeSchema = new Schema<IDiscountCode>({
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    kind: { type: String, enum: ["percent", "free_passes"], required: true },
    value: { type: Number, required: true },
    maxUses: { type: Number, default: null },
    uses: { type: Number, default: 0 },
    redeemedBy: [{ type: String }],
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    note: { type: String, default: "" },
    createdBy: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
});

export default (mongoose.models.DiscountCode as mongoose.Model<IDiscountCode>) || mongoose.model<IDiscountCode>("DiscountCode", DiscountCodeSchema);
