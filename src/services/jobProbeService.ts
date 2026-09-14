/**
 * Job Application Status Probe Service
 * 
 * Inspects a job posting URL / application page to verify if it is actively
 * accepting applications or if it has expired/closed.
 */

export interface ProbeResult {
    isOpen: boolean;
    reason?: string;
    statusCode?: number;
    redirectUrl?: string;
}

const CLOSED_PHRASES = [
    "no longer accepting applications",
    "this position has been filled",
    "this job is closed",
    "application closed",
    "the job you are trying to view is no longer available",
    "this vacancy has expired",
    "applications are now closed",
    "position no longer available",
    "this job posting has expired",
    "this role has been closed",
    "we are no longer accepting submissions",
    "job not found",
    "page not found",
    "this job is no longer active",
    "applications for this position are closed",
    "the requisition has been closed",
    "this opening is closed",
];

/**
 * Probes a job posting URL to verify whether candidates can still apply.
 * Discards postings that are dead, closed, or returning error statuses.
 */
export async function probeJobApplicationStatus(url: string, timeoutMs: number = 8000): Promise<ProbeResult> {
    if (!url || typeof url !== "string") {
        return { isOpen: false, reason: "Missing or invalid job URL" };
    }

    try {
        const parsed = new URL(url);
        // If it is a generic placeholder URL
        if (parsed.pathname === "/" || parsed.pathname === "") {
            return { isOpen: false, reason: "Generic domain root rather than job posting" };
        }

        const res = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
            redirect: "follow",
            signal: AbortSignal.timeout(timeoutMs),
            cache: "no-store" as RequestCache,
        });

        if (res.status === 404 || res.status === 410) {
            return { isOpen: false, statusCode: res.status, reason: `Page returned HTTP ${res.status}` };
        }

        // Check if redirected to a generic careers landing page (indicating specific job was removed)
        const finalUrl = res.url.toLowerCase();
        if (
            (url.includes("greenhouse.io") || url.includes("lever.co") || url.includes("ashbyhq.com")) &&
            (finalUrl.endsWith("/jobs") || finalUrl.endsWith("/careers") || finalUrl.endsWith("/companies"))
        ) {
            return { isOpen: false, redirectUrl: res.url, reason: "Redirected away to generic careers portal" };
        }

        const html = await res.text();
        const lowerHtml = html.toLowerCase();

        // 1. Text keyword inspection for explicit closure messages
        for (const phrase of CLOSED_PHRASES) {
            if (lowerHtml.includes(phrase)) {
                return {
                    isOpen: false,
                    reason: `Matched closure indicator: "${phrase}"`,
                    statusCode: res.status,
                };
            }
        }

        // 2. Explicitly closed buttons / status badges
        if (
            lowerHtml.includes("status: closed") ||
            lowerHtml.includes("status: expired") ||
            lowerHtml.includes("badge-closed") ||
            lowerHtml.includes("role closed")
        ) {
            return {
                isOpen: false,
                reason: "Role is explicitly marked as closed in page structure",
                statusCode: res.status,
            };
        }

        return { isOpen: true, statusCode: res.status };
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Network/Timeout error";
        return { isOpen: true, reason: `Probe warning (assumed open): ${msg}` };
    }
}
