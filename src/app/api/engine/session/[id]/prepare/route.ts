import { NextRequest, NextResponse, after } from "next/server";
import { prepareAnswer } from "@/engine/orchestrator";
import { getProfile } from "@/engine/sessionStore";
import { loadOwnedSession } from "@/engine/sessionAccess";
import { traceTurn } from "@/engine/turnTrace";
import { replySegments } from "@/engine/conversationalEngine";
import { getCachedAudio } from "@/services/ttsService";
import type { Persona } from "@/config/voiceConfig";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { classifyAnswer, pickAcknowledgement } from "@/config/fillerConfig";

/** Longest a draft waits for its audio before replying without the links. */
const DRAFT_AUDIO_BUDGET_MS = 4000;

/**
 * Read-only turn warm-up. This never writes to the interview session or asks
 * the next question; it only prepares the decision for an exact final STT
 * transcript that may arrive a moment later.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { answerText, persona, jobRegion } = await req.json();
        const turnId = req.headers.get("x-onscript-turn-id");
        traceTurn(turnId, "prepare_request_received");
        if (typeof answerText !== "string" || !answerText.trim()) {
            return NextResponse.json({ prepared: false }, { status: 400 });
        }
        const access = await loadOwnedSession(req, id);
        if ("errorResponse" in access) return access.errorResponse;
        // Drafts are optional: over the limit, just skip drafting.
        if (await rateLimit(LIMITS.draft, `user:${access.auth.email}`)) return NextResponse.json({ prepared: false });
        const prepared = await prepareAnswer({
            sessionId: id,
            answerText,
            profile: await getProfile(access.session.candidateId),
            turnId: turnId || undefined,
            session: access.session,
        });
        // The reply as the client will speak it if this draft is used: a fitting
        // acknowledgement flowing straight into the reply's first sentence as
        // ONE clip ("I see. Why are you interested in this position?"), then
        // the rest (lead-in, bank question). No separate filler, no pause.
        const replyParts = prepared
            ? replySegments({ text: prepared.spokenText, bridge: prepared.bridge, question: prepared.question })
            : [];
        const speakable = prepared?.action === "probe" || prepared?.action === "next";
        const weakAnswer = prepared?.verdict === "vague" || prepared?.verdict === "evasive";
        const ack = speakable && replyParts.length ? pickAcknowledgement(classifyAnswer(answerText), weakAnswer) : null;
        // Also recorded without the acknowledgement: if the turn ends before
        // this draft is ready, the client says a standalone "Okay." first and
        // then continues straight into these.
        const leadWithAck = ack ? `${ack} ${replyParts[0]}` : null;
        const clips = leadWithAck ? [leadWithAck, ...replyParts] : replyParts;
        // Recorded in parallel; the browser pre-loads them while the candidate is
        // still talking. A draft is optional, so audio is capped in time.
        const urls = new Map<string, string>();
        if (clips.length) {
            const voicePersona: Persona = persona === "coach" ? "coach" : "recruiter";
            const region =
                access.session.voiceRegion || (typeof jobRegion === "string" && jobRegion ? jobRegion : "nigeria");
            const synthesis = Promise.all(
                clips.map((clip) =>
                    getCachedAudio(clip, voicePersona, region, turnId || undefined)
                        .then((r) => urls.set(clip, r.audioUrl))
                        .catch(() => undefined)
                )
            );
            const ready = await Promise.race([
                synthesis.then(() => true),
                new Promise<false>((resolve) => setTimeout(() => resolve(false), DRAFT_AUDIO_BUDGET_MS)),
            ]);
            if (!ready) after(() => synthesis.then(() => undefined));
        }
        const withUrls = (texts: string[]) => {
            const list = texts.map((text) => ({ text, audioUrl: urls.get(text) ?? "" }));
            return list.length && list.every((clip) => clip.audioUrl) ? list : null;
        };
        const audioSegments = clips.map((text) => ({ text, audioUrl: urls.get(text) ?? "" }));
        // The client may begin warming this exact immutable utterance, but it
        // still cannot play anything until endpointing submits the same text.
        return NextResponse.json({
            prepared: Boolean(prepared),
            preparedText: prepared?.spokenText || null,
            action: prepared?.action || null,
            questionId: prepared?.questionId || null,
            bridge: prepared?.bridge || null,
            question: prepared?.question || null,
            verdict: prepared?.verdict || null,
            // Present only when every clip is recorded: the client may then speak
            // this draft and commit it via /turn. spokenSegments open with the
            // acknowledgement (turn just ended); plainSegments don't (a filler
            // acknowledgement already played).
            spokenSegments: leadWithAck ? withUrls([leadWithAck, ...replyParts.slice(1)]) : null,
            plainSegments: speakable ? withUrls(replyParts) : null,
            audioSegments,
            audioPlan: prepared?.spokenText ? { text: prepared.spokenText } : null,
        });
    } catch {
        // Preparation is strictly opportunistic; a normal submitted turn
        // remains fully functional if this request is cancelled or fails.
        return NextResponse.json({ prepared: false });
    }
}
