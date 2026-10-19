/**
 * Puts the editor's changes into the person's own Word file, so the download
 * keeps their fonts, sizes, spacing, bullets and layout. Only the text of
 * changed lines is rewritten; a new line copies the formatting of the line
 * next to it (a new summary copies a heading and a plain paragraph).
 *
 * Lines are matched to paragraphs by their text, not by position, so this
 * works however many times the resume has been edited and saved since it
 * was uploaded.
 */

import type { StructuredResume } from "../resumeParser";

const BULLET_GLYPH = /^[•·●▪◦●•\-–]\s*/;

interface Para {
    xml: string;
    text: string;
    norm: string;
    isBullet: boolean;
    isBold: boolean;
}

export interface PatchResult {
    file: Uint8Array;
    /** Lines that couldn't be placed in the file (shown to the person, never dropped silently). */
    unplaced: string[];
}

function decode(s: string): string {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function escapeXml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Text as compared: no bullet, no case, no punctuation or extra spaces. */
export function normalizeLine(s: string): string {
    return s
        .replace(BULLET_GLYPH, "")
        // The text reader writes links out in full; the file shows only their label.
        .replace(/\(?(?:https?:\/\/|mailto:)[^\s)]+\)?/gi, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}%+]+/gu, " ")
        .trim();
}

function paraText(xml: string): string {
    let out = "";
    const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) out += m[1] !== undefined ? decode(m[1]) : "\t";
    return out;
}

function toPara(xml: string): Para {
    const text = paraText(xml);
    return {
        xml,
        text,
        norm: normalizeLine(text),
        isBullet: BULLET_GLYPH.test(text.trim()) || xml.includes("<w:numPr>"),
        isBold: /<w:b\/>|<w:b w:val="(?:1|true)"\/>/.test(xml),
    };
}

const words = (s: string) => new Set(normalizeLine(s).split(" ").filter((w) => w.length >= 3));

/** How much of a paragraph's wording a rewritten line kept (0 to 1). */
function overlap(line: string, para: Para): number {
    const p = words(para.text);
    if (p.size === 0) return 0;
    const l = words(line);
    let shared = 0;
    for (const w of p) if (l.has(w)) shared++;
    return shared / p.size;
}

/** Runs that carry text, in order, with where each sits in the paragraph XML. */
function textRuns(pXml: string): Array<{ start: number; end: number; xml: string; text: string }> {
    const runs: Array<{ start: number; end: number; xml: string; text: string }> = [];
    const re = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(pXml))) {
        if (!/<w:t[\s>]|<w:tab\/>/.test(m[0])) continue;
        runs.push({ start: m.index, end: m.index + m[0].length, xml: m[0], text: paraText(m[0]) });
    }
    return runs;
}

/**
 * Replaces a paragraph's text and keeps its formatting. Runs at the start
 * that the new text still begins with (a bullet typed as text, a bold
 * "Tools:" label) are kept as they are; the rest of the text takes the
 * formatting of the first run that differs.
 */
export function setParagraphText(pXml: string, newBody: string): string {
    const current = paraText(pXml);
    const prefix = current.trimStart().match(BULLET_GLYPH)?.[0] ?? "";
    const leading = current.slice(0, current.length - current.trimStart().length);
    const target = leading + prefix + newBody.replace(BULLET_GLYPH, "");
    const runs = textRuns(pXml);
    if (runs.length === 0) return pXml;

    let remaining = target;
    let keepUntil = -1;
    for (let i = 0; i < runs.length - 1; i++) {
        if (runs[i].text && remaining.startsWith(runs[i].text)) {
            remaining = remaining.slice(runs[i].text.length);
            keepUntil = i;
        } else break;
    }
    const edit = runs[keepUntil + 1];
    const rPr = edit.xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
    const open = edit.xml.match(/^<w:r\b[^>]*>/)?.[0] ?? "<w:r>";
    const newRun = `${open}${rPr}<w:t xml:space="preserve">${escapeXml(remaining)}</w:t></w:r>`;

    // Rebuild from the end so earlier positions stay valid.
    let out = pXml;
    for (let i = runs.length - 1; i > keepUntil + 1; i--) out = out.slice(0, runs[i].start) + out.slice(runs[i].end);
    out = out.slice(0, edit.start) + newRun + out.slice(edit.end);
    return out;
}

/** A copy of a paragraph that won't clash with the original in Word. */
function cloneParagraph(pXml: string): string {
    return pXml
        .replace(/\sw14:(?:paraId|textId)="[^"]*"/g, "")
        .replace(/<w:bookmark(?:Start|End)\b[^>]*\/>/g, "")
        .replace(/<w:comment(?:RangeStart|RangeEnd)\b[^>]*\/>/g, "")
        .replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:commentReference\b[^>]*\/>[\s\S]*?<\/w:r>/g, "");
}

function contentLines(resume: StructuredResume): Array<{ text: string; group: string }> {
    const out: Array<{ text: string; group: string }> = [];
    for (const job of [...resume.jobs, ...(resume.projects || [])]) {
        for (const b of job.bullets) if (b.text.trim()) out.push({ text: b.text, group: job.id });
    }
    for (const skill of resume.skills || []) out.push({ text: `${skill.category}: ${skill.items}`, group: "skills" });
    return out;
}

function isHeadingPara(p: Para): boolean {
    return /<w:pStyle w:val="Heading[1-6]"\/>/.test(p.xml) || (p.text.trim().length > 2 && p.text.trim().length < 40 && p.text.trim() === p.text.trim().toUpperCase() && !p.isBullet && /[A-Z]/.test(p.text));
}

