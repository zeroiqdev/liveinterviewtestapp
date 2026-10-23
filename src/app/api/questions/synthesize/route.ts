import { NextRequest, NextResponse } from "next/server";
import { synthesizeQuestionsForRole, synthesizeQuestionsForSession } from "@/engine/questionSynthesizer";
import { requireAdmin } from "@/lib/session";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

export async function POST(req: NextRequest) {
    try {
        // Fills the shared question bank, so only admins may run it.
        const authResult = await requireAdmin(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }
        const limited = await rateLimit(LIMITS.llm, `user:${authResult.session.email}`);
        if (limited) return limited;

        const body = await req.json();
        const { role, domain, company, interviewType, count } = body || {};

        if (!role) {
            return NextResponse.json({ error: "role is required" }, { status: 400 });
        }

        if (interviewType || company) {
            const questions = await synthesizeQuestionsForSession({
                role,
                company,
                interviewType,
                count: Math.min(Math.max(Number(count) || 4, 1), 10),
            });
            return NextResponse.json({ success: true, count: questions.length, questions });
        }

        // Pre-synthesize for role across key interview types
        await synthesizeQuestionsForRole(role, domain);

        return NextResponse.json({ success: true, message: `Questions pre-synthesized for role ${role}` });
    } catch (err) {
        return serverError("api/questions/synthesize", err, "Synthesis failed");
    }
}
