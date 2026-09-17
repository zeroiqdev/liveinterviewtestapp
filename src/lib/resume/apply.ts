import { newId, richTextToPlain, type Edit, type ResumeDoc, type RichText, type Suggestion, type SuggestionOp } from "./types";

function findNode(doc: ResumeDoc, targetId: string): { path: string; node: any; parent: any; index: number } | null {
  // search sections/items/bullets
  for (let si = 0; si < doc.sections.length; si++) {
    const sec = doc.sections[si] as any;
    if (sec.id === targetId) return { path: `sections[${si}]`, node: sec, parent: doc.sections, index: si };
    if (sec.kind === "summary" && sec.id === targetId) return { path: `sections[${si}].body`, node: sec.body, parent: sec, index: -1 };
    if (sec.kind === "experience") {
      for (let ii = 0; ii < sec.items.length; ii++) {
        const it = sec.items[ii];
        if (it.id === targetId) return { path: `sections[${si}].items[${ii}]`, node: it, parent: sec.items, index: ii };
        for (let bi = 0; bi < it.bullets.length; bi++) {
          const b = it.bullets[bi];
          if (b.id === targetId) return { path: `sections[${si}].items[${ii}].bullets[${bi}]`, node: b, parent: it.bullets, index: bi };
        }
      }
    }
    if (sec.kind === "skills") {
      for (let gi = 0; gi < sec.groups.length; gi++) if (sec.groups[gi].id === targetId) return { path: `sections[${si}].groups[${gi}]`, node: sec.groups[gi], parent: sec.groups, index: gi };
    }
    if (sec.kind === "education") {
      for (let ei = 0; ei < sec.items.length; ei++) if (sec.items[ei].id === targetId) return { path: `sections[${si}].items[${ei}]`, node: sec.items[ei], parent: sec.items, index: ei };
    }
    if (sec.kind === "projects" || sec.kind === "custom") {
      for (let pi = 0; pi < (sec.items?.length || 0); pi++) if ((sec.items as any)[pi].id === targetId) return { path: `sections[${si}].items[${pi}]`, node: (sec.items as any)[pi], parent: sec.items, index: pi };
    }
  }
  return null;
}

function cloneDoc(doc: ResumeDoc): ResumeDoc {
  return JSON.parse(JSON.stringify(doc));
}

export function applySuggestion(doc: ResumeDoc, suggestion: Suggestion, overrideValue?: RichText): { doc: ResumeDoc; edit: Edit } {
  const next = cloneDoc(doc);
  const found = findNode(next, suggestion.targetId);
  if (!found) throw new Error(`target ${suggestion.targetId} not found`);

  const after: RichText = overrideValue ?? (suggestion.op.type === "replace_text" ? (suggestion.op as any).after : suggestion.op.type === "insert_bullet" ? (suggestion.op as any).value : []);
  // capture before for inverse
  let before: RichText = [];
  let op: SuggestionOp = suggestion.op;
  let inverse: SuggestionOp;

  if (op.type === "replace_text") {
    // node is Bullet or summary body
    if (Array.isArray(found.node)) {
      before = found.node as RichText;
      (found.parent as any)[found.path.split(".").pop()!] = after;
      inverse = { type: "replace_text", after: before };
    } else if (found.node.text) {
      before = (found.node as any).text as RichText;
      (found.node as any).text = after;
      inverse = { type: "replace_text", after: before };
    } else if (found.node.body) {
      before = found.node.body as RichText;
      found.node.body = after;
      inverse = { type: "replace_text", after: before };
    } else {
      before = [];
      inverse = { type: "replace_text", after: before };
    }
  } else if (op.type === "insert_bullet") {
    // find experience item to insert after
    const expSec = next.sections.find((s) => s.kind === "experience") as any;
    // For simplicity, if target is a bullet, insert after it; if target is role_header, insert as first bullet of that item
    const bulletParent = found.parent as any[];
    if (Array.isArray(bulletParent) && found.node && found.node.text) {
      // target is bullet
      const idx = found.index;
      before = [];
      op = { type: "insert_bullet", afterId: found.node.id, value: after };
      bulletParent.splice(idx + 1, 0, { id: newId("b"), text: after });
      inverse = { type: "delete_bullet" };
    } else {
      // target is experience item
      const item = found.node as any;
      if (!item.bullets) item.bullets = [];
      item.bullets.push({ id: newId("b"), text: after });
      inverse = { type: "delete_bullet" };
      before = [];
    }
  } else if (op.type === "delete_bullet") {
    const arr = found.parent as any[];
    before = (found.node as any).text as RichText;
    arr.splice(found.index, 1);
    inverse = { type: "insert_bullet", afterId: found.index > 0 ? (arr[found.index - 1] as any)?.id ?? null : null, value: before };
  } else {
    // reorder
    before = [];
    inverse = op;
  }

  next.version = (next.version || 0) + 1;
  const edit: Edit = {
    id: newId("edit"),
    at: new Date().toISOString(),
    source: "ai",
    suggestionId: suggestion.id,
    targetId: suggestion.targetId,
    op,
    inverse,
  };
  return { doc: next, edit };
}

export function isStale(suggestion: Suggestion, doc: ResumeDoc): boolean {
  const found = findNode(doc, suggestion.targetId);
  if (!found) return true;
  const cur: RichText | null = Array.isArray(found.node) ? (found.node as RichText) : (found.node as any).text || (found.node as any).body || null;
  if (!cur) return false;
  const beforePlain = richTextToPlain(suggestion.before);
  const curPlain = richTextToPlain(cur as RichText);
  return beforePlain !== curPlain;
}
