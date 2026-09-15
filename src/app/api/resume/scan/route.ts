import { NextRequest, NextResponse } from "next/server";
import { callJSON } from "@/engine/llm";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

export interface ResumeScanResult {
    score: number;
    summary: string;
    strengths: string[];
    suggestions: Array<{
        category: "Impact & Metrics" | "Role Alignment & Keywords" | "Structure & Clarity" | "Action Verbs & Brevity";
        feedback: string;
        recommendation: string;
    }>;
    missingKeywords: string[];
}

const SCAN_SYSTEM_PROMPT = `You are a top-tier executive talent scout and technical resume reviewer at top tech companies.
Your job is to objectively analyze a candidate's resume/CV text against their targeted job role.

Evaluate the resume across these key dimensions:
1. Impact & Quantifiable Results (metrics, numbers, ROI, outcomes vs passive job descriptions).
2. Role Alignment & ATS Keyword Density (specific tools, methodologies, competencies expected for the role).
3. Brevity & Action Verb Strength (starting bullets with strong verbs, avoiding passive phrasing).
4. Clarity & Modern Formatting.

Return a JSON object with this exact structure:
{
  "score": <number 0-100 representing readiness and ATS strength for the target role>,
  "summary": "<2-3 sentence executive critique of the resume's positioning, impact, and main opportunity>",
  "strengths": [
    "<Highlight 1 citing specific experience or technical skill demonstrated effectively>",
    "<Highlight 2>",
    "<Highlight 3>"
  ],
  "suggestions": [
    {
      "category": "<'Impact & Metrics' | 'Role Alignment & Keywords' | 'Structure & Clarity' | 'Action Verbs & Brevity'>",
      "feedback": "<Specific observation of what is lacking in their bullet points or summary>",
      "recommendation": "<Concrete, actionable revision advice on how to rewrite or improve that section>"
    }
  ],
  "missingKeywords": [
    "<Keyword 1 missing for this role>",
    "<Keyword 2>",
    "<Keyword 3>",
    "<Keyword 4>"
  ]
}

Provide 3 to 5 high-impact suggestions that will genuinely boost interview callbacks.
Be constructive, specific, and directly relevant to the target role.`;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { resumeText, role = "Software Engineer", domain = "Software & Engineering", email, resumeName = "My_Resume.pdf" } = body;

        if (!resumeText || typeof resumeText !== "string" || resumeText.trim().length < 40) {
            return NextResponse.json(
                { error: "Resume text must be at least 40 characters long." },
                { status: 400 }
            );
        }

        const userPrompt = `TARGET ROLE: ${role}\nDOMAIN: ${domain}\n\nRESUME CONTENT:\n${resumeText.slice(0, 10000)}`;

        const result = await callJSON<ResumeScanResult>({
            system: SCAN_SYSTEM_PROMPT,
            user: userPrompt,
            maxTokens: 2500,
            timeoutMs: 35000,
        });

        // Optionally persist scan to user record if email is provided
        if (email) {
            try {
                await dbConnect();
                const user = await User.findOne({ email: email.toLowerCase().trim() });
                if (user) {
                    const resumeId = `cv_${Date.now()}`;
                    user.resumes.push({
                        id: resumeId,
                        name: resumeName,
                        rawText: resumeText,
                        score: result.score,
                        summary: result.summary,
                        strengths: result.strengths,
                        suggestions: result.suggestions,
                        missingKeywords: result.missingKeywords,
                        improvedDoc: "",
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    });
                    await user.save();
                }
            } catch (dbErr) {
                console.warn("[api/resume/scan] Failed to persist scan to DB:", dbErr);
            }
        }

        return NextResponse.json({
            success: true,
            result,
        });
    } catch (err) {
        console.error("[api/resume/scan] Error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to scan resume" },
            { status: 500 }
        );
    }
}
