"use client";

import { useEffect } from "react";
import { normalizeReferralCode, REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS } from "@/lib/referralRules";

/**
 * Remembers an invite code from a link like /?ref=K7Q2MX for 30 days, so the
 * account made later (by email or Google) is linked to whoever shared it.
 * The first code someone arrives with is kept.
 */
export function ReferralCapture() {
    useEffect(() => {
        const code = normalizeReferralCode(new URLSearchParams(window.location.search).get("ref"));
        if (!code || document.cookie.includes(`${REFERRAL_COOKIE}=`)) return;
        document.cookie = `${REFERRAL_COOKIE}=${code}; Max-Age=${REFERRAL_COOKIE_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    }, []);
    return null;
}
