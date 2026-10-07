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
   The defaults lead with the lite models: they answered fastest and were
   not quota-limited, while the bigger flash models often return 429 on
   free-tier keys — each failed attempt cost ~0.5–0.7s per call. */
const DEFAULT_GEMINI_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash",
    "gemini-3.7-flash",
    "gemini-flash-latest",
];
const MODEL_COOLDOWN_MS = 60_000;
const modelCooldownUntil = new Map<string, number>();

function geminiModels(): string[] {
    const configured = (process.env.GEMINI_MODELS || "")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);
    return configured.length > 0 ? configured : DEFAULT_GEMINI_MODELS;
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
        let lastError: Error | null = null;
        const now = Date.now();
        // Healthy models first; ones that recently failed are tried last
        // rather than skipped, so a call never fails just for being careful.
        const ordered = [...geminiModels()].sort(
            (a, b) => Number((modelCooldownUntil.get(a) ?? 0) > now) - Number((modelCooldownUntil.get(b) ?? 0) > now)
        );
        for (const model of ordered) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    signal: AbortSignal.timeout(timeoutMs),
                    body: JSON.stringify({
                        system_instruction: {
                            parts: [{ text: opts.system }],
                        },
                        contents: [
                            {
                                role: "user",
                                parts: [{ text: opts.user }],
                            },
                        ],
                        generationConfig: {
                            temperature: opts.temperature !== undefined ? opts.temperature : 0.2,
                            maxOutputTokens: Math.max(opts.maxTokens ?? 2000, 2048),
                            responseMimeType: "application/json",
                        },
                    }),
                });

                if (!res.ok) {
                    const body = await res.text();
                    lastError = new Error(`Gemini API (${model}) ${res.status}: ${body.slice(0, 300)}`);
                    // Quota (429), overload (5xx) or unknown model (404): put the
                    // model on cooldown so the next calls don't pay for it again.
                    if (res.status === 429 || res.status === 404 || res.status >= 500) {
                        modelCooldownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
                        continue;
                    }
                    throw lastError;
                }
                modelCooldownUntil.delete(model);

                const data = (await res.json()) as any;
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) throw new Error(`No response text from Gemini (${model})`);
                return extractJSON(text) as T;
            } catch (err: any) {
                lastError = err;
                // A timed-out model just cost the full timeout; don't lead with it again.
                if (err?.name === "TimeoutError" || err?.name === "AbortError") {
                    modelCooldownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
                }
                continue;
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
