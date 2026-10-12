import mongoose, { Schema, Model } from "mongoose";

/**
 * Every posting the scraper has ever come across, with the date it was first
 * seen. A job that was fetched once isn't treated as new when it turns up
 * again: sources that give no posting date used to have such jobs re-stamped
 * "today" and re-added every time the old copy expired.
 */
export interface ISeenJob {
    /** The posting's address, lower-cased. */
    url: string;
    /** YYYY-MM-DD: when it was first seen, or its own posting date if earlier. */
    firstSeen: string;
    createdAt?: Date;
}

const SeenJobSchema = new Schema<ISeenJob>(
    {
        url: { type: String, required: true, unique: true, index: true },
        firstSeen: { type: String, required: true },
        // Forgotten after a year, so the collection doesn't grow forever.
        createdAt: { type: Date, default: Date.now, expires: 365 * 24 * 60 * 60 },
    },
    { id: false }
);

const SeenJob: Model<ISeenJob> = mongoose.models.SeenJob || mongoose.model<ISeenJob>("SeenJob", SeenJobSchema);
export default SeenJob;
