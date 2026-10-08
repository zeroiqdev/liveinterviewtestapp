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

/**
 * login:   email + password (or Google, the only passwordless option)
 * forgot:  request a password reset code
 * reset:   enter the code and a new password
 * verify:  finish a sign-up that was never verified
 */
type Mode = "login" | "forgot" | "reset" | "verify";

const MIN_PASSWORD_LENGTH = 8;

function LoginForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [mode, setMode] = useState<Mode>("login");
    const [authLoading, setAuthLoading] = useState<"google" | "email" | "send-code" | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [infoMessage, setInfoMessage] = useState<string | null>(null);

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

    const completeLogin = (user: SafeUser) => {
        try {
            localStorage.setItem("useladder_user", JSON.stringify(user));
        } catch {
            // Ignore storage errors
        }
        navigateAfterLogin(user);
    };

    const switchMode = (next: Mode, info: string | null = null) => {
        setMode(next);
        setCode("");
        setErrorMessage(null);
        setInfoMessage(info);
    };

    /** Request an emailed code: a reset code, or a fresh sign-up verification code. */
    const sendCode = async (purpose: "reset" | "verify") => {
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
            setErrorMessage("Enter your email first.");
            return;
        }

        setAuthLoading("send-code");
        setErrorMessage(null);
        try {
            const res = await fetch(purpose === "reset" ? "/api/auth/password/forgot" : "/api/auth/verify/resend", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: trimmedEmail }),
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || "Could not send a code");
            switchMode(purpose === "reset" ? "reset" : "verify", data.message || "Check your email for a 6-digit code.");
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : "Could not send a code");
        } finally {
            setAuthLoading(null);
        }
    };

    const postAuth = async (url: string, body: Record<string, string>) => {
        setAuthLoading("email");
        setErrorMessage(null);
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.code === "email_unverified") {
                setAuthLoading(null);
                await sendCode("verify");
                return;
            }
            if (!res.ok || data.error) throw new Error(data.error || "Something went wrong");
            completeLogin(data.user);
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setAuthLoading(null);
        }
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const trimmedEmail = email.trim();
        if (!trimmedEmail || authLoading) return;

        if (mode === "login") {
            await postAuth("/api/auth/login", { email: trimmedEmail, password: password.trim() });
        } else if (mode === "forgot") {
            await sendCode("reset");
        } else if (mode === "reset") {
            await postAuth("/api/auth/password/reset", {
                email: trimmedEmail,
                code,
                password: newPassword.trim(),
            });
        } else {
            // The password typed at login proves this browser made the sign-up.
            await postAuth("/api/auth/verify", { email: trimmedEmail, code, password: password.trim() });
        }
    };

    const handleGoogleAuth = () => {
        setErrorMessage(null);

        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        if (!clientId || !window.google?.accounts?.oauth2) {
            setErrorMessage("Google sign-in isn't available right now. Please use your email instead.");
            return;
        }

        setAuthLoading("google");
        try {
            const tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: "email profile openid",
                callback: async (tokenRes: GoogleTokenResponse) => {
                    if (tokenRes.error || !tokenRes.access_token) {
                        if (tokenRes.error !== "popup_closed_by_user") {
                            setErrorMessage(tokenRes.error_description || "Google sign-in was canceled");
                        }
                        setAuthLoading(null);
                        return;
                    }

                    try {
                        // The server verifies the token with Google; profile data comes from there.
                        const res = await fetch("/api/auth/google", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ accessToken: tokenRes.access_token }),
                        });

                        const data = await res.json();
                        if (!res.ok || data.error) throw new Error(data.error || "Google sign-in failed");

                        completeLogin(data.user);
                    } catch (e) {
                        setErrorMessage(e instanceof Error ? e.message : "Google authentication error");
                    } finally {
                        setAuthLoading(null);
                    }
                },
            });

            tokenClient.requestAccessToken({ prompt: "select_account" });
        } catch (err) {
            console.error("GIS oauth2 client failed:", err);
            setErrorMessage("Google sign-in failed to start. Please try again.");
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
                    <h2 className={styles.formMainTitle}>
                        {mode === "login" ? "Log in to get prepped" : mode === "verify" ? "Verify your email" : "Reset your password"}
                    </h2>
                    <p className={styles.formSubTitle}>
                        {mode === "login"
                            ? "Enter your details to access your dashboard"
                            : mode === "forgot"
                              ? "We'll email you a 6-digit code to set a new password"
                              : mode === "reset"
                                ? "Enter the code we emailed you and choose a new password"
                                : "Enter the code we emailed you to finish setting up your account"}
                    </p>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                    <div className={styles.authErrorBanner}>
                        <WarningCircle size={18} weight="bold" style={{ flexShrink: 0 }} />
                        <span>{errorMessage}</span>
                    </div>
                )}

                {infoMessage && !errorMessage && (
                    <div className={styles.authInfoBanner} role="status">
                        <span>{infoMessage}</span>
                    </div>
                )}

                {mode === "login" && (
                    <>
                        {/* Google SSO Button — the only passwordless sign-in */}
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
                    </>
                )}

                <form onSubmit={handleSubmit} className={styles.inputFormStack}>
                    <div className={styles.inputGroup}>
                        <label className={styles.inputLabel} htmlFor="login-email">Email</label>
                        <input
                            id="login-email"
                            type="email"
                            className={styles.formInput}
                            placeholder="e.g. allen@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            readOnly={mode === "reset" || mode === "verify"}
                            required
                        />
                    </div>

                    {mode === "login" && (
                        <div className={styles.inputGroup}>
                            <label className={styles.inputLabel} htmlFor="login-password">Password</label>
                            <input
                                id="login-password"
                                type="password"
                                className={styles.formInput}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                required
                            />
                            <button
                                type="button"
                                className={styles.textLinkBtn}
                                onClick={() => switchMode("forgot")}
                                disabled={authLoading !== null}
                            >
                                Forgot password?
                            </button>
                        </div>
                    )}

                    {(mode === "reset" || mode === "verify") && (
                        <div className={styles.inputGroup}>
                            <label className={styles.inputLabel} htmlFor="login-code">
                                {mode === "reset" ? "Reset code" : "Verification code"}
                            </label>
                            <input
                                id="login-code"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                className={`${styles.formInput} ${styles.codeInput}`}
                                placeholder="123456"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                autoComplete="one-time-code"
                                autoFocus
                                required
                            />
                        </div>
                    )}

                    {mode === "reset" && (
                        <div className={styles.inputGroup}>
                            <label className={styles.inputLabel} htmlFor="login-new-password">
                                New password{" "}
                                <span style={{ fontWeight: 400, color: "#94A3B8" }}>({MIN_PASSWORD_LENGTH}+ characters)</span>
                            </label>
                            <input
                                id="login-new-password"
                                type="password"
                                className={styles.formInput}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                autoComplete="new-password"
                                minLength={MIN_PASSWORD_LENGTH}
                                required
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        className={styles.continueSubmitBtn}
                        disabled={
                            !email.trim() ||
                            authLoading !== null ||
                            (mode === "login" && !password.trim()) ||
                            ((mode === "reset" || mode === "verify") && code.length !== 6) ||
                            (mode === "reset" && newPassword.trim().length < MIN_PASSWORD_LENGTH)
                        }
                    >
                        {authLoading === "email" || authLoading === "send-code" ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <SpinnerGap size={18} style={{ animation: "spin 1s linear infinite" }} />
                                {mode === "forgot" ? "Sending code..." : "Please wait..."}
                            </div>
                        ) : mode === "login" ? (
                            "Log In"
                        ) : mode === "forgot" ? (
                            "Send reset code"
                        ) : mode === "reset" ? (
                            "Reset password & log in"
                        ) : (
                            "Verify & log in"
                        )}
                    </button>

                    {mode !== "login" && (
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                            {mode === "forgot" ? (
                                <span />
                            ) : (
                                <button
                                    type="button"
                                    className={styles.textLinkBtn}
                                    onClick={() => sendCode(mode === "reset" ? "reset" : "verify")}
                                    disabled={authLoading !== null}
                                >
                                    Resend code
                                </button>
                            )}
                            <button
                                type="button"
                                className={styles.textLinkBtn}
                                onClick={() => switchMode("login")}
                                disabled={authLoading !== null}
                            >
                                Back to log in
                            </button>
                        </div>
                    )}
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
