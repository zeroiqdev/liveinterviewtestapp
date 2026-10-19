import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ResumeFile from "@/models/ResumeFile";
import { requireAuth } from "@/lib/session";
import { serverError } from "@/lib/apiError";
import { saveResumeFile } from "@/lib/resumeFiles";

export const dynamic = "force-dynamic";

const validId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{1,80}$/.test(id);

/** GET /api/resume/file?resumeId= — the original Word file for one of the user's resumes. */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const resumeId = new URL(req.url).searchParams.get("resumeId");
        if (!validId(resumeId)) return NextResponse.json({ error: "Missing resume." }, { status: 400 });
        await dbConnect();
        const found = await ResumeFile.findOne({ email: auth.session.email, resumeId }).lean();
        if (!found) return NextResponse.json({ error: "No Word file is saved for this resume." }, { status: 404 });
        // A lean read can give the database's Binary type rather than a Buffer.
        const raw = found.data as unknown as Buffer | { buffer: Uint8Array };
        const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw.buffer);
        return new NextResponse(new Uint8Array(bytes), {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Cache-Control": "private, no-store",
            },
        });
    } catch (err) {
        return serverError("api/resume/file GET", err, "Couldn't load your Word file.");
    }
}

/** POST /api/resume/file — { resumeId, name, fileData }: keeps an uploaded Word file. */
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        if ("errorResponse" in auth) return auth.errorResponse;
        const body = await req.json().catch(() => ({}));
        if (!validId(body.resumeId)) return NextResponse.json({ error: "Missing resume." }, { status: 400 });
        const saved = await saveResumeFile(auth.session.email, body.resumeId, String(body.name || "Resume.docx"), body.fileData);
        return NextResponse.json({ saved });
    } catch (err) {
        return serverError("api/resume/file POST", err, "Couldn't keep your Word file.");
    }
}
