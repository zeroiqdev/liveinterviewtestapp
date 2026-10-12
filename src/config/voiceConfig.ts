/**
 * Voice Configuration — Region-to-Voice Mapping
 *
 * Maps {persona, region} → the voice that speaks. Every region currently
 * shares one interviewer and one coach voice; a region can be given its own
 * by pointing its key at a different entry.
 */

import type { VoiceSettings } from "@/lib/elevenlabs";
import type { GeminiVoiceOptions } from "@/lib/geminiTts";
import type { SpitchVoiceOptions } from "@/lib/spitchTts";
import { normalizeRegion } from "@/utils/regionNormalizer";

// ─── Types ──────────────────────────────────────────────────────────

export type Persona = "coach" | "recruiter";
export type VoiceProvider = "elevenlabs" | "yarngpt" | "azure" | "gemini" | "spitch";

/** Azure SSML pacing. Part of the TTS cache key, so changing it re-synthesizes. */
export interface AzureProsody {
  /** SSML prosody rate, e.g. "-5%" (slower) or "0%". */
  rate?: string;
  /** Extra pause inserted after sentence-ending punctuation. */
  sentenceBreakMs?: number;
}

export interface VoiceEntry {
  provider?: VoiceProvider; // Defaults to "elevenlabs"
  voiceId: string;
  voiceSettings?: VoiceSettings;
  prosody?: AzureProsody; // Azure only
  gemini?: GeminiVoiceOptions; // Gemini only
  spitch?: SpitchVoiceOptions; // Spitch only
  label: string; // Human-readable, for logs/debugging
  /** Used when this voice can't synthesize (quota, outage), so audio still plays. */
  fallback?: VoiceEntry;
  /** Typical time to record one sentence; live waits are sized from it. */
  synthesisMs?: number;
}

// Slightly brisker than neutral, with a short pause between sentences.
const INTERVIEW_PROSODY: AzureProsody = { rate: "+6%", sentenceBreakMs: 200 };

// Gemini voices made with voice design, stored in the Google project that owns
// GEMINI_API_KEY. The accent is part of each voice; the style sets the pace.
const GEMINI_INTERVIEW: GeminiVoiceOptions = {
  model: "gemini-3.8-flash-tts",
  style: "warm and professional, at a brisk conversational pace",
};

const AZURE_EZINNE: VoiceEntry = {
  provider: "azure",
  voiceId: "en-NG-EzinneNeural",
  prosody: INTERVIEW_PROSODY,
  label: "Nigerian recruiter (Azure - Ezinne)",
};

const AZURE_ABEO: VoiceEntry = {
  provider: "azure",
  voiceId: "en-NG-AbeoNeural",
  prosody: INTERVIEW_PROSODY,
  label: "Nigerian coach (Azure - Abeo)",
};

/*
 * Spitch voices "Kingsley" (recruiter) and "Lina" (coach), each falling back
 * to the same-gender Azure voice. Switched on with NIGERIAN_VOICE_PROVIDER=spitch;
 * then run the warm-tts-cache script to record the bank, fillers and welcome
 * lines in the new voice. Measured ~3s for a 14s line, first audio ~2s.
 */
const SPITCH_INTERVIEW: SpitchVoiceOptions = { language: "en", speed: 1.06 };
const SPITCH_SYNTHESIS_MS = 2500;

const SPITCH_NIGERIA: Record<Persona, VoiceEntry> = {
  recruiter: {
    provider: "spitch",
    voiceId: "kingsley",
    spitch: SPITCH_INTERVIEW,
    label: "Nigerian recruiter (Spitch - Kingsley)",
    fallback: { ...AZURE_ABEO, label: "Nigerian recruiter (Azure - Abeo)" },
    synthesisMs: SPITCH_SYNTHESIS_MS,
  },
  coach: {
    provider: "spitch",
    voiceId: "lina",
    spitch: SPITCH_INTERVIEW,
    label: "Nigerian coach (Spitch - Lina)",
    fallback: { ...AZURE_EZINNE, label: "Nigerian coach (Azure - Ezinne)" },
    synthesisMs: SPITCH_SYNTHESIS_MS,
  },
};

/*
 * Gemini voices "Ngozi" (recruiter) and "Tunde" (coach), each falling back to
 * the same-gender Azure voice. Gemini's Tier 1 allows only 10 clips a
 * minute and 100 a day — too few for live interviews — so they're switched on
 * with NIGERIAN_VOICE_PROVIDER=gemini only once Google raises those limits.
 */
// Measured 5–7s a sentence on the free tier (vs ~1.5s for Azure).
const GEMINI_SYNTHESIS_MS = 6000;

const GEMINI_NIGERIA: Record<Persona, VoiceEntry> = {
  recruiter: {
    provider: "gemini",
    voiceId: "voice_80w95ndwgpg6",
    gemini: GEMINI_INTERVIEW,
    label: "Nigerian recruiter (Gemini - Ngozi)",
    fallback: AZURE_EZINNE,
    synthesisMs: GEMINI_SYNTHESIS_MS,
  },
  coach: {
    provider: "gemini",
    voiceId: "voice_ufejq00pagr3",
    gemini: GEMINI_INTERVIEW,
    label: "Nigerian coach (Gemini - Tunde)",
    fallback: AZURE_ABEO,
    synthesisMs: GEMINI_SYNTHESIS_MS,
  },
};

