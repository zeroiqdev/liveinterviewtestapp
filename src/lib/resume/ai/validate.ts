import { RawSuggestionSchema, type FlatNode } from "../types";

export type ValidateResult = {
  valid: Array<{ raw: unknown; shortId: string; realId: string }>;
  dropped: Array<{ raw: unknown; reason: string }>;
};

export function validateSuggestions(
  rawArray: unknown,
  shortToReal: Map<string, string>,
  nodesById: Map<string, FlatNode>
): ValidateResult {
  const valid: ValidateResult["valid"] = [];
  const dropped: ValidateResult["dropped"] = [];
  if (!Array.isArray(rawArray)) {
    dropped.push({ raw: rawArray, reason: "not_an_array" });
    return { valid, dropped };
  }
  const seen = new Set<string>();
  for (const item of rawArray) {
    const parsed = RawSuggestionSchema.safeParse(item);
    if (!parsed.success) {
      dropped.push({ raw: item, reason: `zod:${parsed.error.issues.map((i) => i.message).join(";")}` });
      continue;
    }
    const { targetId: shortId, op, after } = parsed.data as any;
    const realId = shortToReal.get(shortId);
    if (!realId) {
      dropped.push({ raw: item, reason: "unknown_id" });
      continue;
    }
    if (seen.has(realId)) {
      dropped.push({ raw: item, reason: "duplicate_target" });
      continue;
    }
    seen.add(realId);
    const node = nodesById.get(realId);
    if (node && op === "replace_text" && typeof after === "string") {
      const cur = node.text.trim();
      if (after.trim() === cur) {
        dropped.push({ raw: item, reason: "no_op" });
        continue;
      }
      // digits guard: any digit sequence in after must be in source text or inside [brackets]
      const withoutBrackets = after.replace(/\[[^\]]*\]/g, "");
      const digitsAfter = withoutBrackets.match(/\d+/g) || [];
      const digitsSource = node.text.match(/\d+/g) || [];
      // also allow digits that appear elsewhere in doc? For now check node only; fabrication across nodes is still fabrication
      const sourceDigitsSet = new Set(digitsSource);
      const hasFabricated = digitsAfter.some((d) => !sourceDigitsSet.has(d));
      if (hasFabricated) {
        dropped.push({ raw: item, reason: "fabricated_digits" });
        continue;
      }
    }
    valid.push({ raw: item, shortId, realId });
  }
  return { valid, dropped };
}
