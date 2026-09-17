import { newId } from "./src/lib/resume/types";
import { flattenDoc } from "./src/lib/resume/ai/flatten";
import { buildShortIdMap } from "./src/lib/resume/ai/shortId";
import { serializeFlat } from "./src/lib/resume/ai/serialize";

const doc: any = {
  id: newId("doc"),
  version: 0,
  source: { kind: "pdf", parsedAt: new Date().toISOString(), confidence: 0.52 },
  contact: {
    fullName: "Kalpesh Prithyani",
    headline: "UI/UX Designer",
    email: "kalpeshprithyani@gmail.com",
    location: "Dubai, UAE",
    links: [
      { id: newId("l"), label: "Portfolio", url: "https://www.kalpeshp.in" },
      { id: newId("l"), label: "LinkedIn", url: "https://www.linkedin.com/in/kalpesh-prithyani" },
    ],
  },
  sections: [
    {
      id: newId("sec"),
      kind: "experience",
      title: "Work Experience",
      items: [
        {
          id: "exp-growthday",
          role: "UI/UX Designer",
          org: "GrowthDay",
          location: "Remote",
          start: { year: 2021, month: 10, raw: "October 2021" },
          end: "present" as const,
          bullets: [
            { id: "b-growth-1", text: [{ text: "Setting up the foundation for a design system, Storybook, and brand visuals to avoid future debts, handling DesignOps, and promoting good design practices" }] },
            { id: "b-growth-2", text: [{ text: "Designed the enterprise console for admins to manage employee accounts" }] },
            { id: "b-growth-3", text: [{ text: "Testing, designing & gamification of features to ensure users are motivated to achieve more every day." }] },
          ],
        },
        {
          id: "exp-ola",
          role: "UI/UX Designer",
          org: "Ola",
          location: "Bangalore, India",
          start: { year: 2021, month: 7, raw: "July 2021" },
          end: { year: 2021, month: 9, raw: "September 2021" },
          bullets: [
            { id: "b-ola-1", text: [{ text: "Designed the MVP product for their new grocery delivery app" }] },
          ],
        },
        {
          id: "exp-cactus",
          role: "UI/UX Design Intern",
          org: "Cactus Communication",
          location: "Remote",
          start: { year: 2021, month: 1, raw: "January 2021" },
          end: { year: 2021, month: 6, raw: "June 2021" },
          bullets: [
            { id: "b-cactus-1", text: [{ text: "Designed journal recommendation system as an add-on feature to Pubsure through user interviews & desk study." }] },
            { id: "b-cactus-2", text: [{ text: "Improved the conversion rates of the product by tracking daily metrics & clicks (Hotjar, Clevertap)." }] },
          ],
        },
      ],
    },
    {
      id: newId("sec"),
      kind: "skills",
      title: "Skills",
      groups: [
        { id: newId("g"), category: "Design", items: "Ideation, Userflows, Information Architecture, Design thinking, UI graphics" },
        { id: newId("g"), category: "Research", items: "User interviews & surveys, Usability & Concept Testing, A/B Testing" },
        { id: newId("g"), category: "Programming", items: "(Strong) HTML, CSS, Javascript (Familiar) React, Redux" },
      ],
    },
  ],
};

console.log("=== Doc confidence", doc.source.confidence, "UI must warn? ", doc.source.confidence < 0.6 ? "YES - show banner + disable preserve_original export" : "no");
const flat = flattenDoc(doc);
console.log("\n=== FlatNodes (LLM sees only this, no markup) ===");
flat.forEach(n => console.log(`[${n.kind.padEnd(12)}] id=${n.id.slice(0,8)} text="${n.text.slice(0,80)}" context="${(n.context||"").slice(0,40)}"`));

const { map, reverse } = buildShortIdMap(flat);
console.log("\n=== ShortId map (per-request, opaque) ===");
for (const [short, real] of map.entries()) console.log(short, "->", real.slice(0,8), flat.find(f=>f.id===real)?.text.slice(0,40));

const serialized = serializeFlat(flat, reverse);
console.log("\n=== Serialized (indented hierarchy, what LLM actually sees) ===\n" + serialized.slice(0,1200));

console.log("\n=== Model contract check ===");
console.log("If LLM returns {targetId:'b-growth-1', op:'replace_text', after:'Streamlined design debt by [X]%...'} with digits [X] placeholder, validate passes. If it returns fabricated 'increased revenue by 300%' with digits not in source and not in [] , validate drops with fabricated_digits.");

// Simulate a mock LLM response
const mockRaw = [
  { targetId: reverse.get("b-growth-1")!, op: "replace_text", after: "Established design system and Storybook, reducing design debt by [X]% and unifying brand visuals across squads", rationale: "vague scope, missing metric", category: "impact", severity: "medium" },
  { targetId: "b-FAKE", op: "replace_text", after: "Made up", rationale: "test", category: "impact", severity: "low" },
];
console.log("\nMock raw from LLM:", JSON.stringify(mockRaw, null, 2));
import { validateSuggestions } from "./src/lib/resume/ai/validate";
const nodesById = new Map(flat.map(n=>[n.id, n]));
const { valid, dropped } = validateSuggestions(mockRaw, map, nodesById);
console.log("\nValid:", valid.length, "Dropped:", dropped);
console.log("Dropped reasons:", dropped.map(d=>d.reason));

console.log("\n=== Render modes ===");
console.log("preserve_original: requires docx + anchorMap, walks anchorMap, splits runs inheriting w:rPr, never regenerates. For Kalpesh PDF (no anchorMap) → falls back to template.");
console.log("template: renders ResumeDoc via docx template (classic serif / modern sans) with theme font/accent, or HTML→Chromium pdf");