export async function patchDocx(original: ArrayBuffer | Uint8Array, resume: StructuredResume): Promise<PatchResult> {
    const PizZip = (await import("pizzip")).default;
    const zip = new PizZip(original);
    const file = zip.file("word/document.xml");
    if (!file) throw new Error("This Word file has no document part.");
    const xml = file.asText();

    // Top-level paragraphs, with their positions in the document.
    const spans: Array<{ start: number; end: number }> = [];
    const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
    let m: RegExpExecArray | null;
    while ((m = pRe.exec(xml))) spans.push({ start: m.index, end: m.index + m[0].length });
    const paras = spans.map((s) => toPara(xml.slice(s.start, s.end)));
    // What each paragraph becomes: its new XML, plus paragraphs to add after it.
    const replaced = new Map<number, string>();
    const after = new Map<number, string[]>();
    const used = new Set<number>();
    const unplaced: string[] = [];

    const byNorm = new Map<string, number[]>();
    paras.forEach((p, i) => {
        if (!p.norm) return;
        byNorm.set(p.norm, [...(byNorm.get(p.norm) || []), i]);
    });

    const lines = contentLines(resume);
    // Unchanged lines: same words as a paragraph.
    const placed: Array<number | null> = lines.map((line) => {
        const hits = byNorm.get(normalizeLine(line.text)) || [];
        const free = hits.find((i) => !used.has(i));
        if (free === undefined) return null;
        used.add(free);
        return free;
    });

    // Changed lines replace the paragraph they were rewritten from.
    lines.forEach((line, li) => {
        if (placed[li] !== null) return;
        let best = -1;
        let bestScore = 0.4;
        paras.forEach((p, i) => {
            if (used.has(i) || isHeadingPara(p) || !p.norm) return;
            if (!p.isBullet && p.norm.split(" ").length < 6 && !p.text.includes(":")) return;
            const score = overlap(line.text, p);
            if (score > bestScore) {
                bestScore = score;
                best = i;
            }
        });
        if (best >= 0) {
            used.add(best);
            placed[li] = best;
            replaced.set(best, setParagraphText(paras[best].xml, line.text));
        }
    });

    // New lines go after the previous line of the same job, formatted like it.
    lines.forEach((line, li) => {
        if (placed[li] !== null) return;
        let anchor: number | null = null;
        for (let k = li - 1; k >= 0 && lines[k].group === line.group; k--) {
            if (placed[k] !== null) {
                anchor = placed[k];
                break;
            }
        }
        if (anchor === null) {
            for (let k = li + 1; k < lines.length && lines[k].group === line.group; k++) {
                if (placed[k] !== null) {
                    anchor = placed[k]! - 1;
                    break;
                }
            }
        }
        if (anchor === null || anchor < 0) {
            unplaced.push(line.text);
            return;
        }
        const templateIndex = paras[anchor].isBullet ? anchor : paras.findIndex((p) => p.isBullet);
        const template = templateIndex >= 0 ? paras[templateIndex].xml : paras[anchor].xml;
        after.set(anchor, [...(after.get(anchor) || []), setParagraphText(cloneParagraph(template), line.text)]);
        placed[li] = anchor;
    });

    // The summary: replace the paragraph under an existing summary heading, or
    // add a heading and paragraph under the contact line.
    const summary = (resume.summary || "").trim();
    if (summary) {
        const headingIndex = paras.findIndex((p) => isHeadingPara(p) && /^(professional\s+)?(summary|profile|about( me)?|overview|objective)$/i.test(p.text.trim()));
        const bodyIndex = headingIndex >= 0 ? paras.findIndex((p, i) => i > headingIndex && p.norm) : -1;
        if (bodyIndex >= 0) {
            if (paras[bodyIndex].norm !== normalizeLine(summary)) replaced.set(bodyIndex, setParagraphText(paras[bodyIndex].xml, summary));
        } else {
            // The contact line, found by its wording (it is never rewritten here).
            let contactGuess = -1;
            let contactScore = 0.5;
            paras.slice(0, 6).forEach((p, i) => {
                const score = resume.contact ? overlap(resume.contact, p) : 0;
                if (score > contactScore || (score === contactScore && contactGuess < 0 && score > 0.5)) {
                    contactScore = score;
                    contactGuess = i;
                }
            });
            const contactIndex = contactGuess >= 0 ? contactGuess : Math.min(1, paras.length - 1);
            const headingTemplate = paras.findIndex((p, i) => i > contactIndex && isHeadingPara(p));
            const bodyTemplate = paras.findIndex((p, i) => i > contactIndex && p.norm.split(" ").length >= 2 && !p.isBullet && !p.isBold && !isHeadingPara(p) && !p.text.includes("\t"));
            const heading = headingTemplate >= 0 ? paras[headingTemplate] : null;
            const headingText = heading && heading.text.trim() === heading.text.trim().toUpperCase() ? "SUMMARY" : "Summary";
            const added = [
                ...(heading ? [setParagraphText(cloneParagraph(heading.xml), headingText)] : []),
                setParagraphText(cloneParagraph(paras[bodyTemplate >= 0 ? bodyTemplate : contactIndex].xml), summary),
            ];
            after.set(contactIndex, [...added, ...(after.get(contactIndex) || [])]);
        }
    }

    // Put it back together, last paragraph first so positions hold.
    let out = xml;
    for (let i = spans.length - 1; i >= 0; i--) {
        const extra = after.get(i);
        const body = replaced.get(i) ?? paras[i].xml;
        if (extra || replaced.has(i)) out = out.slice(0, spans[i].start) + body + (extra ? extra.join("") : "") + out.slice(spans[i].end);
    }
    zip.file("word/document.xml", out);
    return { file: zip.generate({ type: "uint8array", compression: "DEFLATE" }), unplaced };
}
