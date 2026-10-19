"use client";

import React from "react";
import { ANALYTICS_CONSENT_KEY, ANALYTICS_CONSENT_RESET } from "./Analytics";

/** Clears the saved Accept/Decline so the cookie question is asked again. */
export function CookieSettingsButton({ className }: { className?: string }) {
    return (
        <button
            type="button"
            className={className}
            onClick={() => {
                try {
                    localStorage.removeItem(ANALYTICS_CONSENT_KEY);
                } catch {
                    // Saved data is blocked: nothing was remembered anyway.
                }
                window.dispatchEvent(new Event(ANALYTICS_CONSENT_RESET));
            }}
        >
            Cookie settings
        </button>
    );
}
