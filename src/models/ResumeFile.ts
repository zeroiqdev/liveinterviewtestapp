import mongoose, { Schema, Document } from "mongoose";

/**
 * The Word file a resume was uploaded as, kept so the editor's download can
 * put changes into it and keep its formatting. One per resume.
 */
export interface IResumeFile extends Document {
    email: string;
    resumeId: string;
    name: string;
    data: Buffer;
    createdAt: Date;
}

const ResumeFileSchema = new Schema<IResumeFile>(
    {
        email: { type: String, required: true, index: true },
        resumeId: { type: String, required: true },
        name: { type: String, default: "Resume.docx" },
        data: { type: Buffer, required: true },
    },
    { timestamps: true }
);
ResumeFileSchema.index({ email: 1, resumeId: 1 }, { unique: true });

export default (mongoose.models.ResumeFile as mongoose.Model<IResumeFile>) || mongoose.model<IResumeFile>("ResumeFile", ResumeFileSchema);
