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
import { uploadToStorage, checkStorageExists, withCurrentStorageDomain } from "@/lib/r2Storage";
import { getVoiceForContext, type Persona } from "@/config/voiceConfig";
import { normalizeRegion } from "@/utils/regionNormalizer";
import { traceTurn } from "@/engine/turnTrace";

// ─── In-memory cache & concurrency guard ────────────────────────────

const memoryCache = new Map<string, string>();
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
  const voiceEntry = getVoiceForContext(persona, region);
  const provider = voiceEntry.provider || "elevenlabs";
  // Whatever shapes the audio is part of the cache key, so tuning pacing or
  // voice settings re-synthesizes instead of replaying stale clips.
  const audioSettings = (provider === "azure" ? voiceEntry.prosody : voiceEntry.voiceSettings) as
    | Record<string, unknown>
    | undefined;
  const hash = computeCacheHash(text, voiceEntry.voiceId, audioSettings, provider);
  return { region, voiceEntry, provider, audioSettings, hash };
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
  return audioUrl ? { audioUrl, cacheHit: true, region, voiceLabel: voiceEntry.label } : null;
}

export async function getCachedAudio(
  text: string,
  persona: Persona,
  jobRegion: string,
  turnId?: string
): Promise<CachedAudioResult> {
  const { region, voiceEntry, provider, audioSettings, hash } = resolveVoice(text, persona, jobRegion);
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
      let audioBuffer: Buffer;
      if (provider === "azure") {
        audioBuffer = await synthesizeAzureSpeech(text, voiceId, prosody);
      } else if (provider === "yarngpt") {
        audioBuffer = await synthesizeYarnGptSpeech(text, voiceId);
      } else {
        if (!voiceSettings) {
          throw new Error(`Missing voiceSettings for ElevenLabs voice ${voiceId}`);
        }
        audioBuffer = await synthesizeSpeech(text, voiceId, voiceSettings);
      }

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
