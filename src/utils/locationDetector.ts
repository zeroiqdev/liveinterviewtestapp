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

    // 1. Oil & Gas / Engineering & Energy (must be checked BEFORE generic "engineer")
    if (
        r.includes("oil & gas") ||
        r.includes("oil and gas") ||
        r.includes("oil gas") ||
        r.includes("petroleum") ||
        r.includes("drilling") ||
        r.includes("reservoir") ||
        r.includes("pipeline") ||
        r.includes("subsea") ||
        r.includes("geoscientist") ||
        r.includes("geologist") ||
        r.includes("hse") ||
        r.includes("safety") ||
        r.includes("risk manager") ||
        r.includes("safety officer") ||
        r.includes("solids control") ||
        r.includes("offshore") ||
        r.includes("refinery") ||
        r.includes("engineering — oil") ||
        r.includes("engineering - oil") ||
        r === "oil_gas"
    ) {
        return "oil_gas";
    }

    // 2. Virtual Assistant & Administrative Support
    if (
        r.includes("virtual assistant") ||
        r.includes("executive assistant") ||
        r.includes("administrative") ||
        r.includes("office assistant") ||
        r.includes("personal assistant") ||
        r.includes("admin assistant") ||
        r.includes("secretary") ||
        r.includes("office administrator") ||
        r.includes("data entry") ||
        r === "virtual_assistant" ||
        r === "administrative"
    ) {
        return "virtual_assistant";
    }

    // 3. Customer Service & Support
    if (
        r.includes("customer service") ||
        r.includes("customer support") ||
        r.includes("call centre") ||
        r.includes("call center") ||
        r.includes("customer experience") ||
        r.includes("client support") ||
        r.includes("client relations") ||
        r.includes("customer care") ||
        r.includes("helpdesk") ||
        r === "customer_service"
    ) {
        return "customer_service";
    }

    // 4. Banking & Finance
    if (
        r.includes("investment banker") ||
        r.includes("investment banking") ||
        r.includes("financial analyst") ||
        r.includes("finance analyst") ||
        r.includes("banking & finance") ||
        r.includes("banking and finance") ||
        r.includes("banking") ||
        r.includes("accountant") ||
        r.includes("accounting") ||
        r.includes("auditor") ||
        r.includes("auditing") ||
        r.includes("treasury") ||
        r.includes("credit risk") ||
        r === "banking_finance" ||
        (r.includes("finance") && !r.includes("engineer"))
    ) {
        return "banking_finance";
    }

    // 5. Sales & Business Development
    if (
        r.includes("sales & business development") ||
        r.includes("sales and business development") ||
        r.includes("business development") ||
        r.includes("account executive") ||
        (r.includes("account manager") && r.includes("sales")) ||
        r === "sales" ||
        r.includes("sales representative") ||
        r.includes("sales executive") ||
        r.includes("direct sales") ||
        r.includes("field sales") ||
        r.includes("bizdev") ||
        r.includes("biz dev") ||
        r.includes("sales & commercial")
    ) {
        return "sales";
    }

    // 6. Business Analyst
    if (
        r.includes("business analyst") ||
        r.includes("business analysis") ||
        r.includes("functional analyst") ||
        r.includes("business operations") ||
        r.includes("business strategy") ||
        r.includes("operations analyst") ||
        r.includes("erp specialist") ||
        r === "business_analyst"
    ) {
        return "business_analyst";
    }

    // 7. Product Marketer
    if (
        r.includes("product marketer") ||
        r.includes("product marketing") ||
        r.includes("growth marketer") ||
        r.includes("growth marketing") ||
        r.includes("brand and marketing") ||
        r.includes("marketing manager") ||
        r.includes("digital marketing") ||
        r === "product_marketer"
    ) {
        return "product_marketer";
    }

    // 8a. UI Designer
    if (
        r.includes("ui designer") ||
        r.includes("ui design") ||
        r.includes("user interface designer") ||
        r.includes("visual designer") ||
        r.includes("design systems designer") ||
        r === "ui_designer"
    ) {
        return "ui_designer";
    }

    // 8b. Product Design / UI / UX (use word boundaries, NEVER substring match "ui" in "recruiting")
    if (
        r.includes("product design") ||
        r.includes("product designer") ||
        r.includes("ui/ux") ||
        r.includes("ui-ux") ||
        r.includes("ux designer") ||
        r.includes("ux researcher") ||
        r.includes("design system") ||
        r.includes("graphic designer") ||
        r.includes("designer") ||
        r.includes("interaction designer") ||
        /\bui\b/i.test(r) ||
        /\bux\b/i.test(r) ||
        r === "product_designer"
    ) {
        return "product_designer";
    }

    // 9. Product Manager (PM)
    if (
        r.includes("product manager") ||
        r.includes("product lead") ||
        r.includes("program manager") ||
        r.includes("product owner") ||
        r.includes("product ops") ||
        r.includes("technical product manager") ||
        r.includes("cpo") ||
        r === "product" ||
        r === "product_manager"
    ) {
        return "product_manager";
    }

    // 10. Data Analyst & Scientist
    if (
        r.includes("data analyst") ||
        r.includes("data scientist") ||
        r.includes("analytics") ||
        r.includes("scientist") ||
        r.includes("machine learning") ||
        r.includes("bi engineer") ||
        r.includes("data engineer") ||
        /\bml\b/i.test(r) ||
        /\bdata\b/i.test(r) ||
        r === "data_analyst"
    ) {
        return "data_analyst";
    }

    // 11. Frontend & Mobile Engineering
    if (
        r.includes("frontend") ||
        r.includes("front-end") ||
        r.includes("react") ||
        r.includes("web developer") ||
        r.includes("javascript developer") ||
        r.includes("android") ||
        r.includes("ios") ||
        r.includes("mobile developer") ||
        r.includes("mobile engineer") ||
        r.includes("mobile app") ||
        r.includes("flutter") ||
        r.includes("swift") ||
        r.includes("kotlin") ||
        r.includes("ui engineer") ||
        r === "frontend_developer"
    ) {
        return "frontend_developer";
    }

    // 12. DevOps, SRE & Cloud Architecture (must be checked BEFORE generic backend_engineer)
    if (
        r.includes("devops") ||
        r.includes("sre") ||
        r.includes("site reliability") ||
        r.includes("cloud") ||
        r.includes("infrastructure") ||
        r.includes("platform engineer") ||
        r.includes("system administrator") ||
        r.includes("systems administrator") ||
        r.includes("linux administrator") ||
        r.includes("server administrator") ||
        r.includes("devsecops") ||
        r.includes("ci/cd") ||
        r.includes("reliability engineer") ||
        r.includes("solutions architect") ||
        r === "devops_sre"
    ) {
        return "devops_sre";
    }

    // 13. Backend & Systems Infrastructure
    if (
        r.includes("backend") ||
        r.includes("back-end") ||
        r.includes("fullstack") ||
        r.includes("full stack") ||
        r.includes("full-stack") ||
        r.includes("software engineer") ||
        r.includes("software developer") ||
        r.includes("systems engineer") ||
        r.includes("programmer") ||
        r.includes("architect") ||
        r.includes("tech lead") ||
        r.includes("technical lead") ||
        r.includes("node") ||
        r.includes("python") ||
        r.includes("golang") ||
        r.includes("java") ||
        r.includes("rust") ||
        r.includes("developer") ||
        r.includes("engineer") ||
        r === "backend_engineer"
    ) {
        return "backend_engineer";
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
    const jobFamily = (jobRoleFamily && jobRoleFamily !== "general")
        ? normalizeUserRoleFamily(jobRoleFamily)
        : normalizeUserRoleFamily(jobTitle);
    const jobText = (jobTitle + " " + (jobRoleFamily || "")).toLowerCase();

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
        // Exclude design, engineering, and admin roles
        if (
            jobText.includes("designer") ||
            jobText.includes("ui/ux") ||
            jobText.includes("ux/") ||
            jobText.includes("engineer") ||
            jobText.includes("developer") ||
            jobText.includes("programmer") ||
            jobText.includes("virtual assistant") ||
            jobText.includes("administrative") ||
            jobText.includes("customer service") ||
            jobText.includes("social media")
        ) {
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

    // 2a. UI DESIGNER: Strictly UI/UX, Visual Design, Design Systems & Interaction Design
    if (userFamily === "ui_designer") {
        if (
            jobFamily === "product_manager" ||
            jobFamily === "backend_engineer" ||
            jobFamily === "data_analyst" ||
            jobFamily === "sales" ||
            jobFamily === "virtual_assistant" ||
            jobFamily === "customer_service" ||
            jobFamily === "banking_finance" ||
            jobFamily === "oil_gas" ||
            jobText.includes("backend") ||
            jobText.includes("software engineer") ||
            jobText.includes("developer") ||
            jobText.includes("programmer") ||
            jobText.includes("product manager") ||
            jobText.includes("virtual assistant") ||
            jobText.includes("administrative") ||
            jobText.includes("customer service") ||
            jobText.includes("sales") ||
            jobText.includes("food designer") ||
            jobText.includes("fashion designer") ||
            jobText.includes("interior designer") ||
            jobText.includes("floral designer")
        ) {
            return false;
        }
        return (
            jobFamily === "ui_designer" ||
            jobFamily === "product_designer" ||
            jobText.includes("ui designer") ||
            jobText.includes("ui design") ||
            jobText.includes("user interface") ||
            jobText.includes("ui/ux") ||
            jobText.includes("visual designer") ||
            jobText.includes("visual design") ||
            jobText.includes("design system") ||
            jobText.includes("interaction designer") ||
            jobText.includes("interaction design") ||
            jobText.includes("product design") ||
            jobText.includes("web designer") ||
            /\bui\b/i.test(jobText)
        );
    }

    // 2b. PRODUCT DESIGNER: Strictly UI/UX & Product Design only
    if (userFamily === "product_designer") {
        // Exclude PM, engineering, and admin roles
        if (
            jobFamily === "product_manager" ||
            jobFamily === "backend_engineer" ||
            jobFamily === "data_analyst" ||
            jobFamily === "sales" ||
            jobFamily === "virtual_assistant" ||
            jobFamily === "customer_service" ||
            jobFamily === "banking_finance" ||
            jobFamily === "oil_gas" ||
            jobText.includes("product manager") ||
            jobText.includes("backend") ||
            jobText.includes("frontend engineer") ||
            jobText.includes("software engineer") ||
            jobText.includes("developer") ||
            jobText.includes("programmer") ||
            jobText.includes("virtual assistant") ||
            jobText.includes("administrative") ||
            jobText.includes("food designer") ||
            jobText.includes("fashion designer") ||
            jobText.includes("interior designer") ||
            jobText.includes("floral designer")
        ) {
            return false;
        }
        return (
            (jobFamily === "product_designer" || jobFamily === "ui_designer") &&
            (jobText.includes("design") ||
             jobText.includes("ui/ux") ||
             jobText.includes("ux researcher") ||
             jobText.includes("design system") ||
             jobText.includes("visual designer") ||
             jobText.includes("product design") ||
             jobText.includes("ui designer") ||
             /\bui\b/i.test(jobText) ||
             /\bux\b/i.test(jobText))
        );
    }

    // 3. DATA ANALYST / DATA SCIENTIST: Strictly Data only
    if (userFamily === "data_analyst") {
        if (
            jobFamily === "product_designer" ||
            jobFamily === "ui_designer" ||
            jobFamily === "virtual_assistant" ||
            jobFamily === "sales" ||
            jobFamily === "customer_service" ||
            jobText.includes("product designer") ||
            jobText.includes("ui/ux") ||
            jobText.includes("product manager") ||
            jobText.includes("virtual assistant") ||
            jobText.includes("administrative") ||
            (jobText.includes("software engineer") && !jobText.includes("data") && !jobText.includes("ml"))
        ) {
            return false;
        }
        return (
            jobFamily === "data_analyst" ||
            jobText.includes("data") ||
            jobText.includes("analyst") ||
            jobText.includes("analytics") ||
            jobText.includes("data scientist") ||
            jobText.includes("bi engineer") ||
            jobText.includes("machine learning") ||
            jobText.includes("data engineer")
        );
    }

    // 4. FRONTEND & MOBILE DEVELOPER: Cross-matches Frontend, Mobile & Fullstack (excludes PM, Design & Admin)
    if (userFamily === "frontend_developer") {
        if (
            jobFamily === "product_manager" ||
            jobFamily === "product_designer" ||
            jobFamily === "ui_designer" ||
            jobFamily === "data_analyst" ||
            jobFamily === "virtual_assistant" ||
            jobFamily === "customer_service" ||
            jobFamily === "sales" ||
            jobText.includes("product manager") ||
            jobText.includes("product designer") ||
            jobText.includes("ui/ux") ||
            jobText.includes("ux researcher") ||
            jobText.includes("virtual assistant") ||
            jobText.includes("administrative") ||
            jobText.includes("customer service") ||
            jobText.includes("sales")
        ) {
            return false;
        }
        return (
            jobFamily === "frontend_developer" ||
            jobText.includes("frontend") ||
            jobText.includes("front-end") ||
            jobText.includes("full stack") ||
            jobText.includes("fullstack") ||
            jobText.includes("react") ||
            jobText.includes("vue") ||
            jobText.includes("angular") ||
            jobText.includes("web developer") ||
            jobText.includes("ui engineer") ||
            jobText.includes("android") ||
            jobText.includes("ios") ||
            jobText.includes("mobile") ||
            jobText.includes("flutter") ||
            jobText.includes("swift") ||
            jobText.includes("kotlin")
        );
    }

    // 5. DEVOPS & SRE: Strictly DevOps, SRE, Cloud, Platform & Infrastructure roles
    if (userFamily === "devops_sre") {
        if (
            jobFamily === "product_manager" ||
            jobFamily === "product_designer" ||
            jobFamily === "data_analyst" ||
            jobFamily === "virtual_assistant" ||
            jobFamily === "customer_service" ||
            jobFamily === "sales" ||
            jobFamily === "human_resources" ||
            jobFamily === "banking_finance" ||
            jobFamily === "hse_officer" ||
            jobText.includes("frontend") ||
            jobText.includes("front-end") ||
            jobText.includes("mobile developer") ||
            jobText.includes("android") ||
            jobText.includes("ios") ||
            jobText.includes("product designer") ||
            jobText.includes("ui/ux") ||
            jobText.includes("ux researcher") ||
            jobText.includes("product manager") ||
            jobText.includes("project manager") ||
            jobText.includes("program manager") ||
            jobText.includes("virtual assistant") ||
            jobText.includes("administrative") ||
            jobText.includes("customer service") ||
            jobText.includes("sales") ||
            jobText.includes("civil") ||
            jobText.includes("construction") ||
            jobText.includes("facilities") ||
            jobText.includes("structural") ||
            jobText.includes("mechanical") ||
            jobText.includes("hardware") ||
            jobText.includes("land development") ||
            jobText.includes("communications officer")
        ) {
            return false;
        }
        return (
            jobFamily === "devops_sre" ||
            jobText.includes("devops") ||
            jobText.includes("sre") ||
            jobText.includes("site reliability") ||
            jobText.includes("cloud engineer") ||
            jobText.includes("cloud architect") ||
            jobText.includes("cloud solutions architect") ||
            jobText.includes("cloud operations") ||
            jobText.includes("cloud security") ||
            jobText.includes("cloud") ||
            jobText.includes("infrastructure") ||
            jobText.includes("platform engineer") ||
            jobText.includes("platform engineering") ||
            jobText.includes("kubernetes") ||
            jobText.includes("system administrator") ||
            jobText.includes("systems administrator") ||
            jobText.includes("linux administrator") ||
            jobText.includes("server administrator") ||
            jobText.includes("devsecops") ||
            jobText.includes("ci/cd") ||
            jobText.includes("reliability") ||
            jobText.includes("solutions architect")
        );
    }

    // 6. BACKEND & SYSTEMS DEVELOPER: Cross-matches Backend & Fullstack (excludes PM, Design & Admin)
    if (userFamily === "backend_engineer") {
        if (
            jobText.includes("product manager") ||
            jobText.includes("product designer") ||
            jobText.includes("ui/ux") ||
            jobText.includes("ux researcher") ||
            jobText.includes("virtual assistant") ||
            jobText.includes("administrative") ||
            jobText.includes("customer service") ||
            jobText.includes("sales")
        ) {
            return false;
        }
        return (
            jobFamily === "backend_engineer" ||
            jobText.includes("backend") ||
            jobText.includes("back-end") ||
            jobText.includes("full stack") ||
            jobText.includes("fullstack") ||
            jobText.includes("software engineer") ||
            jobText.includes("software developer") ||
            jobText.includes("systems engineer") ||
            jobText.includes("golang") ||
            jobText.includes("python") ||
            jobText.includes("node") ||
            jobText.includes("api") ||
            jobText.includes("architect")
        );
    }

    // 6. VIRTUAL ASSISTANT: Strictly Administrative Support only
    if (userFamily === "virtual_assistant") {
        // STRICT EXCLUSION: Reject ANY engineering, technical, product, design, data, sales, or banking roles
        if (
            jobText.includes("developer") ||
            jobText.includes("engineer") ||
            jobText.includes("software") ||
            jobText.includes("programmer") ||
            jobText.includes("architect") ||
            jobText.includes("android") ||
            jobText.includes("ios") ||
            jobText.includes("mobile") ||
            jobText.includes("devops") ||
            jobText.includes("cloud") ||
            jobText.includes("sre") ||
            jobText.includes("backend") ||
            jobText.includes("frontend") ||
            jobText.includes("fullstack") ||
            jobText.includes("product manager") ||
            jobText.includes("product lead") ||
            jobText.includes("product designer") ||
            jobText.includes("ui/ux") ||
            jobText.includes("data scientist") ||
            jobText.includes("data analyst") ||
            jobText.includes("investment banker") ||
            jobText.includes("salesforce")
        ) {
            return false;
        }
        return (
            jobFamily === "virtual_assistant" ||
            jobText.includes("virtual assistant") ||
            jobText.includes("executive assistant") ||
            jobText.includes("administrative assistant") ||
            jobText.includes("administrative coordinator") ||
            jobText.includes("administrative business partner") ||
            jobText.includes("office assistant") ||
            jobText.includes("personal assistant") ||
            jobText.includes("admin assistant") ||
            jobText.includes("secretary") ||
            jobText.includes("office administrator")
        );
    }

    // 7. CUSTOMER SERVICE: Strictly Customer Support only
    if (userFamily === "customer_service") {
        if (jobText.includes("software engineer") || jobText.includes("product manager") || jobText.includes("product designer")) {
            return false;
        }
        return (
            jobFamily === "customer_service" ||
            jobText.includes("customer service") ||
            jobText.includes("customer support") ||
            jobText.includes("call centre") ||
            jobText.includes("call center") ||
            jobText.includes("customer experience") ||
            jobText.includes("client support") ||
            jobText.includes("customer service representative")
        );
    }

    // 8. SALES & BUSINESS DEVELOPMENT: Strictly Sales only
    if (userFamily === "sales") {
        if (jobText.includes("software engineer") || jobText.includes("product designer") || jobText.includes("virtual assistant") || jobText.includes("customer service")) {
            return false;
        }
        return (
            jobFamily === "sales" ||
            jobText.includes("sales") ||
            jobText.includes("business development") ||
            jobText.includes("account executive") ||
            jobText.includes("bizdev") ||
            jobText.includes("account manager")
        );
    }

    // 9. BANKING & FINANCE: Strictly Finance only
    if (userFamily === "banking_finance") {
        if (jobText.includes("software engineer") || jobText.includes("product manager") || jobText.includes("virtual assistant")) {
            return false;
        }
        return (
            jobFamily === "banking_finance" ||
            jobText.includes("banking") ||
            jobText.includes("investment banker") ||
            jobText.includes("financial analyst") ||
            jobText.includes("finance") ||
            jobText.includes("investment")
        );
    }

    // 10. PRODUCT MARKETER: Strictly Product Marketing & Growth
    if (userFamily === "product_marketer") {
        if (
            jobText.includes("software engineer") ||
            jobText.includes("backend") ||
            jobText.includes("virtual assistant") ||
            jobText.includes("customer service")
        ) {
            return false;
        }
        return (
            jobFamily === "product_marketer" ||
            jobText.includes("product market") ||
            jobText.includes("growth market") ||
            jobText.includes("marketing manager") ||
            jobText.includes("digital market") ||
            jobText.includes("marketing communication") ||
            jobText.includes("brand manager")
        );
    }

    // 11. OIL & GAS / ENERGY: Strictly Oil & Gas & HSE only
    if (userFamily === "oil_gas") {
        if (
            jobFamily === "backend_engineer" ||
            jobFamily === "frontend_developer" ||
            jobFamily === "product_manager" ||
            jobFamily === "product_designer" ||
            jobFamily === "ui_designer" ||
            jobFamily === "data_analyst" ||
            jobFamily === "virtual_assistant" ||
            jobFamily === "sales" ||
            jobText.includes("software engineer") ||
            jobText.includes("developer") ||
            jobText.includes("frontend") ||
            jobText.includes("backend") ||
            jobText.includes("product manager") ||
            jobText.includes("virtual assistant") ||
            jobText.includes("sales development") ||
            jobText.includes("outbound") ||
            jobText.includes("account executive") ||
            jobText.includes("sdr")
        ) {
            return false;
        }
        return (
            jobFamily === "oil_gas" ||
            jobText.includes("oil & gas") ||
            jobText.includes("oil and gas") ||
            jobText.includes("petroleum") ||
            jobText.includes("drilling") ||
            jobText.includes("reservoir") ||
            (jobText.includes("pipeline") && !jobText.includes("sales") && !jobText.includes("talent")) ||
            jobText.includes("subsea") ||
            jobText.includes("geoscientist") ||
            jobText.includes("geologist") ||
            jobText.includes("hse") ||
            jobText.includes("safety") ||
            jobText.includes("risk manager") ||
            jobText.includes("safety officer") ||
            jobText.includes("offshore") ||
            jobText.includes("refinery") ||
            jobText.includes("solids control") ||
            jobText.includes("engineering — oil") ||
            jobText.includes("engineering - oil")
        );
    }

    // 12. BUSINESS ANALYST: Strictly Business Systems, Operations & Strategy
    if (userFamily === "business_analyst") {
        if (
            jobFamily === "product_designer" ||
            jobFamily === "ui_designer" ||
            jobFamily === "virtual_assistant" ||
            jobFamily === "backend_engineer" ||
            jobFamily === "frontend_developer" ||
            jobFamily === "devops_sre" ||
            jobText.includes("software engineer") ||
            jobText.includes("software developer") ||
            jobText.includes("programmer") ||
            jobText.includes("frontend") ||
            jobText.includes("backend") ||
            jobText.includes("product designer") ||
            jobText.includes("ui/ux") ||
            jobText.includes("virtual assistant")
        ) {
            return false;
        }
        return (
            jobFamily === "business_analyst" ||
            jobFamily === "data_analyst" ||
            jobText.includes("business analyst") ||
            jobText.includes("business analysis") ||
            jobText.includes("functional analyst") ||
            jobText.includes("operations analyst") ||
            jobText.includes("business operations")
        );
    }

    if (userFamily === "general" || jobFamily === "general") {
        return false;
    }

    return jobFamily === userFamily;
}
