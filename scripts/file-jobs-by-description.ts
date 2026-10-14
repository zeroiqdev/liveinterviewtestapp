/**
 * Files every job whose title doesn't settle its kind of role, by having its
 * description read (lib/jobRoleClassifier). The scheduled scrape does a few
 * each run; this does as many as asked in one go.
 *
 * Usage:
 *   npx tsx scripts/file-jobs-by-description.ts            # up to 300 jobs
 *   npx tsx scripts/file-jobs-by-description.ts --all      # everything waiting
 *   npx tsx scripts/file-jobs-by-description.ts --sample   # try 12 "program manager" jobs and print the answers, changing nothing
 */

import { resolve } from "path";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import dbConnect from "../src/lib/mongodb";
import Job from "../src/models/Job";
import { fileJobsByDescription, fileWaitingJobs } from "../src/lib/jobRoleClassifier";

async function main() {
    await dbConnect();
    if (process.argv.includes("--sample")) {
        const jobs = await Job.find({ title: /(program|project) manager|operations lead|chief of staff|solutions/i, fullDescription: { $exists: true, $ne: "" } })
            .select("title fullDescription")
            .limit(12)
            .lean();
        const filed = await fileJobsByDescription(jobs.map((job, index) => ({ id: String(index + 1), title: job.title, description: job.fullDescription || "" })));
        jobs.forEach((job, index) => console.log(`${(filed.get(String(index + 1)) || "?").padEnd(18)} ${job.title}`));
        return;
    }
    const all = process.argv.includes("--all");
    let total = 0;
    let moved = 0;
    for (;;) {
        const run = await fileWaitingJobs({ limit: 300, budgetMs: 10 * 60_000, concurrency: 4 });
        total += run.checked;
        moved += run.moved;
        console.log(`checked ${total}, filed under a role ${moved}, still waiting ${run.remaining}`);
        if (!all || run.checked === 0 || run.remaining === 0) break;
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
