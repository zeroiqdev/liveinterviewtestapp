/**
 * Finds and stores a logo for every company on the jobs board.
 *
 * The scheduled scrape does this a few companies at a time; this does all of
 * them in one go (first set-up, or after the lookup rules improve).
 *
 * Usage:
 *   npx tsx scripts/backfill-company-logos.ts            # companies with no logo yet
 *   npx tsx scripts/backfill-company-logos.ts --retry    # also retry ones not found before
 *   npx tsx scripts/backfill-company-logos.ts --refresh  # fetch and store every logo again
 */

import { resolve } from "path";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import dbConnect from "../src/lib/mongodb";
import Job from "../src/models/Job";
import CompanyLogoModel from "../src/models/CompanyLogo";
import { companyKey, resolveCompanyLogo } from "../src/lib/companyLogos";
import { setCompanyLogos } from "../src/lib/jobStorage";
import { scrapeJobbermanJobs, scrapeLinkedInNigeriaJobs } from "../src/services/careerPageScraper";

const CONCURRENCY = 5;

async function main() {
    const retry = process.argv.includes("--retry");
    await dbConnect();
    if (retry) await CompanyLogoModel.deleteMany({ logoUrl: null });
    // --refresh: fetch and store every logo again (after the way logos are drawn changes).
    if (process.argv.includes("--refresh")) await CompanyLogoModel.deleteMany({});
    // Employer names that came through as a page title.
    for (const job of await Job.find({ company: /^Jobs at .+ - Company Review/i }).select("company")) {
        await Job.updateOne({ _id: job._id }, { $set: { company: job.company.replace(/^Jobs at (.+?) - Company Review.*$/i, "$1").trim() } });
    }

    // The job boards' own listings carry many employers' logos.
    console.log("Reading listing logos from LinkedIn and Jobberman…");
    const listingLogos = new Map<string, string>();
    const boards = await Promise.allSettled([
        scrapeLinkedInNigeriaJobs("https://www.linkedin.com/jobs/search?location=Nigeria", "LinkedIn Nigeria"),
        scrapeJobbermanJobs("https://www.jobberman.com/jobs", "Jobberman"),
    ]);
    for (const board of boards) {
        if (board.status !== "fulfilled") continue;
        for (const job of board.value.jobs) {
            if (job.company && job.companyLogo) listingLogos.set(companyKey(job.company), job.companyLogo);
        }
    }
    console.log(`  ${listingLogos.size} employers have a logo on their listing.`);

    const companies = await Job.aggregate<{ _id: string; url: string; logo?: string }>([
        { $match: { status: { $ne: "closed" } } },
        { $group: { _id: "$company", url: { $first: "$url" }, logo: { $max: "$companyLogo" } } },
    ]);
    console.log(`${companies.length} companies on the board.`);

    const found = new Map<string, string>();
    let missing = 0;
    for (let i = 0; i < companies.length; i += CONCURRENCY) {
        const batch = companies.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
            batch.map((company) =>
                resolveCompanyLogo({
                    company: company._id,
                    jobUrl: company.url,
                    // A logo address already on the job (e.g. from Wellfound) is a listing logo too.
                    listingLogoUrl: listingLogos.get(companyKey(company._id)) ?? (company.logo?.includes("/company-logos/") ? undefined : company.logo),
                })
            )
        );
        results.forEach((outcome, k) => {
            if (outcome.status === "fulfilled" && outcome.value) found.set(batch[k]._id, outcome.value);
            else missing++;
        });
        if ((i / CONCURRENCY) % 10 === 0) console.log(`  ${Math.min(i + CONCURRENCY, companies.length)}/${companies.length} checked, ${found.size} with a logo`);
    }

    const updated = await setCompanyLogos(found);
    // Addresses that point at someone else's server are dropped: they break without warning.
    const cleared = await Job.updateMany(
        { companyLogo: { $exists: true, $not: /\/company-logos\// } },
        { $unset: { companyLogo: "" } }
    );
    console.log(`Done: ${found.size} companies with a logo, ${missing} without. ${updated} jobs updated, ${cleared.modifiedCount} outside addresses removed.`);
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
