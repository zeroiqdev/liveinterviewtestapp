/**
 * TTS Service — Core Caching Function
 *
 * Orchestrates the full TTS pipeline:
 *   1. Resolve voice config for (persona, region)
 *   2. Check MongoDB cache
 *   3. On miss: synthesize via ElevenLabs, upload to Cloudflare R2, cache in MongoDB
 *   4. Concurrency guard prevents duplicate synthesis for the same key
 *
 * Usage:
 *   // Bank question (should hit cache after pre-warming):
 *   const { audioUrl } = await getCachedAudio(
 *     "Tell me about yourself.",
 *     "recruiter",
 *     "Lagos, Nigeria"  // Raw location — normalizeRegion handles it
 *   );
 *
 *   // Dynamic follow-up (usually cache miss, still checked):
 *   const { audioUrl } = await getCachedAudio(
 *     generatedFollowUpText,
 *     "recruiter",
 *     "Lagos, Nigeria"
 *   );
 */

import { createHash } from "crypto";
import dbConnect from "@/lib/mongodb";
import TtsCacheModel from "@/models/TtsCache";
import { synthesizeSpeech } from "@/lib/elevenlabs";
import { synthesizeYarnGptSpeech } from "@/lib/yarngpt";
import { synthesizeAzureSpeech } from "@/lib/azureTts";
import { synthesizeGeminiSpeech } from "@/lib/geminiTts";
import { synthesizeSpitchSpeech } from "@/lib/spitchTts";
import { uploadToStorage, checkStorageExists, withCurrentStorageDomain } from "@/lib/r2Storage";
import {
  getVoiceForContext,
  maxConcurrentSyntheses,
  type Persona,
  type VoiceEntry,
  type VoiceProvider,
} from "@/config/voiceConfig";
import { normalizeRegion } from "@/utils/regionNormalizer";
import { traceTurn } from "@/engine/turnTrace";

// ─── In-memory cache & concurrency guard ────────────────────────────

const memoryCache = new Map<string, string>();

/*
 * Cap concurrent provider requests per server instance and provider. Azure's
 * free tier allows ~20 requests a minute; an interview start used to fire the
 * opening sentences and ~40 filler clips at once, Azure refused them, and the
 * first question fell back to the browser's voice.
 */
const activeSyntheses = new Map<string, number>();
const synthesisQueues = new Map<string, Array<() => void>>();

async function withSynthesisSlot<T>(provider: VoiceProvider, task: () => Promise<T>): Promise<T> {
  const queue = synthesisQueues.get(provider) ?? [];
  synthesisQueues.set(provider, queue);
  if ((activeSyntheses.get(provider) ?? 0) >= maxConcurrentSyntheses(provider)) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  activeSyntheses.set(provider, (activeSyntheses.get(provider) ?? 0) + 1);
  try {
    return await task();
  } finally {
    activeSyntheses.set(provider, (activeSyntheses.get(provider) ?? 1) - 1);
    queue.shift()?.();
  }
}
const inFlight = new Map<string, Promise<string>>();

// ─── Hash computation ───────────────────────────────────────────────

/**
 * Computes a deterministic SHA-256 hash for cache deduplication.
 * The hash key is: (provider === "elevenlabs" ? "" : `${provider}:`) + text + voiceId + JSON.stringify(voiceSettings || {})
 * ElevenLabs keeps an empty prefix so existing cache entries stay valid.
 */
export function computeCacheHash(
  text: string,
  voiceId: string,
  voiceSettings?: Record<string, unknown>,
  provider: string = "elevenlabs"
): string {
  const prefix = provider === "elevenlabs" ? "" : `${provider}:`;
  const payload = prefix + text + voiceId + JSON.stringify(voiceSettings || {});
  return createHash("sha256").update(payload).digest("hex");
}

// ─── Main entry point ───────────────────────────────────────────────

export interface CachedAudioResult {
  audioUrl: string;
  cacheHit: boolean;
  region: string;    // Normalized region (for debugging)
  voiceLabel: string; // Human-readable voice label
}

/**
 * Returns the audio URL for the given text, persona, and job region.
 * Checks memory & MongoDB cache; on miss, synthesizes, uploads to R2, and caches.
 * Resilient against MongoDB outages — synthesis proceeds even if DB is unavailable.
 *
 * @param text - The text to synthesize
 * @param persona - "coach" or "recruiter"
 * @param jobRegion - Raw job location string (e.g. "Lagos, Nigeria")
 * @returns The audio URL and cache status
 */
function resolveVoice(text: string, persona: Persona, jobRegion: string) {
  const region = normalizeRegion(jobRegion);
  return { region, ...voiceKey(text, getVoiceForContext(persona, region)) };
}

