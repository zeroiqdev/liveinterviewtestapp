/**
 * Deletes the stored recordings (audio files and their database rows) of
 * voices the product no longer uses. Recordings can always be made again.
 *
 * Usage:
 *   npx tsx scripts/delete-unused-voice-recordings.ts            # show what would go
 *   npx tsx scripts/delete-unused-voice-recordings.ts --delete   # delete it
 *
 * Kept: the two voices in use, and by default the Nigerian Azure voices the
 * live site used before the switch (pass --include-nigerian once the new
 * version is deployed).
 */

import { resolve } from "path";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import dbConnect from "../src/lib/mongodb";
import TtsCache from "../src/models/TtsCache";
import { getR2Client } from "../src/lib/r2Storage";
import { getAllPersonas, getVoiceForContext } from "../src/config/voiceConfig";

const NIGERIAN_AZURE = ["en-NG-EzinneNeural", "en-NG-AbeoNeural"];

async function main() {
    const reallyDelete = process.argv.includes("--delete");
    const keep = new Set(getAllPersonas().map((persona) => getVoiceForContext(persona, "nigeria").voiceId));
    if (!process.argv.includes("--include-nigerian")) NIGERIAN_AZURE.forEach((voice) => keep.add(voice));

    await dbConnect();
    const groups = await TtsCache.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$voiceId", n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
    for (const group of groups) console.log(`${keep.has(group._id) ? "keep  " : "delete"}  ${String(group.n).padStart(5)}  ${group._id}`);

    const rows = await TtsCache.find({ voiceId: { $nin: [...keep] } }).select("_id").lean();
    console.log(`${rows.length} recordings to delete.`);
    if (!reallyDelete || rows.length === 0) return;

    const client = getR2Client();
    const bucket = process.env.R2_BUCKET_NAME;
    if (!client || !bucket) throw new Error("Storage isn't configured; nothing deleted.");
    let files = 0;
    for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const result = await client.send(
            new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((row) => ({ Key: `tts-cache/${row._id}.mp3` })), Quiet: false } })
        );
        if (result.Errors?.length) throw new Error(`Storage refused ${result.Errors.length} deletions; stopped before touching the database.`);
        files += result.Deleted?.length ?? 0;
        // Rows go only after their files are gone.
        await TtsCache.deleteMany({ _id: { $in: batch.map((row) => row._id) } });
    }
    console.log(`Deleted ${files} audio files and ${rows.length} database rows.`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
