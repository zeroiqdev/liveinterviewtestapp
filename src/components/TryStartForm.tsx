"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MagnifyingGlass } from "@phosphor-icons/react";
import { saveTry, type TryState } from "@/lib/tryClient";
import ob from "./onboarding.module.css";
import styles from "./tryInterview.module.css";

const MIN_CHARS = 200;

/**
 * Pick a role, paste a job description, start: the first step of the preview,
 * with no account. Roles are the ones the app supports, picked the same way as
 * at sign-up; anything else can be requested.
 */
export function TryStartForm() {
    const router = useRouter();
    const [roles, setRoles] = useState<Array<{ title: string; domain: string }>>([]);
    const [roleQuery, setRoleQuery] = useState("");
    const [role, setRole] = useState("");
    const [description, setDescription] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [requesting, setRequesting] = useState(false);
    const [wantedRole, setWantedRole] = useState("");
    const [wantedEmail, setWantedEmail] = useState("");
    const [requestState, setRequestState] = useState<"idle" | "sending" | "sent">("idle");
    const [requestError, setRequestError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/roles")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (Array.isArray(data?.roles)) setRoles(data.roles);
            })
            .catch(() => undefined);
    }, []);

    const visibleRoles = useMemo(() => {
        const query = roleQuery.trim().toLowerCase();
        return query ? roles.filter((r) => r.title.toLowerCase().includes(query)) : roles;
    }, [roles, roleQuery]);

    const ready = Boolean(role) && description.trim().length >= MIN_CHARS;

    const start = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (!role) return setError("Choose your role first.");
        if (description.trim().length < MIN_CHARS) return setError("Paste the full job description, including the responsibilities.");
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/try/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role, description }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.question) throw new Error(data.error || "We couldn't start your practice. Please try again.");
            saveTry(data as TryState);
            router.push("/try");
        } catch (err) {
            setError(err instanceof Error ? err.message : "We couldn't start your practice. Please try again.");
            setBusy(false);
        }
    };

    const sendRequest = async () => {
        if (requestState === "sending") return;
        if (wantedRole.trim().length < 3) return setRequestError("Tell us the role you're looking for.");
        setRequestState("sending");
        setRequestError(null);
        try {
            const res = await fetch("/api/roles/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: wantedRole, email: wantedEmail }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "We couldn't send your request. Please try again.");
            setRequestState("sent");
        } catch (err) {
            setRequestState("idle");
            setRequestError(err instanceof Error ? err.message : "We couldn't send your request. Please try again.");
        }
    };

    return (
        <form className={ob.inputFormStack} onSubmit={start} noValidate>
            {error && (
                <div className={ob.authErrorBanner} role="alert">
                    <span>{error}</span>
                </div>
            )}

            <div className={ob.inputGroup}>
                <label className={ob.inputLabel} htmlFor="try-role-search">Your role</label>
                <div className={styles.roleSearch}>
                    <input
                        id="try-role-search"
                        type="text"
                        className={ob.searchBoxInput}
                        placeholder="Product"
                        value={roleQuery}
                        onChange={(e) => setRoleQuery(e.target.value)}
                        disabled={busy}
                    />
                    <MagnifyingGlass size={18} className={ob.searchBoxRightIcon} />
                </div>
                <div className={`${ob.roleResultsList} ${styles.roleList}`} role="radiogroup" aria-label="Your role">
                    {visibleRoles.map((r) => {
                        const selected = role === r.title;
                        return (
                            <button
                                key={r.title}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                className={`${ob.roleTintRow} ${selected ? ob.roleTintRowSelected : ""}`}
                                onClick={() => setRole(r.title)}
                                disabled={busy}
                            >
                                <span>{r.title}</span>
                                {selected && (
                                    <span className={ob.selectedCheckCircle}>
                                        <Check size={12} weight="bold" />
                                    </span>
                                )}
                            </button>
                        );
                    })}
                    {roles.length > 0 && visibleRoles.length === 0 && <p className={ob.noResults}>No roles match &quot;{roleQuery}&quot;</p>}
                </div>

                {!requesting && requestState !== "sent" && (
                    <button type="button" className={`${ob.textLinkBtn} ${styles.inlineLink}`} onClick={() => setRequesting(true)}>
                        Can&rsquo;t find your role? Request it
                    </button>
                )}
                {requesting && requestState !== "sent" && (
                    <div className={styles.requestBox}>
                        <input
                            className={ob.formInput}
                            placeholder="The role you're looking for"
                            aria-label="The role you're looking for"
                            value={wantedRole}
                            onChange={(e) => setWantedRole(e.target.value)}
                            maxLength={80}
                        />
                        <input
                            className={ob.formInput}
                            type="email"
                            placeholder="Your email, to hear when it's added (optional)"
                            aria-label="Your email (optional)"
                            value={wantedEmail}
                            onChange={(e) => setWantedEmail(e.target.value)}
                            maxLength={200}
                        />
                        {requestError && (
                            <div className={ob.authErrorBanner} role="alert">
                                <span>{requestError}</span>
                            </div>
                        )}
                        <div className={styles.requestActions}>
                            <button type="button" className={ob.googleSsoBtn} onClick={() => setRequesting(false)}>Cancel</button>
                            <button type="button" className={`${ob.continueSubmitBtn} ${styles.inlineBtn}`} onClick={sendRequest} disabled={requestState === "sending"}>
                                {requestState === "sending" ? "Sending..." : "Request role"}
                            </button>
                        </div>
                    </div>
                )}
                {requestState === "sent" && (
                    <div className={ob.authInfoBanner} role="status">
                        <span>Thanks. We&rsquo;ve noted your request for {wantedRole.trim()}.</span>
                    </div>
                )}
            </div>

            <div className={ob.inputGroup}>
                <label className={ob.inputLabel} htmlFor="try-description">Job description</label>
                <textarea
                    id="try-description"
                    className={`${ob.formInput} ${styles.textarea}`}
                    placeholder="Paste the description of a job you're applying for"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={8000}
                    rows={8}
                    disabled={busy}
                />
            </div>

            <button type="submit" className={ob.continueSubmitBtn} disabled={busy || !ready}>
                {busy ? "Reading the job description..." : "Start my interview"}
            </button>
        </form>
    );
}