function voiceKey(text: string, voiceEntry: VoiceEntry) {
  const provider = voiceEntry.provider || "elevenlabs";
  // Whatever shapes the audio is part of the cache key, so tuning pacing or
  // voice settings re-synthesizes instead of replaying stale clips.
  const audioSettings = (
    provider === "azure"
      ? voiceEntry.prosody
      : provider === "gemini"
        ? voiceEntry.gemini
        : provider === "spitch"
          ? voiceEntry.spitch
          : voiceEntry.voiceSettings
  ) as Record<string, unknown> | undefined;
  const hash = computeCacheHash(text, voiceEntry.voiceId, audioSettings, provider);
  return { voiceEntry, provider, audioSettings, hash };
}

/**
 * Finds already-stored audio without synthesizing. Order is chosen for live
 * latency: memory (0ms) → MongoDB index (~150ms) → R2 HEAD (~850ms) only when
 * MongoDB is unreachable. Every uploaded clip is indexed in MongoDB, so on a
 * fresh line the slow R2 check would be pure waste.
 */
async function lookupStored(hash: string, turnId?: string): Promise<string | null> {
  const memoryHit = memoryCache.get(hash);
  if (memoryHit) {
    traceTurn(turnId, "tts_cache_hit", { layer: "memory" });
    return memoryHit;
  }

  try {
    await dbConnect();
    const cached = await TtsCacheModel.findById(hash).lean<{ audioUrl?: string }>();
    if (cached?.audioUrl) {
      traceTurn(turnId, "tts_cache_hit", { layer: "database" });
      // Serve from the current storage domain even if the clip was saved under an old one.
      const audioUrl = withCurrentStorageDomain(cached.audioUrl);
      memoryCache.set(hash, audioUrl);
      TtsCacheModel.updateOne(
        { _id: hash },
        { $set: { lastUsedAt: new Date() } }
      ).catch(() => {});
      return audioUrl;
    }
    return null;
  } catch (dbErr) {
    console.warn(
      `[ttsService] MongoDB cache read skipped (${(dbErr as Error).message || "connection error"}). ` +
      `Checking storage directly.`
    );
  }

  // MongoDB unavailable — fall back to the storage existence check.
  try {
    const r2Url = await checkStorageExists(`tts-cache/${hash}.mp3`);
    if (r2Url) {
      traceTurn(turnId, "tts_cache_hit", { layer: "storage" });
      memoryCache.set(hash, r2Url);
      return r2Url;
    }
  } catch {
    // Non-fatal — synthesize
  }
  return null;
}

/**
 * Returns stored audio for this text if it already exists, never
 * synthesizing. Used on the live turn path to grab a pre-warmed clip without
 * risking a synthesis wait.
 */
export async function lookupCachedAudio(
  text: string,
  persona: Persona,
  jobRegion: string,
  turnId?: string
): Promise<CachedAudioResult | null> {
  const { region, voiceEntry, hash } = resolveVoice(text, persona, jobRegion);
  const audioUrl = await lookupStored(hash, turnId);
  if (audioUrl) return { audioUrl, cacheHit: true, region, voiceLabel: voiceEntry.label };
  // While the main voice is down, the backup voice's recordings stand in.
  if (voiceEntry.fallback && coolingDown(voiceEntry)) {
    const backup = voiceKey(text, voiceEntry.fallback);
    const backupUrl = await lookupStored(backup.hash, turnId);
    if (backupUrl) return { audioUrl: backupUrl, cacheHit: true, region, voiceLabel: voiceEntry.fallback.label };
  }
  return null;
}

/*
 * After a voice fails (e.g. its daily free quota is used up), skip straight to
 * its backup for a while instead of waiting on retries for every clip.
 */
const PRIMARY_COOLDOWN_MS = 5 * 60_000;
const cooldownUntil = new Map<string, number>();

/** For scripts that would rather wait for the main voice than use its backup. */
export function resetVoiceCooldowns(): void {
  cooldownUntil.clear();
}

function coolingDown(entry: VoiceEntry): boolean {
  return (cooldownUntil.get(entry.voiceId) ?? 0) > Date.now();
}

