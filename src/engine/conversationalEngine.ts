/* ══════════════════════════════════════════════════════════════
   Unified Conversational Turn Engine
   One LLM call per candidate turn: intent detection, a rubric
   assessment of the answer, and a targeted follow-up question.

   It deliberately does NOT see or choose the next bank question —
   the selector does that in parallel. This engine decides whether
   to move on; the orchestrator binds the selector's question into
   the spoken text afterwards (see orchestrator.planTurn).
   ══════════════════════════════════════════════════════════════ */

import { LIVE_TURN_HEDGE_MS, LIVE_TURN_TIMEOUT_MS, callJSON } from "./llm";
import { detectVoiceCommand } from "./voiceCommands";
import type {
    AnswerAssessment,
    AnswerVerdict,
    Blueprint,
    CandidateProfile,
    Competency,
    ProbeDimension,
    SessionDoc,
} from "./types";
import { companyGuidance } from "./company";

export type InterviewToolName =
    | "end_call"
    | "repeat_question"
    | "skip_question"
    | "ask_question"
    | "push_back";

export interface InterviewToolCall {
    tool: InterviewToolName;
    reason?: string;
    systemMessage: string;
    cleanExtraction?: string;
    noteSummary?: string;
}

export interface ConversationalTurnOutput {
    intent: "answer" | "repeat_question" | "end_interview" | "skip_question";
    /** What the model suggested. The orchestrator makes the final call. */
    suggestedTool: InterviewToolName;
    /** Fixed text for end/repeat; empty for answer/skip (bound later). */
    spokenText: string;
    /** Targeted follow-up aimed at the weakest dimension, if any. */
    probeText: string;
    assessment: AnswerAssessment | null;
    cleanExtraction?: string;
    noteSummary: string;
    endCallReason?: string;
}

/** Context about the follow-up chain on the current question. */
export interface ProbeContext {
    rootQuestion: string;
    followUpsSoFar: number;
    maxFollowUps: number;
    depth: "standard" | "deep";
}

function stripBold(text: string): string {
    if (!text) return text;
    return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*\*/g, "");
}

/**
 * Sentences of a spoken reply, as /turn synthesizes them (first sentence
 * first for fast playback). /prepare warms the same clips, so the split must
 * stay identical in both places.
 */
export function splitSpokenSentences(text: string): string[] {
    const matches = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
    const sentences = matches ? matches.map((s) => s.trim()).filter(Boolean) : [];
    return sentences.length > 0 ? sentences : [text];
}

/**
 * The clips a reply is spoken as, in order. A new question is its lead-in
 * sentences followed by the bank question as one clip (pre-recorded by the
 * cache warm-up); anything else is split by sentence. /prepare warms exactly
 * these clips and /turn plays them, so both must use this function.
 */
export function replySegments(reply: { text: string; bridge?: string | null; question?: string | null }): string[] {
    const question = reply.question ? cleanSpokenAudioText(reply.question) : "";
    if (question) {
        const bridge = reply.bridge ? cleanSpokenAudioText(reply.bridge) : "";
        return [...(bridge ? splitFirstClause(splitSpokenSentences(bridge)) : []), question];
    }
    const text = cleanSpokenAudioText(reply.text);
    return text ? splitFirstClause(splitSpokenSentences(text)) : [];
}

/** Below this many words the first clip is already quick to record. */
const LONG_FIRST_CLIP_WORDS = 14;
/** Each side of a clause split keeps at least this many words. */
const MIN_CLAUSE_WORDS = 4;

/**
 * Recording time grows with the length of speech, and only the first clip
 * holds the reply up — the rest record while it plays. So a long first
 * sentence is spoken as two clips, split at its first natural pause (a comma,
 * semicolon or dash) with enough words on each side to sound whole.
 */
export function splitFirstClause(sentences: string[]): string[] {
    const [first, ...rest] = sentences;
    if (!first) return sentences;
    const words = first.split(/\s+/);
    if (words.length < LONG_FIRST_CLIP_WORDS) return sentences;
    for (let i = MIN_CLAUSE_WORDS - 1; i < words.length - MIN_CLAUSE_WORDS; i++) {
        if (/[,;:]$/.test(words[i]) || words[i + 1] === "—" || words[i + 1] === "-") {
            const cut = /[,;:]$/.test(words[i]) ? i + 1 : i + 2;
            if (words.length - cut < MIN_CLAUSE_WORDS) break;
            return [words.slice(0, cut).join(" "), words.slice(cut).join(" "), ...rest];
        }
    }
    return sentences;
}

