/**
 * Location Detection & Job Geographic Matching Utility
 * 
 * Provides client-side and server-side detection of user location
 * (Country, City, Continent, African/Nigerian territory) via timezone mapping
 * and cached IP geolocation, and accurately matches jobs based on geographic proximity
 * and global remote hiring status.
 */

export interface UserLocation {
    country: string;
    countryCode: string;
    city?: string;
    continent: string;
    timezone: string;
    isAfrica: boolean;
    isNigeria: boolean;
    source: "timezone" | "ip_api" | "manual";
}

// Timezone to Country & Region Mapping
const TIMEZONE_MAP: Record<string, { country: string; countryCode: string; city: string; continent: string }> = {
    // ── Nigeria & West Africa ──
    "Africa/Lagos": { country: "Nigeria", countryCode: "NG", city: "Lagos", continent: "Africa" },
    "Africa/Accra": { country: "Ghana", countryCode: "GH", city: "Accra", continent: "Africa" },
    "Africa/Abidjan": { country: "Ivory Coast", countryCode: "CI", city: "Abidjan", continent: "Africa" },
    "Africa/Dakar": { country: "Senegal", countryCode: "SN", city: "Dakar", continent: "Africa" },
    "Africa/Porto-Novo": { country: "Benin", countryCode: "BJ", city: "Cotonou", continent: "Africa" },
    "Africa/Lome": { country: "Togo", countryCode: "TG", city: "Lome", continent: "Africa" },
    "Africa/Freetown": { country: "Sierra Leone", countryCode: "SL", city: "Freetown", continent: "Africa" },
    "Africa/Monrovia": { country: "Liberia", countryCode: "LR", city: "Monrovia", continent: "Africa" },

    // ── East & Central Africa ──
    "Africa/Nairobi": { country: "Kenya", countryCode: "KE", city: "Nairobi", continent: "Africa" },
    "Africa/Kigali": { country: "Rwanda", countryCode: "RW", city: "Kigali", continent: "Africa" },
    "Africa/Kampala": { country: "Uganda", countryCode: "UG", city: "Kampala", continent: "Africa" },
    "Africa/Dar_es_Salaam": { country: "Tanzania", countryCode: "TZ", city: "Dar es Salaam", continent: "Africa" },
    "Africa/Addis_Ababa": { country: "Ethiopia", countryCode: "ET", city: "Addis Ababa", continent: "Africa" },

    // ── Southern Africa ──
    "Africa/Johannesburg": { country: "South Africa", countryCode: "ZA", city: "Johannesburg", continent: "Africa" },
    "Africa/Harare": { country: "Zimbabwe", countryCode: "ZW", city: "Harare", continent: "Africa" },
    "Africa/Lusaka": { country: "Zambia", countryCode: "ZM", city: "Lusaka", continent: "Africa" },
    "Africa/Gaborone": { country: "Botswana", countryCode: "BW", city: "Gaborone", continent: "Africa" },

    // ── North Africa ──
    "Africa/Cairo": { country: "Egypt", countryCode: "EG", city: "Cairo", continent: "Africa" },
    "Africa/Casablanca": { country: "Morocco", countryCode: "MA", city: "Casablanca", continent: "Africa" },
    "Africa/Tunis": { country: "Tunisia", countryCode: "TN", city: "Tunis", continent: "Africa" },
    "Africa/Algiers": { country: "Algeria", countryCode: "DZ", city: "Algiers", continent: "Africa" },

    // ── United Kingdom & Europe ──
    "Europe/London": { country: "United Kingdom", countryCode: "GB", city: "London", continent: "Europe" },
    "Europe/Berlin": { country: "Germany", countryCode: "DE", city: "Berlin", continent: "Europe" },
    "Europe/Paris": { country: "France", countryCode: "FR", city: "Paris", continent: "Europe" },
    "Europe/Amsterdam": { country: "Netherlands", countryCode: "NL", city: "Amsterdam", continent: "Europe" },
    "Europe/Dublin": { country: "Ireland", countryCode: "IE", city: "Dublin", continent: "Europe" },
    "Europe/Madrid": { country: "Spain", countryCode: "ES", city: "Madrid", continent: "Europe" },
    "Europe/Rome": { country: "Italy", countryCode: "IT", city: "Rome", continent: "Europe" },
    "Europe/Warsaw": { country: "Poland", countryCode: "PL", city: "Warsaw", continent: "Europe" },
    "Europe/Stockholm": { country: "Sweden", countryCode: "SE", city: "Stockholm", continent: "Europe" },

    // ── North America ──
    "America/New_York": { country: "United States", countryCode: "US", city: "New York", continent: "North America" },
    "America/Los_Angeles": { country: "United States", countryCode: "US", city: "San Francisco", continent: "North America" },
    "America/Chicago": { country: "United States", countryCode: "US", city: "Chicago", continent: "North America" },
    "America/Toronto": { country: "Canada", countryCode: "CA", city: "Toronto", continent: "North America" },
    "America/Vancouver": { country: "Canada", countryCode: "CA", city: "Vancouver", continent: "North America" },

    // ── Asia & Oceania ──
    "Asia/Dubai": { country: "United Arab Emirates", countryCode: "AE", city: "Dubai", continent: "Asia" },
    "Asia/Kolkata": { country: "India", countryCode: "IN", city: "Bengaluru", continent: "Asia" },
    "Asia/Singapore": { country: "Singapore", countryCode: "SG", city: "Singapore", continent: "Asia" },
    "Australia/Sydney": { country: "Australia", countryCode: "AU", city: "Sydney", continent: "Oceania" },
};

