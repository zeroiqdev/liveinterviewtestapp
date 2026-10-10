/**
 * Gemini TTS Client Wrapper
 *
 * Synthesizes speech with Gemini's text-to-speech through the Interactions
 * API, using voices made with Gemini voice design (ids like "voice_…", stored
 * in the Google project that owns GEMINI_API_KEY). Gemini returns 24 kHz WAV;
 * it's encoded to MP3 here so clips stay small (~8x smaller) to download.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/speech-generation
 *       https://ai.google.dev/gemini-api/docs/voice-design
 */


export class GeminiTtsSynthesisError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "GeminiTtsSynthesisError";
  }
}

export interface GeminiVoiceOptions {
  /** TTS model, e.g. "gemini-3.8-flash-tts". */
  model: string;
  /** Delivery for this read (pace, warmth). The accent belongs to the voice itself. */
  style?: string;
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
// Live turns are waiting: one retry, then the caller's backup voice takes over.
const MAX_RETRIES = 1;
const REQUEST_TIMEOUT_MS = 25_000;
const MP3_KBPS = 48;
const MIN_VALID_BYTES = 1000;

interface InteractionResponse {
  steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: string }> }>;
  error?: { message?: string };
}

/** The PCM samples and format of a WAV file. */
export function readWav(wav: Buffer): { samples: Int16Array; sampleRate: number; channels: number } {
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new GeminiTtsSynthesisError("Gemini returned audio that isn't WAV");
  }
  let sampleRate = 24000;
  let channels = 1;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      channels = wav.readUInt16LE(offset + 10);
      sampleRate = wav.readUInt32LE(offset + 12);
    } else if (id === "data") {
      // Streams can leave the size unset; take what's there.
      const end = Math.min(wav.length, offset + 8 + (size || wav.length));
      const pcm = wav.subarray(offset + 8, end - ((end - offset - 8) % 2));
      const samples = new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.length));
      return { samples, sampleRate, channels };
    }
    offset += 8 + size + (size % 2);
  }
  throw new GeminiTtsSynthesisError("Gemini audio had no data");
}

/*
 * Loaded with import(): the package's require() entry is a browser bundle that
 * exports nothing, which is what scripts and tests (run as CommonJS) would get.
 */
let encoderModule: Promise<typeof import("@breezystack/lamejs")> | null = null;

/** 16-bit mono PCM → MP3. */
export async function encodeMp3(samples: Int16Array, sampleRate: number): Promise<Buffer> {
  encoderModule ??= import("@breezystack/lamejs");
  const { Mp3Encoder } = await encoderModule;
  const encoder = new Mp3Encoder(1, sampleRate, MP3_KBPS);
  const chunks: Buffer[] = [];
  for (let i = 0; i < samples.length; i += 1152) {
    const frame = encoder.encodeBuffer(samples.subarray(i, i + 1152));
    if (frame.length) chunks.push(Buffer.from(frame));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

/**
 * Synthesizes speech with a Gemini voice and returns MP3 audio.
 * Retries rate-limit and server errors with backoff.
 */
export async function synthesizeGeminiSpeech(
  text: string,
  voiceId: string,
  options: GeminiVoiceOptions
): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiTtsSynthesisError("GEMINI_API_KEY is not set");

  const body = JSON.stringify({
    model: options.model,
    input: [
      {
        type: "user_input",
        content: [
          {
            type: "text",
            text,
            ...(options.style ? { annotations: [{ type: "speech_metadata", style: options.style }] } : {}),
          },
        ],
      },
    ],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice: voiceId }] },
  });

  let lastError: GeminiTtsSynthesisError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 200);
        lastError = new GeminiTtsSynthesisError(`Gemini TTS returned ${res.status}: ${detail}`, res.status);
        // Bad requests won't get better on retry.
        if (res.status < 500 && res.status !== 429) throw lastError;
        continue;
      }
      const json = (await res.json()) as InteractionResponse;
      const audio = (json.steps ?? [])
        .filter((step) => step.type === "model_output")
        .flatMap((step) => step.content ?? [])
        .filter((part) => part.type === "audio" && part.data)
        .pop()?.data;
      if (!audio) throw new GeminiTtsSynthesisError("Gemini TTS returned no audio");
      const { samples, sampleRate, channels } = readWav(Buffer.from(audio, "base64"));
      if (channels !== 1) throw new GeminiTtsSynthesisError(`Unexpected ${channels}-channel audio`);
      const mp3 = await encodeMp3(samples, sampleRate);
      if (mp3.length < MIN_VALID_BYTES) throw new GeminiTtsSynthesisError("Gemini TTS audio was too short");
      return mp3;
    } catch (err) {
      if (err instanceof GeminiTtsSynthesisError && err.statusCode && err.statusCode < 500 && err.statusCode !== 429) {
        throw err;
      }
      lastError = err instanceof GeminiTtsSynthesisError ? err : new GeminiTtsSynthesisError((err as Error).message);
    }
  }
  throw lastError ?? new GeminiTtsSynthesisError("Gemini TTS failed");
}
