import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * S3 client and helpers for file storage.
 *
 * All uploads go to a single bucket partitioned by key prefix:
 *   resumes/{userId}/{timestamp}-{filename}
 *   audio/{sessionId}/{questionId}.webm    (future module)
 */

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || "intelliview-uploads";

export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Server-side encryption at rest
      ServerSideEncryption: "AES256",
    })
  );

  // Return the S3 object URL (not publicly accessible — use getSignedDownloadUrl for reads)
  return `https://${BUCKET}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
}

export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

export async function deleteFromS3(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

/**
 * Build a consistent S3 key for resume uploads.
 * Format: resumes/{userId}/{timestamp}-{sanitizedFilename}
 */
export function buildResumeKey(
  userId: string,
  originalFilename: string
): string {
  const sanitized = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `resumes/${userId}/${Date.now()}-${sanitized}`;
}

/**
 * Build a consistent S3 key for audio answer uploads.
 * Format: audio/{sessionId}/{questionId}.{ext}
 */
export function buildAudioKey(
  sessionId: string,
  questionId: string,
  mimeType: string
): string {
  const ext = mimeType.includes("webm") ? "webm" : "wav";
  return `audio/${sessionId}/${questionId}.${ext}`;
}

export { s3Client, BUCKET };
