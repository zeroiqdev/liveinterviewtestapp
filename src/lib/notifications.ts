/**
 * The bell's list: recent purchases and things that happened on the account,
 * built from records already kept (payments, reports, resume reviews, the
 * pass wallet). Nothing extra is stored except when the list was last opened.
 * Pure, so it can be tested without a database.
 */

import { PASS_HOURS } from "./passes";

export type NotificationKind = "purchase" | "report" | "resume" | "pass" | "welcome";

export interface AppNotification {
    id: string;
    kind: NotificationKind;
    title: string;
    detail: string;
    at: string;
    /** Where tapping it goes, if anywhere. */
    href?: string;
    unread: boolean;
}

export interface NotificationSources {
    accountCreatedAt?: Date;
    purchases: Array<{ reference: string; passes: number; amount: number; discountCode?: string; label?: string; paidAt: Date }>;
    reports: Array<{ sessionId: string; overallScore: number; role?: string; interviewType?: string; createdAt: Date }>;
    resumes: Array<{ id: string; name: string; score?: number; createdAt?: Date }>;
    activeUntil?: Date | null;
    /** When the person last opened the list; anything newer is unread. */
    seenAt?: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back the list goes. */
export const NOTIFICATION_DAYS = 30;
export const MAX_NOTIFICATIONS = 20;

const naira = (amount: number) => `₦${amount.toLocaleString("en-NG")}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildNotifications(sources: NotificationSources, now: Date = new Date()): AppNotification[] {
    const since = now.getTime() - NOTIFICATION_DAYS * DAY_MS;
    const seen = sources.seenAt?.getTime() ?? 0;
    const items: Array<Omit<AppNotification, "unread" | "at"> & { at: Date }> = [];

    for (const p of sources.purchases) {
        const passes = plural(p.passes, "pass", "passes");
        if (p.label === "Referral reward") {
            items.push({
                id: `purchase:${p.reference}`,
                kind: "purchase",
                title: "You earned a free pass",
                detail: "Friends you invited bought passes, so a free pass has been added to your account.",
                at: p.paidAt,
                href: "/profile#invite",
            });
            continue;
        }
        items.push({
            id: `purchase:${p.reference}`,
            kind: "purchase",
            title: p.amount === 0 ? `${passes} added to your account` : `Payment received for ${passes}`,
            detail:
                p.amount === 0
                    ? `With the code ${p.discountCode || "you used"}. Each pass gives you 24 hours of interviews.`
                    : `${naira(p.amount)}${p.discountCode ? ` with the code ${p.discountCode}` : ""}. See your receipt.`,
            at: p.paidAt,
            href: `/payment/receipt/${encodeURIComponent(p.reference)}`,
        });
    }

    for (const r of sources.reports) {
        const what = r.interviewType || (r.role ? `${r.role} interview` : "interview");
        items.push({
            id: `report:${r.sessionId}`,
            kind: "report",
            title: "Your interview report is ready",
            detail: `${what}: ${Math.round(r.overallScore)} out of 100.`,
            at: r.createdAt,
            href: `/feedback?sessionId=${encodeURIComponent(r.sessionId)}`,
        });
    }

    for (const resume of sources.resumes) {
        if (!resume.createdAt || typeof resume.score !== "number" || resume.score <= 0) continue;
        items.push({
            id: `resume:${resume.id}`,
            kind: "resume",
            title: "Your resume was reviewed",
            detail: `${resume.name} scored ${Math.round(resume.score)} out of 100. See what to fix.`,
            at: resume.createdAt,
            href: "/resume-feedback",
        });
    }

    // A running pass started PASS_HOURS before it ends.
    if (sources.activeUntil && sources.activeUntil.getTime() > now.getTime()) {
        const until = sources.activeUntil;
        items.push({
            id: `pass:${until.getTime()}`,
            kind: "pass",
            title: "Your pass is running",
            detail: `Interview as much as you like until ${until.toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" })}.`,
            at: new Date(until.getTime() - PASS_HOURS * 60 * 60 * 1000),
        });
    }

    if (sources.accountCreatedAt) {
        items.push({
            id: "welcome",
            kind: "welcome",
            title: "Welcome to get prepped",
            detail: "Pick an interview on the home screen to start practising.",
            at: sources.accountCreatedAt,
        });
    }

    return items
        .filter((item) => item.at.getTime() >= since && item.at.getTime() <= now.getTime() + 60_000)
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, MAX_NOTIFICATIONS)
        .map((item) => ({ ...item, at: item.at.toISOString(), unread: item.at.getTime() > seen }));
}
