"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    Briefcase,
    Check,
    CreditCard,
    FileText,
    LockKey,
    SignOut,
    Trash,
    UserCircle,
    Warning,
} from "@phosphor-icons/react";
import styles from "./profile.module.css";
import { FeedbackButton } from "./FeedbackButton";
import PassDialog from "./PassDialog";
import PasswordChecklist from "./PasswordChecklist";
import { DeleteAccountDialog } from "./dashboard/DeleteAccountDialog";
import { isStrongPassword } from "@/lib/passwordPolicy";
import { normalizeUserRoleFamily } from "@/utils/locationDetector";
import { receiptNumber } from "@/lib/receipts";

interface Me {
    name: string;
    email: string;
    role: string;
    domain: string;
    experienceInRole: string;
    linkedinUrl: string;
    portfolioUrl: string;
    provider: string;
    hasPassword: boolean;
    resumes: Array<{ id: string; name: string; score?: number; updatedAt?: string; createdAt?: string }>;
}
interface PassState {
    active: boolean;
    expiresAt: string | null;
    unused: number;
    freeInterviewsLeft: number;
}
interface Purchase {
    reference: string;
    label: string;
    passes: number;
    amount: number;
    currency: string;
    paidAt: string;
}

/** The same choices as at sign-up. */
const EXPERIENCE_OPTIONS = [
    { value: "none", label: "No job experience", level: "Entry-Level" },
    { value: "0-3", label: "0–3 years", level: "Junior" },
    { value: "3-5", label: "3–5 years", level: "Mid-Level" },
    { value: "5+", label: "5+ years", level: "Senior" },
] as const;

const SECTIONS = [
    { id: "profile", label: "Profile", icon: UserCircle },
    { id: "career", label: "Role and experience", icon: Briefcase },
    { id: "resumes", label: "Resumes", icon: FileText },
    { id: "security", label: "Sign-in and security", icon: LockKey },
    { id: "billing", label: "Passes and payments", icon: CreditCard },
    { id: "account", label: "Delete account", icon: Warning },
] as const;

function initialsOf(name: string, email: string): string {
    const words = (name || email.split("@")[0] || "").trim().split(/\s+/).filter(Boolean);
    return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase() || "?";
}

/** Empty, or a web address (https:// added when it's left off). Null when it isn't one. */
function cleanUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(withScheme);
        return url.hostname.includes(".") ? url.toString() : null;
    } catch {
        return null;
    }
}

function naira(amount: number): string {
    return `₦${amount.toLocaleString("en-NG")}`;
}

