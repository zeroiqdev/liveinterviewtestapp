/**
 * Re-files every stored job under the right kind of role, using the current
 * rules (title first; a category only counts when the description backs it).
 * Run after the classification rules change.
 *
 * Usage:
 *   npx tsx scripts/reclassify-jobs.ts            # show what would change
 *   npx tsx scripts/reclassify-jobs.ts --apply    # change it
 */

import { resolve } from "path";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import dbConnect from "../src/lib/mongodb";
import Job from "../src/models/Job";
import { classifyRoleFamily, descriptionSupportsFamily } from "../src/services/careerPageScraper";

async function main() {
    const apply = process.argv.includes("--apply");
    await dbConnect();
    const jobs = await Job.find().select("title roleFamily fullDescription").lean();
    const moves = new Map<string, number>();
    const examples = new Map<string, string[]>();
    const writes: Array<{ updateOne: { filter: { _id: unknown }; update: { $set: { roleFamily: string } } } }> = [];

    for (const job of jobs) {
        const fromTitle = classifyRoleFamily(job.title);
        // A job filed only by its board's category keeps that only if its description agrees.
        const next =
            fromTitle === "backend_engineer" && job.roleFamily === "oil_gas"
                ? "oil_gas" // an engineer in the oil and gas category is a field engineer
                : fromTitle !== "general"
                ? fromTitle
                : descriptionSupportsFamily(job.roleFamily, job.fullDescription)
                ? job.roleFamily
                : "general";
        if (next === job.roleFamily) continue;
        const move = `${job.roleFamily} → ${next}`;
        moves.set(move, (moves.get(move) ?? 0) + 1);
        const list = examples.get(move) ?? [];
        if (list.length < 3) list.push(job.title);
        examples.set(move, list);
        writes.push({ updateOne: { filter: { _id: job._id }, update: { $set: { roleFamily: next } } } });
    }

    console.log(`${jobs.length} jobs, ${writes.length} to re-file.`);
    for (const [move, count] of [...moves].sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(5)}  ${move}   e.g. ${examples.get(move)!.join(" | ")}`);
    if (apply && writes.length) {
        for (let i = 0; i < writes.length; i += 500) await Job.bulkWrite(writes.slice(i, i + 500), { ordered: false });
        console.log("Applied.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
