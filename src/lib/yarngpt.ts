/**
 * YarnGPT TTS Client Wrapper
 *
 * Provides text-to-speech synthesis specifically tuned for authentic Nigerian accents.
 * Supports male and female Nigerian voices (e.g. Osagie, Femi, Idera, Regina).
 */

export class YarnGptSynthesisError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryCount?: number
  ) {
    super(message);
    this.name = "YarnGptSynthesisError";
  }
}

const YARNGPT_API_URL = "https://yarngpt.ai/api/v1/tts";
const MAX_RETRIES = 3;
const MIN_VALID_BYTES = 1000; // Reject suspiciously small/truncated audio

/**
 * Synthesizes speech via YarnGPT TTS API.
 *
 * @param text - The text to synthesize into speech.
 * @param voice - YarnGPT voice identifier (e.g., "Osagie", "Idera", "Femi", "Regina").
 * @returns A Buffer containing the MP3 audio data.
 * @throws YarnGptSynthesisError if all retries fail or configuration is invalid.
 */
export async function synthesizeYarnGptSpeech(
  text: string,
  voice: string = "Osagie"
): Promise<Buffer> {
  const apiKey = process.env.YARNGPT_API_KEY;
  if (!apiKey) {
    throw new YarnGptSynthesisError(
      "YARNGPT_API_KEY environment variable is not set"
    );
  }

  if (!text || !text.trim()) {
    throw new YarnGptSynthesisError("Cannot synthesize empty text");
  }

  const payload = JSON.stringify({
    text: text.trim(),
    voice,
    response_format: "mp3",
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(YARNGPT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          Accept: "audio/mp3, audio/mpeg, */*",
        },
        body: payload,
      });

      // Authentication error — non-retryable
      if (response.status === 401) {
        throw new YarnGptSynthesisError(
          "Invalid YarnGPT API key",
          401,
          attempt
        );
      }

      // Client validation error — non-retryable
      if (response.status === 400 || response.status === 422) {
        const errorBody = await response.text().catch(() => "unknown");
        throw new YarnGptSynthesisError(
          `YarnGPT validation error: ${errorBody}`,
          response.status,
          attempt
        );
      }

      // Rate limit — retryable with backoff
      if (response.status === 429) {
        const retryAfter = parseInt(
          response.headers.get("retry-after") || "5",
          10
        );
        console.warn(
          `[yarngpt] Rate limited (429). Waiting ${retryAfter}s before retry ${attempt + 1}/${MAX_RETRIES}`
        );
        await sleep(retryAfter * 1000);
        continue;
      }

      // Server error — retryable
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "unknown");
        lastError = new YarnGptSynthesisError(
          `YarnGPT API error ${response.status}: ${errorBody}`,
          response.status,
          attempt
        );
        console.warn(
          `[yarngpt] API error ${response.status} on attempt ${attempt + 1}/${MAX_RETRIES}`
        );
        await sleep(Math.pow(2, attempt) * 1000); // 1s, 2s, 4s
        continue;
      }

      // Success: read audio arrayBuffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.byteLength < MIN_VALID_BYTES) {
        lastError = new YarnGptSynthesisError(
          `YarnGPT returned suspiciously small audio (${buffer.byteLength} bytes).`,
          undefined,
          attempt
        );
        console.warn(
          `[yarngpt] Audio too small (${buffer.byteLength}B) on attempt ${attempt + 1}/${MAX_RETRIES}`
        );
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      return buffer;
    } catch (err) {
      if (
        err instanceof YarnGptSynthesisError &&
        (err.statusCode === 401 || err.statusCode === 400 || err.statusCode === 422)
      ) {
        throw err;
      }

      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[yarngpt] Attempt ${attempt + 1}/${MAX_RETRIES} failed:`,
        lastError.message
      );

      if (attempt < MAX_RETRIES - 1) {
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }

  throw new YarnGptSynthesisError(
    `YarnGPT synthesis failed after ${MAX_RETRIES} attempts. Last error: ${lastError?.message || "unknown"}`,
    undefined,
    MAX_RETRIES
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
