/** Natural bridges between an answer and the next question. */
export type FillerLength = "short" | "long";

export interface ContextualFillerCategory {
  keywords: string[];
  phrases: string[];
  longerPhrases: string[];
}

export const CONTEXTUAL_FILLER_CATEGORIES: Record<string, ContextualFillerCategory> = {
  technical: {
    keywords: ["architecture", "database", "api", "service", "microservice", "microservices", "redis", "postgres", "postgresql", "sql", "pipeline", "docker", "kubernetes", "aws", "cloud", "cache", "caching", "migration", "stack", "frontend", "backend", "kafka", "monolith", "deadlock", "cluster", "deploy", "ci/cd", "payment", "integration"],
    phrases: ["That makes the technical picture clearer.", "That technical context is useful.", "I have that implementation picture."],
    longerPhrases: ["That gives me a clearer picture of the technical decisions involved. I’m keeping that context in mind as we move on.", "I’m following how you approached the implementation and the trade-offs around it. Let me hold on to that detail for the next part."],
  },
  metrics: {
    keywords: ["percent", "%", "million", "billion", "latency", "throughput", "users", "scale", "revenue", "growth", "reduced", "increased", "metrics", "roi", "uptime", "downtime", "traffic", "tps", "qps", "impact"],
    phrases: ["That impact is helpful context.", "The outcome there is useful context.", "That gives me a useful sense of the scale."],
    longerPhrases: ["That helps me connect your work to the outcome it produced. I’m keeping the scale and impact in view as we continue.", "I have the result and the scale of it in mind. That context will be useful for the next question."],
  },
  challenges: {
    keywords: ["conflict", "disagreed", "disagreement", "difficult", "challenge", "bug", "incident", "outage", "failure", "pressure", "deadline", "blocker", "crisis", "friction", "obstacle", "trade-off", "tradeoff", "problem"],
    phrases: ["That frames the challenge clearly.", "That’s useful context on the obstacle.", "I’m following the problem you had to work through."],
    longerPhrases: ["That gives me a useful view of the constraint you were working through. I’m keeping that challenge in mind as we move to the next area.", "I understand the obstacle and the pressure around it. Let me carry that context into the next part of the conversation."],
  },
  leadership: {
    keywords: ["team", "mentored", "mentoring", "stakeholder", "stakeholders", "leadership", "aligned", "cross-functional", "product manager", "collaborated", "collaboration", "managed", "initiative", "hired", "culture", "direction"],
    phrases: ["That people context is helpful.", "That clarifies how you worked with the team.", "That gives me a sense of your role in it."],
    longerPhrases: ["That helps me understand how you worked with the people around the problem. I’m keeping your role in that collaboration in mind.", "I have a clearer picture of the stakeholders and your contribution there. Let’s carry that context into the next question."],
  },
  general: {
    keywords: [],
    phrases: ["Understood.", "I see.", "That’s helpful context.", "I’m with you.", "Got it."],
    longerPhrases: ["That gives me helpful context about your experience. I’m keeping it in mind as we continue.", "I have that part of your background in mind. Let me connect it with the next area we need to cover."],
  },
};

/**
 * Spoken the instant the candidate stops talking, while the reply is still
 * being finished — like a person saying "Okay." before responding properly.
 * Neutral ones fit short or vague answers; engaged ones only follow a real,
 * substantive answer; objections get their own (below).
 */
export const NEUTRAL_ACKNOWLEDGEMENTS = ["Okay.", "Right.", "I see.", "Alright.", "Understood.", "Fair enough."];
export const ENGAGED_ACKNOWLEDGEMENTS = [
  "Got it.",
  "Interesting.",
  "Okay, that makes sense.",
  "Thanks for walking me through that.",
];
export const ACKNOWLEDGEMENTS = [...NEUTRAL_ACKNOWLEDGEMENTS, ...ENGAGED_ACKNOWLEDGEMENTS];

/**
 * For an objection or correction ("there's no company here"): acknowledges
 * their point, then the reply responds to it directly — no second line.
 */
export const OBJECTION_ACKNOWLEDGEMENTS = ["Fair point.", "Thanks for clarifying.", "Okay, noted.", "Understood."];

/**
 * What kind of turn the candidate just took, from their words alone:
 * - "objection": pushes back, corrects the question, asks something back, or
 *   says they don't know / haven't done it — never praise or "helpful context".
 * - "brief": too short to react to with anything but a neutral "Okay."
 * - "substantive": a real answer.
 */
export type AnswerKind = "objection" | "brief" | "substantive";

