/**
 * Voice Live relay — realtime speech-to-speech interviews.
 *
 *   browser ──(PCM16 mic audio, JSON)──▶ relay ──▶ Azure Voice Live
 *   browser ◀──(audio deltas, events)─── relay ◀──
 *
 * The relay holds the Azure key and runs the interview engine's tool calls
 * server-side, so the browser can't see the key or tamper with decisions.
 * It needs a long-lived process (not Vercel serverless): run it with
 * `npm run voice-relay` locally, or deploy it to a container host.
 *
 * Turn loop:
 *   candidate stops → final transcript → (short grace) → "decision" response
 *   forced to call assess_answer → engine applies the probe policy → tool
 *   output → "speech" response (audio) following the engine's instruction.
 *
 * Env: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, AUTH_SECRET, MONGODB_URI,
 *      VOICE_LIVE_MODEL (default gpt-4.1-mini), VOICE_RELAY_PORT (default 8787),
 *      VOICE_RELAY_MAX_MINUTES (default 45), VOICE_RELAY_MAX_CONNECTIONS (default 50)
 */

import { resolve } from "path";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createServer } from "http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { verifyRelayToken } from "../src/lib/relayToken";
import { getSession, saveSession } from "../src/engine/sessionStore";
import { toPublicState } from "../src/engine/orchestrator";
import {
    REALTIME_TOOLS,
    applyRealtimeTurn,
    buildRealtimeInstructions,
    planNextQuestion,
    recordInterviewerUtterance,
    type AssessArgs,
    type PlannedQuestion,
    type RealtimeAction,
} from "../src/engine/realtimeAdapter";
import { normalizeRegion } from "../src/utils/regionNormalizer";

const PORT = Number(process.env.VOICE_RELAY_PORT || 8787);
const MODEL = process.env.VOICE_LIVE_MODEL || "gpt-4.1-mini";
const API_VERSION = "2026-04-10";
// Wait this long after a final transcript for more speech before deciding,
// so a short pause mid-answer doesn't end the candidate's turn.
const DECISION_GRACE_MS = 200;
// Azure realtime audio is billed per minute: cap each call and the total.
const MAX_SESSION_MS = Number(process.env.VOICE_RELAY_MAX_MINUTES || 45) * 60_000;
const MAX_CONNECTIONS = Number(process.env.VOICE_RELAY_MAX_CONNECTIONS || 50);
// Mic audio arrives in small PCM frames; nothing legitimate is this large.
const MAX_MESSAGE_BYTES = 1024 * 1024;

/** Relay token ids already used, with their expiry (ms). Tokens are single use. */
const usedTokens = new Map<string, number>();
/** The live browser connection for each interview session. */
const activeBySession = new Map<string, WebSocket>();

function claimToken(jti: string, expSeconds: number): boolean {
    const now = Date.now();
    for (const [id, exp] of usedTokens) if (exp < now) usedTokens.delete(id);
    if (usedTokens.has(jti)) return false;
    usedTokens.set(jti, expSeconds * 1000);
    return true;
}

// Azure neural voices usable by Voice Live (ElevenLabs voices are not).
const VOICE_BY_REGION: Record<string, string> = {
    nigeria: "en-NG-AbeoNeural",
    uk: "en-GB-RyanNeural",
    us: "en-US-AndrewNeural",
    "international-default": "en-US-AndrewNeural",
};

type ResponseKind = "opening" | "decision" | "speech";
interface TrackedResponse {
    kind: ResponseKind;
    ending: boolean;
    done: Promise<void>;
    resolveDone: () => void;
}

function log(sessionId: string, msg: string) {
    console.log(`[relay ${sessionId.slice(0, 8)}] ${msg}`);
}

function transcriptOf(session: { transcript: Array<{ role: string; text: string }> }) {
    return session.transcript.map((t) => ({ role: t.role, text: t.text }));
}

const http = createServer((_req, res) => {
    // Health check for container hosts.
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("voice relay ok");
});
const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE_BYTES });

