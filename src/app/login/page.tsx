"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { EnvelopeSimple } from "@phosphor-icons/react";
import styles from "../../components/onboarding.module.css";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [authLoading, setAuthLoading] = useState<"google" | "linkedin" | null>(null);
    const router = useRouter();

    const handleEmailLogin = () => {
        if (!email.trim()) return;
        // Mock returning user login
        const userProfile = { 
            email, 
            onboarded: true // Assume they have a profile for the mock
        };
        localStorage.setItem("useladder_user", JSON.stringify(userProfile));
        router.push("/dashboard");
    };

    const handleSocialLogin = (provider: "linkedin" | "google") => {
        setAuthLoading(provider);
        setTimeout(() => {
            const userProfile = { 
                provider, 
                onboarded: true 
            };
            localStorage.setItem("useladder_user", JSON.stringify(userProfile));
            router.push("/dashboard");
        }, 1200);
    };

    return (
        <div className={styles.pageWrapper}>
            <div className={styles.container}>
                <div className={styles.dividerTop} />

                <h1 className={styles.welcomeTitle}>
                    welcome{" "}
                    <span className={styles.markerWord}>
                        back
                        <svg
                            className={styles.markerUnderline}
                            viewBox="0 0 300 20"
                            preserveAspectRatio="none"
                            aria-hidden="true"
                        >
                            <path
                                d="M4 12 C60 6 150 4 296 10 M30 16 C100 10 200 8 280 13"
                                stroke="#4793f7"
                                strokeWidth="6"
                                strokeLinecap="round"
                                fill="none"
                            />
                        </svg>
                    </span>
                </h1>
                <p className={styles.loginSubtitle}>practice without the pressure.</p>

                <div className={styles.loginFormSection}>
                    <div className={styles.emailRow}>
                        <div className={styles.inputWrap}>
                            <EnvelopeSimple size={18} className={styles.inputIcon} />
                            <input
                                type="email"
                                className={styles.textInput}
                                placeholder="enter email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleEmailLogin()}
                            />
                        </div>

                        <button
                            type="button"
                            className={`${styles.continueButton} ${email.trim() ? styles.continueButtonActive : ""
                                }`}
                            onClick={handleEmailLogin}
                            disabled={!email.trim()}
                        >
                            continue
                        </button>
                    </div>

                    <div className={styles.orDivider}>
                        <span className={styles.orDividerLine} />
                        <span className={styles.orDividerText}>OR</span>
                        <span className={styles.orDividerLine} />
                    </div>

                    <div className={styles.socialRow}>
                        <button
                            type="button"
                            className={styles.socialButton}
                            onClick={() => handleSocialLogin("linkedin")}
                            disabled={authLoading !== null}
                            aria-label="Sign in with LinkedIn"
                        >
                            {authLoading === "linkedin" ? (
                                <div className="animate-spin h-6 w-6 border-2 border-[#4793f7] border-t-transparent rounded-full" />
                            ) : (
                                <svg viewBox="0 0 24 24" width="28" height="28" fill="#0A66C2">
                                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                </svg>
                            )}
                        </button>
                        <button
                            type="button"
                            className={styles.socialButton}
                            onClick={() => handleSocialLogin("google")}
                            disabled={authLoading !== null}
                            aria-label="Sign in with Google"
                        >
                            {authLoading === "google" ? (
                                <div className="animate-spin h-6 w-6 border-2 border-[#4793f7] border-t-transparent rounded-full" />
                            ) : (
                                <svg viewBox="0 0 24 24" width="28" height="28">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                            )}
                        </button>
                    </div>

                    <p className={styles.loginPrompt} style={{ marginTop: '2rem' }}>
                        don&apos;t have an account? <a href="/onboarding" className={styles.loginLink}>sign up</a>
                    </p>
                </div>

                <div className={styles.dividerBottom} />
            </div>
        </div>
    );
}
