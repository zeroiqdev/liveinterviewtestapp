import dbConnect from "@/lib/mongodb";
import ResumeFile from "@/models/ResumeFile";

/** Word files only, and not huge: a resume .docx is usually under 100 KB. */
export const MAX_RESUME_FILE_BYTES = 3 * 1024 * 1024;
const DOCX_DATA_URL = /^data:application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document;base64,/;

/** The bytes of an uploaded .docx, or null if it isn't one (PDFs and text can't be kept formatted). */
export function docxBytes(fileData: unknown): Buffer | null {
    if (typeof fileData !== "string" || !DOCX_DATA_URL.test(fileData)) return null;
    const bytes = Buffer.from(fileData.replace(DOCX_DATA_URL, ""), "base64");
    // A .docx is a zip: it starts with "PK".
    if (bytes.length < 4 || bytes.length > MAX_RESUME_FILE_BYTES || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
    return bytes;
}

/** Keeps the original Word file for a resume, replacing any earlier one. */
export async function saveResumeFile(email: string, resumeId: string, name: string, fileData: unknown): Promise<boolean> {
    const bytes = docxBytes(fileData);
    if (!bytes) return false;
    await dbConnect();
    await ResumeFile.updateOne({ email, resumeId }, { $set: { name: name.slice(0, 200), data: bytes } }, { upsert: true });
    return true;
}
