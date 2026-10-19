import { describe, it } from "node:test";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { patchDocx, setParagraphText } from "../src/lib/resume/patchDocx";
import { parseResumeTextToStructured, type StructuredResume } from "../src/lib/resumeParser";

/** A small resume in the common layout: company and dates, then title, then bullets typed as text. */
async function sampleDocx(): Promise<Buffer> {
    const run = (text: string, bold = false) => new TextRun({ text, bold, font: "EB Garamond", size: 21 });
    const bullet = (text: string) => new Paragraph({ indent: { left: 360, hanging: 180 }, children: [run(`•  ${text}`)] });
    const doc = new Document({
        sections: [
            {
                children: [
                    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run("Ada Obi", true)] }),
                    new Paragraph({ children: [run("Lagos | ada@example.test")] }),
                    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run("EXPERIENCE", true)] }),
                    new Paragraph({ children: [run("Paystack", true), run("\tJan 2022 – Present", true)] }),
                    new Paragraph({ children: [run("Product Manager   |   payments platform", true)] }),
                    bullet("Led the checkout redesign that raised conversion by 12% across 3 markets."),
                    bullet("Wrote requirement documents for the payouts team."),
                    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run("EDUCATION", true)] }),
                    new Paragraph({ children: [run("BSc Computer Science, University of Lagos")] }),
                ],
            },
        ],
    });
    return Packer.toBuffer(doc);
}

function paragraphs(file: Uint8Array) {
    const xml = new PizZip(file).file("word/document.xml")!.asText();
    return (xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || []).map((p) => ({
        text: (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join(""),
        pPr: p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "",
        rPr: p.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "",
    }));
}

const read = (text: string) => parseResumeTextToStructured(text, "", "Product Manager", "").structured;

describe("putting edits into the person's own Word file", () => {
    it("rewrites a changed line in place with its own formatting, and leaves the rest alone", async () => {
        const original = await sampleDocx();
        const resume: StructuredResume = read("Ada Obi\nLagos | ada@example.test\nEXPERIENCE\nPaystack   Jan 2022 – Present\nProduct Manager | payments platform\n• Led the checkout redesign that raised conversion by 12% across 3 markets.\n• Wrote requirement documents for the payouts team.\nEDUCATION\nBSc Computer Science, University of Lagos");
        resume.jobs[0].bullets[1].text = "Wrote requirement documents for the payouts team, cutting rework for 8 engineers.";
        const { file, unplaced } = await patchDocx(original, resume);
        assert.deepEqual(unplaced, []);
        const before = paragraphs(original);
        const after = paragraphs(file);
        assert.equal(after.length, before.length);
        const changed = after.findIndex((p) => p.text.includes("cutting rework"));
        assert.equal(after[changed].text, "•  Wrote requirement documents for the payouts team, cutting rework for 8 engineers.");
        assert.equal(after[changed].pPr, before[changed].pPr);
        assert.equal(after[changed].rPr, before[changed].rPr);
        // Everything else is exactly as it was.
        after.forEach((p, i) => i !== changed && assert.equal(p.text, before[i].text));
    });

    it("adds a new line after the job's last line, and a summary under the contact line, copying nearby formatting", async () => {
        const original = await sampleDocx();
        const resume = read("Ada Obi\nLagos | ada@example.test\nEXPERIENCE\nPaystack   Jan 2022 – Present\nProduct Manager | payments platform\n• Led the checkout redesign that raised conversion by 12% across 3 markets.\n• Wrote requirement documents for the payouts team.\nEDUCATION\nBSc Computer Science, University of Lagos");
        resume.jobs[0].bullets.push({ id: "new", text: "Ran 20 merchant interviews to shape the payouts roadmap." });
        resume.summary = "Product manager in payments with a record of raising conversion.";
        const { file } = await patchDocx(original, resume);
        const before = paragraphs(original);
        const after = paragraphs(file);
        const texts = after.map((p) => p.text);
        assert.deepEqual(texts.slice(0, 4), ["Ada Obi", "Lagos | ada@example.test", "SUMMARY", "Product manager in payments with a record of raising conversion."]);
        const added = texts.indexOf("•  Ran 20 merchant interviews to shape the payouts roadmap.");
        assert.equal(texts[added - 1], before[6].text, "goes right after the job's last line");
        assert.equal(after[added].pPr, before[6].pPr);
        assert.equal(after[2].pPr, before[2].pPr, "the new heading looks like the existing ones");
    });

    it("keeps leading runs the new text still starts with, like a bold label", () => {
        const p = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Tools:</w:t></w:r><w:r><w:t xml:space="preserve"> Jira, Figma</w:t></w:r></w:p>';
        const out = setParagraphText(p, "Tools: Jira, Figma, Mixpanel");
        assert.match(out, /<w:b\/><\/w:rPr><w:t>Tools:<\/w:t>/);
        assert.match(out, /> Jira, Figma, Mixpanel</);
    });
});