export async function getCachedAudio(
  text: string,
  persona: Persona,
  jobRegion: string,
  turnId?: string
): Promise<CachedAudioResult> {
  const region = normalizeRegion(jobRegion);
  const voiceEntry = getVoiceForContext(persona, region);
  const { fallback } = voiceEntry;
  if (fallback && coolingDown(voiceEntry)) {
    // Already-recorded clips in the main voice are still fine to use.
    const stored = await lookupStored(voiceKey(text, voiceEntry).hash, turnId);
    if (stored) return { audioUrl: stored, cacheHit: true, region, voiceLabel: voiceEntry.label };
    return audioForVoice(text, persona, region, fallback, turnId);
  }
  try {
    return await audioForVoice(text, persona, region, voiceEntry, turnId);
  } catch (err) {
    if (!fallback) throw err;
    cooldownUntil.set(voiceEntry.voiceId, Date.now() + PRIMARY_COOLDOWN_MS);
    // Still the same accent and gender, and often already recorded.
    console.warn(
      `[ttsService] ${voiceEntry.label} failed (${(err as Error).message.slice(0, 160)}); ` +
      `using ${fallback.label} for the next ${PRIMARY_COOLDOWN_MS / 60_000} minutes`
    );
    return audioForVoice(text, persona, region, fallback, turnId);
  }
}

async function audioForVoice(
  text: string,
  persona: Persona,
  region: string,
  entry: VoiceEntry,
  turnId?: string
): Promise<CachedAudioResult> {
  const { voiceEntry, provider, audioSettings, hash } = voiceKey(text, entry);
  const { voiceId, voiceSettings, prosody, label } = voiceEntry;

  // Join an identical synthesis already running (e.g. a prefetch) first.
  const runningFlight = inFlight.get(hash);
  if (runningFlight && !memoryCache.has(hash)) {
    traceTurn(turnId, "tts_cache_hit", { layer: "in_flight" });
    const audioUrl = await runningFlight;
    return { audioUrl, cacheHit: true, region, voiceLabel: label };
  }

  const stored = await lookupStored(hash, turnId);
  if (stored) {
    return { audioUrl: stored, cacheHit: true, region, voiceLabel: label };
  }

  // Cache miss — check in-flight guard (may have started during lookup)
  const existingFlight = inFlight.get(hash);
  if (existingFlight) {
    traceTurn(turnId, "tts_cache_hit", { layer: "in_flight" });
    console.info(
      `[ttsService] Awaiting in-flight synthesis for hash ${hash.slice(0, 12)}...`
    );
    const audioUrl = await existingFlight;
    return { audioUrl, cacheHit: true, region, voiceLabel: label };
  }

  // 6. Start synthesis with concurrency guard
  traceTurn(turnId, "tts_cache_miss");
  const synthesisPromise = (async (): Promise<string> => {
    try {
      console.info(
        `[ttsService] Synthesizing "${text.slice(0, 50)}..." ` +
        `via ${provider.toUpperCase()} with ${label} (${voiceId})`
      );

      // Synthesize via selected provider
      const audioBuffer: Buffer = await withSynthesisSlot(provider, () => {
        if (provider === "gemini" && voiceEntry.gemini) return synthesizeGeminiSpeech(text, voiceId, voiceEntry.gemini);
        if (provider === "spitch" && voiceEntry.spitch) return synthesizeSpitchSpeech(text, voiceId, voiceEntry.spitch);
        if (provider === "azure") return synthesizeAzureSpeech(text, voiceId, prosody);
        if (provider === "yarngpt") return synthesizeYarnGptSpeech(text, voiceId);
        if (!voiceSettings) {
          throw new Error(`Missing voiceSettings for ElevenLabs voice ${voiceId}`);
        }
        return synthesizeSpeech(text, voiceId, voiceSettings);
      });

      // Upload to Cloudflare R2 Storage
      const storagePath = `tts-cache/${hash}.mp3`;
      const audioUrl = await uploadToStorage(audioBuffer, storagePath);

      // Store in memory cache
      memoryCache.set(hash, audioUrl);

      // Store in MongoDB cache (fire-and-forget, never block audio return on DB error)
      TtsCacheModel.create({
        _id: hash,
        text,
        persona,
        region,
        provider,
        voiceId,
        voiceSettings: audioSettings || {},
        audioUrl,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      }).then(() => {
        console.info(`[ttsService] Cached in MongoDB: ${hash.slice(0, 12)}...`);
      }).catch((mongoErr) => {
        console.warn(`[ttsService] MongoDB cache save skipped: ${mongoErr?.message || mongoErr}`);
      });

      console.info(
        `[ttsService] Audio ready: ${hash.slice(0, 12)}... → ${audioUrl.slice(0, 60)}`
      );

      return audioUrl;
    } finally {
      inFlight.delete(hash);
    }
  })();

  inFlight.set(hash, synthesisPromise);

  const audioUrl = await synthesisPromise;
  return { audioUrl, cacheHit: false, region, voiceLabel: label };
}