function shortDate(value?: string): string {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Keeps the dashboard's saved copy of the profile in step with what was just saved. */
function rememberUser(user: unknown) {
    if (!user || typeof user !== "object") return;
    try {
        const saved = JSON.parse(localStorage.getItem("useladder_user") || "{}");
        localStorage.setItem("useladder_user", JSON.stringify({ ...saved, ...user }));
    } catch {
        // Saved data is blocked: the dashboard reads the account from the server anyway.
    }
}

type SaveState = { status: "idle" | "saving" | "saved"; error: string | null };
const IDLE: SaveState = { status: "idle", error: null };

/** One card on the page: a title, a line on what it's for, then its fields. */
function Section({ id, title, description, children, tone }: { id: string; title: string; description: string; children: React.ReactNode; tone?: "danger" }) {
    return (
        <section id={id} className={`${styles.card} ${tone === "danger" ? styles.cardDanger : ""}`} aria-labelledby={`${id}-title`}>
            <header className={styles.cardHead}>
                <h2 id={`${id}-title`} className={styles.cardTitle}>{title}</h2>
                <p className={styles.cardText}>{description}</p>
            </header>
            {children}
        </section>
    );
}

/** The save button and what happened, at the foot of a card. */
function SaveRow({ state, disabled, label = "Save changes", onSave }: { state: SaveState; disabled: boolean; label?: string; onSave: () => void }) {
    return (
        <div className={styles.saveRow}>
            {state.error ? (
                <p className={styles.error} role="alert">{state.error}</p>
            ) : state.status === "saved" ? (
                <p className={styles.saved} role="status"><Check size={14} weight="bold" /> Saved</p>
            ) : (
                <span />
            )}
            <button type="button" className={styles.primary} onClick={onSave} disabled={disabled || state.status === "saving"}>
                {state.status === "saving" ? "Saving…" : label}
            </button>
        </div>
    );
}

/** Account settings: profile, role, resumes, sign-in, passes and payments, and deleting the account. */
export default function ProfilePage() {
    const router = useRouter();
    const [me, setMe] = useState<Me | null>(null);
    const [failed, setFailed] = useState(false);
    const [pass, setPass] = useState<PassState | null>(null);
    const [purchases, setPurchases] = useState<Purchase[] | null>(null);
    const [roles, setRoles] = useState<Array<{ title: string; domain: string }>>([]);
    const [activeSection, setActiveSection] = useState<string>("profile");
    const [passOpen, setPassOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Profile
    const [name, setName] = useState("");
    const [linkedin, setLinkedin] = useState("");
    const [portfolio, setPortfolio] = useState("");
    const [profileSave, setProfileSave] = useState<SaveState>(IDLE);
    // Changing email: new address and password, then the code sent to it.
    const [emailStep, setEmailStep] = useState<"idle" | "form" | "code">("idle");
    const [newEmail, setNewEmail] = useState("");
    const [emailPassword, setEmailPassword] = useState("");
    const [emailCode, setEmailCode] = useState("");
    const [emailBusy, setEmailBusy] = useState(false);
    const [emailNote, setEmailNote] = useState<{ kind: "info" | "error"; text: string } | null>(null);
    // Role and experience
    const [role, setRole] = useState("");
    const [experience, setExperience] = useState("");
    const [careerSave, setCareerSave] = useState<SaveState>(IDLE);
    const [requesting, setRequesting] = useState(false);
    const [wantedRole, setWantedRole] = useState("");
    const [requestNote, setRequestNote] = useState<string | null>(null);
    // Password
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [passwordSave, setPasswordSave] = useState<SaveState>(IDLE);

    const load = useCallback(async () => {
        const res = await fetch("/api/auth/user", { cache: "no-store" }).catch(() => null);
        if (res?.status === 401) {
            router.replace("/login?redirect=/profile");
            return;
        }
        const data = res?.ok ? await res.json().catch(() => null) : null;
        if (!data?.user) {
            setFailed(true);
            return;
        }
        const user = data.user as Me;
        setMe(user);
        setName(user.name);
        setLinkedin(user.linkedinUrl);
        setPortfolio(user.portfolioUrl);
        setRole(user.role);
        setExperience(EXPERIENCE_OPTIONS.some((o) => o.value === user.experienceInRole) ? user.experienceInRole : "");
    }, [router]);

    useEffect(() => {
        const start = window.setTimeout(() => void load(), 0);
        fetch("/api/payments/pass", { cache: "no-store" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => data && setPass(data))
            .catch(() => undefined);
        fetch("/api/payments/history", { cache: "no-store" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => setPurchases(Array.isArray(data?.purchases) ? data.purchases : []))
            .catch(() => setPurchases([]));
        fetch("/api/roles")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => Array.isArray(data?.roles) && setRoles(data.roles))
            .catch(() => undefined);
        return () => window.clearTimeout(start);
    }, [load]);

    // The section in view is the one marked in the side list.
    useEffect(() => {
        if (!me) return;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
                if (visible) setActiveSection(visible.target.id);
            },
            { rootMargin: "-20% 0px -65% 0px" }
        );
        SECTIONS.forEach((section) => {
            const el = document.getElementById(section.id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, [me]);

    const save = async (body: Record<string, unknown>, setState: (s: SaveState) => void): Promise<boolean> => {
        setState({ status: "saving", error: null });
        try {
            const res = await fetch("/api/auth/user", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "We couldn't save that. Please try again.");
            if (data.user) {
                setMe((current) => (current ? { ...current, ...data.user } : current));
                rememberUser(data.user);
            }
            setState({ status: "saved", error: null });
            return true;
        } catch (err) {
            setState({ status: "idle", error: err instanceof Error ? err.message : "We couldn't save that. Please try again." });
            return false;
        }
    };

    const emailRequest = async (action: "request" | "confirm") => {
        if (emailBusy) return;
        setEmailBusy(true);
        setEmailNote(null);
        try {
            const res = await fetch("/api/auth/email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(action === "request" ? { action, newEmail, currentPassword: emailPassword } : { action, newEmail, code: emailCode }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "We couldn't change your email just now.");
            if (action === "request") {
                setEmailStep("code");
                setEmailNote({ kind: "info", text: data.message || `We've emailed a code to ${newEmail}.` });
            } else {
                if (data.user) {
                    setMe((current) => (current ? { ...current, ...data.user } : current));
                    rememberUser(data.user);
                }
                setEmailStep("idle");
                setNewEmail("");
                setEmailPassword("");
                setEmailCode("");
                setEmailNote({ kind: "info", text: "Your email has been changed. Use it next time you sign in." });
            }
        } catch (err) {
            setEmailNote({ kind: "error", text: err instanceof Error ? err.message : "We couldn't change your email just now." });
        } finally {
            setEmailBusy(false);
        }
    };

    const profileChanged = !!me && (name.trim() !== me.name || linkedin.trim() !== me.linkedinUrl || portfolio.trim() !== me.portfolioUrl);
    const saveProfile = () => {
        if (name.trim().length < 2) return setProfileSave({ status: "idle", error: "Enter your name." });
        const linkedinUrl = cleanUrl(linkedin);
        const portfolioUrl = cleanUrl(portfolio);
        if (linkedinUrl === null) return setProfileSave({ status: "idle", error: "That LinkedIn address doesn't look right." });
        if (portfolioUrl === null) return setProfileSave({ status: "idle", error: "That portfolio address doesn't look right." });
        setLinkedin(linkedinUrl);
        setPortfolio(portfolioUrl);
        void save({ name: name.trim(), linkedinUrl, portfolioUrl }, setProfileSave);
    };

    const careerChanged = !!me && (role !== me.role || (experience !== "" && experience !== me.experienceInRole));
    const saveCareer = () => {
        const picked = roles.find((r) => r.title === role);
        const level = EXPERIENCE_OPTIONS.find((o) => o.value === experience);
        void save(
            {
                role,
                ...(picked ? { domain: picked.domain } : {}),
                ...(level ? { experienceInRole: level.value, seniority: level.level } : {}),
            },
            setCareerSave
        ).then((ok) => {
            if (!ok) return;
            // The dashboard picks its interview types and jobs from the role family.
            rememberUser({ role, roleFamily: normalizeUserRoleFamily(role) });
        });
    };

    const requestRole = async () => {
        if (wantedRole.trim().length < 3) return setRequestNote("Tell us the role you're looking for.");
        const res = await fetch("/api/roles/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: wantedRole, email: me?.email }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        if (!res?.ok) return setRequestNote(data.error || "We couldn't send your request. Please try again.");
        setRequestNote(`Thanks. We'll email you when ${wantedRole.trim()} is added.`);
        setRequesting(false);
        setWantedRole("");
    };

    const passwordReady = isStrongPassword(newPassword.trim()) && (!me?.hasPassword || currentPassword.length > 0);
    const savePassword = async () => {
        const ok = await save({ password: newPassword.trim(), ...(me?.hasPassword ? { currentPassword } : {}) }, setPasswordSave);
        if (ok) {
            setCurrentPassword("");
            setNewPassword("");
            setMe((current) => (current ? { ...current, hasPassword: true } : current));
        }
    };

    const signOut = async () => {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        try {
            localStorage.removeItem("useladder_user");
        } catch {
            // Saved data is blocked: they are signed out on the server all the same.
        }
        router.push("/login");
    };

    const passLine = useMemo(() => {
        if (!pass) return null;
        if (pass.active && pass.expiresAt) {
            return { title: "Pass active", detail: `Until ${new Date(pass.expiresAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` };
        }
        if (pass.unused > 0) return { title: `${pass.unused} unused ${pass.unused === 1 ? "pass" : "passes"}`, detail: "Each starts when you begin an interview and lasts 24 hours." };
        if (pass.freeInterviewsLeft > 0) return { title: "Free interview available", detail: "Your first interview is on us." };
        return { title: "No active pass", detail: "Get a pass to keep practising." };
    }, [pass]);

    const roleOptions = useMemo(() => {
        const titles = roles.map((r) => r.title);
        // Keep an older role that's no longer on the list selectable.
        return me?.role && !titles.includes(me.role) ? [me.role, ...titles] : titles;
    }, [roles, me?.role]);

    return (
        <div className={styles.page}>
            <header className={styles.top}>
                <Link href="/dashboard" className={styles.back}>
                    <ArrowLeft size={16} weight="bold" /> Dashboard
                </Link>
                <FeedbackButton section="Profile" />
            </header>

            {failed ? (
                <main className={styles.mainNarrow}>
                    <p className={styles.note}>We couldn&rsquo;t load your account. Refresh to try again.</p>
                </main>
            ) : !me ? (
                <main className={styles.mainNarrow} aria-busy="true">
                    <p className={styles.note}>Loading your account…</p>
                </main>
            ) : (
                <div className={styles.layout}>
                    <aside className={styles.side}>
                        <div className={styles.identity}>
                            <span className={styles.avatar} aria-hidden="true">{initialsOf(me.name, me.email)}</span>
                            <div className={styles.identityText}>
                                <h1 className={styles.name}>{me.name || me.email}</h1>
                                <p className={styles.email}>{me.email}</p>
                            </div>
                        </div>
                        <nav className={styles.nav} aria-label="Settings">
                            {SECTIONS.map((section) => {
                                const Icon = section.icon;
                                return (
                                    <a
                                        key={section.id}
                                        href={`#${section.id}`}
                                        className={`${styles.navItem} ${activeSection === section.id ? styles.navItemActive : ""} ${section.id === "account" ? styles.navItemDanger : ""}`}
                                        aria-current={activeSection === section.id ? "true" : undefined}
                                    >
                                        <Icon size={17} weight={activeSection === section.id ? "fill" : "regular"} />
                                        {section.label}
                                    </a>
                                );
                            })}
                        </nav>
                        <button type="button" className={styles.signOut} onClick={signOut}>
                            <SignOut size={16} weight="bold" /> Sign out
                        </button>
                    </aside>

                    <main className={styles.content}>
                        <Section id="profile" title="Profile" description="How you appear in your reports, and where recruiters can find more about you.">
                            <div className={styles.fields}>
                                <label className={styles.field}>
                                    <span className={styles.label}>Full name</span>
                                    <input className={styles.input} value={name} onChange={(e) => { setName(e.target.value); setProfileSave(IDLE); }} maxLength={80} autoComplete="name" />
                                </label>
                                <div className={styles.field}>
                                    <label className={styles.label} htmlFor="settings-email">Email</label>
                                    <input id="settings-email" className={styles.input} value={me.email} readOnly aria-describedby="email-note" />
                                    <span id="email-note" className={styles.hint}>
                                        {me.provider === "google" ? (
                                            "You sign in with Google, so this comes from your Google account."
                                        ) : emailStep === "idle" ? (
                                            <>
                                                The email you sign in with.{" "}
                                                <button type="button" className={styles.linkBtn} onClick={() => { setEmailStep("form"); setEmailNote(null); }}>
                                                    Change it
                                                </button>
                                            </>
                                        ) : null}
                                    </span>
                                </div>
                                <label className={styles.field}>
                                    <span className={styles.label}>LinkedIn <span className={styles.optional}>(optional)</span></span>
                                    <input className={styles.input} value={linkedin} onChange={(e) => { setLinkedin(e.target.value); setProfileSave(IDLE); }} placeholder="linkedin.com/in/your-name" inputMode="url" maxLength={300} />
                                </label>
                                <label className={styles.field}>
                                    <span className={styles.label}>Portfolio or website <span className={styles.optional}>(optional)</span></span>
                                    <input className={styles.input} value={portfolio} onChange={(e) => { setPortfolio(e.target.value); setProfileSave(IDLE); }} placeholder="yourname.com" inputMode="url" maxLength={300} />
                                </label>
                            </div>
                            {emailNote && emailStep === "idle" && <p className={emailNote.kind === "error" ? styles.error : styles.saved}>{emailNote.text}</p>}
                            {emailStep !== "idle" && (
                                <div className={styles.subPanel}>
                                    <h3 className={styles.subTitle}>Change your email</h3>
                                    {emailStep === "form" ? (
                                        <div className={styles.fields}>
                                            <label className={styles.field}>
                                                <span className={styles.label}>New email</span>
                                                <input className={styles.input} type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email" maxLength={200} />
                                            </label>
                                            {me.hasPassword && (
                                                <label className={styles.field}>
                                                    <span className={styles.label}>Current password</span>
                                                    <input className={styles.input} type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} autoComplete="current-password" />
                                                </label>
                                            )}
                                        </div>
                                    ) : (
                                        <label className={styles.field}>
                                            <span className={styles.label}>Code sent to {newEmail}</span>
                                            <input
                                                className={styles.input}
                                                inputMode="numeric"
                                                autoComplete="one-time-code"
                                                maxLength={6}
                                                value={emailCode}
                                                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                                placeholder="123456"
                                            />
                                        </label>
                                    )}
                                    {emailNote && <p className={emailNote.kind === "error" ? styles.error : styles.hint}>{emailNote.text}</p>}
                                    <div className={styles.buttonRow}>
                                        {emailStep === "form" ? (
                                            <button
                                                type="button"
                                                className={styles.primary}
                                                onClick={() => void emailRequest("request")}
                                                disabled={emailBusy || !newEmail.includes("@") || (me.hasPassword && !emailPassword)}
                                            >
                                                {emailBusy ? "Sending…" : "Send code"}
                                            </button>
                                        ) : (
                                            <>
                                                <button type="button" className={styles.primary} onClick={() => void emailRequest("confirm")} disabled={emailBusy || emailCode.length !== 6}>
                                                    {emailBusy ? "Changing…" : "Change email"}
                                                </button>
                                                <button type="button" className={styles.secondary} onClick={() => void emailRequest("request")} disabled={emailBusy}>
                                                    Send a new code
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            className={styles.secondary}
                                            onClick={() => {
                                                setEmailStep("idle");
                                                setEmailNote(null);
                                                setEmailCode("");
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                            <SaveRow state={profileSave} disabled={!profileChanged} onSave={saveProfile} />
                        </Section>

                        <Section id="career" title="Role and experience" description="Your interview questions, matched jobs and weekly tips are chosen from these.">
                            <div className={styles.fields}>
                                <div className={styles.field}>
                                    <label className={styles.label} htmlFor="settings-role">Role you&rsquo;re preparing for</label>
                                    <select id="settings-role" className={styles.input} value={role} onChange={(e) => { setRole(e.target.value); setCareerSave(IDLE); }}>
                                        {roleOptions.map((title) => (
                                            <option key={title} value={title}>{title}</option>
                                        ))}
                                    </select>
                                    {requesting ? (
                                        <span className={styles.requestRow}>
                                            <input
                                                className={styles.input}
                                                value={wantedRole}
                                                onChange={(e) => setWantedRole(e.target.value)}
                                                placeholder="The role you're looking for"
                                                aria-label="The role you're looking for"
                                                maxLength={80}
                                            />
                                            <button type="button" className={styles.secondary} onClick={() => void requestRole()}>Request</button>
                                        </span>
                                    ) : (
                                        <span className={styles.hint}>
                                            {requestNote ?? (
                                                <>
                                                    Can&rsquo;t find yours?{" "}
                                                    <button type="button" className={styles.linkBtn} onClick={() => { setRequesting(true); setRequestNote(null); }}>
                                                        Request it
                                                    </button>
                                                </>
                                            )}
                                        </span>
                                    )}
                                    {requesting && requestNote && <span className={styles.error}>{requestNote}</span>}
                                </div>
                                <div className={styles.field} role="radiogroup" aria-labelledby="experience-label">
                                    <span id="experience-label" className={styles.label}>Years of experience in this role</span>
                                    <div className={styles.segmented}>
                                        {EXPERIENCE_OPTIONS.map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                role="radio"
                                                aria-checked={experience === option.value}
                                                className={`${styles.segment} ${experience === option.value ? styles.segmentOn : ""}`}
                                                onClick={() => { setExperience(option.value); setCareerSave(IDLE); }}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <SaveRow state={careerSave} disabled={!careerChanged} onSave={saveCareer} />
                        </Section>

                        <Section id="resumes" title="Resumes" description="With a resume, some questions are about your own experience, and jobs are matched to it.">
                            {me.resumes.length === 0 ? (
                                <p className={styles.empty}>You haven&rsquo;t added a resume yet.</p>
                            ) : (
                                <ul className={styles.list}>
                                    {me.resumes.map((resume) => (
                                        <li key={resume.id} className={styles.listRow}>
                                            <span className={styles.fileIcon} aria-hidden="true"><FileText size={18} /></span>
                                            <span className={styles.listText}>
                                                <b>{resume.name}</b>
                                                <span>
                                                    {[shortDate(resume.updatedAt || resume.createdAt) && `Updated ${shortDate(resume.updatedAt || resume.createdAt)}`, typeof resume.score === "number" && resume.score > 0 ? `Resume score ${resume.score}` : ""]
                                                        .filter(Boolean)
                                                        .join(" · ")}
                                                </span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className={styles.buttonRow}>
                                <button type="button" className={styles.secondary} onClick={() => router.push("/dashboard?open=credentials")}>
                                    {me.resumes.length === 0 ? "Add a resume" : "Add or change resumes"}
                                </button>
                                {me.resumes.length > 0 && (
                                    <Link href="/resume-feedback" className={styles.secondary}>See resume feedback</Link>
                                )}
                            </div>
                        </Section>

                        <Section
                            id="security"
                            title="Sign-in and security"
                            description={me.provider === "google" ? "You sign in with Google. You can also set a password to sign in with your email." : "You sign in with your email and password."}
                        >
                            <dl className={styles.facts}>
                                <div><dt>Sign-in method</dt><dd>{me.provider === "google" ? (me.hasPassword ? "Google, or email and password" : "Google") : "Email and password"}</dd></div>
                            </dl>
                            <h3 className={styles.subTitle}>{me.hasPassword ? "Change password" : "Set a password"}</h3>
                            <div className={styles.fields}>
                                {me.hasPassword && (
                                    <label className={styles.field}>
                                        <span className={styles.label}>Current password</span>
                                        <input className={styles.input} type="password" value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setPasswordSave(IDLE); }} autoComplete="current-password" />
                                        <span className={styles.hint}>
                                            Forgotten it? <Link href="/login">Reset it from the sign-in page</Link>.
                                        </span>
                                    </label>
                                )}
                                <label className={styles.field}>
                                    <span className={styles.label}>New password</span>
                                    <input className={styles.input} type="password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setPasswordSave(IDLE); }} autoComplete="new-password" aria-describedby="new-password-rules" />
                                    {newPassword && <PasswordChecklist password={newPassword.trim()} id="new-password-rules" />}
                                </label>
                            </div>
                            <p className={styles.hint}>Changing your password signs you out on your other devices.</p>
                            <SaveRow state={passwordSave} disabled={!passwordReady} label={me.hasPassword ? "Change password" : "Set password"} onSave={() => void savePassword()} />
                            <button type="button" className={`${styles.secondary} ${styles.signOutInline}`} onClick={signOut}>
                                <SignOut size={16} weight="bold" /> Sign out
                            </button>
                        </Section>

                        <Section id="billing" title="Passes and payments" description="A pass gives you unlimited interviews for 24 hours, starting when you begin the first one.">
                            {passLine && (
                                <div className={styles.passBox}>
                                    <div>
                                        <b>{passLine.title}</b>
                                        <span>{passLine.detail}</span>
                                    </div>
                                    {!pass?.active && (
                                        <button type="button" className={styles.primary} onClick={() => setPassOpen(true)}>Get a pass</button>
                                    )}
                                </div>
                            )}
                            <h3 className={styles.subTitle}>Payment history</h3>
                            {purchases === null ? (
                                <p className={styles.empty}>Loading…</p>
                            ) : purchases.length === 0 ? (
                                <p className={styles.empty}>No payments yet.</p>
                            ) : (
                                <ul className={styles.list}>
                                    {purchases.map((purchase) => (
                                        <li key={purchase.reference} className={styles.listRow}>
                                            <span className={styles.listText}>
                                                <b>{purchase.label}</b>
                                                <span>{shortDate(purchase.paidAt)} · {receiptNumber(purchase.reference)}</span>
                                            </span>
                                            <span className={styles.amount}>{naira(purchase.amount)}</span>
                                            <Link href={`/payment/receipt/${encodeURIComponent(purchase.reference)}`} className={styles.receiptLink}>
                                                Receipt
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Section>

                        <Section id="account" title="Delete account" description="Removes your profile, resumes, interview reports and everything else we keep about you. A record of any payments you made is kept for our accounts. This can't be undone." tone="danger">
                            <div className={styles.buttonRow}>
                                <button type="button" className={styles.dangerBtn} onClick={() => setDeleting(true)}>
                                    <Trash size={15} weight="bold" /> Delete my account
                                </button>
                            </div>
                        </Section>
                    </main>
                </div>
            )}

            <PassDialog isOpen={passOpen} onClose={() => setPassOpen(false)} />
            <DeleteAccountDialog isOpen={deleting} onClose={() => setDeleting(false)} />
        </div>
    );
}
