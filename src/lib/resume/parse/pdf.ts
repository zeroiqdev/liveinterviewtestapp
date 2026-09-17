import { newId, type AnchorMap, type ResumeDoc } from "../types";

export async function parsePdf(opts: { buffer: Buffer; fileRef?: string }): Promise<{ doc: ResumeDoc; anchorMap: AnchorMap }> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    const uint8 = new Uint8Array(opts.buffer.buffer, opts.buffer.byteOffset, opts.buffer.byteLength);
    const pdf = await getDocumentProxy(uint8);
    // Try layout-aware extraction: get text items with positions to handle two-column resumes like Kalpesh
    // Fallback to simple extractText if that fails
    let cleaned = "";
    try {
      // Use pdfjs directly for position info if available
      const { extractText } = await import("unpdf");
      const { text: simpleText } = await extractText(pdf as any, { mergePages: true });
      cleaned = (simpleText || "").trim();
      // If the PDF is two-column, simple merge will interleave left/right incorrectly.
      // Detect two-column by checking raw text for artifacts that indicate columnar layout
      // For Kalpesh, the text contains both "WORK EXPERIENCE" and "RECOGNITION" in same page region.
      // We can attempt to re-extract with column detection via getPage + getTextContent if available
      try {
        const pdfjs: any = (pdf as any)._pdfDoc || pdf;
        if (pdfjs && typeof pdfjs.getPage === "function") {
          const page = await pdfjs.getPage(1);
          const content: any = await page.getTextContent();
          const items: Array<{ str: string; transform: number[] }> = content.items || [];
          // Normalize bullet artifacts:  and æ are often bullet glyphs mis-encoded
          const normalized = items.map((it) => ({
            str: (it.str || "").replace(/[\x18\x19]/g, "•").replace(/æ/g, "•").trim(),
            x: it.transform?.[4] ?? 0,
            y: it.transform?.[5] ?? 0,
          }));
          // Detect two columns by x clustering
          const xs = normalized.map((n) => n.x).filter((x) => x > 0);
          const leftXs = xs.filter((x) => x < 300);
          const rightXs = xs.filter((x) => x >= 300);
          if (leftXs.length > 5 && rightXs.length > 5) {
            // Two-column detected: split and sort each column top-to-bottom (y descending)
            const left = normalized.filter((n) => n.x < 300).sort((a, b) => b.y - a.y);
            const right = normalized.filter((n) => n.x >= 300).sort((a, b) => b.y - a.y);
            // Reconstruct text column by column, preserving line breaks via y clustering
            const colToLines = (col: typeof normalized) => {
              const lines: string[] = [];
              let curY: number | null = null;
              let curLine: string[] = [];
              for (const it of col) {
                if (curY === null || Math.abs(it.y - curY) < 4) {
                  curLine.push(it.str);
                  curY = it.y;
                } else {
                  if (curLine.length) lines.push(curLine.join(" "));
                  curLine = [it.str];
                  curY = it.y;
                }
              }
              if (curLine.length) lines.push(curLine.join(" "));
              return lines;
            };
            const leftLines = colToLines(left);
            const rightLines = colToLines(right);
            // For resume, left is main (experience), right is sidebar; concatenate left then right for logical reading order
            cleaned = [...leftLines, "", ...rightLines].join("\n");
          } else {
            // Single column: use normalized strings joined by y
            const lines = normalized
              .sort((a, b) => b.y - a.y || a.x - b.x)
              .map((n) => n.str)
              .join("\n");
            if (lines && lines.length > 200) cleaned = lines;
          }
          // Final cleanup of artifacts
          cleaned = cleaned
            .replace(/[\x18\x19]/g, "•")
            .replace(/æ/g, "•")
            .replace(/•\s*•/g, "•")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        }
      } catch {}
      if (cleaned && cleaned.length > 40) {
        // Build a minimal ResumeDoc from cleaned text (preserve order, confidence will reflect two-column success)
        const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);
        const { parseDocx } = await import("./docx");
        // Feed the cleaned two-column text through docx parser via synthetic html to reuse its heading/bullet logic
        const html = lines.map((l) => `<p>${l.replace(/&/g, "&amp;")}</p>`).join("");
        // Create a synthetic buffer by reusing docx parser's html path: feed via Buffer of html string as docx? Instead, directly construct doc via docx parser's html handling
        // Simpler: construct a doc manually for preview, but we can also call parseDocx on a synthetic docx buffer containing this html
        // For now, return a direct doc with low-mid confidence to trigger UI warning if needed
        const fullText = lines.join("\n");
        // If we still have the original html, we can call the docx parser's html handling by faking a buffer that will be treated as html
        // Instead, just build a custom doc here and return
        const doc: ResumeDoc = {
          id: newId("doc"),
          version: 0,
          source: { kind: "pdf", fileRef: opts.fileRef, parsedAt: new Date().toISOString(), confidence: 0 },
          contact: { fullName: lines[0]?.slice(0, 48) || "Candidate", links: [] },
          sections: [
            {
              id: newId("sec"),
              kind: "custom" as const,
              title: "Additional",
              items: [{ id: newId("gen"), body: [{ text: fullText.slice(0, 4000) }] }],
            },
          ],
        };
        // Try to get a better structured doc by feeding the cleaned text through the docx parser's html path
        // Create a minimal docx-like html buffer and parse via docx path
        try {
          // Fallback to using the cleaned lines to build a better doc via docx parser's internal html handling
          // For now, just compute confidence and return the custom doc with improved confidence
          const { computeConfidence } = await import("./confidence");
          doc.source.confidence = computeConfidence(doc);
          // If confidence is very low, the UI will show warning as required
          return { doc, anchorMap: {} };
        } catch {
          const { computeConfidence } = await import("./confidence");
          doc.source.confidence = computeConfidence(doc);
          return { doc, anchorMap: {} };
        }
      }
    } catch {}
    // Fallback to simple extractText if layout-aware failed
    const { extractText: simpleExtract } = await import("unpdf");
    const { text: fallbackText } = await simpleExtract(pdf as any, { mergePages: true });
    const cleanedFallback = (fallbackText || "").replace(/[\x18\x19]/g, "•").replace(/æ/g, "•").trim();
    if (cleanedFallback && cleanedFallback.length > 40) {
      const doc: ResumeDoc = {
        id: newId("doc"),
        version: 0,
        source: { kind: "pdf", fileRef: opts.fileRef, parsedAt: new Date().toISOString(), confidence: 0 },
        contact: { fullName: cleanedFallback.split("\n")[0]?.slice(0, 48) || "Candidate", links: [] },
        sections: [
          {
            id: newId("sec"),
            kind: "custom" as const,
            title: "Additional",
            items: [{ id: newId("gen"), body: [{ text: cleanedFallback.slice(0, 4000) }] }],
          },
        ],
      };
      const { computeConfidence } = await import("./confidence");
      doc.source.confidence = computeConfidence(doc);
      return { doc, anchorMap: {} };
    }
  } catch {}
  // ultimate fallback: never throw
  const doc: ResumeDoc = {
    id: newId("doc"),
    version: 0,
    source: { kind: "pdf", fileRef: opts.fileRef, parsedAt: new Date().toISOString(), confidence: 0 },
    contact: { fullName: "Candidate", links: [] },
    sections: [{ id: newId("sec"), kind: "custom", title: "Additional", items: [{ id: newId("gen"), body: [{ text: "Unable to parse PDF — please review manually." }] }] }],
  };
  return { doc, anchorMap: {} };
}
