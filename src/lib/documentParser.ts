import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extracts plain text from a Buffer, Uint8Array, base64 data URI, or binary string for DOCX, PDF, and TXT files.
 */
export async function extractDocumentText(
    input: string | Buffer | Uint8Array,
    fileName: string = "document.pdf"
): Promise<string> {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";

    let buffer: Buffer;

    if (Buffer.isBuffer(input)) {
        buffer = input;
    } else if (input instanceof Uint8Array) {
        buffer = Buffer.from(input);
    } else if (typeof input === "string") {
        if (input.startsWith("data:")) {
            const base64Part = input.split(",")[1] || "";
            buffer = Buffer.from(base64Part, "base64");
        } else if (/^[A-Za-z0-9+/=]{100,}$/.test(input.replace(/\s+/g, ""))) {
            // Raw base64 string
            buffer = Buffer.from(input.replace(/\s+/g, ""), "base64");
        } else if (input.startsWith("PK\x03\x04") || input.startsWith("%PDF")) {
            // Binary string read via FileReader.readAsText
            buffer = Buffer.from(input, "binary");
        } else {
            // Already plain text / markdown
            if (ext !== "pdf" && ext !== "docx" && ext !== "doc") {
                return input.trim();
            }
            buffer = Buffer.from(input, "binary");
        }
    } else {
        return "";
    }

    // 1. DOCX Extraction via Mammoth — preserve hyperlinks
    if (ext === "docx" || ext === "doc" || buffer.slice(0, 4).toString("hex") === "504b0304") {
        // First try HTML conversion to keep hrefs
        try {
            const htmlResult = await mammoth.convertToHtml({ buffer });
            const html = (htmlResult.value || "").trim();
            if (html && html.length > 20) {
                let withLinks = html
                    .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, (_m, url: string, txt: string) => {
                        const t = txt.trim();
                        const u = url.trim();
                        if (!u || t.toLowerCase() === u.toLowerCase()) return t;
                        // Avoid duplicating if txt already contains url
                        if (t.includes(u)) return t;
                        // If url is mailto: and text is email, don't duplicate (mailto:...)!
                        const cleanU = u.replace(/^mailto:/i, "");
                        if (t.toLowerCase() === cleanU.toLowerCase()) return t;
                        // Keep display + url in parentheses — preserves clickable intent and survives plain-text parse
                        return `${t} (${u})`;
                    })
                    .replace(/<\/p>/gi, "\n")
                    .replace(/<br\s*\/?>/gi, "\n")
                    .replace(/<\/h[1-6]>/gi, "\n")
                    .replace(/<\/li>/gi, "\n")
                    .replace(/<\/tr>/gi, "\n")
                    .replace(/<\/t[dh]>/gi, "\t")
                    .replace(/<[^>]+>/g, " ")
                    .replace(/&amp;/g, "&")
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">")
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/[ \t]+\n/g, "\n")
                    .replace(/\n{3,}/g, "\n\n")
                    .trim();
                // Collapse runs of spaces but keep newlines
                withLinks = withLinks
                    .split("\n")
                    .map((l) => l.replace(/\s{2,}/g, " ").trim())
                    .filter((l) => l.length > 0)
                    .join("\n");
                if (withLinks.length > 20) return withLinks;
            }
        } catch (htmlErr) {
            console.warn("[documentParser] Mammoth html extraction failed:", htmlErr);
        }
        try {
            const result = await mammoth.extractRawText({ buffer });
            const text = (result.value || "").trim();
            if (text.length > 20) {
                // Fallback: try to enrich raw text with hyperlinks via PizZip
                try {
                    const PizZip = (await import("pizzip")).default;
                    const zip = new PizZip(buffer);
                    const docXml = zip.file("word/document.xml")?.asText() || "";
                    const relsXml = zip.file("word/_rels/document.xml.rels")?.asText() || "";
                    const relMap = new Map<string, string>();
                    const relRegex = /Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*TargetMode="External"/g;
                    let m: RegExpExecArray | null;
                    while ((m = relRegex.exec(relsXml))) relMap.set(m[1], m[2]);
                    // Find hyperlinks with display text
                    const linkRegex = /<w:hyperlink[^>]*r:id="([^"]+)"[^>]*>([\s\S]*?)<\/w:hyperlink>/g;
                    let enriched = text;
                    let lm: RegExpExecArray | null;
                    while ((lm = linkRegex.exec(docXml))) {
                        const rId = lm[1];
                        const inner = lm[2];
                        const tMatches = [...inner.matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g)].map((x) => x[1]);
                        const display = tMatches.join("").trim();
                        const url = relMap.get(rId);
                        if (display && url && !enriched.includes(url)) {
                            // inject url after first occurrence of display
                            const escDisplay = display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                            const re = new RegExp(escDisplay + "(?!\\s*\\()", "m");
                            if (re.test(enriched)) enriched = enriched.replace(re, `${display} (${url})`);
                        }
                    }
                    if (enriched.length > 20) return enriched;
                } catch {}
                return text;
            }
        } catch (docxErr) {
            console.warn("[documentParser] Mammoth docx extraction failed, trying fallback:", docxErr);
        }
    }

    // 2. PDF Extraction via unpdf
    if (ext === "pdf" || buffer.slice(0, 4).toString() === "%PDF") {
        try {
            const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
            const pdf = await getDocumentProxy(uint8);
            const { text } = await extractText(pdf, { mergePages: true });
            const cleaned = (text || "").trim();
            if (cleaned.length > 20) {
                return cleaned;
            }
        } catch (pdfErr) {
            console.warn("[documentParser] unpdf extraction failed, trying fallback:", pdfErr);
        }
    }

    // 3. Fallback: Check if printable UTF-8 (only for non-binary formats)
    if (ext !== "pdf" && ext !== "docx" && ext !== "doc") {
        try {
            const utf8 = buffer.toString("utf-8");
            const printable = utf8.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{2,}/g, " ").trim();
            if (printable.length > 30) {
                return printable;
            }
        } catch {}
    }

    if (
        typeof input === "string" &&
        !input.startsWith("data:") &&
        !input.startsWith("%PDF") &&
        !input.startsWith("PK\x03\x04") &&
        ext !== "pdf" &&
        ext !== "docx" &&
        ext !== "doc"
    ) {
        return input.trim();
    }
    return "";
}