/**
 * Detects user location from browser environment, timezone, and cached IP geolocation.
 */
export async function detectUserLocation(): Promise<UserLocation> {
    if (typeof window === "undefined") {
        // Server default fallback: Nigeria / Africa
        return {
            country: "Nigeria",
            countryCode: "NG",
            city: "Lagos",
            continent: "Africa",
            timezone: "Africa/Lagos",
            isAfrica: true,
            isNigeria: true,
            source: "timezone",
        };
    }

    // 1. Check if we already have a cached location in localStorage
    try {
        const cached = localStorage.getItem("useladder_user_location");
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.country && parsed.continent) {
                return parsed;
            }
        }
    } catch {
        // Continue to detection
    }

    // 2. Client-side Timezone Detection (instant, zero-latency)
    let tz = "";
    try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
        tz = "Africa/Lagos";
    }

    let detected: UserLocation;

    if (TIMEZONE_MAP[tz]) {
        const mapped = TIMEZONE_MAP[tz];
        detected = {
            country: mapped.country,
            countryCode: mapped.countryCode,
            city: mapped.city,
            continent: mapped.continent,
            timezone: tz,
            isAfrica: mapped.continent === "Africa",
            isNigeria: mapped.country === "Nigeria",
            source: "timezone",
        };
    } else if (tz.startsWith("Africa/")) {
        const city = tz.replace("Africa/", "").replace(/_/g, " ");
        detected = {
            country: tz.includes("Lagos") ? "Nigeria" : "African Region",
            countryCode: tz.includes("Lagos") ? "NG" : "AF",
            city,
            continent: "Africa",
            timezone: tz,
            isAfrica: true,
            isNigeria: tz.includes("Lagos"),
            source: "timezone",
        };
    } else if (tz.startsWith("Europe/")) {
        detected = {
            country: "United Kingdom / Europe",
            countryCode: "EU",
            continent: "Europe",
            timezone: tz,
            isAfrica: false,
            isNigeria: false,
            source: "timezone",
        };
    } else if (tz.startsWith("America/")) {
        detected = {
            country: "United States / North America",
            countryCode: "US",
            continent: "North America",
            timezone: tz,
            isAfrica: false,
            isNigeria: false,
            source: "timezone",
        };
    } else {
        // Fallback default
        detected = {
            country: "Nigeria",
            countryCode: "NG",
            city: "Lagos",
            continent: "Africa",
            timezone: tz || "Africa/Lagos",
            isAfrica: true,
            isNigeria: true,
            source: "timezone",
        };
    }

    // Save detection in cache
    try {
        localStorage.setItem("useladder_user_location", JSON.stringify(detected));
    } catch {
        // Ignore storage errors
    }

    // Optional background async refinement with free IP API (non-blocking)
    try {
        fetch("https://ipwho.is/", { signal: AbortSignal.timeout(3000) })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data && data.success) {
                    const refined: UserLocation = {
                        country: data.country || detected.country,
                        countryCode: data.country_code || detected.countryCode,
                        city: data.city || detected.city,
                        continent: data.continent || detected.continent,
                        timezone: data.timezone?.id || tz,
                        isAfrica: data.continent === "Africa" || data.country === "Nigeria",
                        isNigeria: data.country === "Nigeria" || data.country_code === "NG",
                        source: "ip_api",
                    };
                    localStorage.setItem("useladder_user_location", JSON.stringify(refined));
                }
            })
            .catch(() => {
                // Ignore API failures, timezone detection is already accurate
            });
    } catch {
        // Ignore API errors
    }

    return detected;
}

