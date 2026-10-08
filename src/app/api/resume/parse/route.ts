import { NextRequest, NextResponse } from "next/server";
import { extractDocumentText } from "@/lib/documentParser";
import { parseResume } from "@/lib/resume/parse";
import { plainToRich } from "@/lib/resume/types";
import { getSession } from "@/lib/session";
import { LIMITS, clientIp, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

/** Public: onboarding parses a CV before the account exists. Text extraction only, no LLM. */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession(req);
        const limited = await rateLimit(LIMITS.parse, session ? `user:${session.email}` : `ip:${clientIp(req)}`);
        if (limited) return limited;

        const body = await req.json();
        const { fileData = "", resumeText = "", resumeName = "document.pdf", fileRef } = body as any;

        const inputToExtract = fileData || resumeText;
        if (!inputToExtract) {
            return NextResponse.json({ error: "No document data provided" }, { status: 400 });
        }

        // Try new canonical parser first (preserves RichText + AnchorMap)
        let doc: any = null;
        let anchorMap: any = null;
        let usedNewParser = false;
        try {
            let buffer: Buffer | null = null;
            if (typeof inputToExtract === "string" && inputToExtract.startsWith("data:")) {
                const b64 = inputToExtract.split(",")[1] || "";
                buffer = Buffer.from(b64, "base64");
            } else if (Buffer.isBuffer(inputToExtract as any)) {
                buffer = inputToExtract as unknown as Buffer;
            } else if (typeof inputToExtract === "string" && /^[A-Za-z0-9+/=]{100,}$/.test(String(inputToExtract).replace(/\s+/g, ""))) {
                buffer = Buffer.from(String(inputToExtract).replace(/\s+/g, ""), "base64");
            } else if (typeof inputToExtract === "string" && (inputToExtract.startsWith("PK") || inputToExtract.startsWith("%PDF"))) {
                buffer = Buffer.from(inputToExtract as string, "binary");
            }
            if (buffer && buffer.length > 40) {
                const parsed = await parseResume({ buffer, fileName: resumeName, fileRef: fileRef || resumeName });
                doc = parsed.doc;
                anchorMap = parsed.anchorMap;
                usedNewParser = true;
            }
        } catch (e) {
            console.warn("[api/resume/parse] new parser fallback:", (e as Error).message);
        }

        // Fallback / legacy text extraction for backward compat
        const text = await extractDocumentText(inputToExtract, resumeName);
        if (!text || text.length < 10) {
            return NextResponse.json({ error: "Could not extract text from document" }, { status: 422 });
        }

        // If new parser succeeded, return it alongside legacy text
        if (usedNewParser && doc) {
            // Ensure doc has at least the extracted text if parser produced empty sections
            return NextResponse.json({ success: true, text, doc, anchorMap, confidence: doc.source.confidence, usedNewParser: true });
        }

        // No new doc (e.g. manual text) — synthesize a minimal ResumeDoc from plain text so callers can still use canonical model
        if (!doc && resumeText && resumeText.trim().length > 20) {
            const { newId } = await import("@/lib/resume/types");
            doc = {
                id: newId("doc"),
                version: 0,
                source: { kind: "manual", fileRef: fileRef || "manual", parsedAt: new Date().toISOString(), confidence: 0.45 },
                contact: { fullName: resumeText.split("\n")[0]?.slice(0, 48) || "Candidate", links: [] },
                sections: [{ id: newId("sec"), kind: "custom", title: "Additional", items: [{ id: newId("gen"), body: plainToRich(resumeText.slice(0, 6000)) }] }],
            } as any;
            anchorMap = {};
        }

        return NextResponse.json({ success: true, text, ...(doc ? { doc, anchorMap, confidence: doc.source?.confidence } : {}), usedNewParser: !!doc });
    } catch (err) {
        return serverError("api/resume/parse", err, "Failed to parse document");
    }
}