// ─── Voice Map ──────────────────────────────────────────────────────

// Azure "Ava" interviews and "Ethan" (MAI-Voice) coaches, in every region:
// one pair of voices for the whole product. Ava is spoken at her natural
// pace (the pace she was chosen at), with a short pause between sentences.
const AVA: VoiceEntry = {
  provider: "azure",
  voiceId: "en-US-AvaMultilingualNeural",
  prosody: { sentenceBreakMs: 200 },
  label: "Interviewer (Azure - Ava)",
  // Measured 1.5–2.2s a sentence.
  synthesisMs: 2000,
};

const ETHAN: VoiceEntry = {
  provider: "azure",
  voiceId: "en-US-Ethan:MAI-Voice-2.1",
  prosody: INTERVIEW_PROSODY,
  label: "Coach (Azure - Ethan)",
  synthesisMs: 2000,
};

const REGIONS = ["nigeria", "uk", "us", "international-default"] as const;

const VOICE_MAP: Record<Persona, Record<string, VoiceEntry>> = {
  recruiter: Object.fromEntries(REGIONS.map((region) => [region, AVA])),
  coach: Object.fromEntries(REGIONS.map((region) => [region, ETHAN])),
};

// ─── Resolver ───────────────────────────────────────────────────────

/**
 * Resolves the voice configuration for a given persona and job region.
 *
 * If the region doesn't have a mapped voice, falls back to "international-default"
 * rather than erroring.
 *
 * @param persona - "coach" or "recruiter"
 * @param jobRegion - Normalized region key (e.g. "nigeria", "uk", "us")
 * @returns The voice configuration for synthesis
 */
export function getVoiceForContext(
  persona: Persona,
  jobRegion: string
): VoiceEntry {
  const personaMap = VOICE_MAP[persona];
  if (!personaMap) {
    console.warn(
      `[voiceConfig] Unknown persona "${persona}", falling back to recruiter`
    );
    return VOICE_MAP.recruiter["international-default"];
  }

  if (jobRegion === "nigeria") {
    const provider = process.env.NIGERIAN_VOICE_PROVIDER;
    if (provider === "spitch") return SPITCH_NIGERIA[persona];
    if (provider === "gemini") return GEMINI_NIGERIA[persona];
  }
  const entry = personaMap[jobRegion];
  if (entry) return entry;

  // Fallback to international-default
  console.info(
    `[voiceConfig] No voice mapped for ${persona}/${jobRegion}, using international-default`
  );
  return personaMap["international-default"];
}

/**
 * Returns all supported region keys for a given persona.
 * Useful for the pre-warming script.
 */
export function getSupportedRegions(persona: Persona): string[] {
  return Object.keys(VOICE_MAP[persona] || {});
}

/**
 * Returns all personas in the voice map.
 */
export function getAllPersonas(): Persona[] {
  return Object.keys(VOICE_MAP) as Persona[];
}

/** Requests a provider can take at once per server instance. */
export function maxConcurrentSyntheses(provider: VoiceProvider): number {
  // Azure: a drafted reply is four clips (acknowledgement + first clause, the
  // first clause alone, the rest, the question), so four record together
  // rather than the last waiting a full recording for a free slot. Its free
  // tier's limit is ~20 requests a minute, which this doesn't change. Spitch's
  // Tier 1 allows three calls at once; Gemini's limit is per minute.
  if (provider === "azure") return 4;
  return provider === "gemini" ? 8 : 3;
}

export interface LiveAudioTiming {
  /** How long /prepare waits for a draft's clips (the candidate is still talking). */
  draftBudgetMs: number;
  /** How long /turn waits for a reply's first clip before answering without it. */
  quickBudgetMs: number;
  /** How long the browser lets fillers cover for a draft still being recorded. */
  lateDraftWaitMs: number;
}

/**
 * Live waits sized to how quickly the voice records: tuned on Azure (~1.5s a
 * sentence) and stretched for slower voices, so a draft recorded a moment
 * after the old cut-off is still used rather than thrown away and redone.
 */
export function liveAudioTiming(persona: Persona, jobRegion: string): LiveAudioTiming {
  const synthesisMs = getVoiceForContext(persona, normalizeRegion(jobRegion)).synthesisMs;
  // Voices without a measured speed keep the waits tuned on Azure.
  if (!synthesisMs) return { draftBudgetMs: 4000, quickBudgetMs: 2500, lateDraftWaitMs: 4000 };
  return {
    draftBudgetMs: Math.max(4000, synthesisMs + 3000),
    quickBudgetMs: Math.max(2500, synthesisMs + 1000),
    lateDraftWaitMs: Math.max(4000, synthesisMs + 1000),
  };
}
