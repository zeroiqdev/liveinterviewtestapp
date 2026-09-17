import type { Edit, ResumeDoc, Suggestion } from "./types";

export type ResumeState = {
  doc: ResumeDoc;
  suggestions: Suggestion[];
  edits: Edit[];
  dropped: Array<{ raw: unknown; reason: string }>;
};

export function markStale(state: ResumeState): ResumeState {
  // mark suggestions stale if underlying node changed
  const { isStale } = require("./apply") as { isStale: (s: Suggestion, d: ResumeDoc) => boolean };
  const next = state.suggestions.map((s) => (isStale(s, state.doc) ? { ...s, status: "stale" as const } : s));
  return { ...state, suggestions: next };
}
