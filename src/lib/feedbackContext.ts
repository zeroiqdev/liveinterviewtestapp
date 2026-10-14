/**
 * What the app already knows when someone sends feedback, so they don't have
 * to describe it: their device, the last things they did, any errors the app
 * hit, and whatever the current screen adds (the interview, the question).
 *
 * Kept in memory only, and only as labels: what was typed into a field, a
 * resume or an answer is never recorded here.
 */

const MAX_STEPS = 25;
const MAX_ERRORS = 5;

export interface FeedbackStep {
    /** Seconds before the feedback was sent. */
    secondsAgo?: number;
    at: number;
    what: string;
}

const steps: Array<{ at: number; what: string }> = [];
const errors: Array<{ at: number; message: string }> = [];
const screenContext: Record<string, Record<string, string | number | boolean | null | undefined>> = {};
let started = false;

function remember<T>(list: T[], item: T, max: number) {
    list.push(item);
    if (list.length > max) list.shift();
}

/** A short, readable name for what was clicked: its label, never its contents. */
function labelFor(target: EventTarget | null): string | null {
    const element = target instanceof Element ? target.closest("button, a, [role='button'], [role='tab'], [role='radio'], summary") : null;
    if (!element) return null;
    const label = (element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "").replace(/\s+/g, " ").trim();
    if (!label) return null;
    return label.length > 60 ? `${label.slice(0, 57)}…` : label;
}

/** Records a step by hand ("Interview started", "Turn submitted"). */
export function noteFeedbackStep(what: string) {
    remember(steps, { at: Date.now(), what }, MAX_STEPS);
}

/** What the current screen wants attached to any feedback sent from now on. */
export function setFeedbackContext(screen: string, context: Record<string, string | number | boolean | null | undefined> | null) {
    if (context) screenContext[screen] = context;
    else delete screenContext[screen];
}

/** Starts listening for clicks, page changes and errors. Safe to call more than once. */
export function startFeedbackCapture() {
    if (started || typeof window === "undefined") return;
    started = true;
    noteFeedbackStep(`Opened ${window.location.pathname}`);
    document.addEventListener(
        "click",
        (event) => {
            const label = labelFor(event.target);
            if (label) noteFeedbackStep(`Clicked “${label}”`);
        },
        { capture: true, passive: true }
    );
    let lastPath = window.location.pathname;
    const onMove = () => {
        if (window.location.pathname === lastPath) return;
        lastPath = window.location.pathname;
        noteFeedbackStep(`Went to ${lastPath}`);
    };
    window.addEventListener("popstate", onMove);
    // Client-side navigation doesn't fire an event: check when the page settles.
    setInterval(onMove, 1000);
    window.addEventListener("error", (event) => remember(errors, { at: Date.now(), message: String(event.message).slice(0, 300) }, MAX_ERRORS));
    window.addEventListener("unhandledrejection", (event) =>
        remember(errors, { at: Date.now(), message: String((event.reason && event.reason.message) || event.reason).slice(0, 300) }, MAX_ERRORS)
    );
}

/** "Chrome 122 on Android (phone)" from the browser's own description of itself. */
export function describeDevice(userAgent: string, viewportWidth: number): string {
    const browser =
        /Edg\/(\d+)/.exec(userAgent)?.[1] ? `Edge ${/Edg\/(\d+)/.exec(userAgent)![1]}`
        : /OPR\/(\d+)/.exec(userAgent)?.[1] ? `Opera ${/OPR\/(\d+)/.exec(userAgent)![1]}`
        : /(?:Chrome|CriOS)\/(\d+)/.exec(userAgent)?.[1] ? `Chrome ${/(?:Chrome|CriOS)\/(\d+)/.exec(userAgent)![1]}`
        : /(?:Firefox|FxiOS)\/(\d+)/.exec(userAgent)?.[1] ? `Firefox ${/(?:Firefox|FxiOS)\/(\d+)/.exec(userAgent)![1]}`
        : /Version\/(\d+).*Safari/.exec(userAgent)?.[1] ? `Safari ${/Version\/(\d+).*Safari/.exec(userAgent)![1]}`
        : "Unknown browser";
    const system =
        /iPhone|iPad|iPod/.test(userAgent) ? "iOS"
        : /Android/.test(userAgent) ? "Android"
        : /Windows/.test(userAgent) ? "Windows"
        : /Mac OS X/.test(userAgent) ? "macOS"
        : /Linux/.test(userAgent) ? "Linux"
        : "Unknown system";
    const kind = /iPad|Tablet/.test(userAgent) || (system === "Android" && !/Mobile/.test(userAgent)) ? "tablet" : /Mobi|iPhone|Android/.test(userAgent) || viewportWidth < 600 ? "phone" : "computer";
    return `${browser} on ${system} (${kind})`;
}

export interface CapturedContext {
    device: string;
    viewport: string;
    connection?: string;
    online: boolean;
    language: string;
    timezone: string;
    /** Microphone and camera permission, where the browser will say. */
    permissions?: Record<string, string>;
    steps: Array<{ secondsAgo: number; what: string }>;
    errors: Array<{ secondsAgo: number; message: string }>;
    screens: typeof screenContext;
}

/** Everything known right now, ready to send with a piece of feedback. */
export async function captureFeedbackContext(): Promise<CapturedContext> {
    const now = Date.now();
    const connection = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number } }).connection;
    const permissions: Record<string, string> = {};
    for (const name of ["microphone", "camera"]) {
        try {
            permissions[name] = (await navigator.permissions.query({ name: name as PermissionName })).state;
        } catch {
            // This browser won't say.
        }
    }
    return {
        device: describeDevice(navigator.userAgent, window.innerWidth),
        viewport: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x`,
        connection: connection?.effectiveType ? `${connection.effectiveType}${connection.downlink ? `, ${connection.downlink} Mbps` : ""}` : undefined,
        online: navigator.onLine,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        permissions: Object.keys(permissions).length ? permissions : undefined,
        steps: steps.map((step) => ({ secondsAgo: Math.round((now - step.at) / 1000), what: step.what })),
        errors: errors.map((error) => ({ secondsAgo: Math.round((now - error.at) / 1000), message: error.message })),
        screens: { ...screenContext },
    };
}
