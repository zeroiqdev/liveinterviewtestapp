import { z } from "zod";

// ── helpers ────────────────────────────────────────────────────────────────
export const newId = (prefix = "") => {
  // nanoid-like without extra dep at runtime (nanoid ESM); fallback to Math.random
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { nanoid } = require("nanoid") as { nanoid: (size?: number) => string };
    return prefix ? `${prefix}_${nanoid(8)}` : nanoid(10);
  } catch {
    return `${prefix ? prefix + "_" : ""}${Math.random().toString(36).slice(2, 10)}`;
  }
};

// ── primitives ─────────────────────────────────────────────────────────────
export const RunSchema = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  link: z.string().url().optional().or(z.literal("")),
});
export type Run = z.infer<typeof RunSchema>;
export type RichText = Run[];

export const DateMarkSchema = z.object({
  year: z.number().int().min(1900).max(2100),
  month: z.number().int().min(1).max(12).optional(),
  raw: z.string().min(1),
});
export type DateMark = z.infer<typeof DateMarkSchema>;

// ── contact ────────────────────────────────────────────────────────────────
export const LinkSchema = z.object({ id: z.string(), label: z.string(), url: z.string() });
export const ContactSchema = z.object({
  fullName: z.string().min(1),
  headline: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  links: z.array(LinkSchema).default([]),
});
export type Contact = z.infer<typeof ContactSchema>;

// ── bullets & items ───────────────────────────────────────────────────────
export const BulletSchema = z.object({ id: z.string(), text: z.array(RunSchema) });
export type Bullet = z.infer<typeof BulletSchema>;

export const ExperienceItemSchema = z.object({
  id: z.string(),
  role: z.string().min(1),
  org: z.string().min(1),
  location: z.string().optional(),
  start: DateMarkSchema,
  end: z.union([DateMarkSchema, z.literal("present")]),
  bullets: z.array(BulletSchema),
  projectHeaders: z.array(z.string()).optional(),
  companyDescription: z.string().optional(),
});
export type ExperienceItem = z.infer<typeof ExperienceItemSchema>;

export const EducationItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  org: z.string(),
  location: z.string().optional(),
  start: DateMarkSchema.optional(),
  end: z.union([DateMarkSchema, z.literal("present")]).optional(),
  details: z.array(z.array(RunSchema)).optional(),
});
export type EducationItem = z.infer<typeof EducationItemSchema>;

export const SkillGroupSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  category: z.string(),
  items: z.string(),
  runs: z.array(RunSchema).optional(),
});
export type SkillGroup = z.infer<typeof SkillGroupSchema>;

export const ProjectItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  bullets: z.array(BulletSchema).optional(),
  link: z.string().optional(),
});
export type ProjectItem = z.infer<typeof ProjectItemSchema>;

export const GenericItemSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  body: z.array(RunSchema),
});
export type GenericItem = z.infer<typeof GenericItemSchema>;

// ── sections (discriminated) ───────────────────────────────────────────────
export const SectionSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("summary"), title: z.string(), body: z.array(RunSchema) }),
  z.object({ id: z.string(), kind: z.literal("experience"), title: z.string(), items: z.array(ExperienceItemSchema) }),
  z.object({ id: z.string(), kind: z.literal("education"), title: z.string(), items: z.array(EducationItemSchema) }),
  z.object({ id: z.string(), kind: z.literal("skills"), title: z.string(), groups: z.array(SkillGroupSchema) }),
  z.object({ id: z.string(), kind: z.literal("projects"), title: z.string(), items: z.array(ProjectItemSchema) }),
  z.object({ id: z.string(), kind: z.literal("custom"), title: z.string(), items: z.array(GenericItemSchema) }),
]);
export type Section = z.infer<typeof SectionSchema>;

