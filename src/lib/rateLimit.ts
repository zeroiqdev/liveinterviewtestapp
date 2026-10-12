/**
 * Fixed-window rate limiting for routes that cost money (LLM, TTS) or guard
 * credentials (login, emailed codes).
 *
 * Counters live in MongoDB so every serverless instance shares them. When the
 * database is unavailable it falls back to a per-process counter, which is
 * weaker but still stops a single client hammering one instance.
 */

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import RateLimit from "@/models/RateLimit";

export interface RateRule {
    /** Name of the limit, e.g. "tts" or "login". */
    bucket: string;
    /** Max requests per window. */
    limit: number;
    windowSeconds: number;
    /** What the user was trying to do, for the error message ("sign-up attempts"). */
    action?: string;
}

const memory = (globalThis as unknown as { __rateLimits?: Map<string, number> }).__rateLimits ?? new Map<string, number>();
(globalThis as unknown as { __rateLimits?: Map<string, number> }).__rateLimits = memory;

async function increment(id: string, expiresAt: Date): Promise<number> {
    try {
        await dbConnect();
        const row = await RateLimit.findOneAndUpdate(
            { _id: id },
            { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
            { upsert: true, new: true }
        ).lean();
        return row?.count ?? 1;
    } catch {
        if (memory.size > 10_000) memory.clear();
        const next = (memory.get(id) ?? 0) + 1;
        memory.set(id, next);
        return next;
    }
}

/**
 * Counts one request. Returns 0 when it is within the limit, otherwise the
 * seconds until the window resets.
 */
export async function hit(rule: RateRule, key: string): Promise<number> {
    const windowMs = rule.windowSeconds * 1000;
    const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
    const id = `${rule.bucket}:${key}:${windowStart}`;
    const count = await increment(id, new Date(windowStart + windowMs));
    if (count <= rule.limit) return 0;
    return Math.max(1, Math.ceil((windowStart + windowMs - Date.now()) / 1000));
}

// In development every request comes from localhost, so one per-IP counter
// would be shared by everyone testing (and by scripts). Only per-user and
// per-email limits apply there.
const SKIP_IP_KEYS = process.env.NODE_ENV === "development";

function waitText(seconds: number): string {
    const minutes = Math.ceil(seconds / 60);
    return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}

/**
 * Counts one request against each key; returns a 429 response when any is
 * over its limit, or null when the request may proceed.
 */
export async function rateLimit(rule: RateRule, ...keys: string[]): Promise<NextResponse | null> {
    for (const key of keys) {
        if (SKIP_IP_KEYS && key.startsWith("ip:")) continue;
        const retryAfter = await hit(rule, key);
        if (retryAfter) {
            return NextResponse.json(
                {
                    error: `Too many ${rule.action ?? "requests"}. Please try again in ${waitText(retryAfter)}.`,
                    code: "rate_limited",
                },
                { status: 429, headers: { "Retry-After": String(retryAfter) } }
            );
        }
    }
    return null;
}

/** Best-effort client IP for anonymous rate limits. */
export function clientIp(req: Request): string {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return req.headers.get("x-real-ip") || "unknown";
}

/* Shared limits. Per-user limits are generous for real use but cap abuse. */
export const LIMITS = {
    login: { bucket: "login", limit: 10, windowSeconds: 15 * 60, action: "login attempts" },
    emailCodeSend: { bucket: "email-code-send", limit: 5, windowSeconds: 60 * 60, action: "code requests" },
    signup: { bucket: "signup", limit: 20, windowSeconds: 60 * 60, action: "sign-up attempts" },
    llm: { bucket: "llm", limit: 60, windowSeconds: 60 * 60, action: "requests" },
    tts: { bucket: "tts", limit: 1000, windowSeconds: 60 * 60, action: "voice requests" },
    parse: { bucket: "parse", limit: 30, windowSeconds: 60 * 60, action: "uploads" },
    interview: { bucket: "interview", limit: 20, windowSeconds: 24 * 60 * 60, action: "interviews started today" },
    realtime: { bucket: "realtime", limit: 30, windowSeconds: 60 * 60, action: "voice connections" },
    // Reply drafts made while the candidate talks: several per answer.
    draft: { bucket: "draft", limit: 600, windowSeconds: 60 * 60, action: "draft requests" },
} satisfies Record<string, RateRule>;
