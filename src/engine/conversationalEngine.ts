/* ══════════════════════════════════════════════════════════════
   Unified Conversational Turn Engine (Jobmentis-Caliber)
   Single high-speed LLM call for intent detection, depth analysis,
   pushback/probes, clean verbatim extractions, and natural bridges.
   ══════════════════════════════════════════════════════════════ */

import { callJSON } from "./llm";
import type { Blueprint, CandidateProfile, Competency, SessionDoc } from "./types";

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
    action: "push_back" | "follow_up" | "next_question" | "repeat" | "end_call" | "skip";
    cleanExtraction?: string;
    spokenText: string;
    noteSummary: string;
    endCallReason?: string;
    advanceSection?: boolean;
    toolCall?: InterviewToolCall;
}

function stripBold(text: string): string {
    if (!text) return text;
    return text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*\*/g, "");
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

const SYSTEM_PROMPT = `You are a professional, authentic AI interviewer. You listen attentively to the candidate's actual words and respond like a seasoned human interviewer.
You are equipped with SPEECH-TO-ACTION TOOL CALLING functions.

AVAILABLE TOOLS:
1. end_call:
   Triggered when candidate explicitly wants to stop, end, or conclude the call (e.g. "I am done with the interview", "end the call", "that'll be all for now, thank you", "I have to stop now").
   Args:
     - reason: "The candidate explicitly requested to end the interview"
     - system__message_to_speak: "Understood, <candidateName>. Thank you for taking the time to speak with me today. Have a great rest of your day!"

2. repeat_question:
   Triggered when candidate asks to repeat, clarify, or re-read the question (e.g. "can you repeat the question?", "what was the question again?", "could you say that one more time?").
   Args:
     - system__message_to_speak: "No problem at all! I asked: <repeat the question clearly>. Take your time."

3. skip_question:
   Triggered when candidate asks to skip or pass on the current question (e.g. "can we skip this question?", "I'd like to pass on this one", "let's go to the next question").
   Args:
     - reason: "Candidate requested to skip question"
     - system__message_to_speak: "No problem, let's move right along. <ask the next question>"

4. push_back:
   Triggered rarely: only when the candidate's answer to the CURRENT question is materially incomplete or evasive and one concise clarification is essential before moving on. Do not use it merely because another detail could be interesting.
   Args:
     - clean_extraction: "<quote or summarize candidate's specific mention>"
     - system__message_to_speak: "Got it. But let me push back a bit on that. You mentioned <clean_extraction>, but I want to understand your specific, hands-on contribution. What was a specific roadblock or failure mode you encountered in that initiative, how did you personally address it, and how did you measure success?"
     - note_summary: "<1-2 sentence running note>"

5. ask_question:
   Default after a substantive answer. Ask the supplied "Next Question In Section Pool" so the structured interview plan remains the backbone of the conversation.
   Args:
     - clean_extraction: "<quote or summarize a specific highlight from candidate's answer>"
     - system__message_to_speak: "<natural continuation into nextPoolQuestion, grounded in clean_extraction>"
     - note_summary: "<1-2 sentence running note>"

OUTPUT JSON SCHEMA:
{
  "tool_call": {
    "tool": "end_call" | "repeat_question" | "skip_question" | "push_back" | "ask_question",
    "args": {
      "reason": "<reason string if applicable>",
      "system__message_to_speak": "<the exact natural spoken response to speak to candidate>",
      "clean_extraction": "<exact phrase or topic extracted from candidate's words, or null>",
      "note_summary": "<1-2 sentence running note of candidate's points, or null>"
    }
  },
  "advance_section": true or false
}

Rules:
- Be authentic, responsive, and original. NEVER use canned scripts or mention topics the candidate never spoke about. Ground your reaction in what the candidate ACTUALLY said.
- Use natural spoken language. 1 to 3 spoken sentences max.
- A short bridge may already have played while you were thinking. Do not restart with "Thanks", "Got it", or "Moving on". Continue naturally into the question, for example: "On that point, walk me through..." or "I want to understand how you handled...".
- The scripted pool is authoritative: when using ask_question, ask the supplied next pool question. You may add at most one short, neutral transition, but do not replace it with a new question based only on the latest answer.
- Favor ask_question. The controller may reject push_back when its follow-up budget is exhausted or the previous turn was already a follow-up.
- Plain text only (no markdown asterisks ** or bullet lists).`;

