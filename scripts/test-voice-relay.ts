/**
 * End-to-end test for the Voice Live relay: a simulated candidate (Azure
 * en-NG-EzinneNeural speech) answers the realtime interviewer, and the script
 * prints the conversation, engine decisions and per-turn latency.
 *
 * Usage (relay must be running: `npm run voice-relay`):
 *   npx tsx scripts/test-voice-relay.ts
 */

import { resolve } from "path";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import WebSocket from "ws";
import { startSession } from "../src/engine/orchestrator";
import { blueprintForRole } from "../src/engine/roleMapping";
import { signRelayToken } from "../src/lib/relayToken";

const RELAY_URL = process.env.TEST_RELAY_URL || "ws://localhost:8787";
const region = process.env.AZURE_SPEECH_REGION!;
const key = process.env.AZURE_SPEECH_KEY!;

const ANSWERS = [
    "Yeah so I have done a lot of backend work. We built scalable systems and improved performance a lot. It was a great team effort and it went really well.",
    "We just made things faster. The team worked on optimizations and things got better overall.",
    "Specifically, our checkout API had a p95 latency of 1.8 seconds because each request made six sequential calls to the inventory service. I proposed batching them into one call and adding a Redis cache with a thirty second expiry. I wrote the batching layer myself and load tested it. Latency dropped to 420 milliseconds and checkout errors fell about thirty percent.",
    "Honestly I'm not sure, I haven't worked with that directly.",
];

async function candidateAudio(text: string): Promise<Buffer> {
    const ssml = `<speak version="1.0" xml:lang="en-NG"><voice name="en-NG-EzinneNeural">${text}</voice></speak>`;
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "raw-24khz-16bit-mono-pcm",
            "User-Agent": "useladder-relay-test",
        },
        body: ssml,
    });
    if (!res.ok) throw new Error(`candidate TTS failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

async function main() {
    const { session } = await startSession({
        candidateId: "relay-test",
        ownerId: "relay-test",
        blueprintId: blueprintForRole("Software Engineer", "Mid-Level"),
        profile: null,
        candidateName: "Ada",
        companyName: "General",
        probeDepth: "standard",
    });
    console.log(`session ${session.sessionId.slice(0, 8)}`);
    const audios = await Promise.all(ANSWERS.map(candidateAudio));
    const token = await signRelayToken({ sessionId: session.sessionId, ownerId: "relay-test" });
    const ws = new WebSocket(`${RELAY_URL}/?token=${token}&region=nigeria`);

    // A continuous "microphone": queued answer audio, otherwise silence.
    const FRAME = 24000 * 2 * 0.04; // 40 ms of PCM16
    const silence = Buffer.alloc(FRAME);
    let queue = Buffer.alloc(0);
    const mic = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        let frame = silence;
        if (queue.length) {
            frame = queue.subarray(0, FRAME);
            queue = queue.subarray(FRAME);
        }
        ws.send(frame, { binary: true });
    }, 40);

    const t0 = Date.now();
    const ts = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s`;
    let answerIdx = 0;
    const latencies: number[] = [];

    ws.on("message", (raw) => {
        const m = JSON.parse(raw.toString());
        switch (m.type) {
            case "ai_text":
                console.log(`${ts()} AI: ${m.text}`);
                break;
            case "ai_done":
                if (answerIdx < audios.length) {
                    const a = audios[answerIdx++];
                    console.log(`${ts()} CANDIDATE: "${ANSWERS[answerIdx - 1]}"`);
                    setTimeout(() => {
                        queue = Buffer.concat([queue, a]);
                    }, 600);
                } else if (answerIdx++ === audios.length) {
                    setTimeout(() => ws.send(JSON.stringify({ type: "end" })), 500);
                }
                break;
            case "decision":
                console.log(`${ts()}   ⚙ engine: ${m.action}`);
                break;
            case "metrics":
                latencies.push(m.firstAudioMs);
                console.log(`${ts()}   ⏱ speech end → first audio ${m.firstAudioMs}ms (transcript ${m.transcriptMs}ms, decision ${m.decisionMs}ms)`);
                break;
            case "complete":
                console.log(`${ts()} COMPLETE`);
                break;
            case "error":
                console.log(`${ts()} ERROR ${m.message}`);
                break;
        }
    });
    ws.on("close", () => {
        clearInterval(mic);
        if (latencies.length) {
            const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
            console.log(`\nAverage speech end → first audio: ${avg}ms over ${latencies.length} turns (plus ~700ms end-of-speech silence detection)`);
        }
        process.exit(0);
    });
    setTimeout(() => {
        console.log("TIMEOUT");
        process.exit(1);
    }, 180_000);
}

main().catch((err) => {
    console.error("FAILED", err);
    process.exit(1);
});