export function cleanSpokenAudioText(text: string): string {
    if (!text) return "";
    return text
        // If end_call JSON format, extract the system message to speak
        .replace(/end_call\{[\s\S]*?system__message_to_speak:\s*([^}]+)\}/g, "$1")
        .replace(/end_call\{[\s\S]*?\}/g, "")
        // Strip emotion/prosody tags like [happy], [slow], [thoughtful] so TTS engines speak naturally
        .replace(/\[[a-zA-Z0-9_\s]+\]/g, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}

const SYSTEM_PROMPT = `You are a seasoned, fair interviewer. You listen to the candidate's actual words, judge whether they have really demonstrated what they claim, and ask sharp follow-up questions when they have not.

STEP 1 — ASSESS the candidate's latest answer on four dimensions, 0 to 3 each:
- specificity: 0 = generalities only; 1 = a situation named but vague; 2 = concrete situation with some detail; 3 = concrete systems, people, numbers, constraints.
- ownership: 0 = only "we"/"the team"; 1 = unclear personal role; 2 = clear personal actions; 3 = clear personal decisions and why they made them.
- depth: 0 = buzzwords; 1 = describes what, not how; 2 = explains how; 3 = explains why, trade-offs, alternatives, what went wrong.
- evidence: 0 = no outcome; 1 = vague outcome ("it went well"); 2 = concrete outcome; 3 = measured outcome plus a lesson learned.
Then a verdict:
- "verified": they clearly demonstrated real, first-hand knowledge for this question.
- "partial": real but thin in one dimension; acceptable to move on.
- "vague": mostly generalities, no concrete example, or claims without substance.
- "evasive": sidesteps the question, answers a different question, or deflects.
Also report: weakest_dimension, said_dont_know (they admitted not knowing or not having done it), contradiction (conflicts with something they said earlier or with their profile), claim_summary (one short phrase: what they claimed).

The transcript comes from live speech recognition and may contain misheard words. Judge the substance, never penalise garbled words or grammar.

STEP 2 — PICK A TOOL:
- end_call: ONLY when they clearly want to end the WHOLE interview ("end the interview", "I have to stop the interview now"). "I'm done", "that's all", "that's it" after an answer mean the ANSWER is complete — not end_call.
- repeat_question: they ask to hear or clarify the question again.
- skip_question: they ask to skip or pass on this question.
- push_back: the answer is vague, evasive, or contradictory and a follow-up is needed before they have proven it.
- ask_question: the answer is verified or good enough — move on. The system will ask the next planned question itself; do not write it.

STEP 3 — WRITE probe_question whenever the verdict is not "verified" and they did not say they don't know (even if you picked ask_question; the controller may still use it). Rules:
- Target the weakest dimension and quote or reference their own words ("You mentioned ...").
- Escalate with the number of follow-ups already asked on this question:
  0 so far → clarify / get the concrete example ("Can you walk me through a specific time...", "What exactly did you change?").
  1 so far → mechanism / reasoning ("Why that approach over ...?", "How did it actually work?", "What went wrong along the way?").
  2+ so far → verification ("If X doubled tomorrow, what would fail first?", "What would you do differently?", "How did you know it worked?").
- Never repeat a follow-up already asked (see the transcript). One focused question, 1 to 2 spoken sentences.
- Curious and professional, never accusatory. From the second follow-up on, you may add that it is fine to say if they have not done something.
- Plain spoken text only — no markdown, no lists.
- If the candidate points out that the question doesn't apply to them (e.g. no company or employer was specified, or it assumes experience they said they don't have), that is not evasion: do not push back on it — choose ask_question so the interview moves on, and leave probe_question empty.
- Do not open with a generic acknowledgement ("Got it", "Okay", "Thanks for sharing") — the interviewer has already said one. Open by engaging with what they said, e.g. "But let me push back a bit on that." or "Writing PRDs gives me the process, but...".

OUTPUT ONLY THIS JSON:
{
  "assessment": {
    "specificity": 0-3, "ownership": 0-3, "depth": 0-3, "evidence": 0-3,
    "verdict": "verified" | "partial" | "vague" | "evasive",
    "weakest_dimension": "specificity" | "ownership" | "depth" | "evidence" | null,
    "said_dont_know": true | false,
    "contradiction": true | false,
    "claim_summary": "<short phrase>"
  },
  "tool_call": {
    "tool": "end_call" | "repeat_question" | "skip_question" | "push_back" | "ask_question",
    "args": {
      "reason": "<why>",
      "clean_extraction": "<exact phrase from their answer worth noting, or null>",
      "note_summary": "<1-2 sentence running note on what they demonstrated>"
    }
  },
  "probe_question": "<follow-up question, or empty string>"
}`;

