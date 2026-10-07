/**
 * Azure Speech TTS Client Wrapper
 *
 * Synthesizes speech with Azure neural voices via the REST API, e.g. the
 * Nigerian English voices "en-NG-AbeoNeural" (male) and "en-NG-EzinneNeural"
 * (female). Requires AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (e.g. "westus3").
 *
 * Docs: https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech
 */

import type { AzureProsody } from "@/config/voiceConfig";

export class AzureTtsSynthesisError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryCount?: number
  ) {
    super(message);
    this.name = "AzureTtsSynthesisError";
  }
}

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 15_000;
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const MIN_VALID_BYTES = 1000; // Reject suspiciously small/truncated audio

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Escaped SSML body: a clear pause after each sentence, wrapped in a prosody
 * rate when one is configured. */
function buildSpokenBody(text: string, prosody?: AzureProsody): string {
  let body = escapeXml(text);
  if (prosody?.sentenceBreakMs) {
    // Only between sentences (punctuation followed by more text).
    body = body.replace(/([.!?])\s+(?=\S)/g, `$1<break time="${prosody.sentenceBreakMs}ms"/> `);
  }
  if (prosody?.rate) {
    body = `<prosody rate="${escapeXml(prosody.rate)}">${body}</prosody>`;
  }
  return body;
}

/** "en-NG-AbeoNeural" → "en-NG" */
function localeForVoice(voice: string): string {
  const match = voice.match(/^([a-z]{2,3}-[A-Z]{2})-/);
  return match ? match[1] : "en-US";
}

/**
 * Synthesizes speech via Azure Speech.
 *
 * @param text - The text to synthesize into speech.
 * @param voice - Azure voice name, e.g. "en-NG-AbeoNeural".
 * @returns A Buffer containing the MP3 audio data.
 * @throws AzureTtsSynthesisError if all retries fail or configuration is invalid.
 */
export async function synthesizeAzureSpeech(
  text: string,
  voice: string = "en-NG-AbeoNeural",
  prosody?: AzureProsody
): Promise<Buffer> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new AzureTtsSynthesisError(
      "AZURE_SPEECH_KEY and AZURE_SPEECH_REGION environment variables must be set"
    );
  }

  if (!text || !text.trim()) {
    throw new AzureTtsSynthesisError("Cannot synthesize empty text");
  }

  const locale = localeForVoice(voice);
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
    `<voice name="${escapeXml(voice)}">${buildSpokenBody(text.trim(), prosody)}</voice>` +
    `</speak>`;
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
          "User-Agent": "useladder",
        },
        body: ssml,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      // Authentication / bad request — non-retryable
      if (response.status === 401 || response.status === 403) {
        throw new AzureTtsSynthesisError(
          "Invalid Azure Speech key or region",
          response.status,
          attempt
        );
      }
      if (response.status === 400) {
        const errorBody = await response.text().catch(() => "unknown");
        throw new AzureTtsSynthesisError(
          `Azure TTS rejected the request (check voice "${voice}"): ${errorBody}`,
          400,
          attempt
        );
      }

      // Rate limit — retryable with backoff (free tier allows 20 req / 60s)
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("retry-after") || "2", 10);
        console.warn(
          `[azureTts] Rate limited (429). Waiting ${retryAfter}s before retry ${attempt + 1}/${MAX_RETRIES}`
        );
        lastError = new AzureTtsSynthesisError("Azure TTS rate limited", 429, attempt);
        await sleep(retryAfter * 1000);
        continue;
      }

      // Server error — retryable
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "unknown");
        lastError = new AzureTtsSynthesisError(
          `Azure TTS error ${response.status}: ${errorBody}`,
          response.status,
          attempt
        );
        console.warn(`[azureTts] API error ${response.status} on attempt ${attempt + 1}/${MAX_RETRIES}`);
        await sleep(Math.pow(2, attempt) * 500); // 0.5s, 1s, 2s
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength < MIN_VALID_BYTES) {
        lastError = new AzureTtsSynthesisError(
          `Azure TTS returned suspiciously small audio (${buffer.byteLength} bytes).`,
          undefined,
          attempt
        );
        await sleep(Math.pow(2, attempt) * 500);
        continue;
      }

      return buffer;
    } catch (err) {
      if (
        err instanceof AzureTtsSynthesisError &&
        (err.statusCode === 400 || err.statusCode === 401 || err.statusCode === 403)
      ) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[azureTts] Attempt ${attempt + 1}/${MAX_RETRIES} failed:`, lastError.message);
      if (attempt < MAX_RETRIES - 1) {
        await sleep(Math.pow(2, attempt) * 500);
      }
    }
  }

  throw new AzureTtsSynthesisError(
    `Azure TTS synthesis failed after ${MAX_RETRIES} attempts. Last error: ${lastError?.message || "unknown"}`,
    undefined,
    MAX_RETRIES
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
