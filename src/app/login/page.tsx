"use client";

import React, { useState, useEffect, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
    ArrowLeft,
    WarningCircle,
    SpinnerGap,
} from "@phosphor-icons/react";
import styles from "../../components/onboarding.module.css";

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
                    initialize: (config: Record<string, unknown>) => void;
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

interface SafeUser {
    id: string;
    email: string;
    name: string;
    role?: string;
    domain?: string;
    isAdmin?: boolean;
    systemRole?: string;
    [key: string]: unknown;
}

function LoginForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [authLoading, setAuthLoading] = useState<"google" | "email" | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectParam = searchParams.get("redirect");
    const errorParam = searchParams.get("error");

    const navigateAfterLogin = useCallback((user: SafeUser) => {
        if (redirectParam && redirectParam.startsWith("/")) {
            if (redirectParam.startsWith("/admin") && !user.isAdmin) {
                router.replace("/dashboard");
                return;
            }
            router.replace(redirectParam);
            return;
        }

        if (user.role && user.domain) {
            router.replace("/dashboard");
        } else {
            router.replace("/onboarding");
        }
    }, [redirectParam, router]);

    // Check for authorization error messages in URL query
    useEffect(() => {
        if (errorParam === "unauthorized_admin") {
            setErrorMessage("Administrator privileges are required to view that page. Please sign in with an admin account.");
        }
    }, [errorParam]);

    // Check active session on mount
    useEffect(() => {
        let isMounted = true;
        fetch("/api/auth/me")
            .then((res) => {
                if (res.ok) return res.json();
                return null;
            })
            .then((data) => {
                if (!isMounted || !data?.authenticated || !data?.user) return;
                try {
                    localStorage.setItem("useladder_user", JSON.stringify(data.user));
                } catch {
                    // Ignore storage quota
                }
                navigateAfterLogin(data.user);
            })
            .catch(() => {});

        return () => {
            isMounted = false;
        };
    }, [navigateAfterLogin]);

    // Load Google Identity Services script
    useEffect(() => {
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

    const handleEmailLogin = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const trimmedEmail = email.trim();
        if (!trimmedEmail) return;

        setAuthLoading("email");
        setErrorMessage(null);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: trimmedEmail,
                    password: password.trim(),
                }),
            });

            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || "Login failed");
            }

            try {
                localStorage.setItem("useladder_user", JSON.stringify(data.user));
            } catch {
                // Ignore storage errors
            }

            navigateAfterLogin(data.user);
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
                            const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                                headers: { Authorization: `Bearer ${tokenRes.access_token}` },
                            });

                            if (!userinfoRes.ok) throw new Error("Could not retrieve profile from Google");

                            const userinfo = await userinfoRes.json();

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

                            try {
                                localStorage.setItem("useladder_user", JSON.stringify(data.user));
                            } catch {
                                // Ignore storage errors
                            }

                            navigateAfterLogin(data.user);
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
                console.error("GIS oauth2 client failed:", err);
            }
        }

        // 2. Local fallback if Google Client ID is not configured - posts to server for real session
        try {
            const res = await fetch("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: email.trim() || "allen@example.com",
                    name: "Allen Kurotimi",
                    avatar: "",
                    role: "Senior Product Manager",
                    domain: "Product & Design",
                    seniority: "professional",
                    provider: "google",
                }),
            });

            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || "Failed to complete local sign-in");
            }

            try {
                localStorage.setItem("useladder_user", JSON.stringify(data.user));
            } catch {
                // Ignore storage errors
            }

            navigateAfterLogin(data.user);
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : "Failed to sign in");
        } finally {
            setAuthLoading(null);
        }
    };

    return (
        <div className={styles.splitWrapper}>
            {/* ════════ LEFT HERO PANEL (MATCHES ONBOARDING) ════════ */}
            <div className={styles.leftHeroPanel}>
                <div className={styles.leftHeroCenter}>
                    <h1 className={styles.welcomeHeading}>
                        <span className={styles.welcomeRow}>
                            Welcome
                            <svg className={styles.sparkleIcon} viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
                            </svg>
                        </span>
                        <span>back</span>
                    </h1>
                    <p className={styles.lockInSubtitle}>
                        Ready to pick up right where you left off?
                    </p>
                </div>

                <div />
            </div>

            {/* ════════ RIGHT CONTENT PANEL ════════ */}
            <div className={styles.rightContentPanel}>
                {/* Back button to Home */}
                <Link href="/" className={styles.topBackSquareBtn} aria-label="Go home">
                    <ArrowLeft size={18} />
                </Link>

                {/* Team Greeting Badge matching Onboarding Step 2 */}
                <div className={styles.greetingChipRow}>
                    <Image
                        src="/char1.png"
                        alt="Interview Coach"
                        width={34}
                        height={34}
                        className={styles.greetingCharImg}
                    />
                    <div className={styles.greetingBadge}>
                        Your team is ready
                    </div>
                </div>

                {/* Form Header */}
                <div className={styles.formHeader}>
                    <h2 className={styles.formMainTitle}>Log in to get prepped</h2>
                    <p className={styles.formSubTitle}>Enter your details to access your dashboard</p>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                    <div className={styles.authErrorBanner}>
                        <WarningCircle size={18} weight="bold" style={{ flexShrink: 0 }} />
                        <span>{errorMessage}</span>
                    </div>
                )}

                {/* Google SSO Button */}
                <button
                    type="button"
                    className={styles.googleSsoBtn}
                    onClick={handleGoogleAuth}
                    disabled={authLoading !== null}
                >
                    {authLoading === "google" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <SpinnerGap size={18} style={{ animation: "spin 1s linear infinite" }} />
                            Connecting with Google...
                        </div>
                    ) : (
                        <>
                            <svg viewBox="0 0 24 24" width="20" height="20">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Continue with Google
                        </>
                    )}
                </button>

                {/* Divider */}
                <div className={styles.orDivider}>
                    <span className={styles.orLine} />
                    <span className={styles.orText}>or</span>
                    <span className={styles.orLine} />
                </div>

                {/* Credentials Form */}
                <form onSubmit={handleEmailLogin} className={styles.inputFormStack}>
                    <div className={styles.inputGroup}>
                        <label className={styles.inputLabel}>Email</label>
                        <input
                            type="email"
                            className={styles.formInput}
                            placeholder="e.g. allen@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label className={styles.inputLabel}>Password</label>
                        <input
                            type="password"
                            className={styles.formInput}
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                        />
                    </div>

                    <button
                        type="submit"
                        className={styles.continueSubmitBtn}
                        disabled={!email.trim() || authLoading !== null}
                    >
                        {authLoading === "email" ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <SpinnerGap size={18} style={{ animation: "spin 1s linear infinite" }} />
                                Logging in...
                            </div>
                        ) : (
                            "Log In"
                        )}
                    </button>
                </form>

                {/* Switch to sign up */}
                <p className={styles.switchAuthPrompt}>
                    Don&apos;t have an account?{" "}
                    <Link href="/onboarding" className={styles.switchAuthLink}>
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className={styles.splitWrapper} />}>
            <LoginForm />
        </Suspense>
    );
}
