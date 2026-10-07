/**
 * YarnGPT TTS Client Wrapper
 *
 * Provides text-to-speech synthesis specifically tuned for authentic Nigerian accents.
 * Voice ids are lowercase and case-sensitive (e.g. "osagie", "idera", "adaora",
 * "emma", "jude") — see GET https://api.yarngpt.ai/api/v1/voices.
 *
 * The API is asynchronous (https://yarngpt.ai/api-docs):
 *   1. POST /api/v1/tts with an Idempotency-Key → 202 { job_id, status: "queued" }
 *   2. Poll GET /api/v1/status/{job_id} until status is "completed" or "failed"
 *   3. Download the signed audio_url (valid ~1 hour) — we store it ourselves (R2)
 */

import { randomUUID } from "crypto";

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

const YARNGPT_API_BASE = "https://api.yarngpt.ai/api/v1";
const MAX_SUBMIT_RETRIES = 3;
/** A job that fails server-side is resubmitted (with a new key) this many times. */
const MAX_JOB_ATTEMPTS = 2;
const JOB_TIMEOUT_MS = 60_000;
// Docs recommend starting near 1s and backing off toward 5s to avoid burst limits.
const POLL_INITIAL_MS = 800;
const POLL_MAX_MS = 3_000;
const MIN_VALID_BYTES = 1000; // Reject suspiciously small/truncated audio

interface YarnGptJobStatus {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  percentage?: number;
  audio_url: string | null;
  error_code?: string | null;
  error_message?: string | null;
}

/**
 * Synthesizes speech via the YarnGPT TTS API.
 *
 * @param text - The text to synthesize into speech.
 * @param voice - YarnGPT voice id (lowercase, e.g. "osagie", "idera").
 * @returns A Buffer containing the MP3 audio data.
 * @throws YarnGptSynthesisError if all attempts fail or configuration is invalid.
 */
export async function synthesizeYarnGptSpeech(
  text: string,
  voice: string = "osagie"
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

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_JOB_ATTEMPTS; attempt++) {
    try {
      const jobId = await submitJob(apiKey, text.trim(), voice);
      const audioUrl = await waitForJob(apiKey, jobId);
      return await downloadAudio(audioUrl);
    } catch (err) {
      if (err instanceof YarnGptSynthesisError && isNonRetryable(err.statusCode)) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[yarngpt] Job attempt ${attempt + 1}/${MAX_JOB_ATTEMPTS} failed:`,
        lastError.message
      );
    }
  }

  throw new YarnGptSynthesisError(
    `YarnGPT synthesis failed after ${MAX_JOB_ATTEMPTS} attempts. Last error: ${lastError?.message || "unknown"}`,
    undefined,
    MAX_JOB_ATTEMPTS
  );
}

function isNonRetryable(status?: number): boolean {
  return status === 400 || status === 401 || status === 402 || status === 404 || status === 422;
}

/** Submits a TTS job and returns its id. Retries transient errors with the
 * same Idempotency-Key, which the API guarantees will not bill twice. */
async function submitJob(apiKey: string, text: string, voice: string): Promise<string> {
  const idempotencyKey = randomUUID();
  const payload = JSON.stringify({ text, voice, output_format: "mp3" });
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_SUBMIT_RETRIES; attempt++) {
    const response = await fetch(`${YARNGPT_API_BASE}/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: payload,
    });

    if (response.ok) {
      const data = (await response.json()) as { job_id?: string };
      if (!data.job_id) {
        throw new YarnGptSynthesisError("YarnGPT response missing job_id", response.status, attempt);
      }
      return data.job_id;
    }

    const errorBody = await response.text().catch(() => "unknown");

    if (response.status === 401) {
      throw new YarnGptSynthesisError("Invalid YarnGPT API key", 401, attempt);
    }
    if (response.status === 402) {
      throw new YarnGptSynthesisError(`YarnGPT quota exceeded: ${errorBody}`, 402, attempt);
    }
    if (response.status === 404) {
      // e.g. VOICE_NOT_FOUND — voice ids are lowercase and case-sensitive
      throw new YarnGptSynthesisError(`YarnGPT not found (check voice "${voice}"): ${errorBody}`, 404, attempt);
    }
    if (response.status === 400 || response.status === 422) {
      throw new YarnGptSynthesisError(`YarnGPT validation error: ${errorBody}`, response.status, attempt);
    }
    if (response.status === 409) {
      // Same key still running — wait and replay; the original job is returned.
      lastError = new YarnGptSynthesisError(`YarnGPT conflict: ${errorBody}`, 409, attempt);
      await sleep(1000);
      continue;
    }
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("retry-after") || "5", 10);
      console.warn(
        `[yarngpt] Rate limited (429). Waiting ${retryAfter}s before retry ${attempt + 1}/${MAX_SUBMIT_RETRIES}`
      );
      lastError = new YarnGptSynthesisError("YarnGPT rate limited", 429, attempt);
      await sleep(retryAfter * 1000);
      continue;
    }

    // 5xx — transient, safe to retry with the identical body and key
    lastError = new YarnGptSynthesisError(
      `YarnGPT API error ${response.status}: ${errorBody}`,
      response.status,
      attempt
    );
    console.warn(`[yarngpt] API error ${response.status} on submit attempt ${attempt + 1}/${MAX_SUBMIT_RETRIES}`);
    await sleep(Math.pow(2, attempt) * 1000); // 1s, 2s, 4s
  }

  throw lastError ?? new YarnGptSynthesisError("YarnGPT submit failed");
}

/** Polls a job until it completes and returns its signed audio URL. */
async function waitForJob(apiKey: string, jobId: string): Promise<string> {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let delay = POLL_INITIAL_MS;

  while (Date.now() < deadline) {
    await sleep(delay);
    delay = Math.min(POLL_MAX_MS, Math.round(delay * 1.4));

    const response = await fetch(`${YARNGPT_API_BASE}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("retry-after") || "2", 10);
      await sleep(retryAfter * 1000);
      continue;
    }
    if (!response.ok) {
      // Transient status-read failure; keep polling until the deadline.
      if (response.status >= 500) continue;
      const errorBody = await response.text().catch(() => "unknown");
      throw new YarnGptSynthesisError(`YarnGPT status error ${response.status}: ${errorBody}`, response.status);
    }

    const job = (await response.json()) as YarnGptJobStatus;
    if (job.status === "completed") {
      if (!job.audio_url) throw new YarnGptSynthesisError(`YarnGPT job ${jobId} completed without audio_url`);
      return job.audio_url;
    }
    if (job.status === "failed") {
      throw new YarnGptSynthesisError(
        `YarnGPT job ${jobId} failed: ${job.error_message || job.error_code || "unknown error"}`
      );
    }
  }

  throw new YarnGptSynthesisError(`YarnGPT job ${jobId} timed out after ${JOB_TIMEOUT_MS / 1000}s`);
}

async function downloadAudio(audioUrl: string): Promise<Buffer> {
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new YarnGptSynthesisError(`YarnGPT audio download failed (${response.status})`, response.status);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength < MIN_VALID_BYTES) {
    throw new YarnGptSynthesisError(
      `YarnGPT returned suspiciously small audio (${buffer.byteLength} bytes).`
    );
  }
  return buffer;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
