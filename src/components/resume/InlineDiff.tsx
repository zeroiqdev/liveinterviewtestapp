"use client";
import type { RichText } from "@/lib/resume/types";

export function RichDiff({ before, after, keyword }: { before: RichText; after: RichText; keyword?: string }) {
  const plainBefore = before.map((r) => r.text).join("");
  const plainAfter = after.map((r) => r.text).join("");
  const hasPlaceholder = /\[X\]/.test(plainAfter);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ background: "#FEF2F2", borderLeft: "2px solid #EF4444", padding: "0.35rem 0.55rem", borderRadius: "0 4px 4px 0", color: "#991B1B", fontFamily: "'Inter', sans-serif", fontSize: "0.78rem" }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#DC2626", display: "block" }}>Original</span>
        <span style={{ textDecoration: "line-through", opacity: 0.9 }}>{plainBefore}</span>
      </div>
      <div style={{ background: "#F0FDF4", border: "1px solid #DCFCE7", padding: "0.45rem 0.6rem", borderRadius: 6, color: "#166534", fontFamily: "'Inter', sans-serif", fontSize: "0.78rem" }}>
        <span style={{ fontWeight: 700 }}>Improvement:</span> {plainAfter}
        {keyword && <span style={{ background: "#FEF08A", border: "1px solid #FDE68A", padding: "0 2px", borderRadius: 3, marginLeft: 6, color: "#854D0E" }}>{keyword}</span>}
        {hasPlaceholder && <span style={{ marginLeft: 6, background: "#FFFBEB", border: "1px solid #FDE68A", padding: "0 4px", borderRadius: 4, color: "#92400E" }}>[X] must be filled</span>}
      </div>
    </div>
  );
}

export function PlaceholderInput({ value, onChange }: { value: RichText; onChange: (v: RichText) => void }) {
  const plain = value.map((r) => r.text).join("");
  const hasX = /\[X\]/.test(plain);
  if (!hasX) return null;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: "0.75rem", color: "#92400E" }}>
      Fill placeholder:
      <input
        style={{ border: "1px solid #FDE68A", borderRadius: 6, padding: "0.25rem 0.45rem", fontSize: "0.78rem", flex: 1 }}
        placeholder="e.g. 24"
        onChange={(e) => {
          const v = e.target.value.trim();
          const replaced = plain.replace("[X]", v || "[X]");
          onChange([{ text: replaced }]);
        }}
      />
      %
    </label>
  );
}
