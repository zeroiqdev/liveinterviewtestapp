/* ══════════════════════════════════════
   Target company — practice interviews
   can be "general" (no employer). Then
   the interviewer must not ask about
   "our company", why they want to join
   us, or the company's product.
   ══════════════════════════════════════ */

import type { BankQuestion } from "./types";

/** Names the UI uses when no real company was chosen. */
const PLACEHOLDER_COMPANIES = new Set([
    "",
    "general",
    "general industry benchmark",
    "industry benchmark",
    "target role",
    "top tech",
    "none",
    "n/a",
]);

/** The real target company, or null for a general practice interview. */
export function realCompanyName(name: string | null | undefined): string | null {
    const trimmed = name?.trim() ?? "";
    return PLACEHOLDER_COMPANIES.has(trimmed.toLowerCase()) ? null : trimmed;
}

/** Bank questions that only make sense when interviewing for a specific employer. */
const COMPANY_QUESTION =
    /\bour (company|company's|organi[sz]ation|organi[sz]ation's|firm|brand|mission|culture)\b|\b(work|join|apply) (here|with us|for us)\b|\bwhy (us|this company)\b|\bthis company\b/i;
const OUR_PRODUCT = /\bour product\b/i;
/** Hypothetical scenarios ("Case Study: our database…", "We are facing…") are fine without a company. */
const SCENARIO = /^\s*(case study|scenario)\b|\bwe (are|need|have|launched|want)\b|\bour leadership\b/i;

export function needsCompanyContext(question: BankQuestion): boolean {
    const text = question.question;
    if (question.category === "company_fit") return true;
    if (COMPANY_QUESTION.test(text)) return true;
    return OUR_PRODUCT.test(text) && !SCENARIO.test(text);
}

/** Drops employer-specific questions from a pool for general interviews. */
export function questionsForCompany(pool: BankQuestion[], company: string | null | undefined): BankQuestion[] {
    if (realCompanyName(company)) return pool;
    const filtered = pool.filter((q) => !needsCompanyContext(q));
    return filtered.length > 0 ? filtered : pool;
}

/** Prompt guidance about the company context, for every interviewer prompt. */
export function companyGuidance(company: string | null | undefined): string {
    const real = realCompanyName(company);
    if (real) return `Company: ${real}`;
    return `Company: none — this is a general practice interview, not for a specific employer. Never ask what the candidate knows about "our company", why they want to join "us", about "our product", or anything that assumes a particular employer. Speak as an experienced interviewer for the role in general.`;
}
