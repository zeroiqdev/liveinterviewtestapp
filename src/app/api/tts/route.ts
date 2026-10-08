/**
 * TTS API Route — On-Demand Speech Synthesis
 *
 * POST /api/tts
 * Body: { text: string, persona: "coach" | "recruiter", jobRegion: string }
 * Returns: { audioUrl: string, cacheHit: boolean, region: string, voiceLabel: string }
 *
 * Used by the frontend to get audio for both bank questions and dynamic follow-ups.
 * Bank questions should mostly hit cache after pre-warming.
 */

import { NextResponse } from "next/server";
import { getCachedAudio } from "@/services/ttsService";
import type { Persona } from "@/config/voiceConfig";
import { requireAuth } from "@/lib/session";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { serverError } from "@/lib/apiError";

// Interview prompts are a few sentences; anything longer is not a real use.
const MAX_TTS_CHARS = 1500;

export async function POST(request: Request) {
  try {
    const authResult = await requireAuth(request);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const limited = await rateLimit(LIMITS.tts, `user:${authResult.session.email}`);
    if (limited) return limited;

    const body = await request.json();
    const { text, persona, jobRegion } = body as {
      text?: string;
      persona?: string;
      jobRegion?: string;
    };

    // Validate required fields
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Missing or empty 'text' field" },
        { status: 400 }
      );
    }

    if (text.length > MAX_TTS_CHARS) {
      return NextResponse.json(
        { error: `'text' must be at most ${MAX_TTS_CHARS} characters` },
        { status: 400 }
      );
    }

    if (!persona || !["coach", "recruiter"].includes(persona)) {
      return NextResponse.json(
        { error: "'persona' must be 'coach' or 'recruiter'" },
        { status: 400 }
      );
    }

    if (!jobRegion || typeof jobRegion !== "string") {
      return NextResponse.json(
        { error: "Missing 'jobRegion' field" },
        { status: 400 }
      );
    }

    const result = await getCachedAudio(
      text.trim(),
      persona as Persona,
      jobRegion,
      request.headers.get("x-onscript-turn-id") || undefined
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("Rate limit") || message.includes("429")) {
      return serverError("api/tts", err, "Voice service is busy. Please try again shortly.", 429);
    }
    // A provider key problem is ours, not the caller's: don't answer 401.
    return serverError("api/tts", err, "Speech synthesis failed", message.includes("API key") ? 503 : 500);
  }
}
