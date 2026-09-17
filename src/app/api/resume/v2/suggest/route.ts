import { NextRequest, NextResponse } from "next/server";
import { suggestForDoc } from "@/lib/resume/ai/chunk";
import { ResumeDocSchema } from "@/lib/resume/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { doc } = body as { doc: unknown };
    const parsed = ResumeDocSchema.parse(doc);
    const { valid, dropped } = await suggestForDoc(parsed);
    return NextResponse.json({ valid, dropped, count: valid.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
