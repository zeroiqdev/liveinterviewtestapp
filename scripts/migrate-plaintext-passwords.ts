/**
 * One-off: hash any passwords still stored as plain text.
 *
 *   npx tsx scripts/migrate-plaintext-passwords.ts          # dry run
 *   npx tsx scripts/migrate-plaintext-passwords.ts --apply  # write changes
 */

import { resolve } from "path";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import mongoose from "mongoose";
import dbConnect from "../src/lib/mongodb";
import User from "../src/models/User";
import { hashPassword, isBcryptHash } from "../src/lib/password";

async function main() {
    const apply = process.argv.includes("--apply");
    await dbConnect();

    const users = await User.find({ password: { $nin: ["", null] } }).select("email password");
    const legacy = users.filter((u) => u.password && !isBcryptHash(u.password));
    console.log(`${legacy.length} of ${users.length} stored passwords are plain text.`);

    for (const user of legacy) {
        if (apply) {
            user.password = await hashPassword(user.password!.trim());
            await user.save();
        }
        console.log(`${apply ? "hashed" : "would hash"}: ${user.email}`);
    }

    if (!apply && legacy.length) console.log("Dry run only. Re-run with --apply to write.");
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
