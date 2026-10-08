import { NextRequest, NextResponse } from "next/server";
import { extractProfile } from "@/engine/extraction";
import { saveProfile } from "@/engine/sessionStore";
import { ownerIdFor } from "@/engine/sessionAccess";
import { getBlueprint } from "@/engine/data";
import { requireAuth } from "@/lib/session";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

export async function POST(req: NextRequest) {
    try {
        const authResult = await requireAuth(req);
        if ("errorResponse" in authResult) {
            return authResult.errorResponse;
        }
        const limited = await rateLimit(LIMITS.llm, `user:${authResult.session.email}`);
        if (limited) return limited;

        const body = await req.json();
        const { blueprintId, resumeText, linkedinText, portfolioText } =
            body || {};
        // Profiles are keyed by the authenticated user, matching session start.
        const candidateId = ownerIdFor(authResult.session);

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
        await saveProfile(profile);

        return NextResponse.json({ profile });
    } catch (err) {
        return serverError("api/engine/extract", err, "extraction failed");
    }
}
