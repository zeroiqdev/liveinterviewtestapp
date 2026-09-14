/* ══════════════════════════════════════
   Engine constants — models, pacing
   thresholds, role-family claim weights
   ══════════════════════════════════════ */

/** Fast small model for in-loop calls (selector / probe / follow-up). */
export const MODEL_FAST =
    process.env.ANTHROPIC_MODEL_FAST || "claude-haiku-4-5-20251001";

/** Stronger model for the one-time extraction call. */
export const MODEL_EXTRACTION =
    process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

/** Set USELADDER_ENGINE_MOCK=1 to run the whole engine without an API key. */
export const ENGINE_MOCK = process.env.USELADDER_ENGINE_MOCK === "1";

/* ── Time Governor thresholds ──
   ratio = secondsRemaining / estimatedSecondsNeeded               */
export const TIGHTENING_RATIO = 1.6;
export const COMPRESSED_RATIO = 1.0;

/** Rough per-question cost model for coverage estimation. */
export const AVG_SECONDS_PER_SCRIPTED_QUESTION = 150;
export const AVG_SECONDS_PER_FOLLOWUP = 75;

/** Hard session cap on follow-ups that override their topic budget
    (contradictions). Keeps "contradiction always probes" bounded. */
export const MAX_BUDGET_OVERRIDES_PER_SESSION = 2;

/** Running notes are trimmed to the last N entries in prompts. */
export const NOTES_WINDOW = 8;

/* ── Role-family claim weighting ──
   Which profile fields the Question Selector should prioritise
   per role family (from product spec).                            */
export const ROLE_FAMILY_WEIGHTS: Record<
    string,
    { prioritizeClaimTags: string[]; heavyFields: string[] }
> = {
    customer_service: {
        prioritizeClaimTags: ["ambiguous_scope"],
        heavyFields: ["claims"],
    },
    sales_bizdev: {
        prioritizeClaimTags: ["scale_impact", "ownership"],
        heavyFields: ["claims"],
    },
    banking_finance: {
        prioritizeClaimTags: ["technical_depth"],
        heavyFields: ["roles", "claims"],
    },
    virtual_assistant: {
        prioritizeClaimTags: ["ownership"],
        heavyFields: ["claims", "techStack"],
    },
    oil_gas_fresher: {
        prioritizeClaimTags: ["technical_depth", "ownership"],
        heavyFields: ["projects", "claims"],
    },
    oil_gas_experienced: {
        prioritizeClaimTags: ["technical_depth", "ownership"],
        heavyFields: ["projects", "claims"],
    },
    oil_gas_safety_officer: {
        prioritizeClaimTags: ["technical_depth", "ownership"],
        heavyFields: ["projects", "claims"],
    },
    software_tech: {
        prioritizeClaimTags: ["technical_depth"],
        heavyFields: ["projects", "techStack"],
    },
    product_management: {
        prioritizeClaimTags: ["scale_impact", "ownership", "ambiguous_scope"],
        heavyFields: ["projects", "claims"],
    },
    data_science_analytics: {
        prioritizeClaimTags: ["technical_depth", "scale_impact"],
        heavyFields: ["projects", "techStack", "claims"],
    },
    devops_cloud_sre: {
        prioritizeClaimTags: ["technical_depth", "ownership"],
        heavyFields: ["projects", "techStack"],
    },
};

export function weightsFor(blueprintId: string) {
    return (
        ROLE_FAMILY_WEIGHTS[blueprintId] || {
            prioritizeClaimTags: ["ownership"],
            heavyFields: ["claims"],
        }
    );
}
