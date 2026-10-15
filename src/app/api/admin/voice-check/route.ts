import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { synthesizeAzureSpeech } from "@/lib/azureTts";
import { getR2Client, uploadToStorage } from "@/lib/r2Storage";
import { getVoiceForContext } from "@/config/voiceConfig";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/voice-check — can this deployment voice a new line? Tries the
 * interviewer's voice and saving a clip, and says which setting is missing or
 * wrong. Shows whether secrets are set, never their values.
 */
export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if ("errorResponse" in auth) return auth.errorResponse;

    const settings = {
        AZURE_SPEECH_KEY: Boolean(process.env.AZURE_SPEECH_KEY?.trim()),
        // The region isn't secret, and seeing it is the quickest way to spot a wrong one.
        AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION?.trim() || null,
        R2_ACCOUNT_ID: Boolean(process.env.R2_ACCOUNT_ID?.trim()),
        R2_ACCESS_KEY_ID: Boolean(process.env.R2_ACCESS_KEY_ID?.trim()),
        R2_SECRET_ACCESS_KEY: Boolean(process.env.R2_SECRET_ACCESS_KEY?.trim()),
        R2_BUCKET_NAME: process.env.R2_BUCKET_NAME?.trim() || null,
        R2_PUBLIC_DOMAIN: process.env.R2_PUBLIC_DOMAIN?.trim() || null,
    };
    // Spaces or quotes pasted into a setting are a common cause of "invalid key".
    const suspicious = ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION"].filter((name) => {
        const raw = process.env[name];
        return Boolean(raw) && (raw !== raw!.trim() || /^["']|["']$/.test(raw!.trim()));
    });

    const voice = getVoiceForContext("recruiter", "nigeria");
    const result: { voice: string; voicing: string; saving: string; seconds?: number } = { voice: voice.label, voicing: "not tried", saving: "not tried" };
    let audio: Buffer | null = null;
    const started = Date.now();
    try {
        audio = await synthesizeAzureSpeech("This is a voice check.", voice.voiceId, voice.prosody);
        result.voicing = "ok";
    } catch (err) {
        const message = (err as Error).message || "";
        result.voicing = message.includes("must be set")
            ? "Azure settings are missing"
            : message.includes("Invalid Azure Speech key or region")
              ? "Azure rejected the key or region: the key must belong to the speech resource in this region"
              : message.includes("rejected the request")
                ? `Azure doesn't offer the voice ${voice.voiceId} in region "${settings.AZURE_SPEECH_REGION}"`
                : `Azure error: ${message.slice(0, 160)}`;
    }
    result.seconds = Math.round((Date.now() - started) / 100) / 10;

    if (audio) {
        if (!getR2Client()) {
            result.saving = "R2 storage settings are missing, so new lines can't be saved";
        } else {
            try {
                const url = await uploadToStorage(audio, "health/voice-check.mp3");
                result.saving = url.includes("placeholder") ? "R2 storage settings are missing" : "ok";
            } catch (err) {
                result.saving = `R2 refused the upload: ${(err as Error).message.slice(0, 160)}`;
            }
        }
    }

    return NextResponse.json({ ok: result.voicing === "ok" && result.saving === "ok", settings, suspicious, ...result });
}