const VERDICTS: AnswerVerdict[] = ["verified", "partial", "vague", "evasive"];
const DIMENSIONS: ProbeDimension[] = ["specificity", "ownership", "depth", "evidence"];

function clampScore(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 0;
}

function parseAssessment(raw: unknown): AnswerAssessment | null {
    if (!raw || typeof raw !== "object") return null;
    const a = raw as Record<string, unknown>;
    const verdict = VERDICTS.includes(a.verdict as AnswerVerdict) ? (a.verdict as AnswerVerdict) : null;
    if (!verdict) return null;
    const weakest = DIMENSIONS.includes(a.weakest_dimension as ProbeDimension)
        ? (a.weakest_dimension as ProbeDimension)
        : null;
    return {
        specificity: clampScore(a.specificity),
        ownership: clampScore(a.ownership),
        depth: clampScore(a.depth),
        evidence: clampScore(a.evidence),
        verdict,
        weakestDimension: weakest,
        saidDontKnow: a.said_dont_know === true,
        contradiction: a.contradiction === true,
        claimSummary: typeof a.claim_summary === "string" ? a.claim_summary.slice(0, 200) : "",
    };
}

/** Deterministic follow-up used when the model gives none (offline/mock). */
export function fallbackProbe(dimension: ProbeDimension | null, followUpsSoFar: number): string {
    if (followUpsSoFar >= 2) {
        return "Let me test that a little further: if you had to do it again tomorrow, what is the first thing you would change, and why?";
    }
    switch (dimension) {
        case "ownership":
            return "You've described what the team did. What were the specific decisions you made yourself?";
        case "depth":
            return "Walk me through how that actually worked. Why did you choose that approach over the alternatives?";
        case "evidence":
            return "How did you know it worked? What was the measurable result?";
        default:
            return "Can you give me a specific example? Walk me through one situation and exactly what you did.";
    }
}

function endCallOutput(candidateName: string, answerText: string): ConversationalTurnOutput {
    const systemMessage = `Understood, ${candidateName}. Thank you for taking the time to speak with me today. Have a great rest of your day!`;
    const reason = `The candidate explicitly indicated they want to end the call by saying '${answerText.slice(0, 80)}'`;
    return {
        intent: "end_interview",
        suggestedTool: "end_call",
        spokenText: `end_call{reason:${reason},system__message_to_speak:${systemMessage}}`,
        probeText: "",
        assessment: null,
        noteSummary: "Candidate requested to end interview.",
        endCallReason: reason,
    };
}

