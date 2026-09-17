import type { AnchorMap, ResumeDoc } from "../types";
import { parseDocx } from "./docx";
import { parsePdf } from "./pdf";

export async function parseResume(opts: { buffer: Buffer; fileName?: string; fileRef?: string }): Promise<{ doc: ResumeDoc; anchorMap: AnchorMap }> {
  const ext = (opts.fileName || "").split(".").pop()?.toLowerCase();
  const isPdf = ext === "pdf" || opts.buffer.slice(0, 4).toString() === "%PDF";
  try {
    if (isPdf) return await parsePdf({ buffer: opts.buffer, fileRef: opts.fileRef });
    // default to docx path (also handles manual text via fallback)
    return await parseDocx({ buffer: opts.buffer, fileRef: opts.fileRef });
  } catch (e) {
    // never throw — return partial doc
    const { newId } = await import("../types");
    const doc: ResumeDoc = {
      id: newId("doc"),
      version: 0,
      source: { kind: (isPdf ? "pdf" : "docx") as any, fileRef: opts.fileRef, parsedAt: new Date().toISOString(), confidence: 0 },
      contact: { fullName: "Candidate", links: [] },
      sections: [{ id: newId("sec"), kind: "custom", title: "Additional", items: [{ id: newId("gen"), body: [{ text: "Unable to parse document — please review manually." }] }] }],
    };
    return { doc, anchorMap: {} };
  }
}

export { computeConfidence } from "./confidence";
