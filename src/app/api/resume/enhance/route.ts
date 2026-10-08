import { NextRequest, NextResponse } from "next/server";
import { callJSON } from "@/engine/llm";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { extractDocumentText } from "@/lib/documentParser";
import { requireAuth } from "@/lib/session";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

export interface ResumeEnhanceResult {
    improvedDoc: string;
    keyChangesMade: string[];
    headline: string;
}

const ENHANCE_SYSTEM_PROMPT = `You are a world-class executive resume writer and career strategist specializing in top-tier tech and corporate recruiting.
Your task is to rewrite, refine, and elevate a candidate's resume to make it an irresistible, ATS-optimized, elite document tailored to their target role.

Guidelines for rewriting:
1. Elevate bullet points into the Google X-Y-Z formula: "Accomplished [X], as measured by [Y], by doing [Z]".
2. Begin every bullet with active, dynamic verbs (e.g., Engineered, Architected, Spearheaded, Accelerated, Scaled, Streamlined).
3. Inject industry-standard keywords and competencies for the target role naturally.
4. Format the final output in crisp, modern GitHub-flavored Markdown that is clean, readable, and ready for export or printing.
5. Address the user's specific notes or suggestions if provided.

Return a JSON object with this exact structure:
{
  "headline": "<A punchy professional title/headline for the candidate>",
  "keyChangesMade": [
    "<Highlight of rewrite change 1, e.g. 'Quantified engineering impact across backend scaling bullets'>",
    "<Highlight of rewrite change 2>",
    "<Highlight of rewrite change 3>"
  ],
  "improvedDoc": "<The complete, beautifully structured resume in clean Markdown text>"
}`;

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAuth(req);
        if ("errorResponse" in authResult) return authResult.errorResponse;
        const limited = await rateLimit(LIMITS.llm, `user:${authResult.session.email}`);
        if (limited) return limited;

        const body = await req.json();
        const {
            resumeText = "",
            role = "Software Engineer",
            domain = "Software & Engineering",
            userNotes = "",
            resumeId,
            fileData = "",
            resumeName = "Resume.pdf",
        } = body;
        // Saved results always go to the signed-in user, never an email from the body.
        const email = authResult.session.email;

        const inputToExtract = fileData || resumeText;
        let parsedText = await extractDocumentText(inputToExtract, resumeName);

        if (!parsedText || parsedText.length < 30) {
            if (typeof resumeText === "string" && resumeText.trim().length >= 30 && !resumeText.startsWith("PK") && !resumeText.startsWith("%PDF")) {
                parsedText = resumeText.trim();
            }
        }

        if (!parsedText || parsedText.length < 30) {
            return NextResponse.json(
                { error: "Resume text must be at least 30 characters long and contain readable plain text." },
                { status: 400 }
            );
        }

        const userPrompt = `TARGET ROLE: ${role}
DOMAIN: ${domain}
USER CUSTOM NOTES / EDITS: ${userNotes || "Enhance for maximum impact and ATS score."}

ORIGINAL RESUME:
${parsedText.slice(0, 10000)}`;

        const result = await callJSON<ResumeEnhanceResult>({
            system: ENHANCE_SYSTEM_PROMPT,
            user: userPrompt,
            maxTokens: 3500,
            timeoutMs: 45000,
        });

        // Persist improved document to user's MongoDB record if available
        if (email) {
            try {
                await dbConnect();
                const user = await User.findOne({ email: email.toLowerCase().trim() });
                if (user) {
                    if (resumeId) {
                        const targetResume = user.resumes.find((r) => r.id === resumeId);
                        if (targetResume) {
                            targetResume.improvedDoc = result.improvedDoc;
                            targetResume.updatedAt = new Date();
                        }
                    } else if (user.resumes.length > 0) {
                        user.resumes[user.resumes.length - 1].improvedDoc = result.improvedDoc;
                        user.resumes[user.resumes.length - 1].updatedAt = new Date();
                    }
                    await user.save();
                }
            } catch (dbErr) {
                console.warn("[api/resume/enhance] Failed to save improved resume to DB:", dbErr);
            }
        }

        return NextResponse.json({
            success: true,
            result,
        });
    } catch (err) {
        return serverError("api/resume/enhance", err, "Failed to enhance resume");
    }
}
