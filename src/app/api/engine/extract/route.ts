import { NextRequest, NextResponse } from "next/server";
import { extractProfile } from "@/engine/extraction";
import { saveProfile } from "@/engine/sessionStore";
import { getBlueprint } from "@/engine/data";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { candidateId, blueprintId, resumeText, linkedinText, portfolioText } =
            body || {};

        if (!candidateId || !blueprintId) {
            return NextResponse.json(
                { error: "candidateId and blueprintId are required" },
                { status: 400 }
            );
        }
        if (!getBlueprint(blueprintId)) {
            return NextResponse.json(
                { error: `unknown blueprintId: ${blueprintId}` },
                { status: 404 }
            );
        }

        const profile = await extractProfile({
            candidateId,
            blueprintId,
            resumeText,
            linkedinText,
            portfolioText,
        });
        saveProfile(profile);

        return NextResponse.json({ profile });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "extraction failed" },
            { status: 500 }
        );
    }
}