wss.on("connection", async (client, req) => {
    const url = new URL(req.url || "/", "http://relay");
    const send = (msg: Record<string, unknown>) => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(msg));
    };
    const fail = (message: string) => {
        send({ type: "error", message });
        client.close();
    };

    if (wss.clients.size > MAX_CONNECTIONS) return fail("Voice interviews are at capacity. Please try again shortly.");

    const claims = await verifyRelayToken(url.searchParams.get("token") || "");
    if (!claims) return fail("Invalid or expired relay token.");
    if (!claimToken(claims.jti, claims.exp)) return fail("This relay token has already been used.");
    const session = await getSession(claims.sessionId);
    if (!session || (session.ownerId && session.ownerId !== claims.ownerId)) return fail("Unknown session.");
    if (session.complete) return fail("This interview is already complete.");

    const key = process.env.AZURE_SPEECH_KEY;
    const azureRegion = process.env.AZURE_SPEECH_REGION;
    if (!key || !azureRegion) return fail("Voice service is not configured.");

    // The browser may have gone away during the awaits above; its close
    // event fired before our handler exists, so stop here.
    if (client.readyState !== WebSocket.OPEN) return;

    // One live connection per interview: a reconnect replaces the old one.
    const previous = activeBySession.get(session.sessionId);
    if (previous && previous !== client && previous.readyState === WebSocket.OPEN) {
        previous.send(JSON.stringify({ type: "error", message: "This interview was opened in another window." }));
        previous.close();
    }
    activeBySession.set(session.sessionId, client);
    const maxDurationTimer = setTimeout(() => {
        send({ type: "error", message: "This voice session reached its time limit." });
        client.close();
    }, MAX_SESSION_MS);

    const sid = session.sessionId;
    const voice =
        VOICE_BY_REGION[normalizeRegion(url.searchParams.get("region") || "nigeria")] ?? VOICE_BY_REGION.nigeria;
    const azure = new WebSocket(
        `wss://${azureRegion}.api.cognitive.microsoft.com/voice-live/realtime?api-version=${API_VERSION}&model=${MODEL}`,
        { headers: { "api-key": key } }
    );
    const toAzure = (msg: Record<string, unknown>) => {
        if (azure.readyState === WebSocket.OPEN) azure.send(JSON.stringify(msg));
    };

    /* ── per-connection state ── */
    let configured = false;
    let planned: PlannedQuestion | null = null;
    let planning: Promise<void> | null = null;
    let answerParts: string[] = []; // final transcripts since the last decision
    let decisionTimer: NodeJS.Timeout | null = null;
    let activeDecision: TrackedResponse | null = null; // forced assess_answer response
    let decisionApplied = false; // its tool call already changed the session
    let applying: Promise<unknown> = Promise.resolve();
    const requested: TrackedResponse[] = []; // response.create sent, response.created pending
    const responses = new Map<string, TrackedResponse>();
    const turn = { stoppedAt: 0, transcribedAt: 0, toolAt: 0, decidedAt: 0, firstAudioAt: 0 };

    const createResponse = (kind: ResponseKind, response: Record<string, unknown>, ending = false): TrackedResponse => {
        let resolveDone!: () => void;
        const done = new Promise<void>((r) => (resolveDone = r));
        const tracked: TrackedResponse = { kind, ending, done, resolveDone };
        requested.push(tracked);
        toAzure({ type: "response.create", response });
        return tracked;
    };
    const kindOf = (responseId: unknown) => responses.get(String(responseId))?.kind ?? null;

    const replan = () => {
        planning = planNextQuestion(session)
            .then((p) => {
                planned = p;
            })
            .catch((err) => log(sid, `planning failed: ${(err as Error).message}`));
    };

    const requestDecision = () => {
        decisionTimer = null;
        if (activeDecision || session.complete || answerParts.length === 0) return;
        decisionApplied = false;
        // Force the rubric tool call; no audio until the engine has decided.
        activeDecision = createResponse("decision", { modalities: ["text"], tool_choice: "required" });
    };

    const applyTurn = async (callId: string | null, args: AssessArgs) => {
        const decision = activeDecision;
        const answerText = answerParts.join(" ").trim();
        if (planning) await planning; // normally already finished
        const action: RealtimeAction = await applyRealtimeTurn({ session, answerText, args, planned, persist: false });
        decisionApplied = true;
        turn.decidedAt = Date.now();
        if (action.action !== "wait") answerParts = [];
        if (action.action === "ask_next") replan();
        log(sid, `decision: ${action.action} (intent=${args.intent}, verdict=${args.verdict})`);
        send({ type: "decision", action: action.action, state: toPublicState(session) });

        // Only one response may be active: let the decision response finish.
        if (decision) await Promise.race([decision.done, new Promise((r) => setTimeout(r, 1500))]);

        toAzure({
            type: "conversation.item.create",
            item: callId
                ? { type: "function_call_output", call_id: callId, output: JSON.stringify(action) }
                : {
                      type: "message",
                      role: "system",
                      content: [{ type: "input_text", text: `Controller decision (follow it): ${JSON.stringify(action)}` }],
                  },
        });
        turn.firstAudioAt = 0;
        createResponse("speech", { modalities: ["text", "audio"], tool_choice: "none" }, action.action === "end");
        // Persist off the critical path: the model is already speaking.
        void saveSession(session).catch((err) => log(sid, `save failed: ${(err as Error).message}`));
    };

    /* ── Azure → relay ── */
    azure.on("message", (raw: RawData) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Voice Live service events
        let m: any;
        try {
            m = JSON.parse(raw.toString());
        } catch {
            return;
        }
        switch (m.type) {
            case "session.created":
                toAzure({
                    type: "session.update",
                    session: {
                        modalities: ["text", "audio"],
                        instructions: buildRealtimeInstructions(session),
                        voice: { type: "azure-standard", name: voice, rate: "0.95" },
                        input_audio_sampling_rate: 24000,
                        input_audio_noise_reduction: { type: "azure_deep_noise_suppression" },
                        input_audio_echo_cancellation: { type: "server_echo_cancellation" },
                        input_audio_transcription: { model: "azure-speech", language: voice.slice(0, 5) },
                        turn_detection: {
                            type: "azure_semantic_vad",
                            silence_duration_ms: 700,
                            remove_filler_words: true,
                            interrupt_response: true,
                            auto_truncate: true,
                            create_response: false, // the relay decides when to respond
                        },
                        tools: REALTIME_TOOLS,
                        tool_choice: "auto",
                    },
                });
                break;

            case "session.updated":
                if (configured) break;
                configured = true;
                log(sid, `session ready (model=${MODEL}, voice=${voice})`);
                send({ type: "ready", state: toPublicState(session) });
                replan();
                if (session.pendingQuestion?.text) {
                    createResponse("opening", {
                        modalities: ["text", "audio"],
                        tool_choice: "none",
                        instructions: `Begin the interview. Say exactly this, word for word: "${session.pendingQuestion.text}"`,
                    });
                }
                break;

            case "response.created": {
                const tracked = requested.shift();
                if (tracked && m.response?.id) responses.set(m.response.id, tracked);
                break;
            }

            case "input_audio_buffer.speech_started":
                send({ type: "user_speaking" });
                if (decisionTimer) {
                    clearTimeout(decisionTimer);
                    decisionTimer = null;
                }
                // Still talking: drop a decision that hasn't changed anything yet.
                if (activeDecision && !decisionApplied) {
                    toAzure({ type: "response.cancel" });
                    activeDecision = null;
                }
                break;

            case "input_audio_buffer.speech_stopped":
                turn.stoppedAt = Date.now();
                send({ type: "user_stopped" });
                break;

            case "conversation.item.input_audio_transcription.completed": {
                const text = String(m.transcript || "").trim();
                turn.transcribedAt = Date.now();
                if (!text) break;
                answerParts.push(text);
                send({ type: "user_text", text });
                if (decisionTimer) clearTimeout(decisionTimer);
                decisionTimer = setTimeout(requestDecision, DECISION_GRACE_MS);
                break;
            }

            case "response.function_call_arguments.done": {
                if (kindOf(m.response_id) !== "decision" || !activeDecision || m.name !== "assess_answer") break;
                turn.toolAt = Date.now();
                let args: AssessArgs;
                try {
                    args = JSON.parse(m.arguments || "{}");
                } catch {
                    args = { intent: "answer", verdict: "partial", wants_follow_up: false };
                }
                applying = applyTurn(m.call_id, args).catch((err) => {
                    log(sid, `apply failed: ${(err as Error).message}`);
                    send({ type: "error", message: "The interviewer hit a problem. Please continue." });
                });
                break;
            }

            case "response.audio.delta": {
                if (!turn.firstAudioAt && kindOf(m.response_id) === "speech") {
                    turn.firstAudioAt = Date.now();
                    if (turn.stoppedAt) {
                        const metrics = {
                            transcriptMs: turn.transcribedAt - turn.stoppedAt,
                            toolCallMs: turn.toolAt - turn.stoppedAt,
                            decisionMs: turn.decidedAt - turn.stoppedAt,
                            firstAudioMs: turn.firstAudioAt - turn.stoppedAt,
                        };
                        log(sid, `latency after speech end: transcript ${metrics.transcriptMs}ms → model tool call ${metrics.toolCallMs}ms → engine ${metrics.decisionMs}ms → first audio ${metrics.firstAudioMs}ms`);
                        send({ type: "metrics", ...metrics });
                    }
                }
                send({ type: "audio", delta: m.delta });
                break;
            }

            case "response.audio_transcript.delta":
                send({ type: "ai_text_delta", delta: m.delta });
                break;

            case "response.audio_transcript.done": {
                const text = String(m.transcript || "");
                send({ type: "ai_text", text });
                // The opening is already in the transcript from startSession.
                if (kindOf(m.response_id) === "speech") void recordInterviewerUtterance(session, text);
                break;
            }

            case "response.done": {
                const id = m.response?.id;
                const tracked = id ? responses.get(id) : undefined;
                if (id) responses.delete(id);
                tracked?.resolveDone();
                if (!tracked) break;
                const status = m.response?.status;

                if (tracked.kind === "decision") {
                    if (activeDecision === tracked) activeDecision = null;
                    // Model finished without calling the tool: decide with a neutral score.
                    const calledTool = (m.response?.output || []).some((o: { type?: string }) => o.type === "function_call");
                    if (status === "completed" && !calledTool && !decisionApplied) {
                        applying = applyTurn(null, { intent: "answer", verdict: "partial", wants_follow_up: false });
                    }
                } else {
                    send({ type: "ai_done" });
                    if (tracked.ending && status === "completed") {
                        send({ type: "complete", sessionId: sid, transcript: transcriptOf(session) });
                        setTimeout(() => client.close(), 500);
                    }
                }
                break;
            }

            case "error":
                // Cancelling an already-finished response is harmless.
                if (m.error?.code === "response_cancel_not_active") break;
                log(sid, `azure error: ${JSON.stringify(m.error).slice(0, 300)}`);
                send({ type: "error", message: m.error?.message || "Voice service error" });
                break;
        }
    });

    azure.on("close", (code, reason) => {
        log(sid, `azure closed ${code} ${reason.toString().slice(0, 120)}`);
        if (client.readyState === WebSocket.OPEN) {
            send({ type: "error", message: "Voice connection closed." });
            client.close();
        }
    });
    azure.on("error", (err) => log(sid, `azure socket error: ${err.message}`));

    /* ── browser → relay ── */
    client.on("message", (data: RawData, isBinary: boolean) => {
        if (isBinary) {
            // Raw PCM16 mono 24 kHz microphone audio.
            const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
            toAzure({ type: "input_audio_buffer.append", audio: buf.toString("base64") });
            return;
        }
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === "end") {
                void applying.finally(async () => {
                    await saveSession(session).catch(() => undefined);
                    send({ type: "complete", sessionId: sid, transcript: transcriptOf(session) });
                    client.close();
                });
            }
        } catch {
            // ignore malformed control messages
        }
    });

    client.on("close", () => {
        clearTimeout(maxDurationTimer);
        if (activeBySession.get(sid) === client) activeBySession.delete(sid);
        if (decisionTimer) clearTimeout(decisionTimer);
        if (azure.readyState === WebSocket.OPEN || azure.readyState === WebSocket.CONNECTING) azure.close();
        void saveSession(session).catch(() => undefined);
        log(sid, "client disconnected");
    });
});

http.listen(PORT, () => {
    console.log(`Voice Live relay listening on ws://localhost:${PORT} (model ${MODEL})`);
});
