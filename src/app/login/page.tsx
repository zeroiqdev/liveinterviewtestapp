"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { EnvelopeSimple, WarningCircle } from "@phosphor-icons/react";
import styles from "../../components/onboarding.module.css";

interface GoogleIdConfig {
    client_id: string;
    callback?: (response: { credential: string }) => void | Promise<void>;
    [key: string]: unknown;
}

interface GoogleTokenResponse {
    access_token?: string;
    error?: string;
    error_description?: string;
    [key: string]: unknown;
}

interface GoogleTokenClientConfig {
    client_id: string;
    scope: string;
    callback: (tokenRes: GoogleTokenResponse) => void | Promise<void>;
    [key: string]: unknown;
}

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (config: GoogleIdConfig) => void;
                    renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
                    prompt: () => void;
                };
                oauth2: {
                    initTokenClient: (config: GoogleTokenClientConfig) => {
                        requestAccessToken: (options?: Record<string, unknown>) => void;
                    };
                };
            };
        };
    }
}

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [authLoading, setAuthLoading] = useState<"google" | "linkedin" | "email" | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        // Load Google Identity Services script
        const scriptId = "google-gsi-client";
        if (!document.getElementById(scriptId)) {
            const script = document.createElement("script");
            script.id = scriptId;
            script.src = "https://accounts.google.com/gsi/client";
            script.async = true;
            script.defer = true;
            document.body.appendChild(script);
        }
    }, []);

    const handleEmailLogin = async () => {
        if (!email.trim()) return;
        setAuthLoading("email");
        setErrorMessage(null);

        try {
            const res = await fetch("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: email.trim(),
                    provider: "email",
                }),
            });

            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || "Login failed");
            }

            localStorage.setItem("useladder_user", JSON.stringify(data.user));
            if (data.user?.role && data.user?.domain) {
                router.push("/dashboard");
            } else {
                router.push("/onboarding");
            }
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : "Error logging in with email");
        } finally {
            setAuthLoading(null);
        }
    };

    const handleGoogleAuth = async () => {
        setAuthLoading("google");
        setErrorMessage(null);

        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

        // 1. Production Google Identity Services (GIS) OAuth2 Popup Flow
        if (clientId && window.google?.accounts?.oauth2) {
            try {
                const tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: "email profile openid",
                    callback: async (tokenRes: GoogleTokenResponse) => {
                        if (tokenRes.error) {
                            if (tokenRes.error !== "popup_closed_by_user") {
                                setErrorMessage(tokenRes.error_description || "Google sign-in was canceled");
                            }
                            setAuthLoading(null);
                            return;
                        }

                        try {
                            // Fetch user profile from Google's userinfo endpoint
                            const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                                headers: { Authorization: `Bearer ${tokenRes.access_token}` },
                            });

                            if (!userinfoRes.ok) {
                                throw new Error("Could not retrieve profile from Google");
                            }

                            const userinfo = await userinfoRes.json();

                            // Save credentials and user record directly in MongoDB
                            const res = await fetch("/api/auth/google", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    email: userinfo.email,
                                    name: userinfo.name,
                                    avatar: userinfo.picture,
                                    googleId: userinfo.sub,
                                    provider: "google",
                                }),
                            });

                            const data = await res.json();
                            if (!res.ok || data.error) throw new Error(data.error || "Failed to persist Google session");

                            localStorage.setItem("useladder_user", JSON.stringify(data.user));
                            if (data.user?.role && data.user?.domain) {
                                router.push("/dashboard");
                            } else {
                                router.push("/onboarding");
                            }
                        } catch (e) {
                            setErrorMessage(e instanceof Error ? e.message : "Google authentication error");
                        } finally {
                            setAuthLoading(null);
                        }
                    },
                });

                tokenClient.requestAccessToken({ prompt: "select_account" });
                return;
            } catch (err) {
                console.error("GIS oauth2 client failed, trying one-tap fallback:", err);
            }
        }

        // 2. Fallback if One-Tap ID credential is provided
        if (clientId && window.google?.accounts?.id) {
            try {
                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: async (response: { credential: string }) => {
                        try {
                            const res = await fetch("/api/auth/google", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ credential: response.credential }),
                            });
                            const data = await res.json();
                            if (!res.ok || data.error) throw new Error(data.error || "Google auth failed");
                            localStorage.setItem("useladder_user", JSON.stringify(data.user));
                            if (data.user?.role && data.user?.domain) {
                                router.push("/dashboard");
                            } else {
                                router.push("/onboarding");
                            }
                        } catch (e) {
                            setErrorMessage(e instanceof Error ? e.message : "Google authentication error");
                        } finally {
                            setAuthLoading(null);
                        }
                    },
                });
                window.google.accounts.id.prompt();
                return;
            } catch {
                // Fall back
            }
        }

        // 3. If NEXT_PUBLIC_GOOGLE_CLIENT_ID is not yet configured in .env.local, prompt developer / allow local testing
        if (!clientId) {
            setErrorMessage("Google Client ID is not configured. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your environment variables.");
            setAuthLoading(null);
            return;
        }

        setErrorMessage("Unable to open Google Sign-In popup. Please ensure popups are allowed.");
        setAuthLoading(null);
    };

    const handleLinkedInLogin = async () => {
        setAuthLoading("linkedin");
        setTimeout(() => {
            const userProfile = {
                email: email.trim() || "linkedin.user@example.com",
                name: "LinkedIn Member",
                provider: "linkedin",
                role: "Software Engineer",
                domain: "Software & Engineering",
                roleFamily: "engineering",
                onboarded: true,
            };
            localStorage.setItem("useladder_user", JSON.stringify(userProfile));
            router.push("/dashboard");
        }, 1000);
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

                {errorMessage && (
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        background: "#FEF2F2",
                        border: "1px solid #FECACA",
                        color: "#B91C1C",
                        padding: "10px 14px",
                        borderRadius: "10px",
                        fontSize: "0.84rem",
                        marginBottom: "1rem"
                    }}>
                        <WarningCircle size={18} weight="bold" />
                        <span>{errorMessage}</span>
                    </div>
                )}

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
                            disabled={!email.trim() || authLoading !== null}
                        >
                            {authLoading === "email" ? (
                                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                            ) : (
                                "continue"
                            )}
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
                            onClick={handleLinkedInLogin}
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
                            onClick={handleGoogleAuth}
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
