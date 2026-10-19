/**
 * Site identity for search engines and link previews: the sitemap, robots
 * rules, page metadata and structured data all read from here.
 */

/**
 * The public address of the site, without a trailing slash. Set
 * NEXT_PUBLIC_SITE_URL to the address people should find the site at (your
 * custom domain); otherwise Vercel's production domain is used.
 */
export const SITE_URL = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    "http://localhost:3000"
).replace(/\/+$/, "");

export const SITE_NAME = "get prepped";
// What people search ("interview practice") first, the brand last.
export const SITE_TITLE = "Free Interview Practice for Your Dream Job | get prepped";
export const SITE_DESCRIPTION =
    "Practise a real job interview out loud. The interviewer asks follow-up questions on your answers, then shows you exactly what to fix. Your first interview is free.";
export const COMPANY_NAME = "Zero and One Solutions Limited";

/** Pages anyone can open, for the sitemap. Everything else needs an account. */
export const PUBLIC_PAGES: Array<{ path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }> = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
    { path: "/jobs", priority: 0.7, changeFrequency: "weekly" },
    { path: "/login", priority: 0.4, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
];

/** Signed-in areas and endpoints: nothing here is useful in search results. */
export const PRIVATE_PATHS = ["/api/", "/admin", "/dashboard", "/interview", "/feedback", "/resume-feedback", "/onboarding"];
