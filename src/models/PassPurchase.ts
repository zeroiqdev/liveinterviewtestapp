import mongoose, { Schema, Document } from "mongoose";

/** One attempt to buy passes: created when checkout opens, marked paid when the payment is confirmed. */
export interface IPassPurchase extends Document {
    email: string;
    /** Our own id for the purchase, sent to the payment provider. */
    reference: string;
    /** The payment provider's id for the checkout. */
    checkoutId?: string;
    passes: number;
    /** Price in naira. */
    amount: number;
    currency: string;
    label: string;
    status: "pending" | "paid";
    /** The discount code used, if any, and the full price before it. */
    discountCode?: string;
    fullAmount?: number;
    paidAt?: Date;
    createdAt: Date;
}

const PassPurchaseSchema = new Schema<IPassPurchase>(
    {
        email: { type: String, required: true, index: true },
        reference: { type: String, required: true, unique: true },
        checkoutId: { type: String, index: true },
        passes: { type: Number, required: true },
        amount: { type: Number, required: true },
        currency: { type: String, default: "NGN" },
        label: { type: String, default: "" },
        status: { type: String, enum: ["pending", "paid"], default: "pending" },
        paidAt: { type: Date },
        discountCode: { type: String },
        fullAmount: { type: Number },
    },
    { timestamps: true }
);

export default (mongoose.models.PassPurchase as mongoose.Model<IPassPurchase>) || mongoose.model<IPassPurchase>("PassPurchase", PassPurchaseSchema);
