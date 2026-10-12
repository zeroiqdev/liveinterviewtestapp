/**
 * Collapses repeated jobs for display. The same role at the same company is
 * often posted once per city (or simply posted twice); a list should show it
 * once, saying how many other locations it is open in.
 */

interface ListedJob {
    title: string;
    company: string;
    location: string;
    datePosted: string;
    description?: string;
    moreLocations?: number;
}

const AFRICAN_LOCATION =
    /nigeria|lagos|abuja|port harcourt|ibadan|kano|africa|kenya|nairobi|ghana|accra|johannesburg|cape town|egypt|cairo|rwanda|kigali|uganda|kampala|tanzania|senegal|dakar|ethiopia|morocco/i;

const normalise = (text: string) =>
    (text || "")
        .toLowerCase()
        .replace(/&amp;/g, "&")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

/** Which of two copies of a role to show: an African location first, then the newer, then the fuller. */
function better<T extends ListedJob>(a: T, b: T): T {
    const africa = Number(AFRICAN_LOCATION.test(b.location)) - Number(AFRICAN_LOCATION.test(a.location));
    if (africa !== 0) return africa > 0 ? b : a;
    if (a.datePosted !== b.datePosted) return b.datePosted > a.datePosted ? b : a;
    return (b.description?.length ?? 0) > (a.description?.length ?? 0) ? b : a;
}

/**
 * One entry per role and company, in the order the roles first appear.
 * `moreLocations` counts the other places the role is open in.
 */
export function collapseDuplicateJobs<T extends ListedJob>(jobs: T[]): T[] {
    const groups = new Map<string, { shown: T; locations: Set<string> }>();
    for (const job of jobs) {
        const key = `${normalise(job.title)}|${normalise(job.company)}`;
        const group = groups.get(key);
        if (!group) {
            groups.set(key, { shown: job, locations: new Set([normalise(job.location)]) });
        } else {
            group.shown = better(group.shown, job);
            group.locations.add(normalise(job.location));
        }
    }
    return [...groups.values()].map(({ shown, locations }) =>
        locations.size > 1 ? { ...shown, moreLocations: locations.size - 1 } : shown
    );
}
