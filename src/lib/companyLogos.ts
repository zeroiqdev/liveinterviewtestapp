/**
 * Company logos for the jobs board.
 *
 * A logo is looked up once per company and a copy is kept in our own storage,
 * so the board never depends on guessing a favicon address in the browser
 * (which gave blurry icons, generic globes, or another company's mark).
 *
 * Where a logo comes from, in order:
 *   1. the job board's own listing (LinkedIn, Wellfound and some Jobberman
 *      cards carry the employer's logo);
 *   2. the company's website: its app icon (apple-touch-icon) or a large
 *      site icon. The website is the one the job links to, a known address,
 *      or a guess from the name that is only trusted if the page names the
 *      company.
 * A company with no findable logo is remembered too, and shown as an initial.
 */

import { createHash } from "crypto";
import dbConnect from "@/lib/mongodb";
import CompanyLogoModel from "@/models/CompanyLogo";
import { uploadToStorage } from "@/lib/r2Storage";

const FETCH_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 600_000;
const MIN_IMAGE_BYTES = 400;
/** Smaller than this and it's too blurry to show (logos display at 28px, 56px on sharp screens). */
const MIN_SIDE_PX = 48;
/** A company with no logo found is tried again after this long. */
const RETRY_MISSING_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** Hosts that serve many companies' jobs: their own icon is never the employer's. */
const SHARED_HOSTS =
    /(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|jobberman\.com|linkedin\.com|wellfound\.com|ycombinator\.com|indeed\.com|glassdoor\.com|seamlesshiring\.com|smartrecruiters\.com|myworkdayjobs\.com|bamboohr\.com|breezy\.hr|notion\.site)$/i;

/** Websites that can't be guessed from the name. Keys are companyKey() values. */
const KNOWN_WEBSITES: Record<string, string> = {
    moniepoint: "moniepoint.com",
    "moniepoint teamapt": "moniepoint.com",
    "moniepoint group": "moniepoint.com",
    "kuda bank": "kuda.com",
    kuda: "kuda.com",
    "jumia group": "jumia.com.ng",
    jumia: "jumia.com.ng",
    "interswitch group": "interswitchgroup.com",
    "helium health": "heliumhealth.com",
    "scale ai": "scale.com",
    deliveroo: "deliveroo.co.uk",
    notion: "notion.com",
    linear: "linear.app",
    "paystack stripe": "paystack.com",
    paystack: "paystack.com",
    andela: "andela.com",
    flutterwave: "flutterwave.com",
    piggyvest: "piggyvest.com",
    interswitch: "interswitchgroup.com",
    nomba: "nomba.com",
    anduril: "anduril.com",
    harvey: "harvey.ai",
    "perplexity ai": "perplexity.ai",
    perplexity: "perplexity.ai",
    "dangote industries limited": "dangote.com",
    "dangote group": "dangote.com",
    "africa delivery technologies limited kwik": "kwik.delivery",
};

const COMPANY_SUFFIX = / (inc|ltd|limited|llc|plc|group|nigeria|technologies|technology)$/g;

/**
 * Addresses a company might own, guessed from its name. A guess is only used
 * when the page there names the company (see pageNamesCompany).
 */
export function guessedWebsites(key: string): string[] {
    const name = key.replace(COMPANY_SUFFIX, "");
    const joined = name.replace(/ /g, "");
    if (joined.length < 4) return [];
    const guesses = [`${joined}.com`];
    // "Snorkel AI" is snorkel.ai, "Perplexity AI" is perplexity.ai.
    if (/ ai$/.test(name) && joined.length > 5) guesses.unshift(`${joined.slice(0, -2)}.ai`);
    return guesses;
}

/** "Moniepoint (TeamApt)" → "moniepoint teamapt" */
export function companyKey(company: string): string {
    return (company || "")
        .toLowerCase()
        .replace(/&amp;/g, "&")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

/** Names that are a job board's placeholder, not an employer. */
function isPlaceholderCompany(key: string): boolean {
    return !key || /^(jobberman (verified employer|partner)|confidential|anonymous|portfolio company|unknown)/.test(key);
}

/** The company's own website from a job link, or null when the link is on a shared jobs host. */
export function websiteFromJobUrl(jobUrl: string | undefined): string | null {
    if (!jobUrl) return null;
    try {
        const host = new URL(jobUrl).hostname.toLowerCase();
        if (SHARED_HOSTS.test(host)) return null;
        return host.replace(/^(www|careers?|jobs?|boards?|apply|join|work|talent|hire|recruiting)\./, "");
    } catch {
        return null;
    }
}

async function fetchWithTimeout(url: string, accept: string): Promise<Response | null> {
    // One more try after a dropped connection or timeout; a refusal is final.
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(url, {
                headers: { "User-Agent": USER_AGENT, Accept: accept },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                redirect: "follow",
                cache: "no-store" as RequestCache,
            });
            return res.ok ? res : null;
        } catch {
            // try again
        }
    }
    return null;
}