/**
 * Calculates a relevance score (0 - 100) for a job against a user's location.
 * A score of 0 means the job is incompatible with or not hiring from the user's region.
 */
export function scoreJobForLocation(jobLocation: string = "", userLoc: UserLocation): number {
    const loc = jobLocation.toLowerCase().trim();
    if (!loc) return 0;

    const usCityOrStateKeywords = [
        "united states", "usa", "us only", "usa only", "us remote", "remote (us)", "remote, us",
        "remote - us", "us (remote)", "san francisco", "sf bay", "bay area", "new york", "nyc",
        "boston", "seattle", "austin", "chicago", "los angeles", "california", "texas", "florida",
        "colorado", "denver", "atlanta", "washington", "canada", "toronto", "vancouver", "north america"
    ];

    const ukEuropeKeywords = [
        "united kingdom", "uk only", "uk remote", "london", "europe only", "eu only", "germany",
        "berlin", "france", "paris", "netherlands", "amsterdam", "ireland", "dublin", "poland"
    ];

    const isExplicitlyUS = usCityOrStateKeywords.some((k) => loc.includes(k));
    const isExplicitlyUKEurope = ukEuropeKeywords.some((k) => loc.includes(k));

    const isGlobalRemote =
        (loc.includes("worldwide") ||
         loc.includes("global") ||
         loc.includes("anywhere") ||
         loc === "remote" ||
         loc === "remote (global)" ||
         loc === "remote (worldwide)" ||
         loc === "remote - global" ||
         loc === "remote, worldwide" ||
         loc === "remote (anywhere)" ||
         loc.includes("work from anywhere") ||
         loc.includes("all-remote")) &&
        !isExplicitlyUS &&
        !isExplicitlyUKEurope;

    // 1. Nigeria Target
    if (userLoc.isNigeria) {
        if (loc.includes("nigeria") || loc.includes("lagos") || loc.includes("abuja") || loc.includes("port harcourt") || loc.includes("ibadan")) {
            return 100;
        }
        if (loc.includes("africa") || loc.includes("emea") || loc.includes("ghana") || loc.includes("kenya") || loc.includes("south africa") || loc.includes("rwanda")) {
            return 85;
        }
        if (isGlobalRemote) {
            return 75;
        }
        // Reject overseas city-restricted remote postings (e.g. "California (Remote)", "Boston", "London (Remote)")
        return 0;
    }

    // 2. Pan-African Target
    if (userLoc.isAfrica) {
        if (loc.includes("africa") || loc.includes("ghana") || loc.includes("kenya") || loc.includes("south africa") || loc.includes("rwanda") || loc.includes("egypt")) {
            return 100;
        }
        if (loc.includes("nigeria") || loc.includes("lagos") || loc.includes("emea")) {
            return 90;
        }
        if (isGlobalRemote) {
            return 75;
        }
        return 0;
    }

    // 3. United States & North America Target
    if (userLoc.country.toLowerCase().includes("united states") || userLoc.countryCode === "US") {
        if (isExplicitlyUS) {
            return 100;
        }
        if (isGlobalRemote) {
            return 85;
        }
        if (loc.includes("remote") && !loc.includes("nigeria") && !loc.includes("africa") && !loc.includes("uk only")) {
            return 70;
        }
        return 0;
    }

    // 4. United Kingdom & Europe Target
    if (userLoc.country.toLowerCase().includes("united kingdom") || userLoc.countryCode === "GB" || userLoc.continent === "Europe") {
        if (isExplicitlyUKEurope || loc.includes("emea")) {
            return 100;
        }
        if (isGlobalRemote) {
            return 85;
        }
        if (loc.includes("remote") && !loc.includes("nigeria") && !loc.includes("us only")) {
            return 70;
        }
        return 0;
    }

    // 5. Global Remote / Worldwide Target
    if (userLoc.country === "Worldwide" || userLoc.countryCode === "WW") {
        if (isGlobalRemote) {
            return 100;
        }
        if (loc.includes("remote")) {
            return 60;
        }
        return 20;
    }

    // Fallback: check exact country name or general global remote
    const cLower = userLoc.country.toLowerCase();
    if (cLower && loc.includes(cLower)) return 100;
    if (isGlobalRemote) return 80;

    return 0;
}

