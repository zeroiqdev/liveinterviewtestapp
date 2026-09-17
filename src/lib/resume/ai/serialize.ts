import type { FlatNode } from "../types";

export function serializeFlat(nodes: FlatNode[], shortMap: Map<string, string>): string {
  // shortMap is reverse: realId -> shortId
  const byShort = (id: string) => shortMap.get(id) || id;
  const lines: string[] = [];
  let currentSection = "";
  for (const n of nodes) {
    const sid = byShort(n.id);
    if (n.kind === "summary") {
      if (currentSection !== "SUMMARY") {
        lines.push("# SUMMARY");
        currentSection = "SUMMARY";
      }
      lines.push(`[${sid}] ${n.text}`);
    } else if (n.kind === "role_header") {
      if (currentSection !== "EXPERIENCE") {
        lines.push("# EXPERIENCE");
        currentSection = "EXPERIENCE";
      }
      lines.push(`[${sid}] ${n.text}`);
    } else if (n.kind === "bullet") {
      lines.push(`  [${sid}] ${n.text}`);
    } else if (n.kind === "skill_group") {
      if (currentSection !== "SKILLS") {
        lines.push("# SKILLS");
        currentSection = "SKILLS";
      }
      lines.push(`[${sid}] ${n.text}`);
    } else {
      if (currentSection !== n.kind.toUpperCase()) {
        lines.push(`# ${n.kind.toUpperCase()}`);
        currentSection = n.kind.toUpperCase();
      }
      lines.push(`[${sid}] ${n.text}`);
    }
  }
  return lines.join("\n");
}

export function serializeDocForSummary(fullNodes: FlatNode[], shortMap: Map<string, string>): string {
  // summary call gets full doc as context
  return serializeFlat(fullNodes, shortMap);
}
