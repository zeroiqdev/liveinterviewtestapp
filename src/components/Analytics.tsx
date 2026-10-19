"use client";

import React, { useSyncExternalStore } from "react";
import Script from "next/script";
import Link from "next/link";

/**
 * Google Analytics, only after the visitor agrees to it. Nothing from Google
 * loads until they press Accept; Decline is remembered and nothing loads.
 * Page changes inside the app are counted by GA4's enhanced measurement
 * ("page changes based on browser history"), so no extra code is needed.
 *
 * Set NEXT_PUBLIC_GA_ID (e.g. G-XXXXXXXXXX). Without it, nothing here shows.
 */

const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";
export const ANALYTICS_CONSENT_KEY = "useladder_analytics_consent";
/** Fired by "Cookie settings" on the privacy page to ask again. */
export const ANALYTICS_CONSENT_RESET = "useladder_analytics_consent_reset";

type Consent = "granted" | "denied" | null;

function readConsent(): Consent {
    try {
        const value = localStorage.getItem(ANALYTICS_CONSENT_KEY);
        return value === "granted" || value === "denied" ? value : null;
    } catch {
        return null;
    }
}

/** Told when the choice changes here, on the privacy page, or in another tab. */
function subscribe(onChange: () => void) {
    window.addEventListener(ANALYTICS_CONSENT_RESET, onChange);
    window.addEventListener("storage", onChange);
    return () => {
        window.removeEventListener(ANALYTICS_CONSENT_RESET, onChange);
        window.removeEventListener("storage", onChange);
    };
}

export function Analytics() {
    // "unknown" while rendering on the server, so the banner never flashes for someone who already chose.
    const consent = useSyncExternalStore<Consent | "unknown">(subscribe, readConsent, () => "unknown");

    if (!GA_ID) return null;

    const choose = (choice: "granted" | "denied") => {
        try {
            localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
        } catch {
            // Saved data is blocked: nothing to remember it in.
        }
        window.dispatchEvent(new Event(ANALYTICS_CONSENT_RESET));
    };

    return (
        <>
            {consent === "granted" && (
                <>
                    <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
                    <Script id="google-analytics" strategy="afterInteractive">
                        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
                    </Script>
                </>
            )}
            {consent === null && (
                <div role="dialog" aria-label="Cookies" style={bannerStyle}>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "#334155" }}>
                        We use Google Analytics cookies to see how people use get prepped, so we can improve it.{" "}
                        <Link href="/privacy#analytics" style={{ color: "#2563EB" }}>
                            Learn more
                        </Link>
                    </p>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button type="button" onClick={() => choose("denied")} style={{ ...buttonStyle, background: "#FFFFFF", color: "#334155", border: "1px solid #CBD5E1" }}>
                            Decline
                        </button>
                        <button type="button" onClick={() => choose("granted")} style={{ ...buttonStyle, background: "#4782F6", color: "#FFFFFF", border: "1px solid #4782F6" }}>
                            Accept
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

const bannerStyle: React.CSSProperties = {
    position: "fixed",
    left: 16,
    right: 16,
    // Clear of the phone tab bar and the bottom bars on the resume page.
    bottom: "calc(84px + env(safe-area-inset-bottom, 0px))",
    zIndex: 1000,
    maxWidth: 560,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    justifyContent: "space-between",
    padding: "14px 16px",
    background: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
    fontFamily: "Inter, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

const buttonStyle: React.CSSProperties = {
    height: 38,
    padding: "0 16px",
    borderRadius: 8,
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
};
