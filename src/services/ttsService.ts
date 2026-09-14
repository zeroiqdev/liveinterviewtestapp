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
import { uploadToStorage, checkStorageExists } from "@/lib/r2Storage";
import { getVoiceForContext, type Persona } from "@/config/voiceConfig";
import { normalizeRegion } from "@/utils/regionNormalizer";

// ─── In-memory cache & concurrency guard ────────────────────────────

const memoryCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

// ─── Hash computation ───────────────────────────────────────────────

/**
 * Computes a deterministic SHA-256 hash for cache deduplication.
 * The hash key is: (provider === "yarngpt" ? "yarngpt:" : "") + text + voiceId + JSON.stringify(voiceSettings || {})
 */
export function computeCacheHash(
  text: string,
  voiceId: string,
  voiceSettings?: Record<string, unknown>,
  provider: string = "elevenlabs"
): string {
  const prefix = provider === "yarngpt" ? "yarngpt:" : "";
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
export async function getCachedAudio(
  text: string,
  persona: Persona,
  jobRegion: string
): Promise<CachedAudioResult> {
  // 1. Resolve voice config
  const region = normalizeRegion(jobRegion);
  const voiceEntry = getVoiceForContext(persona, region);
  const provider = voiceEntry.provider || "elevenlabs";
  const { voiceId, voiceSettings, label } = voiceEntry;

  // 2. Compute cache hash
  const hash = computeCacheHash(
    text,
    voiceId,
    voiceSettings as unknown as Record<string, unknown> | undefined,
    provider
  );

  // 3. Check in-memory cache first (instant)
  const memoryHit = memoryCache.get(hash);
  if (memoryHit) {
    return {
      audioUrl: memoryHit,
      cacheHit: true,
      region,
      voiceLabel: label,
    };
  }

  // 4. Check Cloudflare R2 direct persistent storage first (fast CDN HEAD check: ~60ms)
  const storagePath = `tts-cache/${hash}.mp3`;
  try {
    const r2Url = await checkStorageExists(storagePath);
    if (r2Url) {
      memoryCache.set(hash, r2Url);
      return {
        audioUrl: r2Url,
        cacheHit: true,
        region,
        voiceLabel: label,
      };
    }
  } catch {
    // Non-fatal, proceed to check MongoDB
  }

  // 4b. Check MongoDB cache (with non-blocking error handling)
  try {
    await dbConnect();
    const cached = await TtsCacheModel.findById(hash).lean();
    if (cached) {
      const audioUrl = (cached as any).audioUrl;
      memoryCache.set(hash, audioUrl);
      TtsCacheModel.updateOne(
        { _id: hash },
        { $set: { lastUsedAt: new Date() } }
      ).catch(() => {});

      return {
        audioUrl,
        cacheHit: true,
        region,
        voiceLabel: label,
      };
    }
  } catch (dbErr) {
    console.warn(
      `[ttsService] MongoDB cache read skipped (${(dbErr as Error).message || "connection error"}). ` +
      `Proceeding with direct synthesis.`
    );
  }

  // 5. Cache miss — check in-flight guard
  const existingFlight = inFlight.get(hash);
  if (existingFlight) {
    console.info(
      `[ttsService] Awaiting in-flight synthesis for hash ${hash.slice(0, 12)}...`
    );
    const audioUrl = await existingFlight;
    return { audioUrl, cacheHit: true, region, voiceLabel: label };
  }

  // 6. Start synthesis with concurrency guard
  const synthesisPromise = (async (): Promise<string> => {
    try {
      console.info(
        `[ttsService] Synthesizing "${text.slice(0, 50)}..." ` +
        `via ${provider.toUpperCase()} with ${label} (${voiceId})`
      );

      // Synthesize via selected provider
      let audioBuffer: Buffer;
      if (provider === "yarngpt") {
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
        voiceSettings: voiceSettings || {},
        audioUrl,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      }).then(() => {
        console.info(`[ttsService] Cached in MongoDB: ${hash.slice(0, 12)}...`);
      }).catch((mongoErr: any) => {
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
