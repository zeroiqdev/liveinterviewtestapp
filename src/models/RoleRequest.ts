import mongoose, { Schema, Document } from "mongoose";

/** A role someone asked for that isn't on the list yet. One row per role, counted. */
export interface IRoleRequest extends Document {
    /** The role in lower case, for counting the same request once. */
    key: string;
    /** The role as it was first typed. */
    role: string;
    count: number;
    /** People who asked to be told when it's added. */
    emails: string[];
    firstRequestedAt: Date;
    lastRequestedAt: Date;
}

const RoleRequestSchema = new Schema<IRoleRequest>({
    key: { type: String, required: true, unique: true },
    role: { type: String, required: true },
    count: { type: Number, default: 0 },
    emails: [{ type: String }],
    firstRequestedAt: { type: Date, default: Date.now },
    lastRequestedAt: { type: Date, default: Date.now },
});

export default (mongoose.models.RoleRequest as mongoose.Model<IRoleRequest>) || mongoose.model<IRoleRequest>("RoleRequest", RoleRequestSchema);
