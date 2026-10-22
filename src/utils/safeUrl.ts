/**
 * A link from outside (a scraped job post) only if it's a web address.
 * Anything else, such as a "javascript:" link planted on a careers page,
 * would run in our site when clicked, so it gets no link at all.
 */
export function safeExternalUrl(url: unknown): string | null {
    if (typeof url !== "string" || !url.trim()) return null;
    try {
        const parsed = new URL(url.trim());
        return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
    } catch {
        return null;
    }
}