interface FetchedImage {
    bytes: Buffer;
    contentType: string;
    extension: string;
}

/** Width and height of a PNG, read from its header. */
function pngSize(bytes: Buffer): { width: number; height: number } | null {
    if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Width and height of a JPEG, read from its frame header. */
function jpegSize(bytes: Buffer): { width: number; height: number } | null {
    let at = 2;
    while (at + 9 < bytes.length && bytes[at] === 0xff) {
        const marker = bytes[at + 1];
        // Frame headers (SOF0–SOF15, except the three that aren't frames).
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
        }
        at += 2 + bytes.readUInt16BE(at + 2);
    }
    return null;
}

/** Downloads an image and accepts it only if it is big enough to be a logo. */
export async function fetchLogoImage(url: string): Promise<FetchedImage | null> {
    const res = await fetchWithTimeout(url, "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8");
    if (!res) return null;
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) return null;

    const head = bytes.subarray(0, 300).toString("utf-8").trimStart().toLowerCase();
    if (contentType.includes("svg") || head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) {
        // A drawing can be complete in a couple of hundred bytes.
        return bytes.length >= 150 ? { bytes, contentType: "image/svg+xml", extension: "svg" } : null;
    }
    if (bytes.length < MIN_IMAGE_BYTES) return null;
    const png = pngSize(bytes);
    if (png) {
        if (Math.min(png.width, png.height) < MIN_SIDE_PX) return null;
        return { bytes, contentType: "image/png", extension: "png" };
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
        const jpeg = jpegSize(bytes);
        if (!jpeg || Math.min(jpeg.width, jpeg.height) < MIN_SIDE_PX) return null;
        return { bytes, contentType: "image/jpeg", extension: "jpg" };
    }
    if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
        return bytes.length >= 1500 ? { bytes, contentType: "image/webp", extension: "webp" } : null;
    }
    // .ico and .gif favicons are too small to show as a logo.
    return null;
}

