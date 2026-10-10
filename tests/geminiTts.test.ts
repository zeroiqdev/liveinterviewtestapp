import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeMp3, readWav } from "../src/lib/geminiTts";
import { getVoiceForContext } from "../src/config/voiceConfig";

function wav(samples: Int16Array, sampleRate = 24000): Buffer {
    const data = Buffer.from(samples.buffer);
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

describe("Gemini audio", () => {
    it("reads WAV and encodes it as a much smaller MP3", async () => {
        const tone = new Int16Array(24000).map((_, i) => Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / 24000)));
        const parsed = readWav(wav(tone));
        assert.equal(parsed.sampleRate, 24000);
        assert.equal(parsed.channels, 1);
        assert.equal(parsed.samples.length, tone.length);

        const mp3 = await encodeMp3(parsed.samples, parsed.sampleRate);
        assert.ok(mp3.length > 1000 && mp3.length < tone.byteLength / 4, `mp3 is ${mp3.length} bytes`);
        // MPEG frame sync (or an ID3 tag) at the start.
        assert.ok((mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0) || mp3.toString("ascii", 0, 3) === "ID3");
    });

    it("rejects audio that isn't WAV", () => {
        assert.throws(() => readWav(Buffer.from("not audio at all, definitely not")));
    });
});

describe("Nigerian voices", () => {
    it("are Ava and Ethan everywhere unless a Nigerian provider is switched on", () => {
        const saved = process.env.NIGERIAN_VOICE_PROVIDER;
        try {
            delete process.env.NIGERIAN_VOICE_PROVIDER;
            // One interviewer and one coach voice, whatever the region.
            for (const region of ["nigeria", "uk", "us", "somewhere-else"]) {
                assert.match(getVoiceForContext("recruiter", region).voiceId, /Ava/);
                assert.match(getVoiceForContext("coach", region).voiceId, /Ethan/);
            }

            process.env.NIGERIAN_VOICE_PROVIDER = "gemini";
            const recruiter = getVoiceForContext("recruiter", "nigeria");
            const coach = getVoiceForContext("coach", "nigeria");
            assert.equal(recruiter.provider, "gemini");
            assert.match(recruiter.label, /Ngozi/);
            assert.match(recruiter.fallback!.voiceId, /Ezinne/);
            assert.match(coach.label, /Tunde/);
            assert.match(coach.fallback!.voiceId, /Abeo/);
            assert.equal(getVoiceForContext("recruiter", "uk").provider, "azure");

            process.env.NIGERIAN_VOICE_PROVIDER = "spitch";
            const interviewer = getVoiceForContext("recruiter", "nigeria");
            assert.equal(interviewer.voiceId, "kingsley");
            assert.match(interviewer.fallback!.voiceId, /Abeo/);
            assert.equal(getVoiceForContext("coach", "nigeria").voiceId, "lina");
            assert.match(getVoiceForContext("coach", "nigeria").fallback!.voiceId, /Ezinne/);
        } finally {
            if (saved === undefined) delete process.env.NIGERIAN_VOICE_PROVIDER;
            else process.env.NIGERIAN_VOICE_PROVIDER = saved;
        }
    });
});

describe("live audio timing", () => {
    it("gives slower voices longer before giving up on a clip", async () => {
        const { liveAudioTiming } = await import("../src/config/voiceConfig");
        const saved = process.env.NIGERIAN_VOICE_PROVIDER;
        try {
            delete process.env.NIGERIAN_VOICE_PROVIDER;
            // Ava records a sentence in ~2s: drafts get 5s, a first clip 3s.
            assert.deepEqual(liveAudioTiming("recruiter", "Lagos, Nigeria"), { draftBudgetMs: 5000, quickBudgetMs: 3000, lateDraftWaitMs: 4000 });
            process.env.NIGERIAN_VOICE_PROVIDER = "gemini";
            const gemini = liveAudioTiming("recruiter", "nigeria");
            assert.ok(gemini.draftBudgetMs > 4000 && gemini.quickBudgetMs > 2500 && gemini.lateDraftWaitMs > 4000);
        } finally {
            if (saved === undefined) delete process.env.NIGERIAN_VOICE_PROVIDER;
            else process.env.NIGERIAN_VOICE_PROVIDER = saved;
        }
    });
});

describe("first clip", () => {
    it("splits a long opening sentence at its first natural pause", async () => {
        const { replySegments, splitFirstClause } = await import("../src/engine/conversationalEngine");
        assert.deepEqual(
            replySegments({ text: "You mentioned leading the payments migration at your last company, so walk me through how you chose which services to move first. Take your time." }),
            [
                "You mentioned leading the payments migration at your last company,",
                "so walk me through how you chose which services to move first.",
                "Take your time.",
            ]
        );
        // Short sentences, and ones with no pause to split at, stay whole.
        assert.deepEqual(splitFirstClause(["Tell me about a time you failed."]), ["Tell me about a time you failed."]);
        const noPause = "Can you walk me through exactly how you measured the success of that feature after it launched?";
        assert.deepEqual(splitFirstClause([noPause]), [noPause]);
        // Never leaves a stub of under four words.
        const lateComma = "Walk me through how you measured the success of that feature after launch, briefly.";
        assert.deepEqual(splitFirstClause([lateComma]), [lateComma]);
        // The bank question is never split.
        const withQuestion = replySegments({ text: "", bridge: "Thanks.", question: "Tell me about a time you led a team through a difficult change, and what you learned from it." });
        assert.equal(withQuestion[withQuestion.length - 1], "Tell me about a time you led a team through a difficult change, and what you learned from it.");
    });
});

describe("Azure spoken text", () => {
    it("respells a bare Okay only for Dragon HD voices", async () => {
        const { spokenTextFor } = await import("../src/lib/azureTts");
        const tiana = "en-US-Tiana:DragonHDFlashLatestNeural";
        assert.equal(spokenTextFor("Okay.", tiana), "O.K.");
        assert.equal(spokenTextFor("okay", tiana), "O.K.");
        assert.equal(spokenTextFor("Okay. Tell me more.", tiana), "Okay. Tell me more.");
        assert.equal(spokenTextFor("Okay.", "en-US-Ethan:MAI-Voice-2.1"), "Okay.");
    });
});
