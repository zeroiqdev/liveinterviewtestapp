/**
 * Cloudflare R2 Storage Service
 *
 * Cloudflare R2 is 100% S3-compatible, provides 10 GB free storage,
 * and has zero egress/bandwidth fees.
 *
 * ── Required Environment Variables ──
 * R2_ACCOUNT_ID          - Cloudflare Account ID (found on R2 overview page)
 * R2_ACCESS_KEY_ID       - R2 API Token Access Key ID
 * R2_SECRET_ACCESS_KEY   - R2 API Token Secret Access Key
 * R2_BUCKET_NAME         - Name of your R2 bucket (e.g. "useladder-tts")
 * R2_PUBLIC_DOMAIN       - Public R2.dev URL or custom domain (e.g. "https://pub-xxxx.r2.dev" or "https://audio.yourdomain.com")
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let _s3Client: S3Client | null = null;

function getR2Client(): S3Client | null {
  if (_s3Client) return _s3Client;

  const rawAccountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!rawAccountId || !accessKeyId || !secretAccessKey) {
    console.warn(
      "[r2Storage] Cloudflare R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) not set. " +
      "TTS audio will use local placeholder URLs until credentials are provided."
    );
    return null;
  }

  // Strip https:// and domain suffix if user pasted the full endpoint URL
  const accountId = rawAccountId
    .replace(/^https?:\/\//i, "")
    .replace(/\.r2\.cloudflarestorage\.com.*$/i, "")
    .trim();

  _s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
    },
  });

  return _s3Client;
}

/**
 * Uploads an audio buffer to Cloudflare R2 and returns its public URL.
 * Falls back to a placeholder URL if credentials are not yet configured.
 */
export async function uploadToStorage(
  buffer: Buffer,
  destinationPath: string,
  contentType: string = "audio/mpeg"
): Promise<string> {
  const client = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME || "useladder-tts";
  const publicDomain = process.env.R2_PUBLIC_DOMAIN;

  if (!client) {
    console.warn("[r2Storage] No R2 client available, returning placeholder URL");
    return `https://storage.placeholder.local/${destinationPath}`;
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: destinationPath,
    Body: buffer,
    ContentType: contentType,
  });

  await client.send(command);

  // If a public domain or R2.dev URL is provided, format with it
  if (publicDomain) {
    const baseUrl = publicDomain.replace(/\/+$/, "");
    return `${baseUrl}/${destinationPath}`;
  }

  // Default R2 endpoint format if no custom domain configured
  return `https://${bucketName}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${destinationPath}`;
}

/**
 * Returns the public URL for an asset path in storage.
 */
export function getPublicStorageUrl(destinationPath: string): string {
  const publicDomain = process.env.R2_PUBLIC_DOMAIN;
  if (publicDomain) {
    const baseUrl = publicDomain.replace(/\/+$/, "");
    return `${baseUrl}/${destinationPath}`;
  }
  const bucketName = process.env.R2_BUCKET_NAME || "useladder-tts";
  return `https://${bucketName}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${destinationPath}`;
}

/**
 * Fast HEAD check to determine if an asset already exists in persistent storage.
 */
export async function checkStorageExists(destinationPath: string): Promise<string | null> {
  const publicUrl = getPublicStorageUrl(destinationPath);
  try {
    const res = await fetch(publicUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(2000),
    });
    if (res.status === 200) {
      return publicUrl;
    }
  } catch {
    // Non-fatal network timeout/error
  }
  return null;
}

