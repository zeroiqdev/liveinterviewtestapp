import mongoose, { Schema, Document, Model } from "mongoose";

export interface IQuestion extends Document {
    id: string;
    role_family: string;
    sub_type?: string;
    question: string;
    category: string;
    applies_to_all?: boolean;
    source?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

const QuestionSchema = new Schema<IQuestion>(
    {
        id: { type: String, required: true, unique: true, index: true },
        role_family: { type: String, required: true, index: true },
        sub_type: { type: String },
        question: { type: String, required: true },
        category: { type: String, required: true, index: true },
        applies_to_all: { type: Boolean, default: false },
        source: { type: String },
    },
    {
        timestamps: true,
        id: false,
    }
);

QuestionSchema.index({ role_family: 1, category: 1 });

const Question: Model<IQuestion> =
    mongoose.models.Question || mongoose.model<IQuestion>("Question", QuestionSchema);
export default Question;
