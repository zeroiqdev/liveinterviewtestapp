/**
 * Product metrics for the admin dashboard: is the product delivering value,
 * do people come back, and do they pay. Worked out from records already kept
 * (accounts, interviews, reports, purchases, tries); nothing extra is tracked.
 * Pure functions, so the numbers can be tested without a database.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export interface MetricUser {
    /** Every id the user's interviews may be filed under: account id and email. */
    ids: string[];
    email: string;
    createdAt: Date;
    provider: string;
    role: string;
}
export interface MetricInterview {
    ownerId: string;
    startedAt: Date;
}
export interface MetricReport {
    email: string;
    createdAt: Date;
    mode?: string;
}
export interface MetricPurchase {
    email: string;
    amount: number;
    paidAt: Date;
}
export interface MetricTry {
    createdAt: Date;
    answers: number;
    claimed: boolean;
}
export interface MetricWallet {
    email: string;
    freeInterviewsUsed: number;
}

export interface Headline {
    /** Share as a whole percent, or null when there is no one to measure yet. */
    percent: number | null;
    /** Who it's measured over ("of 42 sign-ups"). */
    of: number;
}

export interface WeekRow {
    /** Monday the week starts, YYYY-MM-DD. */
    week: string;
    signUps: number;
    interviewsStarted: number;
    interviewsCompleted: number;
    /** People who started at least one interview that week. */
    activePractisers: number;
    payers: number;
    revenue: number;
}

export interface ProductMetrics {
    activation: Headline & { medianHoursToFirst: number | null };
    completion: Headline;
    secondInterview: Headline;
    paywallConversion: Headline;
    weekOneRetention: Headline;
    revenue: { total: number; last30Days: number; payers: number; repeatPayers: number };
    weeks: WeekRow[];
    trial: { started: number; finished: number; carriedOn: number };
    signUpsByRole: Array<{ label: string; count: number }>;
    signUpsByMethod: Array<{ label: string; count: number }>;
    interviewsByMode: Array<{ label: string; count: number }>;
}

