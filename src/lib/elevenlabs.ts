/**
 * ElevenLabs TTS Client Wrapper
 *
 * Wraps the @elevenlabs/elevenlabs-js SDK with retry logic,
 * result validation, and typed interfaces.
 */

export interface VoiceSettings {
  stability: number;        // 0–1: Lower = more expressive, higher = more consistent
  similarityBoost: number;  // 0–1: How closely to match the original voice
  style?: number;           // 0–1: Style exaggeration (v2 models only)
  speakerBoost?: boolean;   // Boost speaker clarity
}

export class ElevenLabsSynthesisError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryCount?: number
  ) {
    super(message);
    this.name = "ElevenLabsSynthesisError";
  }
}

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const MODEL_ID = "eleven_multilingual_v2";
const MAX_RETRIES = 3;
const MIN_VALID_BYTES = 1000; // Reject anything smaller than 1KB as invalid audio

/**
 * Synthesizes speech via ElevenLabs TTS API.
 *
 * Uses direct REST calls for reliability. Retries with exponential backoff
 * on transient failures. Validates the result is a non-trivial audio buffer.
 *
 * @returns A Buffer containing the MP3 audio data.
 * @throws ElevenLabsSynthesisError if all retries are exhausted or the API key is invalid.
 */
export async function synthesizeSpeech(
  text: string,
  voiceId: string,
  voiceSettings: VoiceSettings
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new ElevenLabsSynthesisError(
      "ELEVENLABS_API_KEY environment variable is not set"
    );
  }

  if (!text || !text.trim()) {
    throw new ElevenLabsSynthesisError("Cannot synthesize empty text");
  }

  if (!voiceId) {
    throw new ElevenLabsSynthesisError("voiceId is required");
  }

  const url = `${ELEVENLABS_API_URL}/${voiceId}`;
  const body = JSON.stringify({
    text: text.trim(),
    model_id: MODEL_ID,
    voice_settings: {
      stability: voiceSettings.stability,
      similarity_boost: voiceSettings.similarityBoost,
      ...(voiceSettings.style !== undefined && { style: voiceSettings.style }),
      ...(voiceSettings.speakerBoost !== undefined && {
        use_speaker_boost: voiceSettings.speakerBoost,
      }),
    },
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
          Accept: "audio/mpeg",
        },
        body,
      });

      // Non-retryable errors
      if (response.status === 401) {
        throw new ElevenLabsSynthesisError(
          "Invalid ElevenLabs API key",
          401,
          attempt
        );
      }

      if (response.status === 422) {
        const errorBody = await response.text().catch(() => "unknown");
        throw new ElevenLabsSynthesisError(
          `ElevenLabs validation error: ${errorBody}`,
          422,
          attempt
        );
      }

      // Rate limit — retryable
      if (response.status === 429) {
        const retryAfter = parseInt(
          response.headers.get("retry-after") || "5",
          10
        );
        console.warn(
          `[elevenlabs] Rate limited (429). Waiting ${retryAfter}s before retry ${attempt + 1}/${MAX_RETRIES}`
        );
        await sleep(retryAfter * 1000);
        continue;
      }

      // Other server errors — retryable
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "unknown");
        lastError = new ElevenLabsSynthesisError(
          `ElevenLabs API error ${response.status}: ${errorBody}`,
          response.status,
          attempt
        );
        console.warn(
          `[elevenlabs] API error ${response.status} on attempt ${attempt + 1}/${MAX_RETRIES}`
        );
        await sleep(Math.pow(2, attempt) * 1000); // 1s, 2s, 4s
        continue;
      }

      // Success — read the audio buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Validate: reject suspiciously small results (partial/empty)
      if (buffer.byteLength < MIN_VALID_BYTES) {
        lastError = new ElevenLabsSynthesisError(
          `ElevenLabs returned suspiciously small audio (${buffer.byteLength} bytes). ` +
          `Minimum threshold is ${MIN_VALID_BYTES} bytes.`,
          undefined,
          attempt
        );
        console.warn(
          `[elevenlabs] Audio too small (${buffer.byteLength}B) on attempt ${attempt + 1}/${MAX_RETRIES}`
        );
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      return buffer;
    } catch (err) {
      // Re-throw non-retryable errors immediately
      if (
        err instanceof ElevenLabsSynthesisError &&
        (err.statusCode === 401 || err.statusCode === 422)
      ) {
        throw err;
      }

      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[elevenlabs] Attempt ${attempt + 1}/${MAX_RETRIES} failed:`,
        lastError.message
      );

      if (attempt < MAX_RETRIES - 1) {
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }

  throw new ElevenLabsSynthesisError(
    `ElevenLabs synthesis failed after ${MAX_RETRIES} attempts. Last error: ${lastError?.message || "unknown"}`,
    undefined,
    MAX_RETRIES
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
