/**
 * EngineSession / EngineProfile Mongoose Models
 *
 * Persist interview engine state so a session survives across serverless
 * instances (each turn may land on a different Vercel function). The engine
 * owns the document shape (SessionDoc / CandidateProfile); Mongo stores it
 * opaquely under `doc`.
 */

import mongoose, { Schema } from "mongoose";

export interface IEngineSession {
  _id: string; // sessionId
  ownerId: string | null;
  doc: Record<string, unknown>;
  updatedAt: Date;
}

export interface IEngineProfile {
  _id: string; // candidateId
  doc: Record<string, unknown>;
  updatedAt: Date;
}

const EngineSessionSchema: Schema = new Schema(
  {
    _id: { type: String, required: true },
    ownerId: { type: String, default: null },
    doc: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false, timestamps: false, minimize: false }
);

// Interviews are short-lived; feedback is generated right after. Expire
// abandoned sessions after 2 days.
EngineSessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 2 * 24 * 60 * 60 });

const EngineProfileSchema: Schema = new Schema(
  {
    _id: { type: String, required: true },
    doc: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false, timestamps: false, minimize: false }
);

EngineProfileSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const EngineSessionModel =
  mongoose.models.EngineSession ||
  mongoose.model<IEngineSession>("EngineSession", EngineSessionSchema);

export const EngineProfileModel =
  mongoose.models.EngineProfile ||
  mongoose.model<IEngineProfile>("EngineProfile", EngineProfileSchema);

/**
 * A turn decision computed speculatively by /prepare while the candidate is
 * still in their end-of-turn silence. Stored so /turn can reuse it even when
 * it runs on a different serverless instance. One row per answer snapshot.
 */
export interface IPreparedTurn {
  _id: string; // `${sessionId}:${hash of the answer snapshot}`
  sessionId: string;
  answerText: string;
  answerWords: number;
  turnCount: number;
  decision: Record<string, unknown>;
  expiresAt: Date;
}

const PreparedTurnSchema: Schema = new Schema(
  {
    _id: { type: String, required: true },
    sessionId: { type: String, index: true },
    answerText: { type: String, required: true },
    answerWords: { type: Number, default: 0 },
    turnCount: { type: Number, required: true },
    decision: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { _id: false, timestamps: false, minimize: false }
);

export const PreparedTurnModel =
  mongoose.models.PreparedTurn ||
  mongoose.model<IPreparedTurn>("PreparedTurn", PreparedTurnSchema);
