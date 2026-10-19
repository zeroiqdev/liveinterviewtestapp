/**
 * The referral programme's rules, kept apart from the database so they can be
 * tested: every REFERRALS_PER_PASS invited people who buy a pass earn the
 * inviter one free pass.
 */

export const REFERRALS_PER_PASS = 3;
export const REFERRAL_COOKIE = "gp_ref";
export const REFERRAL_COOKIE_DAYS = 30;

/** No 0/O or 1/I, so a code read aloud or typed from a screenshot comes out right. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

export function normalizeReferralCode(value: unknown): string | null {
    const code = String(value ?? "").trim().toUpperCase();
    return REFERRAL_CODE_RE.test(code) ? code : null;
}

export function makeReferralCode(random: (n: number) => number): string {
    let code = "";
    for (let i = 0; i < 6; i++) code += ALPHABET[random(ALPHABET.length)];
    return code;
}

/** Free passes earned for this many invited people who bought. */
export function rewardsEarned(qualified: number): number {
    return Math.floor(Math.max(0, qualified) / REFERRALS_PER_PASS);
}

/** How many more buyers until the next free pass. */
export function referralsToNextPass(qualified: number): number {
    return REFERRALS_PER_PASS - (Math.max(0, qualified) % REFERRALS_PER_PASS);
}
