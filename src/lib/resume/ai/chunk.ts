import { callJSON } from "@/engine/llm";
import { flattenDoc } from "./flatten";
import { buildShortIdMap } from "./shortId";
import { serializeFlat, serializeDocForSummary } from "./serialize";
import { SYSTEM_PROMPT } from "./contract";
import { validateSuggestions } from "./validate";
import type { FlatNode, RawSuggestion, ResumeDoc } from "../types";

type ChunkResult = {
  valid: RawSuggestion[];
  dropped: Array<{ raw: unknown; reason: string }>;
};

export async function suggestForDoc(doc: ResumeDoc): Promise<ChunkResult> {
  const flat = flattenDoc(doc);
  const nodesById = new Map<string, FlatNode>(flat.map((n) => [n.id, n]));
  // group by section for chunking (experience items and bullets together per section)
  const bySection = new Map<string, FlatNode[]>();
  for (const n of flat) {
    const sec = n.kind === "summary" ? "summary" : n.kind === "bullet" || n.kind === "role_header" ? "experience" : n.kind;
    const arr = bySection.get(sec) || [];
    arr.push(n);
    bySection.set(sec, arr);
  }

  const chunks: Array<{ nodes: FlatNode[]; isSummary: boolean }> = [];
  for (const [sec, nodes] of bySection.entries()) {
    if (sec === "summary") {
      // summary gets full doc as context
      chunks.push({ nodes: flat, isSummary: true });
    } else {
      // split large sections into ~12 nodes per chunk to bound tokens
      for (let i = 0; i < nodes.length; i += 12) chunks.push({ nodes: nodes.slice(i, i + 12), isSummary: false });
    }
  }

  const allValid: RawSuggestion[] = [];
  const allDropped: Array<{ raw: unknown; reason: string }> = [];

  await Promise.all(
    chunks.map(async (ch) => {
      const { map: shortToReal, reverse } = buildShortIdMap(ch.nodes);
      const serialized = ch.isSummary ? serializeDocForSummary(ch.nodes, reverse) : serializeFlat(ch.nodes, reverse);
      const user = serialized;
      try {
        const raw = await callJSON<unknown>({
          system: SYSTEM_PROMPT,
          user,
          maxTokens: 1800,
          timeoutMs: 30000,
        });
        // model should return array; if it returned object with suggestions key, unwrap
        const arr = Array.isArray(raw) ? raw : (raw as any)?.suggestions && Array.isArray((raw as any).suggestions) ? (raw as any).suggestions : [];
        const { valid, dropped } = validateSuggestions(arr, shortToReal, nodesById);
        // map shortId -> realId for valid
        for (const v of valid) {
          const real = v.realId;
          const r = v.raw as any;
          // rewrite targetId to realId
          allValid.push({ ...r, targetId: real });
        }
        allDropped.push(...dropped);
      } catch (e) {
        allDropped.push({ raw: ch.nodes.map((n) => n.id), reason: `chunk_error:${(e as Error).message}` });
      }
    })
  );

  // dedup by targetId (first wins)
  const byTarget = new Map<string, RawSuggestion>();
  for (const s of allValid) {
    if (!byTarget.has(s.targetId)) byTarget.set(s.targetId, s);
    else allDropped.push({ raw: s, reason: "duplicate_target_across_chunks" });
  }

  return { valid: Array.from(byTarget.values()), dropped: allDropped };
}
