import type { AnchorMap, RenderJob, ResumeDoc } from "../types";
import { renderPreserveOriginal } from "./preserve";
import { renderTemplate } from "./template";

export async function renderDoc(opts: { doc: ResumeDoc; anchorMap: AnchorMap | null; job: RenderJob }): Promise<Buffer> {
  if (opts.job.mode === "preserve_original" && opts.anchorMap && Object.keys(opts.anchorMap).length > 0) {
    // Need original buffer — stored via fileRef; caller must supply it
    // For now, if fileRef is a data URL or path, try to load; otherwise fall back to template
    // The API layer will pass originalBuffer separately
    throw new Error("preserve_original requires originalBuffer — use renderPreserveOriginal directly");
  }
  return renderTemplate({ doc: opts.doc, templateId: opts.job.templateId, theme: opts.job.theme, format: opts.job.format });
}

export { renderPreserveOriginal, renderTemplate };
