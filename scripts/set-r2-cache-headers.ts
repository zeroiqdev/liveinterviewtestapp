/**
 * One-off: add the long-lived Cache-Control header to audio clips uploaded
 * before uploads set it. Rewrites each object's metadata in place (an S3
 * self-copy); the audio itself is unchanged.
 *
 *   npx tsx scripts/set-r2-cache-headers.ts          # dry run: count what would change
 *   npx tsx scripts/set-r2-cache-headers.ts --apply  # update the objects
 */

import { resolve } from "path";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { CopyObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { AUDIO_CACHE_CONTROL, getR2Client } from "../src/lib/r2Storage";

const PREFIX = "tts-cache/";
const CONCURRENCY = 16;

async function main() {
    const apply = process.argv.includes("--apply");
    const client = getR2Client();
    if (!client) throw new Error("R2 credentials are not configured");
    const bucket = process.env.R2_BUCKET_NAME || "useladder-tts";

    const keys: string[] = [];
    let token: string | undefined;
    do {
        const page = await client.send(
            new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token })
        );
        for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key);
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    console.log(`${keys.length} clips under ${PREFIX}`);

    let alreadySet = 0;
    let updated = 0;
    let failed = 0;
    let next = 0;
    const worker = async () => {
        while (next < keys.length) {
            const key = keys[next++];
            try {
                const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
                if (head.CacheControl === AUDIO_CACHE_CONTROL) {
                    alreadySet++;
                    continue;
                }
                if (apply) {
                    await client.send(
                        new CopyObjectCommand({
                            Bucket: bucket,
                            Key: key,
                            CopySource: `${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`,
                            MetadataDirective: "REPLACE",
                            ContentType: head.ContentType || "audio/mpeg",
                            CacheControl: AUDIO_CACHE_CONTROL,
                            Metadata: head.Metadata,
                        })
                    );
                }
                updated++;
            } catch (err) {
                failed++;
                console.warn(`  ${key}: ${(err as Error).message}`);
            }
            const done = alreadySet + updated + failed;
            if (done % 200 === 0) console.log(`  ${done}/${keys.length}`);
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    console.log(
        `${apply ? "Updated" : "Would update"}: ${updated} | already set: ${alreadySet} | failed: ${failed}`
    );
    if (!apply && updated) console.log("Dry run only. Re-run with --apply to write.");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