function percent(part: number, whole: number): number | null {
    return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Monday 00:00 UTC of the week a time falls in. */
export function weekStart(date: Date): Date {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    return new Date(d.getTime() - day * DAY_MS);
}

function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function countBy<T>(items: T[], key: (item: T) => string, limit = 8): Array<{ label: string; count: number }> {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
    return [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

export function computeProductMetrics(
    data: {
        users: MetricUser[];
        interviews: MetricInterview[];
        reports: MetricReport[];
        purchases: MetricPurchase[];
        tries: MetricTry[];
        wallets: MetricWallet[];
    },
    now: Date = new Date(),
    weeksShown = 8
): ProductMetrics {
    const { users, interviews, reports, purchases, tries, wallets } = data;

    // Each user's interview start times, oldest first.
    const ownerToEmail = new Map<string, string>();
    for (const user of users) for (const id of user.ids) ownerToEmail.set(id, user.email);
    const startsByEmail = new Map<string, number[]>();
    for (const interview of interviews) {
        const email = ownerToEmail.get(interview.ownerId);
        if (!email) continue;
        const list = startsByEmail.get(email) ?? [];
        list.push(interview.startedAt.getTime());
        startsByEmail.set(email, list);
    }
    for (const list of startsByEmail.values()) list.sort((a, b) => a - b);
    const reportEmails = new Set(reports.map((r) => r.email));

    // Activation: signed up, then started an interview.
    const started = users.filter((u) => (startsByEmail.get(u.email)?.length ?? 0) > 0);
    const hoursToFirst = started.map((u) => Math.max(0, (startsByEmail.get(u.email)![0] - u.createdAt.getTime()) / 3_600_000));

    // Completion: of those who started, how many have a report.
    const completed = started.filter((u) => reportEmails.has(u.email));

    // Second interview within 7 days of the first, among people whose first was at least 7 days ago.
    const firstOldEnough = started.filter((u) => now.getTime() - startsByEmail.get(u.email)![0] >= WEEK_MS);
    const cameBack = firstOldEnough.filter((u) => {
        const starts = startsByEmail.get(u.email)!;
        return starts.length > 1 && starts[1] - starts[0] <= WEEK_MS;
    });

    // Paywall: of people who used their free interview, how many paid.
    const usedFree = new Set(wallets.filter((w) => w.freeInterviewsUsed > 0).map((w) => w.email));
    const paidEmails = new Set(purchases.map((p) => p.email));
    const paidAfterFree = [...usedFree].filter((email) => paidEmails.has(email));

    // Week-one retention: practised again 7–14 days after signing up, among people who signed up at least 14 days ago.
    const oldEnough = users.filter((u) => now.getTime() - u.createdAt.getTime() >= 2 * WEEK_MS);
    const retained = oldEnough.filter((u) =>
        (startsByEmail.get(u.email) ?? []).some((t) => t - u.createdAt.getTime() >= WEEK_MS && t - u.createdAt.getTime() < 2 * WEEK_MS)
    );

    // Revenue.
    const purchasesByEmail = new Map<string, number>();
    for (const p of purchases) purchasesByEmail.set(p.email, (purchasesByEmail.get(p.email) ?? 0) + 1);
    const total = purchases.reduce((sum, p) => sum + p.amount, 0);
    const last30Days = purchases.filter((p) => now.getTime() - p.paidAt.getTime() <= 30 * DAY_MS).reduce((sum, p) => sum + p.amount, 0);

    // Week by week, oldest first.
    const thisWeek = weekStart(now).getTime();
    const weeks: WeekRow[] = [];
    for (let i = weeksShown - 1; i >= 0; i--) {
        const from = thisWeek - i * WEEK_MS;
        const to = from + WEEK_MS;
        const inWeek = (d: Date) => d.getTime() >= from && d.getTime() < to;
        const weekStarts = interviews.filter((it) => inWeek(it.startedAt));
        const weekPurchases = purchases.filter((p) => inWeek(p.paidAt));
        weeks.push({
            week: new Date(from).toISOString().slice(0, 10),
            signUps: users.filter((u) => inWeek(u.createdAt)).length,
            interviewsStarted: weekStarts.length,
            interviewsCompleted: reports.filter((r) => inWeek(r.createdAt)).length,
            activePractisers: new Set(weekStarts.map((it) => ownerToEmail.get(it.ownerId) ?? it.ownerId)).size,
            payers: new Set(weekPurchases.map((p) => p.email)).size,
            revenue: weekPurchases.reduce((sum, p) => sum + p.amount, 0),
        });
    }

    return {
        activation: { percent: percent(started.length, users.length), of: users.length, medianHoursToFirst: median(hoursToFirst) },
        completion: { percent: percent(completed.length, started.length), of: started.length },
        secondInterview: { percent: percent(cameBack.length, firstOldEnough.length), of: firstOldEnough.length },
        paywallConversion: { percent: percent(paidAfterFree.length, usedFree.size), of: usedFree.size },
        weekOneRetention: { percent: percent(retained.length, oldEnough.length), of: oldEnough.length },
        revenue: {
            total,
            last30Days,
            payers: paidEmails.size,
            repeatPayers: [...purchasesByEmail.values()].filter((n) => n > 1).length,
        },
        weeks,
        trial: {
            started: tries.length,
            finished: tries.filter((t) => t.answers >= 2).length,
            carriedOn: tries.filter((t) => t.claimed).length,
        },
        signUpsByRole: countBy(users, (u) => u.role || "Not set"),
        signUpsByMethod: countBy(users, (u) => (u.provider === "google" ? "Google" : "Email and password")),
        interviewsByMode: countBy(
            reports.filter((r) => r.mode),
            (r) => (r.mode === "Live Coaching" ? "Interactive Practice" : r.mode === "Mock Interview" ? "Real Interview" : (r.mode as string))
        ),
    };
}
