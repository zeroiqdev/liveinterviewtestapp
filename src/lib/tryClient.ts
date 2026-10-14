/** Browser side of try-before-sign-up: what the page keeps between its steps. */

export const TRY_STORAGE_KEY = "useladder_try";

export interface TryQuestion {
    index: number;
    text: string;
    audioUrl: string | null;
}

export interface TryState {
    role: string;
    domain: string;
    company: string;
    title: string;
    themes: string[];
    total: number;
    question: TryQuestion;
    /** Set once both questions are answered. */
    done?: boolean;
    feedback?: { score: number; working: string; fix: string } | null;
    firstQuestion?: string;
    secondQuestion?: string;
}

export function readTry(): TryState | null {
    try {
        const raw = sessionStorage.getItem(TRY_STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as TryState) : null;
        return parsed && parsed.role && parsed.question ? parsed : null;
    } catch {
        return null;
    }
}

export function saveTry(state: TryState): void {
    try {
        sessionStorage.setItem(TRY_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Saved data is blocked: the page still works until it is reloaded.
    }
}

export function clearTry(): void {
    try {
        sessionStorage.removeItem(TRY_STORAGE_KEY);
    } catch {
        // Nothing to clear.
    }
}

/** Where a finished try carries on once the person has an account. */
export function continueUrl(state: Pick<TryState, "role" | "company" | "title">): string {
    const params = new URLSearchParams({
        mode: "live_coaching",
        role: state.role,
        company: state.company || "General",
        interviewType: `${state.title} Interview`,
        try: "1",
    });
    return `/interview?${params.toString()}`;
}
