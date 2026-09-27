import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAppConfig extends Document {
    key: string;
    value: unknown;
    updatedAt?: Date;
}

const AppConfigSchema = new Schema<IAppConfig>(
    {
        key: { type: String, required: true, unique: true, index: true },
        value: { type: Schema.Types.Mixed, required: true },
    },
    {
        timestamps: true,
        id: false,
    }
);

const AppConfig: Model<IAppConfig> =
    mongoose.models.AppConfig || mongoose.model<IAppConfig>("AppConfig", AppConfigSchema);
export default AppConfig;
