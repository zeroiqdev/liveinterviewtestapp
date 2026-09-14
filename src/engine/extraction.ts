/* ══════════════════════════════════════
   Extraction Service — one-time, per
   candidate. Runs BEFORE the interview,
   never inside the real-time loop.

   Sources are optional: provide any of
   resume / linkedin / portfolio text.
   ══════════════════════════════════════ */

import { callJSON } from "./llm";
import { MODEL_EXTRACTION } from "./constants";
import { getBlueprint } from "./data";
import type { CandidateProfile, ProfileClaim } from "./types";

interface ExtractionInput {
    candidateId: string;
    blueprintId: string;
    resumeText?: string;
    linkedinText?: string;
    portfolioText?: string;
}

interface RawProfile {
    roles?: { title?: string; company?: string; years?: number | null }[];
    yearsTotal?: number | null;
    techStack?: string[];
    projects?: { name?: string; summary?: string; linkedRole?: string | null }[];
    claims?: {
        text?: string;
        specificity?: string;
        linkedCompetencies?: string[];
        sourceLocation?: string;
        tags?: string[];
        evidenceStrength?: string;
    }[];
}

const SYSTEM = `You extract a structured candidate profile from resume / LinkedIn / portfolio text for an interview engine. Be precise and conservative: only extract what the text actually supports. Output ONLY valid JSON matching this schema:

{
  "roles": [{ "title": "...", "company": "...", "years": 2.5 }],
  "yearsTotal": 6,
  "techStack": ["tools, platforms, domain systems"],
  "projects": [{ "name": "...", "summary": "one line", "linkedRole": "company or null" }],
  "claims": [{
    "text": "a claim the candidate makes about themselves",
    "specificity": "vague" | "specific",
    "linkedCompetencies": ["competency ids from the provided list"],
    "sourceLocation": "resume:experience[0] | linkedin:about | portfolio | ...",
    "tags": ["scale_impact" | "ownership" | "technical_depth" | "ambiguous_scope"],
    "evidenceStrength": "strong" | "moderate" | "weak"
  }]
}

Rules:
- A claim is "vague" when it lacks numbers, names, scope, or outcomes ("led a team", "improved sales", "handled many customers"). Vague claims are the highest-value probe targets — capture them faithfully.
- A claim is "specific" when it carries checkable detail (metrics, named clients, timeframes, outcomes).
- linkedCompetencies must only use ids from the competency list given in the user message; use [] when nothing fits.
- sourceLocation must point at where the claim came from (source + section/index).
- If a source is not provided, simply extract from what exists. Never invent roles, tools, or claims.`;

function mockProfile(candidateId: string, has: ExtractionInput): CandidateProfile {
    return {
        candidateId,
        roles: [{ title: "Operations Associate", company: "Demo Ltd", years: 3 }],
        yearsTotal: 3,
        techStack: ["Excel", "CRM"],
        projects: [],
        claims: [
            {
                text: "Led a team",
                specificity: "vague",
                linkedCompetencies: [],
                sourceLocation: "resume:experience[0]",
                tags: ["ownership", "ambiguous_scope"],
                evidenceStrength: "weak",
            },
        ],
        hasProfile: {
            resume: !!has.resumeText,
            linkedin: !!has.linkedinText,
            portfolio: !!has.portfolioText,
        },
        createdAt: new Date().toISOString(),
    };
}

export async function extractProfile(
    input: ExtractionInput
): Promise<CandidateProfile> {
    const hasAnySource = !!(
        input.resumeText?.trim() ||
        input.linkedinText?.trim() ||
        input.portfolioText?.trim()
    );

    if (!hasAnySource) {
        // No sources — empty profile, everything falls back to live conversation.
        return {
            candidateId: input.candidateId,
            roles: [],
            yearsTotal: null,
            techStack: [],
            projects: [],
            claims: [],
            hasProfile: { resume: false, linkedin: false, portfolio: false },
            createdAt: new Date().toISOString(),
        };
    }

    const blueprint = getBlueprint(input.blueprintId);
    const competencyList = (blueprint?.competencies || [])
        .map((c) => `${c.id} (${c.label})`)
        .join(", ");

    const sections: string[] = [];
    if (input.resumeText?.trim())
        sections.push(`RESUME:\n${input.resumeText.trim()}`);
    if (input.linkedinText?.trim())
        sections.push(`LINKEDIN:\n${input.linkedinText.trim()}`);
    if (input.portfolioText?.trim())
        sections.push(`PORTFOLIO:\n${input.portfolioText.trim()}`);

    const user = `Available competency ids for linkedCompetencies: ${competencyList || "none"}

${sections.join("\n\n---\n\n")}`;

    let raw: RawProfile;
    try {
        raw = await callJSON<RawProfile>({
            system: SYSTEM,
            user,
            model: MODEL_EXTRACTION,
            maxTokens: 2000,
            mock: mockProfile(input.candidateId, input),
        });
    } catch {
        // Extraction failure must never block the interview.
        raw = {};
    }

    const validTags = new Set([
        "scale_impact",
        "ownership",
        "technical_depth",
        "ambiguous_scope",
    ]);
    const validCompetencies = new Set(
        (blueprint?.competencies || []).map((c) => c.id)
    );

    const claims: ProfileClaim[] = (raw.claims || [])
        .filter((c) => c.text && typeof c.text === "string")
        .map((c) => ({
            text: c.text as string,
            specificity: c.specificity === "specific" ? "specific" : "vague",
            linkedCompetencies: (c.linkedCompetencies || []).filter((id) =>
                validCompetencies.has(id)
            ),
            sourceLocation: c.sourceLocation || "unknown",
            tags: (c.tags || []).filter((t) => validTags.has(t)),
            evidenceStrength:
                c.evidenceStrength === "strong" || c.evidenceStrength === "moderate"
                    ? c.evidenceStrength
                    : "weak",
        }));

    return {
        candidateId: input.candidateId,
        roles: (raw.roles || []).map((r) => ({
            title: r.title || "Unknown",
            company: r.company || "Unknown",
            years: typeof r.years === "number" ? r.years : null,
        })),
        yearsTotal: typeof raw.yearsTotal === "number" ? raw.yearsTotal : null,
        techStack: (raw.techStack || []).filter((t) => typeof t === "string"),
        projects: (raw.projects || []).map((p) => ({
            name: p.name || "Untitled",
            summary: p.summary || "",
            linkedRole: p.linkedRole || null,
        })),
        claims,
        hasProfile: {
            resume: !!input.resumeText?.trim(),
            linkedin: !!input.linkedinText?.trim(),
            portfolio: !!input.portfolioText?.trim(),
        },
        createdAt: new Date().toISOString(),
    };
}