/**
 * Checks whether a job listing matches the user's geographic location
 * OR is available as remote worldwide / remote everywhere.
 */
export function isJobLocationMatch(jobLocation: string = "", userLoc: UserLocation): boolean {
    return scoreJobForLocation(jobLocation, userLoc) > 0;
}

/**
 * Normalizes user role string from profile/onboarding into standard role family.
 */
export function normalizeUserRoleFamily(roleStr: string = ""): string {
    const r = roleStr.toLowerCase().trim();
    if (!r) return "general";

    // 0. Recruiter & HR must NEVER match as designers or engineers
    if (
        r.includes("recruit") ||
        r.includes("talent") ||
        r.includes("sourcer") ||
        r.includes("human resources") ||
        r.includes("hr ") ||
        r.includes("people ops") ||
        r.includes("people partner")
    ) {
        return "general";
    }

    // 1. Product Design / UI / UX (use word boundaries, NEVER substring match "ui" in "recruiting")
    if (
        r.includes("product design") ||
        r.includes("product designer") ||
        r.includes("ui/ux") ||
        r.includes("ui-ux") ||
        r.includes("ux designer") ||
        r.includes("ui designer") ||
        r.includes("ux researcher") ||
        r.includes("visual designer") ||
        r.includes("design system") ||
        r.includes("graphic designer") ||
        r.includes("designer") ||
        r.includes("interaction designer") ||
        /\bui\b/i.test(r) ||
        /\bux\b/i.test(r)
    ) {
        return "product_designer";
    }

    // 2. Product Manager (PM)
    if (
        r.includes("product manager") ||
        r.includes("product lead") ||
        r.includes("program manager") ||
        r.includes("product owner") ||
        r.includes("product ops") ||
        r.includes("cpo") ||
        r === "product"
    ) {
        return "product_manager";
    }

    // 3. Frontend & Fullstack
    if (
        r.includes("frontend") ||
        r.includes("front-end") ||
        r.includes("react") ||
        r.includes("web developer") ||
        r.includes("javascript developer") ||
        r.includes("fullstack") ||
        r.includes("full stack") ||
        r.includes("full-stack")
    ) {
        return "frontend_developer";
    }

    // 4. Backend & Systems
    if (
        r.includes("backend") ||
        r.includes("back-end") ||
        r.includes("software engineer") ||
        r.includes("software developer") ||
        r.includes("node") ||
        r.includes("python") ||
        r.includes("golang") ||
        r.includes("java") ||
        r.includes("rust") ||
        r.includes("devops") ||
        r.includes("cloud") ||
        r.includes("sre")
    ) {
        return "backend_engineer";
    }

    // 5. Data Analyst & Scientist
    if (
        r.includes("data analyst") ||
        r.includes("data scientist") ||
        r.includes("analytics") ||
        r.includes("scientist") ||
        r.includes("machine learning") ||
        /\bdata\b/i.test(r)
    ) {
        return "data_analyst";
    }

    return "general";
}

/**
 * Checks whether a job listing matches the user's role / expertise.
 * Strictly isolates Product Management, Product Design, Data, and Engineering.
 */