export async function executeConversationalTurn(opts: {
    session: SessionDoc;
    blueprint: Blueprint;
    competency: Competency | null;
    answerText: string;
    profile: CandidateProfile | null;
    nextPoolQuestion?: string | null;
}): Promise<ConversationalTurnOutput> {
    const { session, blueprint, competency, answerText, profile, nextPoolQuestion } = opts;
    const candidateName = session.candidateName || "Candidate";
    const companyName = session.company && session.company !== "General" ? session.company : "our company";
    const roleName = session.interviewType || blueprint.role || "this role";
    const compLabel = competency?.label || "Core Competency";

    const lastInterviewerTurn = session.transcript
        .filter((t) => t.role === "interviewer")
        .slice(-1)[0]?.text || session.pendingQuestion?.text || "Initial question";

    // Recent conversation transcript (last 6 turns for immediate context)
    const recentHistory = session.transcript
        .slice(-6)
        .map((t) => `${t.role === "interviewer" ? "Interviewer" : candidateName}: ${t.text}`)
        .join("\n");

    const userPrompt = `Candidate Name: ${candidateName}
Company: ${companyName}
Role: ${roleName}
Interviewer: AI Interviewer
Current Turn Number: ${session.turnCount}
Current Section/Competency: ${compLabel}

Pending Question Asked:
"${lastInterviewerTurn}"

Candidate's Latest Utterance:
"${answerText}"

Candidate Profile Highlights (if any):
${profile?.claims?.slice(0, 3).map((c) => `- ${c.text}`).join("\n") || "None provided"}

Next Question In Section Pool:
"${nextPoolQuestion || "Tell me about a complex project where you had to handle conflicting stakeholder requirements and deliver under a tight deadline."}"

Recent Transcript:
${recentHistory || "(Start of conversation)"}`;

    const textLower = answerText.toLowerCase().trim();

    // 1. FAST-PATH: Speech-to-action "end_call" (e.g. "I am done with the interview")
    if (/\b(i am done|i'm done|done with the interview|end the interview|end the call|stop the interview|stop the call|wrap it up|wrap up|that'll be all|that will be all|all for now)\b/i.test(textLower)) {
        const systemMessage = `Understood, ${candidateName}. Thank you for taking the time to speak with me today. Have a great rest of your day!`;
        return {
            intent: "end_interview",
            action: "end_call",
            spokenText: `end_call{reason:The user explicitly indicated they want to end the call by saying '${answerText.slice(0, 60)}',system__message_to_speak:${systemMessage}}`,
            noteSummary: "Candidate requested to end interview.",
            endCallReason: `The candidate explicitly indicated they want to end the call by saying '${answerText}'`,
            advanceSection: false,
            toolCall: {
                tool: "end_call",
                reason: `The candidate explicitly indicated they want to end the call by saying '${answerText}'`,
                systemMessage,
            },
        };
    }

    // 2. FAST-PATH: Speech-to-action "repeat_question"
    if (/\b(repeat|say that again|one more time|pardon|didn't catch|did not catch|can you repeat|could you repeat)\b/i.test(textLower)) {
        const systemMessage = `No problem at all! I asked: ${lastInterviewerTurn} Take your time.`;
        return {
            intent: "repeat_question",
            action: "repeat",
            spokenText: systemMessage,
            noteSummary: "Candidate requested question repetition.",
            advanceSection: false,
            toolCall: {
                tool: "repeat_question",
                reason: "Candidate asked for question repetition",
                systemMessage,
            },
        };
    }

    // 3. FAST-PATH: Speech-to-action "skip_question"
    if (/\b(skip this question|skip question|pass on this|next question please|can we skip)\b/i.test(textLower)) {
        const systemMessage = `No problem, let's move right along. ${nextPoolQuestion || "Tell me about another situation where you had to solve a complex challenge under pressure."}`;
        return {
            intent: "skip_question",
            action: "next_question",
            spokenText: systemMessage,
            noteSummary: "Candidate requested to skip question.",
            advanceSection: true,
            toolCall: {
                tool: "skip_question",
                reason: "Candidate skipped the question",
                systemMessage,
            },
        };
    }

    try {
        const raw = await callJSON<any>({
            system: SYSTEM_PROMPT,
            user: userPrompt,
            maxTokens: 350,
            mock: {
                tool_call: {
                    tool: "ask_question",
                    args: {
                        clean_extraction: answerText.slice(0, 40),
                        system__message_to_speak: `On that point, ${nextPoolQuestion || "could you tell me about a time you had to make a difficult trade-off under tight constraints?"}`,
                        note_summary: `Discussed: ${answerText.slice(0, 80)}`,
                    },
                },
                advance_section: true,
            },
        });

        if (raw.tool_call) {
            const tool = raw.tool_call.tool as InterviewToolName;
            const args = raw.tool_call.args || {};
            const systemMessage = stripBold(args.system__message_to_speak || raw.spokenText || "");
            return {
                intent: tool === "end_call" ? "end_interview" : tool === "repeat_question" ? "repeat_question" : tool === "skip_question" ? "skip_question" : "answer",
                action: tool === "end_call" ? "end_call" : tool === "repeat_question" ? "repeat" : tool === "push_back" ? "push_back" : "next_question",
                cleanExtraction: args.clean_extraction,
                spokenText: tool === "end_call" ? `end_call{reason:${args.reason || "Candidate requested to end call"},system__message_to_speak:${systemMessage}}` : systemMessage,
                noteSummary: args.note_summary || answerText.slice(0, 100),
                endCallReason: args.reason,
                advanceSection: !!raw.advance_section || !!raw.advanceSection,
                toolCall: {
                    tool,
                    reason: args.reason,
                    systemMessage,
                    cleanExtraction: args.clean_extraction,
                    noteSummary: args.note_summary,
                },
            };
        }

        if (raw.spokenText && raw.spokenText.trim()) {
            const isEndCall = raw.spokenText.includes("end_call{") || raw.intent === "end_interview" || raw.action === "end_call";
            return {
                intent: isEndCall ? "end_interview" : raw.intent || "answer",
                action: isEndCall ? "end_call" : raw.action || "next_question",
                cleanExtraction: raw.cleanExtraction || undefined,
                spokenText: stripBold(raw.spokenText.trim()),
                noteSummary: raw.noteSummary || answerText.slice(0, 100),
                endCallReason: raw.endCallReason || undefined,
                advanceSection: !!raw.advanceSection,
                toolCall: {
                    tool: isEndCall ? "end_call" : raw.action === "push_back" ? "push_back" : "ask_question",
                    reason: raw.endCallReason,
                    systemMessage: cleanSpokenAudioText(raw.spokenText),
                    cleanExtraction: raw.cleanExtraction,
                    noteSummary: raw.noteSummary,
                },
            };
        }
        throw new Error("Empty spokenText from conversational engine");
    } catch (err) {
        console.warn("[conversationalEngine] Fallback triggered:", err);

        return {
            intent: "answer",
            action: "next_question",
            spokenText: `Building on that, ${nextPoolQuestion || "can you tell me about another situation where you had to solve a complex challenge under pressure?"}`,
            noteSummary: `Answered: ${answerText.slice(0, 80)}`,
            advanceSection: true,
            toolCall: {
                tool: "ask_question",
                systemMessage: `Building on that, ${nextPoolQuestion || "can you tell me about another situation where you had to solve a complex challenge under pressure?"}`,
            },
        };
    }
}
