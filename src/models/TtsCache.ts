/**
 * TtsCache Mongoose Model
 *
 * Stores synthesized TTS audio metadata and URLs.
 * _id is a SHA-256 hash of (text + voiceId + voiceSettings) for deduplication.
 * Region is stored explicitly for easier querying/debugging.
 *
 * Follows the same pattern as UserStats.ts.
 */

import mongoose, { Schema } from "mongoose";

export interface ITtsCache {
  _id: string;           // SHA-256 hash
  text: string;          // The synthesized text
  persona: string;       // "coach" | "recruiter"
  region: string;        // Normalized region key
  provider?: string;     // "elevenlabs" | "yarngpt"
  voiceId: string;       // Voice ID or character name used
  voiceSettings: Record<string, unknown>; // Voice settings used
  audioUrl: string;      // Public URL to the audio file
  createdAt: Date;
  lastUsedAt: Date;
}

const TtsCacheSchema: Schema = new Schema(
  {
    _id: { type: String, required: true }, // SHA-256 hash — we set this manually
    text: { type: String, required: true },
    persona: { type: String, required: true, enum: ["coach", "recruiter"] },
    region: { type: String, required: true },
    provider: { type: String, default: "elevenlabs" },
    voiceId: { type: String, required: true },
    voiceSettings: { type: Schema.Types.Mixed, required: true },
    audioUrl: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
  },
  {
    _id: false, // We manage _id ourselves (the hash)
    timestamps: false, // We manage createdAt/lastUsedAt manually
  }
);

// Index for cleanup/analytics queries
TtsCacheSchema.index({ persona: 1, region: 1 });
TtsCacheSchema.index({ lastUsedAt: 1 });

export default mongoose.models.TtsCache ||
  mongoose.model<ITtsCache>("TtsCache", TtsCacheSchema);