export function isJobRoleMatch(jobRoleFamily: string = "", jobTitle: string = "", userRole: string = ""): boolean {
    if (!userRole || userRole === "all" || userRole === "general") return true;

    const userFamily = normalizeUserRoleFamily(userRole);
    const jobFamily = normalizeUserRoleFamily(jobRoleFamily || jobTitle);
    const jobText = (jobTitle + " " + jobRoleFamily).toLowerCase();

    // 0. Recruiter & HR check - NEVER match for Product Designers, PMs, or Engineers
    if (
        jobText.includes("recruit") ||
        jobText.includes("talent") ||
        jobText.includes("sourcer") ||
        jobText.includes("people ops") ||
        jobText.includes("human resources") ||
        jobText.includes("hr business partner") ||
        jobText.includes("mobility analyst")
    ) {
        return false;
    }

    // 1. PRODUCT MANAGER: Strictly Product Management only
    if (userFamily === "product_manager") {
        // Exclude design and engineering roles
        if (jobText.includes("designer") || jobText.includes("ui/ux") || jobText.includes("ux/") || jobText.includes("engineer") || jobText.includes("developer")) {
            return false;
        }
        return (
            jobFamily === "product_manager" ||
            jobText.includes("product manager") ||
            jobText.includes("product lead") ||
            jobText.includes("group product manager") ||
            jobText.includes("technical product manager") ||
            jobText.includes("director of product") ||
            jobText.includes("head of product") ||
            jobText.includes("product growth") ||
            jobText.includes("growth manager")
        );
    }

    // 2. PRODUCT DESIGNER: Strictly UI/UX & Product Design only
    if (userFamily === "product_designer") {
        // Exclude PM and engineering roles
        if (jobText.includes("product manager") || jobText.includes("backend") || jobText.includes("frontend engineer") || jobText.includes("software engineer")) {
            return false;
        }
        return (
            jobFamily === "product_designer" &&
            (jobText.includes("design") ||
             jobText.includes("ui/ux") ||
             jobText.includes("ux researcher") ||
             jobText.includes("design system") ||
             jobText.includes("visual designer") ||
             jobText.includes("product design") ||
             /\bui\b/i.test(jobText) ||
             /\bux\b/i.test(jobText))
        );
    }

    // 3. DATA ANALYST / DATA SCIENTIST: Strictly Data only
    if (userFamily === "data_analyst") {
        if (jobText.includes("product designer") || jobText.includes("ui/ux") || jobText.includes("product manager")) {
            return false;
        }
        return (
            jobFamily === "data_analyst" ||
            jobText.includes("data") ||
            jobText.includes("analyst") ||
            jobText.includes("analytics") ||
            jobText.includes("data scientist") ||
            jobText.includes("bi engineer") ||
            jobText.includes("machine learning")
        );
    }

    // 4. FRONTEND DEVELOPER: Cross-matches Frontend & Fullstack (excludes PM & Design)
    if (userFamily === "frontend_developer") {
        if (jobText.includes("product manager") || jobText.includes("product designer") || jobText.includes("ui/ux") || jobText.includes("ux researcher")) {
            return false;
        }
        return (
            jobFamily === "frontend_developer" ||
            jobText.includes("frontend") ||
            jobText.includes("front-end") ||
            jobText.includes("full stack") ||
            jobText.includes("fullstack") ||
            jobText.includes("react") ||
            jobText.includes("web developer") ||
            jobText.includes("ui engineer")
        );
    }

    // 5. BACKEND DEVELOPER: Cross-matches Backend & Fullstack (excludes PM & Design)
    if (userFamily === "backend_engineer") {
        if (jobText.includes("product manager") || jobText.includes("product designer") || jobText.includes("ui/ux") || jobText.includes("ux researcher")) {
            return false;
        }
        return (
            jobFamily === "backend_engineer" ||
            jobText.includes("backend") ||
            jobText.includes("back-end") ||
            jobText.includes("full stack") ||
            jobText.includes("fullstack") ||
            jobText.includes("software engineer") ||
            jobText.includes("systems") ||
            jobText.includes("golang") ||
            jobText.includes("python") ||
            jobText.includes("node") ||
            jobText.includes("api") ||
            jobText.includes("infrastructure") ||
            jobText.includes("architect")
        );
    }

    return jobFamily === userFamily;
}
