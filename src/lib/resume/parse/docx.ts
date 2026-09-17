import mammoth from "mammoth";
import { newId, type AnchorMap, type Bullet, type Contact, type ExperienceItem, type ResumeDoc, type RichText, type Section } from "../types";

type DocxWalkOpts = { buffer: Buffer; fileRef?: string };

function run(text: string, bold?: boolean, italic?: boolean, link?: string): RichText[number] {
  return { text, ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}), ...(link ? { link } : {}) };
}

function toRich(htmlFragment: string): RichText {
  // very small html -> RichText: handle <strong>/<b>, <em>/<i>, <a href>
  const runs: RichText = [];
  const re = /<(strong|b|em|i|a)([^>]*)>([^<]*)<\/\1>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(htmlFragment))) {
    if (m[4] !== undefined) {
      const t = m[4].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      if (t) runs.push(run(t));
    } else {
      const tag = m[1].toLowerCase();
      const attrs = m[2] || "";
      const inner = (m[3] || "").replace(/&amp;/g, "&");
      if (!inner) continue;
      if (tag === "a") {
        const href = attrs.match(/href="([^"]+)"/)?.[1] || "";
        runs.push(run(inner, false, false, href));
      } else if (tag === "strong" || tag === "b") runs.push(run(inner, true));
      else if (tag === "em" || tag === "i") runs.push(run(inner, false, true));
      else runs.push(run(inner));
    }
  }
  return runs.length ? runs : [{ text: htmlFragment.replace(/<[^>]+>/g, "") }];
}

function parseContact(lines: string[], htmlLines: string[]): Contact {
  const first = (lines[0] || "").trim();
  const fullName = first.length > 2 && first.length < 48 && !first.includes("@") ? first : "Candidate";
  let headline: string | undefined;
  // second line is often headline like "UI/UX Designer" or "UI/UX Designer | Dubai..."
  const second = (lines[1] || "").trim();
  if (second && second.length < 80 && /(designer|manager|engineer|developer|lead|analyst)/i.test(second) && !/present|20\d\d/i.test(second)) {
    headline = second.split("|")[0].trim().slice(0, 64);
  }
  let email: string | undefined;
  let phone: string | undefined;
  let location: string | undefined;
  const links: Contact["links"] = [];
  const contactProbe = lines.slice(0, 6).join(" | ");
  const emailM = contactProbe.match(/[\w.+-]+@[\w.-]+\.\w+/);
  if (emailM) email = emailM[0];
  const phoneM = contactProbe.match(/\+?[\d][\d\s().-]{7,}\d/);
  if (phoneM) phone = phoneM[0].trim();
  // links from htmlLines (preserve href)
  for (const h of htmlLines.slice(0, 8)) {
    const re = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(h))) {
      const url = mm[1];
      const label = mm[2].trim();
      if (/linkedin|github|portfolio|framer|behance/i.test(label) || url.includes("linkedin") || url.includes("github"))
        links.push({ id: newId("l"), label: label.slice(0, 28), url });
    }
  }
  // fallback: raw urls in contactProbe
  if (links.length === 0) {
    const urlM = contactProbe.match(/https?:\/\/[^\s|]+/g);
    if (urlM) urlM.forEach((u) => links.push({ id: newId("l"), label: "Portfolio", url: u }));
  }
  return { fullName, headline, email, phone, location, links };
}

function classifyHeading(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (/^(product management|work)?\s*experience$/.test(t)) return "experience";
  if (/^(professional\s+)?summary/.test(t)) return "summary";
  if (/^skills/.test(t)) return "skills";
  if (/^education/.test(t)) return "education";
  if (/^projects/.test(t)) return "projects";
  return null;
}

