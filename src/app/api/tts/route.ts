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

export async function POST(request: Request) {
  try {
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
      jobRegion
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/tts] Error:", err);

    const message =
      err instanceof Error ? err.message : "Internal server error";
    const status =
      message.includes("API key") ? 401 :
      message.includes("Rate limit") || message.includes("429") ? 429 :
      500;

    return NextResponse.json({ error: message }, { status });
  }
}