// ── ResumeDoc ──────────────────────────────────────────────────────────────
export const ResumeDocSchema = z.object({
  id: z.string(),
  version: z.number().int().min(0),
  source: z.object({
    kind: z.enum(["docx", "pdf", "manual"]),
    fileRef: z.string().optional(),
    parsedAt: z.string(),
    confidence: z.number().min(0).max(1),
  }),
  contact: ContactSchema,
  sections: z.array(SectionSchema),
});
export type ResumeDoc = z.infer<typeof ResumeDocSchema>;

// ── AnchorMap: paragraphIndex + runRange for preserve_original ────────────
export const AnchorMapSchema = z.record(
  z.string(),
  z.object({ paragraphIndex: z.number().int().min(0), runRange: z.tuple([z.number().int().min(0), z.number().int().min(0)]) })
);
export type AnchorMap = z.infer<typeof AnchorMapSchema>;

// ── FlatNode (LLM view) ───────────────────────────────────────────────────
export const FlatNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(["summary", "bullet", "role_header", "skill_group", "edu_item"]),
  text: z.string(),
  context: z.string().optional(),
});
export type FlatNode = z.infer<typeof FlatNodeSchema>;

// ── Model contract — short-id SuggestionOp ────────────────────────────────
export const RawSuggestionSchema = z.object({
  targetId: z.string().min(1),
  op: z.enum(["replace_text", "insert_bullet", "delete_bullet"]),
  after: z.string().optional(),
  rationale: z.string().min(1).max(120),
  category: z.enum(["impact", "clarity", "keyword", "grammar", "length"]),
  severity: z.enum(["low", "medium", "high"]),
});
export type RawSuggestion = z.infer<typeof RawSuggestionSchema>;

// ── Persisted Suggestion (immutable) ───────────────────────────────────────
export const SuggestionOpSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("replace_text"), after: z.array(RunSchema) }),
  z.object({ type: z.literal("insert_bullet"), afterId: z.string().nullable(), value: z.array(RunSchema) }),
  z.object({ type: z.literal("delete_bullet") }),
  z.object({ type: z.literal("reorder"), newIndex: z.number().int().min(0) }),
]);
export type SuggestionOp = z.infer<typeof SuggestionOpSchema>;

export const SuggestionSchema = z.object({
  id: z.string(),
  docId: z.string(),
  docVersion: z.number().int().min(0),
  targetId: z.string(),
  targetPath: z.string(),
  op: SuggestionOpSchema,
  before: z.array(RunSchema),
  rationale: z.string(),
  category: z.enum(["impact", "clarity", "keyword", "grammar", "length", "structure"]),
  severity: z.enum(["low", "medium", "high"]),
  status: z.enum(["pending", "accepted", "rejected", "edited", "stale"]),
  userEditedValue: z.array(RunSchema).optional(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const EditSchema = z.object({
  id: z.string(),
  at: z.string(),
  source: z.enum(["ai", "user"]),
  suggestionId: z.string().optional(),
  targetId: z.string(),
  op: SuggestionOpSchema,
  inverse: SuggestionOpSchema,
});
export type Edit = z.infer<typeof EditSchema>;

// ── RenderJob ──────────────────────────────────────────────────────────────
export const RenderJobSchema = z.object({
  docId: z.string(),
  mode: z.enum(["preserve_original", "template"]),
  templateId: z.string().optional(),
  theme: z
    .object({ font: z.string(), accentColor: z.string(), density: z.enum(["compact", "normal"]) })
    .optional(),
  format: z.enum(["docx", "pdf"]),
});
export type RenderJob = z.infer<typeof RenderJobSchema>;

// ── helpers ─────────────────────────────────────────────────────────────────
export const richTextToPlain = (rt: RichText) => rt.map((r) => r.text).join("");
export const plainToRich = (s: string): RichText => [{ text: s }];
export const hasBracketPlaceholder = (s: string) => /\[X\]/.test(s);
export const digitsIn = (s: string) => (s.match(/\d+/g) || []).join(",");
