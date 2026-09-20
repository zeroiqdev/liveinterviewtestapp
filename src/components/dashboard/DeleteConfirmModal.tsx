"use client";

import React from "react";
import { Trash, X } from "@phosphor-icons/react";
import styles from "../dashboard.module.css";

interface DeleteConfirmModalProps {
    isOpen: boolean;
    resumeName?: string;
    isDeleting?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

export function DeleteConfirmModal({
    isOpen,
    resumeName,
    isDeleting,
    onCancel,
    onConfirm,
}: DeleteConfirmModalProps) {
    if (!isOpen) return null;

    return (
        <div
            className={styles.settingsModalOverlay}
            onClick={onCancel}
            style={{ zIndex: 10000, padding: "1rem" }}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete resume"
        >
            <div
                className={styles.settingsModalContent}
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: 420, maxHeight: "auto", animation: "scaleModal 0.22s cubic-bezier(0.16, 1, 0.3, 1)" }}
            >
                {/* Header – same as SettingsModal / JobDescModal */}
                <div className={styles.settingsModalHeader} style={{ padding: "1.25rem 1.5rem 1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: "#FFF1F2",
                                border: "1px solid #FECDD3",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                            }}
                        >
                            <Trash size={16} weight="bold" color="#DC2626" />
                        </div>
                        <div>
                            <h3 className={styles.settingsModalTitle} style={{ fontSize: "1.15rem" }}>
                                Delete resume?
                            </h3>
                            <p className={styles.settingsModalSubtitle} style={{ fontSize: "0.82rem", marginTop: 2 }}>
                                This action cannot be undone
                            </p>
                        </div>
                    </div>
                    <button className={styles.settingsCloseBtn} onClick={onCancel} aria-label="Close" disabled={!!isDeleting}>
                        <X size={16} weight="bold" />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: "1rem 1.5rem 1.25rem" }}>
                    <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.5, color: "#475569", fontWeight: 400 }}>
                        Are you sure you want to delete &quot;{resumeName}&quot;?
                    </p>
                </div>

                {/* Footer – same as SettingsModal footer */}
                <div className={styles.settingsModalFooter} style={{ padding: "1rem 1.5rem", justifyContent: "flex-end" }}>
                    <button
                        type="button"
                        className={styles.settingsCancelFooterBtn}
                        onClick={onCancel}
                        disabled={!!isDeleting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={!!isDeleting}
                        className={styles.settingsSaveFooterBtn}
                        style={{
                            background: isDeleting ? "#E11D48" : "#DC2626",
                            boxShadow: "0 4px 14px rgba(220,38,38,0.22)",
                            opacity: isDeleting ? 0.85 : 1,
                            cursor: isDeleting ? "not-allowed" : "pointer",
                            gap: 6,
                        }}
                    >
                        {isDeleting ? (
                            <>
                                <span
                                    style={{
                                        width: 13,
                                        height: 13,
                                        border: "2px solid rgba(255,255,255,0.4)",
                                        borderTopColor: "#FFFFFF",
                                        borderRadius: "50%",
                                        display: "inline-block",
                                        animation: "spin 0.7s linear infinite",
                                    }}
                                />
                                Deleting…
                            </>
                        ) : (
                            "Delete resume"
                        )}
                    </button>
                </div>
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
