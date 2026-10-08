/* ══════════════════════════════════════
   LLM client — plain Anthropic Messages
   API via fetch. No SDK dependency.

   Every in-loop call goes through callJSON:
   system + user prompt in, parsed JSON out.
   Set USELADDER_ENGINE_MOCK=1 to run the
   whole engine with canned responses.
   ══════════════════════════════════════ */

import {
    ANTHROPIC_API_URL,
    ANTHROPIC_VERSION,
    ENGINE_MOCK,
    MODEL_FAST,
} from "./constants";

interface CallJSONOptions {
    system: string;
    user: string;
    model?: string;
    maxTokens?: number;
    timeoutMs?: number;
    /**
     * Race models instead of trying them in turn: start the next one after
     * this long without an answer (or as soon as one fails), first good
     * answer wins. For the live interview, where a hung model must not stall
     * the conversation.
     */
    hedgeMs?: number;
    temperature?: number;
    /** mock payload used when USELADDER_ENGINE_MOCK=1 */
    mock?: unknown;
}

/** Extract the first balanced {...} block from model text with robust fallback. */
function extractJSON(text: string): unknown {
    const trimmed = text.trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        // Continue to strip code fences or match braces
    }

    const cleaned = trimmed
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        // Fall back to balanced brace extraction
    }

    const start = cleaned.indexOf("{");
    if (start === -1) throw new Error("no JSON object in model output");
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < cleaned.length; i++) {
        const char = cleaned[i];
        if (escape) {
            escape = false;
            continue;
        }
        if (char === "\\") {
            escape = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (!inString) {
            if (char === "{") depth++;
            else if (char === "}") {
                depth--;
                if (depth === 0) {
                    const candidate = cleaned.slice(start, i + 1);
                    return JSON.parse(candidate);
                }
            }
        }
    }
    throw new Error("unbalanced braces in model output");
}

/* ── Gemini model selection ──
   Set GEMINI_MODELS (comma-separated, most preferred first) to override.
   Ordered by measured live-turn latency and availability on this key:
   flash-lite answers in ~1–1.4s; gemini-3-flash-preview (~2.5–3s) is the
   dependable backup. The bigger flash models often return 429 on free-tier
   keys and the other lite variants have been timing out, so they come last
   (a failure moves on immediately and puts the model on cooldown). */
const DEFAULT_GEMINI_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash",
    "gemini-flash-latest",
];
const MODEL_COOLDOWN_MS = 60_000;

/**
 * Overall budget for a call on the live interview turn (models are raced,
 * see hedgeMs). These usually return in ~1.5s; trying hung models one after
 * another left candidates in silence for 13–22s.
 */
export const LIVE_TURN_TIMEOUT_MS = 6000;
/** Live calls start the next model if one hasn't answered within this long
 *  (just above the primary model's usual ~1–1.4s, so it rarely double-calls). */
export const LIVE_TURN_HEDGE_MS = 1600;
const modelCooldownUntil = new Map<string, number>();

function geminiModels(): string[] {
    const configured = (process.env.GEMINI_MODELS || "")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);
    return configured.length > 0 ? configured : DEFAULT_GEMINI_MODELS;
}

/** One Gemini request. Puts the model on cooldown when it fails in a way that will repeat. */
async function geminiAttempt<T>(model: string, key: string, opts: CallJSONOptions, signal: AbortSignal): Promise<T> {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal,
            body: JSON.stringify({
                system_instruction: { parts: [{ text: opts.system }] },
                contents: [{ role: "user", parts: [{ text: opts.user }] }],
                generationConfig: {
                    temperature: opts.temperature !== undefined ? opts.temperature : 0.2,
                    maxOutputTokens: Math.max(opts.maxTokens ?? 2000, 2048),
                    responseMimeType: "application/json",
                },
            }),
        });
        if (!res.ok) {
            const body = await res.text();
            // Quota (429), overload (5xx) or unknown model (404): put the
            // model on cooldown so the next calls don't pay for it again.
            if (res.status === 429 || res.status === 404 || res.status >= 500) {
                modelCooldownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
            }
            throw new Error(`Gemini API (${model}) ${res.status}: ${body.slice(0, 300)}`);
        }
        modelCooldownUntil.delete(model);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped REST payload
        const data = (await res.json()) as any;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error(`No response text from Gemini (${model})`);
        return extractJSON(text) as T;
    } catch (err) {
        const name = (err as Error)?.name;
        // A timed-out model just cost the full timeout; don't lead with it again.
        if (name === "TimeoutError") modelCooldownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
        throw err;
    }
}