/** Icon addresses a web page declares, best first. */
export function iconCandidates(html: string, pageUrl: string): string[] {
    const found: Array<{ href: string; score: number }> = [];
    for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
        const rel = (tag.match(/\brel\s*=\s*["']?([^"'>]+)/i)?.[1] || "").toLowerCase();
        const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
        if (!href || !/icon/.test(rel)) continue;
        const size = Number(tag.match(/\bsizes\s*=\s*["']?(\d+)x\d+/i)?.[1] || 0);
        const isSvg = /\.svg(\?|$)/i.test(href) || /image\/svg/i.test(tag);
        // An icon with no stated size may still be large: worth a look, last.
        let score = size || (/\.ico(\?|$)/i.test(href) ? 0 : 96);
        if (rel.includes("apple-touch-icon")) score = Math.max(score, 180);
        if (isSvg) score = Math.max(score, 150);
        if (/mask-icon/.test(rel)) continue; // single-colour silhouettes
        found.push({ href, score });
    }
    const resolve = (href: string) => {
        try {
            return new URL(href, pageUrl).toString();
        } catch {
            return null;
        }
    };
    const declared = found
        .filter((icon) => icon.score >= 96)
        .sort((a, b) => b.score - a.score)
        .map((icon) => resolve(icon.href))
        .filter((href): href is string => Boolean(href));
    // Many sites serve an app icon without declaring it.
    const conventional = resolve("/apple-touch-icon.png");
    return [...new Set([...declared, ...(conventional ? [conventional] : [])])];
}

/**
 * Whether a page is this company's (used only for addresses guessed from the
 * name, where a different company may own the address). The page has to name
 * the company in its title, its declared site name, or its copyright line.
 */
export function pageNamesCompany(html: string, key: string): boolean {
    const named = [
        html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
        ...[...html.matchAll(/<meta[^>]*(?:property|name)=["'](?:og:site_name|og:title|application-name|apple-mobile-web-app-title|twitter:title)["'][^>]*>/gi)].map(
            (tag) => tag[0].match(/content=["']([^"']+)/i)?.[1]
        ),
        ...[...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*)?(?:[-–]\s*\d{4}\s*)?([^<.|]{2,60})/gi)].map((match) => match[1]),
    ]
        .filter((text): text is string => Boolean(text))
        .map(companyKey);
    // Company suffixes don't have to appear: "Kuda Bank" is "Kuda" on its own site.
    const name = key.replace(/ (inc|ltd|limited|llc|plc|group|bank|nigeria|technologies|technology|ai)$/g, "");
    if (name.length < 3) return false;
    const whole = new RegExp(`(^| )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`);
    return named.some((text) => whole.test(text));
}

/**
 * The logo for a website: the app icon or large site icon the page declares,
 * else the site's icon as Google's favicon service has it (which also covers
 * sites that refuse automated visits).
 */
async function logoFromWebsite(domain: string, key: string, trusted: boolean): Promise<FetchedImage | null> {
    const page = await fetchWithTimeout(`https://${domain}/`, "text/html,application/xhtml+xml");
    if (page) {
        const html = (await page.text()).slice(0, 500_000);
        if (!trusted && !pageNamesCompany(html, key)) return null;
        for (const candidate of iconCandidates(html, page.url || `https://${domain}/`).slice(0, 4)) {
            const image = await fetchLogoImage(candidate);
            if (image) return image;
        }
    } else if (!trusted) {
        // Can't confirm whose site this is.
        return null;
    }
    return fetchLogoImage(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`);
}

/** Longest side a stored logo is kept at (shown at 28–40px, twice that on sharp screens). */
const STORED_SIDE_PX = 256;
/** A mark that fills less of its image than this is lost in empty margin. */
const SPARSE_MARK = 0.5;

/**
 * Stores a logo at a sensible size and, only when the mark is lost in empty
 * margin (some employers upload a small logo in the middle of a big white
 * square), cuts the margin away and re-centres it. Logos that already fill
 * their frame are left exactly as designed: cropping those spoils them.
 * An image that can't be processed is kept as it came.
 */
export async function tidyLogo(image: FetchedImage): Promise<FetchedImage> {
    if (image.extension === "svg") return image;
    try {
        const sharp = (await import("sharp")).default;
        const { width = 0, height = 0 } = await sharp(image.bytes).metadata();
        const trimmed = await sharp(image.bytes).ensureAlpha().trim({ threshold: 16 }).toBuffer({ resolveWithObject: true });
        const fill = Math.max(trimmed.info.width / width, trimmed.info.height / height);

        let drawn = sharp(image.bytes);
        if (fill < SPARSE_MARK) {
            const corner = await sharp(image.bytes).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
            const background = { r: corner[0], g: corner[1], b: corner[2], alpha: corner[3] / 255 };
            const margin = Math.round(STORED_SIDE_PX * 0.1);
            const inner = STORED_SIDE_PX - margin * 2;
            drawn = sharp(trimmed.data)
                .resize(inner, inner, { fit: "contain", background })
                .extend({ top: margin, bottom: margin, left: margin, right: margin, background });
        } else if (Math.max(width, height) > STORED_SIDE_PX) {
            drawn = drawn.resize(STORED_SIDE_PX, STORED_SIDE_PX, { fit: "inside" });
        } else if (image.extension === "png") {
            return image;
        }
        return { bytes: await drawn.webp({ quality: 90 }).toBuffer(), contentType: "image/webp", extension: "webp" };
    } catch (err) {
        console.warn("[companyLogos] logo kept as fetched:", err instanceof Error ? err.message : err);
        return image;
    }
}

async function storeLogo(key: string, original: FetchedImage): Promise<string> {
    const image = await tidyLogo(original);
    // The content hash in the name lets the file be cached forever and still
    // be replaced when a company changes its logo.
    const hash = createHash("sha1").update(image.bytes).digest("hex").slice(0, 10);
    const name = key.replace(/ /g, "-").slice(0, 60);
    return uploadToStorage(image.bytes, `company-logos/${name}-${hash}.${image.extension}`, image.contentType);
}

export interface LogoLookup {
    company: string;
    /** Any of the company's job links (its own website, when it has one, is read from it). */
    jobUrl?: string;
    /** A logo address given by the job board's listing. */
    listingLogoUrl?: string;
}

/**
 * The stored logo address for a company, finding and storing it on first use.
 * Returns null when the company has no findable logo.
 */
export async function resolveCompanyLogo(lookup: LogoLookup): Promise<string | null> {
    const key = companyKey(lookup.company);
    if (isPlaceholderCompany(key)) return null;
    await dbConnect();

    const known = await CompanyLogoModel.findOne({ key }).lean();
    if (known?.logoUrl) return known.logoUrl;
    // A listing logo is new information: worth another try even if nothing was found before.
    const recentlyMissing = known && Date.now() - new Date(known.checkedAt).getTime() < RETRY_MISSING_AFTER_MS;
    if (recentlyMissing && !lookup.listingLogoUrl) return null;

    let image: FetchedImage | null = null;
    let source = "";
    if (lookup.listingLogoUrl) {
        image = await fetchLogoImage(lookup.listingLogoUrl);
        if (image) source = "listing";
    }
    if (!image) {
        const ownSite = websiteFromJobUrl(lookup.jobUrl);
        const knownSite = KNOWN_WEBSITES[key];
        const attempts: Array<{ domain: string; trusted: boolean }> = [
            ...(knownSite ? [{ domain: knownSite, trusted: true }] : []),
            ...(ownSite ? [{ domain: ownSite, trusted: true }] : []),
            ...guessedWebsites(key).map((domain) => ({ domain, trusted: false })),
        ];
        const tried = new Set<string>();
        for (const attempt of attempts) {
            if (tried.has(attempt.domain)) continue;
            tried.add(attempt.domain);
            image = await logoFromWebsite(attempt.domain, key, attempt.trusted);
            if (image) {
                source = "website";
                break;
            }
        }
    }

    const logoUrl = image ? await storeLogo(key, image).catch(() => null) : null;
    await CompanyLogoModel.updateOne(
        { key },
        { $set: { company: lookup.company, logoUrl, source: logoUrl ? source : undefined, checkedAt: new Date() } },
        { upsert: true }
    );
    return logoUrl;
}

/**
 * Logos for a batch of scraped jobs: key → stored address. Companies already
 * looked up cost one query between them; at most `maxLookups` new companies
 * are looked up (the rest wait for the next scrape), so a first pass over a
 * big board can't use up the scraper's time.
 */
export async function resolveCompanyLogos(lookups: LogoLookup[], maxLookups = 20, concurrency = 5): Promise<Map<string, string>> {
    const logos = new Map<string, string>();
    // One lookup per company, preferring a job that carries a listing logo.
    const byKey = new Map<string, LogoLookup>();
    for (const lookup of lookups) {
        const key = companyKey(lookup.company);
        if (isPlaceholderCompany(key)) continue;
        const current = byKey.get(key);
        if (!current || (!current.listingLogoUrl && lookup.listingLogoUrl)) byKey.set(key, lookup);
    }
    if (byKey.size === 0) return logos;

    await dbConnect();
    const rows = await CompanyLogoModel.find({ key: { $in: [...byKey.keys()] } }).select("key logoUrl checkedAt").lean();
    const known = new Map(rows.map((row) => [row.key, row]));
    const due: LogoLookup[] = [];
    for (const [key, lookup] of byKey) {
        const row = known.get(key);
        if (row?.logoUrl) {
            logos.set(key, row.logoUrl);
        } else if (!row || lookup.listingLogoUrl || Date.now() - new Date(row.checkedAt).getTime() >= RETRY_MISSING_AFTER_MS) {
            due.push(lookup);
        }
    }
    // Listings that come with a logo are the surest and quickest: do them first.
    due.sort((a, b) => Number(Boolean(b.listingLogoUrl)) - Number(Boolean(a.listingLogoUrl)));
    const batch = due.slice(0, maxLookups);
    for (let i = 0; i < batch.length; i += concurrency) {
        const found = await Promise.allSettled(batch.slice(i, i + concurrency).map((lookup) => resolveCompanyLogo(lookup)));
        found.forEach((outcome, k) => {
            if (outcome.status === "fulfilled" && outcome.value) logos.set(companyKey(batch[i + k].company), outcome.value);
        });
    }
    return logos;
}

/** Stored logos for many companies at once (no lookups): key → address. */
export async function storedLogos(companies: string[]): Promise<Map<string, string>> {
    const keys = [...new Set(companies.map(companyKey).filter(Boolean))];
    const logos = new Map<string, string>();
    if (keys.length === 0) return logos;
    await dbConnect();
    const rows = await CompanyLogoModel.find({ key: { $in: keys }, logoUrl: { $ne: null } }).select("key logoUrl").lean();
    for (const row of rows) if (row.logoUrl) logos.set(row.key, row.logoUrl);
    return logos;
}
