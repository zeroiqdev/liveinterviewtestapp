import { NextRequest, NextResponse } from "next/server";
import { ResumeDocSchema, AnchorMapSchema, RenderJobSchema } from "@/lib/resume/types";
import { renderPreserveOriginal } from "@/lib/resume/render/preserve";
import { renderTemplate } from "@/lib/resume/render/template";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { doc, anchorMap, job, originalBase64 } = body as {
      doc: unknown;
      anchorMap?: unknown;
      job: unknown;
      originalBase64?: string;
    };
    const parsedDoc = ResumeDocSchema.parse(doc);
    const parsedJob = RenderJobSchema.parse(job);
    const amap = anchorMap ? AnchorMapSchema.parse(anchorMap) : null;

    let buf: Buffer;
    if (parsedJob.mode === "preserve_original" && amap && originalBase64) {
      const origBuf = Buffer.from(originalBase64.replace(/^data:[^,]+,/, ""), "base64");
      buf = await renderPreserveOriginal({ originalBuffer: origBuf, doc: parsedDoc, anchorMap: amap });
    } else {
      buf = await renderTemplate({ doc: parsedDoc, templateId: (parsedJob as any).templateId, theme: (parsedJob as any).theme, format: parsedJob.format as any });
    }

    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": parsedJob.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="resume.${parsedJob.format}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
