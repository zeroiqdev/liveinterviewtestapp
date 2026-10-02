import { NextRequest, NextResponse } from "next/server";
import { synthesizeQuestionsForRole, synthesizeQuestionsForSession } from "@/engine/questionSynthesizer";
import { requireAuth } from "@/lib/session";

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAuth(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }

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
                count: count || 4,
            });
            return NextResponse.json({ success: true, count: questions.length, questions });
        }

        // Pre-synthesize for role across key interview types
        await synthesizeQuestionsForRole(role, domain);

        return NextResponse.json({ success: true, message: `Questions pre-synthesized for role ${role}` });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Synthesis failed" }, { status: 500 });
    }
}