export async function parseDocx(opts: DocxWalkOpts): Promise<{ doc: ResumeDoc; anchorMap: AnchorMap }> {
  const { buffer, fileRef } = opts;
  // Use mammoth to get html + messages; html preserves headings, bold, links, lists
  const { value: html } = await mammoth.convertToHtml({ buffer });
  // Split into block-level html fragments in order
  const blockRe = /<(h[1-6]|p|li)([^>]*)>([\s\S]*?)<\/\1>/gi;
  const blocks: { tag: string; attrs: string; inner: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html))) blocks.push({ tag: m[1].toLowerCase(), attrs: m[2], inner: m[3] });

  const docId = newId("doc");
  const contact: Contact = parseContact(
    blocks.map((b) => b.inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()),
    blocks.map((b) => `<${b.tag}${b.attrs}>${b.inner}</${b.tag}>`)
  );

  const sections: Section[] = [];
  const anchorMap: AnchorMap = {};
  let paragraphIndex = 0;

  let currentSummary: RichText | null = null;
  let currentExperienceItems: ExperienceItem[] = [];
  let currentExpItem: ExperienceItem | null = null;
  let currentExperienceTitle: string = "Work Experience";
  let currentSkills: Section | null = null;
  let currentEducation: Section | null = null;
  let currentProjects: Section | null = null;
  let currentCustom: Section | null = null;

  const DATE_AT_END_RE =
    /(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\s*[-–—]\s*(?:Present|Current|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})|(?:19|20)\d{2}\s*[-–—]\s*(?:Present|Current|\d{4}))\s*$/i;

  const isCompanyDescription = (t: string) =>
    / is on a mission to/i.test(t) ||
    /^.+?\s+(helps|offered|connects|was)\s+(companies|freelancers|recruiters|an)\s+/i.test(t) && t.split(/\s+/).length <= 18;

  const flushExperience = () => {
    if (currentExpItem) {
      currentExperienceItems.push(currentExpItem);
      currentExpItem = null;
    }
    if (currentExperienceItems.length) {
      sections.push({ id: newId("sec"), kind: "experience", title: currentExperienceTitle || "Work Experience", items: currentExperienceItems });
      currentExperienceItems = [];
    }
  };

  for (const blk of blocks) {
    const rawInner = blk.inner;
    const text = rawInner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!text) {
      paragraphIndex++;
      continue;
    }
    // heading detection via tag or heuristics
    const headingKind = blk.tag.startsWith("h") ? classifyHeading(text) : null;
    const heuristicKind = classifyHeading(text);
    const kind = headingKind || heuristicKind;

    if (kind) {
      // flush prior experience
      if (kind !== "experience") flushExperience();
      if (kind === "summary") {
        // next blocks until next heading are summary body
        currentSummary = null;
        // create placeholder; body filled on next non-heading blocks
        sections.push({ id: newId("sec"), kind: "summary", title: text.trim(), body: [] });
      } else if (kind === "experience") {
        currentExperienceTitle = text.trim();
        // already flushed, next blocks are experience items
      } else if (kind === "skills") {
        if (!currentSkills) {
          currentSkills = { id: newId("sec"), kind: "skills", title: "Skills", groups: [] };
          sections.push(currentSkills as Section);
        }
      } else if (kind === "education") {
        if (!currentEducation) {
          currentEducation = { id: newId("sec"), kind: "education", title: "Education", items: [] };
          sections.push(currentEducation as Section);
        }
      } else if (kind === "projects") {
        if (!currentProjects) {
          currentProjects = { id: newId("sec"), kind: "projects", title: "Projects", items: [] };
          sections.push(currentProjects as Section);
        }
      }
      paragraphIndex++;
      continue;
    }

    // summary body: first non-heading after summary heading
    const lastSec = sections[sections.length - 1];
    if (lastSec && lastSec.kind === "summary" && (lastSec as Extract<Section, { kind: "summary" }>).body.length === 0) {
      const rt = toRich(rawInner);
      (lastSec as Extract<Section, { kind: "summary" }>).body = rt;
      const bid = newId("b");
      // anchor for summary body
      anchorMap[bid] = { paragraphIndex, runRange: [0, rt.length - 1] };
      // we don't have a bullet id for summary, use section id? For LLM we use summary node id = section id
      paragraphIndex++;
      continue;
    }

    // experience detection: role header must have date at end + role keyword or separator — prevents contact lines like "UI/UX Designer | Dubai" being mis-classified
    const hasDateAtEnd = DATE_AT_END_RE.test(text);
    const isLikelyRoleHeader =
      hasDateAtEnd &&
      (/\b(manager|engineer|lead|director|developer|analyst|associate|head|designer|founder|consultant|specialist|product manager)\b/i.test(text) && text.length < 160 ||
        text.includes("·") ||
        text.includes("|"));

    if (isLikelyRoleHeader) {
      flushExperience(); // actually we flush per item, not whole section — push previous item
      if (currentExpItem) {
        currentExperienceItems.push(currentExpItem);
      }
      // parse date at end
      let dateRaw = "";
      let headerWithoutDate = text;
      const dm = text.match(DATE_AT_END_RE);
      if (dm) {
        dateRaw = dm[0].trim();
        headerWithoutDate = text.slice(0, dm.index).trim();
      }
      // split role/org on comma or " at "
      let role = headerWithoutDate;
      let org = "Company";
      if (headerWithoutDate.includes(",")) {
        const parts = headerWithoutDate.split(",").map((p) => p.trim()).filter(Boolean);
        role = parts[0] || role;
        org = parts.slice(1).join(", ").trim() || org;
      } else if (headerWithoutDate.toLowerCase().includes(" at ")) {
        const parts = headerWithoutDate.split(/\s+at\s+/i).map((p) => p.trim()).filter(Boolean);
        role = parts[0] || role;
        org = parts[1] || org;
      }
      const parseYearMonth = (raw: string) => {
        const y = raw.match(/(19|20)\d{2}/)?.[0];
        const monMap: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
        const mon = raw.toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/)?.[1];
        return { year: y ? parseInt(y, 10) : new Date().getFullYear(), month: mon ? monMap[mon] : undefined, raw };
      };
      const [startRaw, endRaw] = dateRaw ? dateRaw.split(/\s*[-–—]\s*/) : ["", ""];
      const start = parseYearMonth(startRaw || headerWithoutDate);
      const end: ExperienceItem["end"] = !endRaw || /present|current/i.test(endRaw) ? "present" : parseYearMonth(endRaw);
      const itemId = newId("exp");
      currentExpItem = {
        id: itemId,
        role: role.trim(),
        org: org.trim(),
        start,
        end,
        bullets: [],
        projectHeaders: [] as unknown as string[],
        companyDescription: undefined,
      } as unknown as ExperienceItem;
      // anchor for role header
      const rt = toRich(rawInner);
      anchorMap[itemId] = { paragraphIndex, runRange: [0, Math.max(0, rt.length - 1)] };
      paragraphIndex++;
      continue;
    }

    // company description (unscored, plain)
    if (isCompanyDescription(text) && currentExpItem) {
      (currentExpItem as any).companyDescription = text;
      const rt = toRich(rawInner);
      anchorMap[newId("desc")] = { paragraphIndex, runRange: [0, rt.length - 1] };
      paragraphIndex++;
      continue;
    }

    // bullets: <li> tag or leading glyph
    const isBullet = blk.tag === "li" || /^[•·\-\*\—\–]\s/.test(text);
    if (isBullet) {
      const t = text.replace(/^[•·\-\*\—\–]\s*/, "").trim();
      if (!currentExpItem) {
        // orphan bullet → create experience item
        currentExpItem = {
          id: newId("exp"),
          role: "Experience",
          org: "Company",
          start: { year: new Date().getFullYear(), raw: "" },
          end: "present",
          bullets: [],
        } as unknown as ExperienceItem;
      }
      const rt = toRich(rawInner);
      const bid = newId("b");
      const bullet: Bullet = { id: bid, text: rt };
      currentExpItem.bullets.push(bullet);
      anchorMap[bid] = { paragraphIndex, runRange: [0, rt.length - 1] };
    } else {
      // project subheader like "Onscript - Mock Interview Platform" (preserve order, not a bullet)
      const looksLikeProject = /^[A-Z][A-Za-z0-9&]*\s*[-–—]\s*[A-Z].{3,60}$/.test(text) && text.length < 70;
      if (looksLikeProject && currentExpItem) {
        const bid = newId("b");
        // store as bullet with project flag via id prefix? Keep as bullet but caller can render without dot via kind check on text pattern
        const rt = toRich(rawInner);
        (currentExpItem as any).projectHeaders = (currentExpItem as any).projectHeaders || [];
        (currentExpItem as any).projectHeaders.push(text);
        anchorMap[bid] = { paragraphIndex, runRange: [0, rt.length - 1] };
      } else if (text.length > 12) {
        // fallback: treat as custom paragraph under current experience as bullet-like but could be wrapped continuation
        // Try to append to last bullet if last bullet not ending with punct and current not looking like new bullet
        const last = currentExpItem?.bullets[currentExpItem.bullets.length - 1];
        if (last && !/[.!?]$/.test(last.text.map((r) => r.text).join("").trim()) && !/^(Built|Designed|Defined|Created|Led|Managed|Developed|Implemented|Initiated|Orchestrated|Owned|Established)/i.test(text)) {
          // append
          const addRt = toRich(rawInner);
          last.text = [...last.text, { text: " " }, ...addRt];
          // extend anchor range
          const cur = (anchorMap as any)[last.id] as { paragraphIndex: number; runRange: [number, number] } | undefined;
          if (cur) cur.runRange[1] += addRt.length;
        } else {
          // orphan paragraph → custom section
          if (!currentCustom || currentCustom.kind !== "custom") {
            currentCustom = { id: newId("sec"), kind: "custom", title: "Additional", items: [] } as Section;
            sections.push(currentCustom as Section);
          }
          const rt = toRich(rawInner);
          (currentCustom as Extract<Section, { kind: "custom" }>).items.push({ id: newId("gen"), body: rt });
          anchorMap[newId("p")] = { paragraphIndex, runRange: [0, rt.length - 1] };
        }
      }
    }
    paragraphIndex++;
  }

  // flush any pending experience item
  if (currentExpItem) {
    currentExperienceItems.push(currentExpItem);
    // if we haven't yet pushed a experience section but have items, push one
    const hasExpSection = sections.some((s) => s.kind === "experience");
    if (!hasExpSection && currentExperienceItems.length) {
      sections.push({ id: newId("sec"), kind: "experience", title: currentExperienceTitle || "Work Experience", items: currentExperienceItems });
    } else if (hasExpSection) {
      // merge into existing experience section
      const sec = sections.find((s) => s.kind === "experience") as Extract<Section, { kind: "experience" }> | undefined;
      if (sec) sec.items.push(...currentExperienceItems);
    }
  }

  // ensure at least contact + one section
  if (sections.length === 0) {
    sections.push({ id: newId("sec"), kind: "custom", title: "Additional", items: [{ id: newId("gen"), body: [{ text: "" }] }] } as Section);
  }

  // confidence via helper
  const { computeConfidence } = await import("./confidence");
  const tmpDoc: ResumeDoc = {
    id: docId,
    version: 0,
    source: { kind: "docx", fileRef, parsedAt: new Date().toISOString(), confidence: 0 },
    contact,
    sections,
  };
  const confidence = computeConfidence(tmpDoc);
  tmpDoc.source.confidence = confidence;

  return { doc: tmpDoc, anchorMap };
}
