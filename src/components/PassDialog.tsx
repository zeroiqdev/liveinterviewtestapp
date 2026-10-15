"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import styles from "./dashboard.module.css";
import PassOptions from "./PassOptions";

interface PassDialogProps {
    isOpen: boolean;
    onClose: () => void;
    /** Why it opened: sets the heading. */
    reason?: "used-free" | "browse";
}

/**
 * Getting a pass. Picks a pass and sends the person to Bachs' payment page;
 * they come back to /payment/complete, where the payment is confirmed.
 */
export default function PassDialog({ isOpen, onClose, reason = "browse" }: PassDialogProps) {
    const [busy, setBusy] = useState(false);
    if (!isOpen) return null;

    return createPortal(
        <div className={styles.settingsModalOverlay} style={{ zIndex: 10001 }} onClick={busy ? undefined : onClose}>
            <div className={`${styles.settingsModalContent} ${styles.unboldedModal}`} role="dialog" aria-modal="true" aria-labelledby="pass-title" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
                <div className={styles.settingsModalHeader}>
                    <div>
                        <h2 id="pass-title" className={styles.settingsModalTitle} style={{ fontSize: "1.3rem" }}>
                            {reason === "used-free" ? "Keep practising with a pass" : "Get a pass"}
                        </h2>
                        {reason === "used-free" && (
                            <p style={{ margin: "0.35rem 0 0", fontSize: "0.86rem", color: "#64748B", lineHeight: 1.45 }}>
                                You&rsquo;ve used your free interview. A pass gives you as many interviews as you like for 24 hours.
                            </p>
                        )}
                    </div>
                    <button className={styles.settingsCloseBtn} onClick={onClose} disabled={busy} aria-label="Close">
                        <X size={18} weight="bold" />
                    </button>
                </div>
                <PassOptions actionClassName={styles.settingsModalFooter} onBusyChange={setBusy} />
            </div>
        </div>,
        document.body
    );
}
