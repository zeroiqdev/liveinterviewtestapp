import mongoose, { Schema, Document, Model } from "mongoose";

export interface IScraperSource extends Document {
    id: string;
    url: string;
    companyName: string;
    sourceType: "career_page" | "vc_portfolio" | "job_board";
    atsProvider: string;
    enabled: boolean;
    lastScraped: string | null;
    lastJobCount: number;
    dateAdded: string;
    createdAt?: Date;
    updatedAt?: Date;
}

const ScraperSourceSchema = new Schema<IScraperSource>(
    {
        id: { type: String, required: true, unique: true, index: true },
        url: { type: String, required: true, unique: true },
        companyName: { type: String, required: true },
        sourceType: {
            type: String,
            enum: ["career_page", "vc_portfolio", "job_board"],
            default: "career_page",
        },
        atsProvider: { type: String, default: "generic" },
        enabled: { type: Boolean, default: true, index: true },
        lastScraped: { type: String, default: null },
        lastJobCount: { type: Number, default: 0 },
        dateAdded: { type: String, required: true },
    },
    {
        timestamps: true,
        id: false,
    }
);

const ScraperSource: Model<IScraperSource> =
    mongoose.models.ScraperSource || mongoose.model<IScraperSource>("ScraperSource", ScraperSourceSchema);
export default ScraperSource;
