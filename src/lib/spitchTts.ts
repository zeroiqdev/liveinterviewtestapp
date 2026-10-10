/**
 * Spitch TTS Client Wrapper
 *
 * Synthesizes speech with Spitch (https://spitch.app), a Nigerian voice AI
 * service, e.g. the voices "lina" (female) and "kingsley" (male). Returns MP3
 * directly. Requires SPITCH_API_KEY.
 *
 * Docs: https://docs.spitch.app/features/speech
 * Limits (Tier 1): 3 concurrent calls and 180 seconds of speech a minute per
 * account — https://docs.spitch.app/concepts/usage-limits
 */

export class SpitchTtsSynthesisError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "SpitchTtsSynthesisError";
  }
}

export interface SpitchVoiceOptions {
  /** ISO 639 language code of the text. */
  language: string;
  /** 0.7–1.2; 1.0 is the voice's natural pace. */
  speed?: number;
}

const ENDPOINT = "https://api.spitch.app/v1/speech";
// Live turns are waiting: one retry, then the caller's backup voice takes over.
const MAX_RETRIES = 1;
const REQUEST_TIMEOUT_MS = 15_000;
const MIN_VALID_BYTES = 1000;

/** Synthesizes speech with a Spitch voice and returns MP3 audio. */
export async function synthesizeSpitchSpeech(
  text: string,
  voiceId: string,
  options: SpitchVoiceOptions
): Promise<Buffer> {
  const apiKey = process.env.SPITCH_API_KEY;
  if (!apiKey) throw new SpitchTtsSynthesisError("SPITCH_API_KEY is not set");

  const body = JSON.stringify({
    text,
    voice: voiceId,
    language: options.language,
    ...(options.speed ? { speed: options.speed } : {}),
    format: "mp3",
  });

  let lastError: SpitchTtsSynthesisError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 200);
        const error = new SpitchTtsSynthesisError(`Spitch TTS returned ${res.status}: ${detail}`, res.status);
        // A rate limit lasts about a minute, and bad requests won't improve:
        // hand over to the backup voice now rather than retrying.
        if (res.status < 500) throw error;
        lastError = error;
        continue;
      }
      const audio = Buffer.from(await res.arrayBuffer());
      if (audio.length < MIN_VALID_BYTES) throw new SpitchTtsSynthesisError("Spitch TTS audio was too short");
      return audio;
    } catch (err) {
      if (err instanceof SpitchTtsSynthesisError && err.statusCode && err.statusCode < 500) throw err;
      lastError = err instanceof SpitchTtsSynthesisError ? err : new SpitchTtsSynthesisError((err as Error).message);
    }
  }
  throw lastError ?? new SpitchTtsSynthesisError("Spitch TTS failed");
}
