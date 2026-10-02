/** Lightweight, env-gated turn timing records for local diagnostics. */
export const TURN_TRACE_ENABLED = process.env.ONSCRIPT_TURN_TRACE === "1";

export interface TurnTraceEvent {
    stage: string;
    at: number;
    offsetMs: number;
    meta?: Record<string, unknown>;
}

interface TurnTraceRecord {
    startedAt: number;
    events: TurnTraceEvent[];
}

const traceStore = globalThis as unknown as { __onscriptTurnTraces?: Map<string, TurnTraceRecord> };
const records = traceStore.__onscriptTurnTraces ?? (traceStore.__onscriptTurnTraces = new Map());

export function traceTurn(turnId: string | null | undefined, stage: string, meta?: Record<string, unknown>) {
    if (!TURN_TRACE_ENABLED || !turnId) return;
    const now = Date.now();
    const record = records.get(turnId) ?? { startedAt: now, events: [] };
    record.events.push({ stage, at: now, offsetMs: now - record.startedAt, meta });
    records.set(turnId, record);
    if (records.size > 200) records.delete(records.keys().next().value as string);
    console.info(`[turn:${turnId}] +${now - record.startedAt}ms ${stage}`, meta || "");
}

export function getTurnTrace(turnId: string) {
    return records.get(turnId) ?? null;
}
