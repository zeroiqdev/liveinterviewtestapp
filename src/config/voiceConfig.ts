/**
 * Voice Configuration — Region-to-Voice Mapping
 *
 * Maps {persona, region} → {voiceId, voiceSettings}.
 * Adding a new region = one new key-value pair. No code changes needed.
 *
 * ── Voice ID Placeholders ──
 * The voiceIds below are ElevenLabs library placeholders.
 * Replace them with voices you've previewed and added to "My Voices"
 * in the ElevenLabs dashboard. Structure stays the same.
 */

import type { VoiceSettings } from "@/lib/elevenlabs";

// ─── Types ──────────────────────────────────────────────────────────

export type Persona = "coach" | "recruiter";
export type VoiceProvider = "elevenlabs" | "yarngpt";

export interface VoiceEntry {
  provider?: VoiceProvider; // Defaults to "elevenlabs"
  voiceId: string;
  voiceSettings?: VoiceSettings;
  label: string; // Human-readable, for logs/debugging
}

// ─── Voice Map ──────────────────────────────────────────────────────

/**
 * Voice assignment per persona × region.
 *
 * "international-default" is the fallback for any unmapped region.
 */
const VOICE_MAP: Record<Persona, Record<string, VoiceEntry>> = {
  recruiter: {
    nigeria: {
      provider: "yarngpt",
      voiceId: "Osagie",
      label: "Nigerian recruiter (YarnGPT - Osagie)",
    },
    uk: {
      provider: "elevenlabs",
      voiceId: "ssHwp0KCFDTGtFbiUYl6",
      voiceSettings: { stability: 0.6, similarityBoost: 0.78, style: 0.25 },
      label: "British recruiter",
    },
    us: {
      provider: "elevenlabs",
      voiceId: "CICpbs1ZGqlhQNbQmCUP",
      voiceSettings: { stability: 0.6, similarityBoost: 0.75, style: 0.2 },
      label: "American recruiter",
    },
    "international-default": {
      provider: "elevenlabs",
      voiceId: "Pc57DSBXmCXyEAmow7lW",
      voiceSettings: { stability: 0.65, similarityBoost: 0.7, style: 0.15 },
      label: "International recruiter",
    },
  },
  coach: {
    nigeria: {
      provider: "yarngpt",
      voiceId: "Idera",
      label: "Nigerian coach (YarnGPT - Idera)",
    },
    uk: {
      provider: "elevenlabs",
      voiceId: "ssHwp0KCFDTGtFbiUYl6",
      voiceSettings: { stability: 0.55, similarityBoost: 0.75, style: 0.25 },
      label: "British coach",
    },
    us: {
      provider: "elevenlabs",
      voiceId: "CICpbs1ZGqlhQNbQmCUP",
      voiceSettings: { stability: 0.55, similarityBoost: 0.72, style: 0.25 },
      label: "American coach",
    },
    "international-default": {
      provider: "elevenlabs",
      voiceId: "Pc57DSBXmCXyEAmow7lW",
      voiceSettings: { stability: 0.6, similarityBoost: 0.68, style: 0.2 },
      label: "International coach",
    },
  },
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
