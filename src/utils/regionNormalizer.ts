/**
 * Region Normalizer
 *
 * Maps messy, inconsistent job-location strings from scraped listings
 * to a small set of standardized region keys used in the voice config.
 *
 * Extensible: adding a new region = one new entry in REGION_PATTERNS
 * + one new voice entry in voiceConfig.ts. No code changes needed.
 */

// ─── Types ──────────────────────────────────────────────────────────

interface RegionPattern {
  /** Regex patterns to match against the raw location string */
  patterns: RegExp[];
  /** The normalized region key to return on match */
  region: string;
}

// ─── Pattern Table ──────────────────────────────────────────────────

/**
 * Ordered list of region patterns. First match wins.
 * More specific patterns (e.g. individual cities) should come before
 * broader patterns (e.g. continent-level).
 */
const REGION_PATTERNS: RegionPattern[] = [
  // Nigeria (most specific first)
  {
    patterns: [
      /nigeria/i,
      /lagos/i,
      /abuja/i,
      /port\s*harcourt/i,
      /ibadan/i,
      /\bng\b/i,
    ],
    region: "nigeria",
  },

  // West Africa (broader — catches Ghana, Senegal, etc.)
  {
    patterns: [
      /west\s*africa/i,
      /ghana/i,
      /accra/i,
      /senegal/i,
      /dakar/i,
      /côte\s*d'ivoire/i,
      /ivory\s*coast/i,
    ],
    region: "nigeria", // Map West African countries to Nigerian voice as closest match
  },

  // East / South Africa
  {
    patterns: [
      /kenya/i,
      /nairobi/i,
      /south\s*africa/i,
      /cape\s*town/i,
      /johannesburg/i,
      /rwanda/i,
      /kigali/i,
      /egypt/i,
      /cairo/i,
      /\bafrica\b/i,
      /emea/i,
    ],
    region: "nigeria", // Closest regional accent — can be split later
  },

  // United Kingdom & Ireland
  {
    patterns: [
      /united\s*kingdom/i,
      /\buk\b/i,
      /london/i,
      /manchester/i,
      /birmingham/i,
      /edinburgh/i,
      /scotland/i,
      /england/i,
      /britain/i,
      /ireland/i,
      /dublin/i,
    ],
    region: "uk",
  },

  // Continental Europe (mapped to UK voice as closest)
  {
    patterns: [
      /europe/i,
      /\beu\b/i,
      /germany/i,
      /berlin/i,
      /france/i,
      /paris/i,
      /netherlands/i,
      /amsterdam/i,
      /spain/i,
      /madrid/i,
      /barcelona/i,
      /italy/i,
      /milan/i,
      /poland/i,
      /warsaw/i,
      /sweden/i,
      /stockholm/i,
      /portugal/i,
      /lisbon/i,
    ],
    region: "uk",
  },

  // United States & North America
  {
    patterns: [
      /united\s*states/i,
      /\busa\b/i,
      /\bus\b(?!\s*only)/i, // "US" but not part of "US only" which is location filter
      /new\s*york/i,
      /\bnyc\b/i,
      /san\s*francisco/i,
      /\bsf\b/i,
      /bay\s*area/i,
      /california/i,
      /seattle/i,
      /austin/i,
      /boston/i,
      /chicago/i,
      /los\s*angeles/i,
      /denver/i,
      /atlanta/i,
      /texas/i,
      /florida/i,
      /washington/i,
      /colorado/i,
      /canada/i,
      /toronto/i,
      /vancouver/i,
      /north\s*america/i,
    ],
    region: "us",
  },

  // Asia-Pacific (mapped to international-default)
  {
    patterns: [
      /india/i,
      /bangalore/i,
      /mumbai/i,
      /singapore/i,
      /australia/i,
      /sydney/i,
      /japan/i,
      /tokyo/i,
      /asia/i,
      /apac/i,
    ],
    region: "international-default",
  },

  // Latin America (mapped to international-default)
  {
    patterns: [
      /brazil/i,
      /mexico/i,
      /latin\s*america/i,
      /south\s*america/i,
      /argentina/i,
      /colombia/i,
    ],
    region: "international-default",
  },
];

// ─── Normalizer ─────────────────────────────────────────────────────

/**
 * Normalizes a raw job-location string to a standardized region key.
 *
 * Examples:
 *   "Lagos, Nigeria"           → "nigeria"
 *   "Remote (NG)"              → "nigeria"
 *   "London, UK"               → "uk"
 *   "San Francisco, CA, USA"   → "us"
 *   "Remote (Worldwide)"       → "international-default"
 *   ""                         → "international-default"
 *
 * @param rawLocation - The raw location string from a job listing
 * @returns One of the standardized region keys used in voiceConfig.ts
 */
export function normalizeRegion(rawLocation: string): string {
  const loc = (rawLocation || "").trim();
  if (!loc) return "international-default";

  for (const { patterns, region } of REGION_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(loc)) {
        return region;
      }
    }
  }

  return "international-default";
}
