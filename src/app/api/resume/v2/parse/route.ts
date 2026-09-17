import { NextRequest, NextResponse } from "next/server";
import { parseResume } from "@/lib/resume/parse";
import { ResumeDocSchema, AnchorMapSchema } from "@/lib/resume/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileData, fileName = "resume.docx", fileRef } = body as { fileData?: string; fileName?: string; fileRef?: string };
    if (!fileData) return NextResponse.json({ error: "fileData required (base64 data URL or buffer)" }, { status: 400 });
    // fileData is expected as data URL or base64; convert to Buffer
    let buffer: Buffer;
    if (typeof fileData === "string" && fileData.startsWith("data:")) {
      const b64 = fileData.split(",")[1] || "";
      buffer = Buffer.from(b64, "base64");
    } else if (typeof fileData === "string" && /^[A-Za-z0-9+/=]{100,}$/.test(fileData.replace(/\s+/g, ""))) {
      buffer = Buffer.from(fileData.replace(/\s+/g, ""), "base64");
    } else if (Buffer.isBuffer(fileData as any)) {
      buffer = fileData as unknown as Buffer;
    } else {
      buffer = Buffer.from(String(fileData), "binary");
    }
    const { doc, anchorMap } = await parseResume({ buffer, fileName, fileRef: fileRef || fileName });
    // validate
    ResumeDocSchema.parse(doc);
    AnchorMapSchema.parse(anchorMap);
    return NextResponse.json({ doc, anchorMap, confidence: doc.source.confidence });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
