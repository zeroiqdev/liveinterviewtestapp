/**
 * Conversational Filler Phrases
 *
 * Short, natural conversational utterances played immediately when the candidate finishes speaking.
 * Categorized by semantic context to dynamically match what the candidate just discussed,
 * eliminating dead air while the orchestrator LLM processes the turn.
 */

export interface ContextualFillerCategory {
  keywords: string[];
  phrases: string[];
}

export const CONTEXTUAL_FILLER_CATEGORIES: Record<string, ContextualFillerCategory> = {
  technical: {
    keywords: [
      "architecture", "database", "api", "service", "microservice", "microservices",
      "redis", "postgres", "postgresql", "sql", "pipeline", "docker", "kubernetes",
      "aws", "cloud", "cache", "caching", "migration", "stack", "frontend", "backend",
      "kafka", "monolith", "deadlock", "cluster", "deploy", "ci/cd"
    ],
    phrases: [
      "Let me build on that technical choice.",
    ],
  },
  metrics: {
    keywords: [
      "percent", "%", "million", "billion", "latency", "throughput", "users",
      "scale", "revenue", "growth", "reduced", "increased", "metrics", "roi",
      "uptime", "downtime", "traffic", "tps", "qps"
    ],
    phrases: [
      "Let me build on that impact.",
    ],
  },
  challenges: {
    keywords: [
      "conflict", "disagreed", "disagreement", "difficult", "challenge", "bug",
      "incident", "outage", "failure", "pressure", "deadline", "blocker",
      "crisis", "friction", "obstacle", "trade-off", "tradeoff"
    ],
    phrases: [
      "Let me stay with that challenge.",
    ],
  },
  leadership: {
    keywords: [
      "team", "mentored", "mentoring", "stakeholder", "stakeholders", "leadership",
      "aligned", "cross-functional", "product manager", "collaborated", "collaboration",
      "managed", "initiative", "hired", "culture", "direction"
    ],
    phrases: [
      "Let me build on the people side of that.",
    ],
  },
  repeat: {
    keywords: [
      "repeat", "pardon", "again", "say that again", "one more time", "didn't catch", "did not catch", "can you repeat"
    ],
    phrases: [
      "Sure, let me repeat that...",
    ],
  },
  skip: {
    keywords: [
      "skip this question", "skip question", "pass on this", "next question please", "can we skip"
    ],
    phrases: [
      "Sure, let us move to the next one.",
    ],
  },
  closing: {
    keywords: [
      "i am done", "i'm done", "done with the interview", "end the interview", "end the call",
      "that'll be all", "that will be all", "that's all", "all for now", "wrap up", "stop the interview"
    ],
    phrases: [
      "Understood, wrapping up our conversation...",
    ],
  },
  general: {
    keywords: [],
    phrases: [
      "Let me build on that.",
      "I want to stay with that for a moment.",
    ],
  },
};

// Flattened list of lean, pre-warmed fillers (< 6 items to avoid rate limits)
export const CONVERSATIONAL_FILLERS = Object.values(CONTEXTUAL_FILLER_CATEGORIES).flatMap(
  (c) => c.phrases
);

function matchesKeyword(textLower: string, kw: string): boolean {
  if (kw === "%") return textLower.includes("%");
  const escaped = kw.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  return regex.test(textLower);
}

/**
 * Returns a context-sensitive filler based on semantic matching of the candidate's answer.
 * Scores categories based on keyword presence and selects the highest scoring category.
 */
export function getContextualFiller(candidateTranscript?: string): string {
  if (!candidateTranscript || !candidateTranscript.trim()) {
    return getRandomFiller();
  }

  const textLower = candidateTranscript.toLowerCase();

  // Fast path for explicit intent fillers
  for (const kw of CONTEXTUAL_FILLER_CATEGORIES.closing.keywords) {
    if (matchesKeyword(textLower, kw)) {
      return CONTEXTUAL_FILLER_CATEGORIES.closing.phrases[0];
    }
  }
  for (const kw of CONTEXTUAL_FILLER_CATEGORIES.repeat.keywords) {
    if (matchesKeyword(textLower, kw)) {
      return CONTEXTUAL_FILLER_CATEGORIES.repeat.phrases[0];
    }
  }

  let bestCategory: string | null = null;
  let highestScore = 0;

  for (const [catName, category] of Object.entries(CONTEXTUAL_FILLER_CATEGORIES)) {
    if (catName === "general") continue;
    let score = 0;
    for (const kw of category.keywords) {
      if (matchesKeyword(textLower, kw)) {
        score++;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestCategory = catName;
    }
  }

  if (bestCategory && highestScore > 0) {
    const phrases = CONTEXTUAL_FILLER_CATEGORIES[bestCategory].phrases;
    const idx = Math.floor(Math.random() * phrases.length);
    return phrases[idx];
  }

  return getRandomFiller();
}

export function getRandomFiller(): string {
  const generalPhrases = CONTEXTUAL_FILLER_CATEGORIES.general.phrases;
  const index = Math.floor(Math.random() * generalPhrases.length);
  return generalPhrases[index];
}
