import type { ResumeDoc } from "../types";

export function computeConfidence(doc: ResumeDoc): number {
  let score = 0;
  // contact block present
  if (doc.contact.fullName && doc.contact.fullName.length > 2) score += 0.22;
  if (doc.contact.email || doc.contact.links.length > 0) score += 0.12;
  // at least one dated experience item
  const exp = doc.sections.find((s) => s.kind === "experience") as Extract<ResumeDoc["sections"][number], { kind: "experience" }> | undefined;
  const hasDated = exp?.items.some((it) => typeof it.start.year === "number");
  if (hasDated) score += 0.28;
  else if (exp && exp.items.length > 0) score += 0.14;
  // recognizable headings (we emitted them, so count sections)
  const knownKinds = new Set(doc.sections.map((s) => s.kind));
  if (knownKinds.has("experience")) score += 0.12;
  if (knownKinds.has("skills")) score += 0.08;
  if (knownKinds.has("education")) score += 0.06;
  // plausible bullet count (3-20 is healthy)
  const bulletCount = exp ? exp.items.flatMap((i) => i.bullets).length : 0;
  if (bulletCount >= 3 && bulletCount <= 24) score += 0.12;
  else if (bulletCount > 0) score += 0.06;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}
