import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRole extends Document {
    id: string;
    title: string;
    domain: string;
    createdAt?: Date;
    updatedAt?: Date;
}

const RoleSchema = new Schema<IRole>(
    {
        id: { type: String, required: true, unique: true, index: true },
        title: { type: String, required: true },
        domain: { type: String, required: true, index: true },
    },
    {
        timestamps: true,
        id: false,
    }
);

const Role: Model<IRole> = mongoose.models.Role || mongoose.model<IRole>("Role", RoleSchema);
export default Role;