/**
 * Hedged request across models: the first starts immediately, the next after
 * opts.hedgeMs without an answer or as soon as one fails; the first success
 * wins and the rest are cancelled. Bounded by timeoutMs overall.
 */
function raceGemini<T>(models: string[], key: string, opts: CallJSONOptions, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const controllers: AbortController[] = [];
        const timers: ReturnType<typeof setTimeout>[] = [];
        let next = 0;
        let running = 0;
        let settled = false;
        let lastError: unknown = new Error("no Gemini models configured");

        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            timers.forEach(clearTimeout);
            controllers.forEach((c) => c.abort());
            fn();
        };
        const launch = () => {
            if (settled || next >= models.length) {
                if (!settled && running === 0) finish(() => reject(lastError));
                return;
            }
            const model = models[next++];
            const controller = new AbortController();
            controllers.push(controller);
            running++;
            const hedge = setTimeout(launch, opts.hedgeMs);
            timers.push(hedge);
            geminiAttempt<T>(model, key, opts, controller.signal).then(
                (value) => finish(() => resolve(value)),
                (err) => {
                    running--;
                    clearTimeout(hedge);
                    if (!controller.signal.aborted) lastError = err;
                    launch();
                }
            );
        };
        timers.push(setTimeout(() => finish(() => reject(new Error(`LLM race timed out after ${timeoutMs}ms`))), timeoutMs));
        launch();
    });
}

/** Call an LLM with structured output, parsed as T. */
export async function callJSON<T>(opts: CallJSONOptions): Promise<T> {
    if (ENGINE_MOCK && opts.mock !== undefined) {
        return opts.mock as T;
    }

    const timeoutMs = opts.timeoutMs ?? (opts.maxTokens && opts.maxTokens > 1500 ? 40000 : 12000);
    const geminiKey = process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (geminiKey) {
        const now = Date.now();
        // Healthy models first; ones that recently failed are tried last
        // rather than skipped, so a call never fails just for being careful.
        const ordered = [...geminiModels()].sort(
            (a, b) => Number((modelCooldownUntil.get(a) ?? 0) > now) - Number((modelCooldownUntil.get(b) ?? 0) > now)
        );
        // The fast model has random latency spikes (mostly ~1.6s, sometimes 4–8s),
        // so the first hedge is a duplicate of the same request: it usually
        // lands in ~1.6s, far sooner than switching to a slower model.
        if (opts.hedgeMs) return raceGemini<T>([ordered[0], ...ordered], geminiKey, opts, timeoutMs);

        let lastError: Error | null = null;
        for (const model of ordered) {
            try {
                return await geminiAttempt<T>(model, geminiKey, opts, AbortSignal.timeout(timeoutMs));
            } catch (err) {
                lastError = err as Error;
            }
        }
        if (lastError) throw lastError;
    }

    if (anthropicKey) {
        const res = await fetch(ANTHROPIC_API_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": anthropicKey,
                "anthropic-version": ANTHROPIC_VERSION,
            },
            body: JSON.stringify({
                model: opts.model || MODEL_FAST,
                max_tokens: opts.maxTokens ?? 1000,
                temperature: opts.temperature !== undefined ? opts.temperature : 0.2,
                system: opts.system,
                messages: [{ role: "user", content: opts.user }],
            }),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
        }

        const data = (await res.json()) as {
            content?: { type: string; text?: string }[];
        };
        const text = (data.content || [])
            .filter((b) => b.type === "text")
            .map((b) => b.text || "")
            .join("\n");

        return extractJSON(text) as T;
    }

    throw new Error(
        "No AI API key set. Add GEMINI_API_KEY or ANTHROPIC_API_KEY to .env.local"
    );
}
