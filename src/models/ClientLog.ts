import mongoose, { Schema, Document } from "mongoose";

/**
 * Problems the browser reports that users can't see or describe, such as a
 * clip the browser refused to play. Kept two weeks, for diagnosing.
 */
export interface IClientLog extends Document {
    kind: string;
    detail: Record<string, unknown>;
    userAgent: string;
    email?: string | null;
    createdAt: Date;
}

const ClientLogSchema = new Schema<IClientLog>({
    kind: { type: String, required: true, index: true },
    detail: { type: Schema.Types.Mixed, default: {} },
    userAgent: { type: String, default: "" },
    email: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, expires: 14 * 24 * 60 * 60 },
});

export default (mongoose.models.ClientLog as mongoose.Model<IClientLog>) || mongoose.model<IClientLog>("ClientLog", ClientLogSchema);