const OBJECTION =
  /\b(there (is|was|are|were)n?'?t? no|there isn'?t|there wasn'?t|no (company|employer|role|job) (was )?(given|cited|mentioned|specified)|you (didn'?t|did not) (say|mention|specify|give)|not (applicable|relevant)|doesn'?t apply|that'?s not (right|correct|what)|i (don'?t|do not) (know|understand|have)|not sure|what do you mean|can you (clarify|explain|rephrase)|i haven'?t|i have not|never (done|had|worked|been)|no idea|i can'?t (answer|say))\b/i;

export function classifyAnswer(text: string): AnswerKind {
  const trimmed = text.trim();
  if (OBJECTION.test(trimmed) || /\?\s*$/.test(trimmed)) return "objection";
  if (trimmed.split(/\s+/).filter(Boolean).length < 12) return "brief";
  return "substantive";
}

/** Leads into the next bank question when no answer-specific lead-in is ready. */
export const TRANSITIONS = [
  "Let's move on to the next question.",
  "Let me shift gears a little.",
  "Let's look at a different area now.",
  "Building on that, let's move to another topic.",
  "Let's move into the next question then.",
];

/** Leads into a follow-up on the same answer while it is still being finished. */
export const PROBE_LEADINS = [
  "I'd like to dig into that a little more.",
  "Let me go a bit deeper on that.",
  "I want to stay on that for a moment.",
  "Let me press on that a little.",
];

/**
 * Second holding lines, only used if the reply is still not ready after the
 * first one. Each fits only the direction the drafted reply is known to take,
 * so whatever arrives next follows naturally.
 */
export const NEXT_QUESTION_HOLDS = [
  "There's another area I'd like to explore with you.",
  "I'd like to hear about a different side of your experience.",
];
export const PROBE_HOLDS = [
  "There's one part of that I'd like to understand better.",
  "I want to make sure I understand your part in that.",
];

const recentlyUsed: string[] = [];

/** Picks from a list, avoiding the last few lines used so the interviewer doesn't repeat itself. */
export function pickFresh(options: string[]): string {
  const fresh = options.filter((o) => !recentlyUsed.includes(o));
  const choice = pick(fresh.length ? fresh : options);
  recentlyUsed.push(choice);
  if (recentlyUsed.length > 6) recentlyUsed.shift();
  return choice;
}

/**
 * An acknowledgement that fits the answer. Engaged ones need a substantive
 * answer that the draft (if any) didn't judge vague or evasive.
 */
export function pickAcknowledgement(kind: AnswerKind = "substantive", weakAnswer = false): string {
  if (kind === "objection") return pickFresh(OBJECTION_ACKNOWLEDGEMENTS);
  return pickFresh(kind === "substantive" && !weakAnswer ? ACKNOWLEDGEMENTS : NEUTRAL_ACKNOWLEDGEMENTS);
}

// Every phrase a filler can use. All are pre-synthesized in the interview's
// voice, because fillers only play from cache (see useTtsAudio.playIfCached).
export const CONVERSATIONAL_FILLERS = [
  ...ACKNOWLEDGEMENTS,
  ...TRANSITIONS,
  ...PROBE_LEADINS,
  ...OBJECTION_ACKNOWLEDGEMENTS,
  ...NEXT_QUESTION_HOLDS,
  ...PROBE_HOLDS,
  ...Object.values(CONTEXTUAL_FILLER_CATEGORIES).flatMap((category) => category.phrases),
];

function matchesKeyword(textLower: string, keyword: string): boolean {
  if (keyword === "%") return textLower.includes("%");
  const escaped = keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(textLower);
}

function pick(phrases: string[]): string {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

function conversationAnchor(text: string): string | null {
  const organisation = text.match(/\b(?:at|with|for|on|of)\s+([A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){0,2})\b/)?.[1];
  if (organisation && organisation.length >= 3) return `your work at ${organisation}`;

  const project = text.match(/\b(?:built|building|developed|developing|led|leading|launched|launching)\s+(?:the\s+)?([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,4})/i)?.[1];
  if (project && project.split(/\s+/).length >= 2) return project.replace(/\s+(?:and|with|for|to)$/i, "");
  return null;
}

/** Chooses a varied bridge and uses a safe, concise callback when available. */
export function getContextualFiller(candidateTranscript?: string, recentCandidateTurns: string[] = [], length: FillerLength = "short"): string {
  const latest = candidateTranscript?.trim() || "";
  const conversationText = [latest, ...recentCandidateTurns].filter(Boolean).join(" ");
  const textLower = latest.toLowerCase();
  let bestCategory = "general";
  let highestScore = 0;

  for (const [name, category] of Object.entries(CONTEXTUAL_FILLER_CATEGORIES)) {
    if (name === "general") continue;
    const score = category.keywords.reduce((total, keyword) => total + (matchesKeyword(textLower, keyword) ? 1 : 0), 0);
    if (score > highestScore) {
      bestCategory = name;
      highestScore = score;
    }
  }

  const category = CONTEXTUAL_FILLER_CATEGORIES[bestCategory];
  if (length === "short") return pick(category.phrases);

  const anchor = conversationAnchor(conversationText);
  if (anchor) {
    return pick([
      `I’m keeping ${anchor} in mind. It gives useful context for where I want to take the conversation next.`,
      `That helps me place ${anchor} in the wider story of your experience. Let me hold on to that as we continue.`,
    ]);
  }
  return pick(category.longerPhrases);
}

export function getRandomFiller(): string {
  return pick(CONTEXTUAL_FILLER_CATEGORIES.general.phrases);
}
