import { richTextToPlain, type FlatNode, type ResumeDoc } from "../types";

export function flattenDoc(doc: ResumeDoc): FlatNode[] {
  const out: FlatNode[] = [];
  for (const sec of doc.sections) {
    if (sec.kind === "summary") {
      out.push({
        id: sec.id,
        kind: "summary",
        text: richTextToPlain(sec.body),
        context: sec.title,
      });
    } else if (sec.kind === "experience") {
      for (const it of sec.items) {
        const header = `${it.role} @ ${it.org} (${it.start.raw} – ${it.end === "present" ? "Present" : (it.end as any).raw})`;
        out.push({ id: it.id, kind: "role_header", text: header, context: sec.title });
        for (const b of it.bullets) {
          out.push({
            id: b.id,
            kind: "bullet",
            text: richTextToPlain(b.text),
            context: header,
          });
        }
      }
    } else if (sec.kind === "skills") {
      for (const g of sec.groups) {
        out.push({ id: g.id, kind: "skill_group", text: `${g.category}: ${g.items}`, context: sec.title });
      }
    } else if (sec.kind === "education") {
      for (const e of sec.items) {
        out.push({ id: e.id, kind: "edu_item", text: `${e.title} — ${e.org}`, context: sec.title });
      }
    } else if (sec.kind === "projects" || sec.kind === "custom") {
      for (const it of (sec as any).items || []) {
        out.push({ id: it.id, kind: "bullet", text: richTextToPlain(it.body || it.bullets?.[0]?.text || []), context: sec.title });
      }
    }
  }
  return out;
}
