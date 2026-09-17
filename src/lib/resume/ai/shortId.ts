import type { FlatNode } from "../types";

export function buildShortIdMap(nodes: FlatNode[]): { map: Map<string, string>; reverse: Map<string, string> } {
  const map = new Map<string, string>(); // short -> real
  const reverse = new Map<string, string>(); // real -> short
  const counters: Record<string, number> = {};
  const prefixFor = (kind: FlatNode["kind"]) => {
    if (kind === "summary") return "s";
    if (kind === "bullet") return "b";
    if (kind === "role_header") return "r";
    if (kind === "skill_group") return "g";
    return "n";
  };
  for (const n of nodes) {
    const p = prefixFor(n.kind);
    counters[p] = (counters[p] || 0) + 1;
    const short = `${p}-${String(counters[p]).padStart(2, "0")}`;
    map.set(short, n.id);
    reverse.set(n.id, short);
  }
  return { map, reverse };
}
