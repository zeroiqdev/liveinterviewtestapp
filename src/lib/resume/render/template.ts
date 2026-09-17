import type { ResumeDoc } from "../types";

// Mode B: template — render ResumeDoc into a chosen template.
// For docx we use a minimal in-code template (no external dot file) to keep the example self-contained.
// For pdf we would use HTML + headless Chromium printToPDF; here we return docx buffer for both formats for brevity.

export async function renderTemplate(opts: { doc: ResumeDoc; templateId?: string; theme?: { font: string; accentColor: string; density: "compact" | "normal" }; format: "docx" | "pdf" }): Promise<Buffer> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");
  const font = opts.theme?.font || "Calibri";
  const withFont = (o: any) => ({ ...o, font });
  const accent = (opts.theme?.accentColor || "#0F172A").replace("#", "");

  const children: any[] = [];
  const contact = opts.doc.contact;
  children.push(
    new Paragraph({ children: [new TextRun(withFont({ text: contact.fullName, bold: true, size: 28, color: accent }))], heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 80 } }),
    new Paragraph({ children: [new TextRun(withFont({ text: [contact.headline, contact.email, contact.phone, contact.location].filter(Boolean).join(" · "), size: 18, color: "64748B" }))], alignment: AlignmentType.CENTER, spacing: { after: 120 } }),
  );
  if (contact.links.length) {
    const { ExternalHyperlink } = await import("docx");
    children.push(
      new Paragraph({
        children: contact.links.flatMap((l) => [new ExternalHyperlink({ children: [new TextRun(withFont({ text: l.label, color: accent, style: "Hyperlink" }))], link: l.url }), new TextRun({ text: "  " })]),
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    );
  }
  for (const sec of opts.doc.sections) {
    children.push(new Paragraph({ children: [new TextRun(withFont({ text: sec.title, bold: true, size: 20, color: accent }))], heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 } }));
    if (sec.kind === "summary") {
      children.push(new Paragraph({ children: (sec as any).body.map((r: any) => new TextRun(withFont({ text: r.text, bold: r.bold, italics: r.italic, color: r.link ? accent : undefined, style: r.link ? "Hyperlink" : undefined }))), spacing: { after: 120 } }));
    } else if (sec.kind === "experience") {
      for (const it of (sec as any).items) {
        children.push(
          new Paragraph({
            children: [new TextRun(withFont({ text: `${it.role} · ${it.org}`, bold: true, size: 20, color: accent })), new TextRun(withFont({ text: `  ${it.start.raw} – ${it.end === "present" ? "Present" : (it.end as any).raw}`, size: 16, color: "64748B", italics: true }))],
            spacing: { before: 120, after: 60 },
          })
        );
        if (it.bullets) {
          for (const b of it.bullets) {
            children.push(new Paragraph({ children: [new TextRun(withFont({ text: "•  " })), ...b.text.map((r: any) => new TextRun(withFont({ text: r.text, bold: r.bold, italics: r.italic, color: r.link ? accent : undefined, style: r.link ? "Hyperlink" : undefined })))], indent: { left: 360 }, spacing: { after: 40 } }));
          }
        }
      }
    } else if (sec.kind === "skills") {
      for (const g of (sec as any).groups) {
        children.push(new Paragraph({ children: [new TextRun(withFont({ text: `${g.category}: `, bold: true })), new TextRun(withFont({ text: g.items }))], spacing: { after: 40 } }));
      }
    } else {
      for (const it of (sec as any).items || []) {
        const body = (it as any).body || [];
        children.push(new Paragraph({ children: body.map((r: any) => new TextRun(withFont({ text: r.text, bold: r.bold, italics: r.italic }))), spacing: { after: 40 } }));
      }
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buf = await Packer.toBuffer(doc);
  return Buffer.from(buf);
}
