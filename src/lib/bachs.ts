/**
 * Bachs (bachs.io), the payment provider.
 *
 * We create a hosted checkout, send the buyer to it, and learn the result from
 * Bachs: by webhook, and by asking Bachs directly when the buyer comes back.
 * A browser telling us "I paid" is never enough.
 *
 * Environment:
 *   BACHS_API_KEY         sk_sandbox_… (test money) or sk_live_… (real money)
 *   BACHS_WEBHOOK_SECRET  the signing secret of the webhook endpoint
 */

import { createHmac, timingSafeEqual } from "crypto";

const SANDBOX_URL = "https://sandbox-api.bachs.io";
const LIVE_URL = "https://api.bachs.io";
const TIMEOUT_MS = 15000;
/** A webhook older than this is refused: it is probably a replay. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

export class PaymentsNotConfiguredError extends Error {
    constructor() {
        super("Payments are not set up yet.");
    }
}

function apiKey(): string {
    const key = process.env.BACHS_API_KEY?.trim();
    if (!key) throw new PaymentsNotConfiguredError();
    return key;
}

/** Sandbox keys talk to the sandbox, live keys to production: the key decides, never a second setting. */
export function baseUrlFor(key: string): string {
    return key.startsWith("sk_live_") ? LIVE_URL : SANDBOX_URL;
}

export function isLiveMode(): boolean {
    return (process.env.BACHS_API_KEY || "").trim().startsWith("sk_live_");
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const key = apiKey();
    const res = await fetch(`${baseUrlFor(key)}${path}`, {
        method,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Bachs ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : {}) as T;
}

export interface CheckoutSession {
    checkout_id: string;
    checkout_url?: string;
    /** open | completed | expired | cancelled */
    status: string;
    payment_status?: string | null;
    amount: string;
    currency: string;
    reference?: string | null;
}

export interface NewCheckout {
    /** Price in naira, whole or with kobo. */
    amountNaira: number;
    reference: string;
    customer: { email: string; name?: string };
    description: string;
    successUrl?: string;
    cancelUrl?: string;
}

export async function createCheckout(checkout: NewCheckout): Promise<CheckoutSession> {
    return request<CheckoutSession>("POST", "/v1/checkout-sessions", {
        // A raw amount: the price is worked out on our side, so there is no catalogue to keep in step.
        pricing: { currency: "NGN", amount: checkout.amountNaira.toFixed(2) },
        customer: { email: checkout.customer.email, ...(checkout.customer.name?.trim() ? { name: checkout.customer.name.trim() } : {}) },
        reference: checkout.reference,
        metadata: { description: checkout.description },
        // Bachs refuses localhost addresses, so these are only sent when the site has a public one.
        ...(checkout.successUrl ? { success_url: checkout.successUrl } : {}),
        ...(checkout.cancelUrl ? { cancel_url: checkout.cancelUrl } : {}),
        expires_in_minutes: 60,
    });
}

export function getCheckout(checkoutId: string): Promise<CheckoutSession> {
    return request<CheckoutSession>("GET", `/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`);
}

/** Whether Bachs says this checkout was paid in full, in naira. */
export function isPaidInFull(session: CheckoutSession, expectedNaira: number): boolean {
    const paid = session.status === "completed" && (session.payment_status == null || session.payment_status === "succeeded");
    return paid && session.currency === "NGN" && Number(session.amount) >= expectedNaira;
}

/**
 * Whether a webhook really came from Bachs. The signature is an HMAC-SHA256 of
 * "{timestamp}.{raw body}" with the endpoint's secret; the newer header can
 * carry several (during a secret rotation), and any one matching is enough.
 */
export function verifyWebhook(rawBody: string, headers: { get(name: string): string | null }, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
    if (!secret) return false;
    let timestamp = headers.get("x-bachs-timestamp") || "";
    let signatures: string[] = [];
    const v2 = headers.get("x-bachs-signature-v2");
    if (v2) {
        for (const part of v2.split(",")) {
            const [name, value] = part.trim().split("=", 2);
            if (name === "t" && value) timestamp = value;
            if (name === "v1" && value) signatures.push(value);
        }
    }
    const legacy = headers.get("x-bachs-signature");
    if (signatures.length === 0 && legacy) signatures = [legacy];
    if (!/^\d+$/.test(timestamp) || signatures.length === 0) return false;
    if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;

    const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"));
    return signatures.some((signature) => {
        const given = Buffer.from(signature);
        return given.length === expected.length && timingSafeEqual(given, expected);
    });
}
