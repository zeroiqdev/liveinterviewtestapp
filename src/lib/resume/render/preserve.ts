import type { AnchorMap, ResumeDoc } from "../types";

// Mode A: preserve original — walk anchor map, replace text in referenced runs only.
// Where new text needs different run boundaries than original, split the run and inherit formatting from first run.
export async function renderPreserveOriginal(opts: { originalBuffer: Buffer; doc: ResumeDoc; anchorMap: AnchorMap }): Promise<Buffer> {
  const PizZip = (await import("pizzip")).default;
  const zip = new PizZip(opts.originalBuffer);
  const xmlFile = zip.file("word/document.xml");
  if (!xmlFile) return opts.originalBuffer;
  let xml = xmlFile.asText();

  // Build a tiny paragraph/run index to map paragraphIndex -> <w:p> block
  const pRe = /<w:p[^>]*>[\s\S]*?<\/w:p>/g;
  const paragraphs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(xml))) paragraphs.push(m[0]);

  // For each anchor entry, replace the runRange inside that paragraph
  // We keep it simple: find the paragraph by index, then replace its w:t texts
  // This preserves all w:rPr (font, color, bold, link via w:hyperlink) because we only touch w:t
  for (const [nodeId, anchorRaw] of Object.entries(opts.anchorMap as Record<string, any>)) {
    const anchor = anchorRaw as { paragraphIndex: number; runRange: [number, number] };
    // find current text for nodeId from doc
    let beforeText: string | null = null;
    for (const sec of opts.doc.sections) {
      if ((sec as any).id === nodeId) beforeText = (sec as any).body ? (sec as any).body.map((r: any) => r.text).join("") : null;
      if ((sec as any).kind === "experience") {
        for (const it of (sec as any).items || []) {
          if (it.id === nodeId) beforeText = `${it.role} @ ${it.org}`;
          for (const b of it.bullets || []) if (b.id === nodeId) beforeText = b.text.map((r: any) => r.text).join("");
        }
      }
      if (beforeText) break;
    }
    if (beforeText === null) continue;
    // locate paragraph
    const pIdx = (anchor as any).paragraphIndex;
    if (pIdx < 0 || pIdx >= paragraphs.length) continue;
    const pXml = paragraphs[pIdx];
    // collect w:t nodes inside this paragraph
    const tRe = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    const tMatches: Array<{ full: string; inner: string; start: number; end: number }> = [];
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(pXml))) tMatches.push({ full: tm[0], inner: tm[1], start: tm.index, end: tm.index + tm[0].length });
    const [a, b] = anchor.runRange;
    // if range out of bounds, skip
    if (a < 0 || b >= tMatches.length) continue;
    // Find what the doc currently has in that range (should equal beforeText, else stale)
    // For now, replace that range's w:t texts with the new RichText split across runs
    // We need the new text; we can locate the node's current RichText from doc (already have beforeText, but we want after)
    // For preserve mode, caller has already mutated doc; we need after text
    // So re-read from doc's node after mutation: find target node's text
    let afterText: string | null = null;
    for (const sec of opts.doc.sections) {
      if ((sec as any).id === nodeId) afterText = (sec as any).body ? (sec as any).body.map((r: any) => r.text).join("") : null;
      if ((sec as any).kind === "experience") {
        for (const it of (sec as any).items || []) {
          for (const bl of it.bullets || []) if (bl.id === nodeId) afterText = bl.text.map((r: any) => r.text).join("");
        }
      }
      if (afterText !== null) break;
    }
    if (afterText === null || afterText === beforeText) continue;
    // Build new paragraph xml with replaced runs
    // Keep first run's w:rPr, replace its w:t with afterText, clear subsequent runs in range
    // For simplicity, replace the concatenated inner texts
    // Construct new pXml by replacing the runRange's w:t inners
    let newP = pXml;
    // Replace from last to first to keep indices stable
    for (let idx = b; idx >= a; idx--) {
      const mt = tMatches[idx];
      const newInner = idx === a ? afterText.replace(/&/g, "&amp;").replace(/</g, "&lt;") : "";
      const newFull = mt.full.replace(`>${mt.inner}<`, `>${newInner}<`);
      newP = newP.slice(0, mt.start) + newFull + newP.slice(mt.end);
      // Adjust subsequent indices (not needed since we go reverse)
      // Recompute is easier: just do string replace of full
      // For reverse, we can just replace in newP via last occurrence
    }
    // This simplified approach does per-paragraph string replace; for correctness we rebuild via split
    // Instead, do a direct string replacement of the paragraph in xml
    const escapedBefore = beforeText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Fallback: if DOM approach failed, try simple text replace inside this paragraph
    if (!newP.includes(afterText)) {
      // already handled
    }
    paragraphs[pIdx] = newP;
  }

  // Reassemble xml
  let outXml = xml;
  // Replace each original paragraph block with new one (order matters)
  // Use a single pass: rebuild by splitting on pRe
  // Simpler: re-join paragraphs (this loses inter-paragraph whitespace but preserves document)
  // For now, just replace each old p with new p via string replace (first occurrence)
  for (let i = 0; i < paragraphs.length; i++) {
    // find nth occurrence; we have original p strings from first pass, but outXml still has original
    // Replace only that occurrence
    const origP = xml.match(new RegExp(pRe.source, "g"))?.[i];
    // Instead, just replace paragraphs array join
  }
  // Simpler final: join paragraphs with original separators
  // For correctness, just write back the modified paragraph for the first changed one (most docs have single anchor per paragraph)
  // To avoid complexity, fall back to simple global text replace if anchor map is small
  // If we modified xml via DOM, serialize and write
  // For now, if we did any change, write back the first modified paragraph's replacement via simple replace
  // This is a best-effort preserve; template mode is the fallback for complex edits
  // Write back
  // Reconstruct document.xml by replacing paragraphs in order
  let rebuilt = xml;
  // Collect original paragraphs again to replace
  const origPs: string[] = [];
  const re2 = /<w:p[^>]*>[\s\S]*?<\/w:p>/g;
  let mm2: RegExpExecArray | null;
  while ((mm2 = re2.exec(xml))) origPs.push(mm2[0]);
  // paragraphs now holds new versions (only changed ones differ)
  for (let i = 0; i < Math.min(origPs.length, paragraphs.length); i++) {
    if (origPs[i] !== paragraphs[i]) {
      rebuilt = rebuilt.replace(origPs[i], paragraphs[i]);
    }
  }
  zip.file("word/document.xml", rebuilt);
  return zip.generate({ type: "nodebuffer" });
}
