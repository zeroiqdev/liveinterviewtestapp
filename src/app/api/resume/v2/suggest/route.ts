import { NextRequest, NextResponse } from "next/server";
import { suggestForDoc } from "@/lib/resume/ai/chunk";
import { ResumeDocSchema } from "@/lib/resume/types";
import { requireAuth } from "@/lib/session";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const limited = await rateLimit(LIMITS.llm, `user:${authResult.session.email}`);
    if (limited) return limited;

    const body = await req.json();
    const { doc } = body as { doc: unknown };
    const parsed = ResumeDocSchema.parse(doc);
    const { valid, dropped } = await suggestForDoc(parsed);
    return NextResponse.json({ valid, dropped, count: valid.length });
  } catch (e) {
    return serverError("api/resume/v2/suggest", e, "Failed to generate suggestions");
  }
}