export async function executeConversationalTurn(opts: {
    session: SessionDoc;
    blueprint: Blueprint;
    competency: Competency | null;
    answerText: string;
    profile: CandidateProfile | null;
    probe: ProbeContext | null;
}): Promise<ConversationalTurnOutput> {
    const { session, blueprint, competency, answerText, profile, probe } = opts;
    const candidateName = session.candidateName || "Candidate";
    const roleName = session.interviewType || blueprint.role || "this role";
    const compLabel = competency?.label || "General background";

    const lastInterviewerTurn = session.transcript
        .filter((t) => t.role === "interviewer")
        .slice(-1)[0]?.text || session.pendingQuestion?.text || "Initial question";

    // Fast paths: explicit voice commands never need the model.
    const command = detectVoiceCommand(answerText);
    if (command === "end_call") return endCallOutput(candidateName, answerText);
    if (command === "repeat_question") {
        return {
            intent: "repeat_question",
            suggestedTool: "repeat_question",
            spokenText: `No problem at all! I asked: ${lastInterviewerTurn} Take your time.`,
            probeText: "",
            assessment: null,
            noteSummary: "Candidate requested question repetition.",
        };
    }
    if (command === "skip_question") {
        return {
            intent: "skip_question",
            suggestedTool: "skip_question",
            spokenText: "",
            probeText: "",
            assessment: null,
            noteSummary: "Candidate requested to skip question.",
        };
    }

    const recentHistory = session.transcript
        .slice(-8)
        .map((t) => `${t.role === "interviewer" ? "Interviewer" : candidateName}: ${t.text}`)
        .join("\n");

    const probeBlock = probe
        ? `Original question for this thread: "${probe.rootQuestion}"
Follow-ups already asked on it: ${probe.followUpsSoFar} (maximum ${probe.maxFollowUps}; probing intensity: ${probe.depth})`
        : "This is the opening/background answer — assess it, but follow-ups are not used here.";

    const userPrompt = `Candidate: ${candidateName}
${companyGuidance(session.company)}
Role: ${roleName}
Current section: ${compLabel}

Question just asked:
"${lastInterviewerTurn}"

${probeBlock}

Candidate's latest answer:
"${answerText}"

Candidate profile highlights (if any):
${profile?.claims?.slice(0, 4).map((c) => `- ${c.text}`).join("\n") || "None provided"}

Recent transcript:
${recentHistory || "(Start of conversation)"}`;

    try {
        const raw = await callJSON<{
            assessment?: unknown;
            tool_call?: { tool?: string; args?: Record<string, unknown> };
            probe_question?: string;
        }>({
            system: SYSTEM_PROMPT,
            user: userPrompt,
            timeoutMs: LIVE_TURN_TIMEOUT_MS,
            hedgeMs: LIVE_TURN_HEDGE_MS,
            maxTokens: 450,
            mock: {
                assessment: {
                    specificity: answerText.length > 200 ? 2 : 1,
                    ownership: 2,
                    depth: answerText.length > 200 ? 2 : 1,
                    evidence: 1,
                    verdict: answerText.length > 200 ? "partial" : "vague",
                    weakest_dimension: "evidence",
                    said_dont_know: false,
                    contradiction: false,
                    claim_summary: answerText.slice(0, 60),
                },
                tool_call: {
                    tool: "ask_question",
                    args: { reason: "mock", clean_extraction: answerText.slice(0, 40), note_summary: `Discussed: ${answerText.slice(0, 80)}` },
                },
                probe_question: "",
            },
        });

        const tool = (raw.tool_call?.tool as InterviewToolName) || "ask_question";
        const args = raw.tool_call?.args || {};
        const reason = typeof args.reason === "string" ? args.reason : undefined;
        const assessment = parseAssessment(raw.assessment);
        const probeText = stripBold(typeof raw.probe_question === "string" ? raw.probe_question.trim() : "");
        const noteSummary =
            (typeof args.note_summary === "string" && args.note_summary) || answerText.slice(0, 100);
        const cleanExtraction = typeof args.clean_extraction === "string" ? args.clean_extraction : undefined;

        if (tool === "end_call") return endCallOutput(candidateName, answerText);
        if (tool === "repeat_question") {
            return {
                intent: "repeat_question",
                suggestedTool: tool,
                spokenText: `No problem at all! I asked: ${lastInterviewerTurn} Take your time.`,
                probeText: "",
                assessment,
                noteSummary,
            };
        }

        return {
            intent: tool === "skip_question" ? "skip_question" : "answer",
            suggestedTool: tool,
            spokenText: "",
            probeText,
            assessment,
            cleanExtraction,
            noteSummary,
            endCallReason: reason,
        };
    } catch (err) {
        console.warn("[conversationalEngine] Fallback triggered:", err);
        return {
            intent: "answer",
            suggestedTool: "ask_question",
            spokenText: "",
            probeText: "",
            assessment: null,
            noteSummary: `Answered: ${answerText.slice(0, 80)}`,
        };
    }
}
