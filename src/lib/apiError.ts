import { NextResponse } from "next/server";

/**
 * Log an unexpected route error and return a generic message. Raw error
 * messages can expose database, provider or file-system details, so they
 * stay in the server logs.
 */
export function serverError(tag: string, err: unknown, message: string, status = 500): NextResponse {
    console.error(`[${tag}]`, err);
    return NextResponse.json({ error: message }, { status });
}
