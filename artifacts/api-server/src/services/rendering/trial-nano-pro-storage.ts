// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — Nano Pro Standalone Trial R2 persistence
//
// Writes ONLY under: trial/nano-pro/{yyyy-mm-dd}/{runId}/
// Never writes renders/{renderId}/…
// Easy to delete with the trial module.
// ---------------------------------------------------------------------------

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../../lib/logger.js";
import { createR2S3Client, getR2Config } from "../../lib/r2-config.js";

export const TRIAL_NANO_PRO_STORAGE_PREFIX = "trial/nano-pro/" as const;

function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

function utcDateStamp(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Build an isolated trial object key.
 * Rejects any key that would land under production renders/.
 */
export function buildTrialNanoProObjectKey(params: {
  trialRunId: string;
  mimeType?: string;
  date?: Date;
  filename?: string;
}): string {
  const runId = params.trialRunId.trim();
  if (!runId) {
    throw new Error("trial-nano-pro-storage: trialRunId is required");
  }
  if (runId.includes("..") || runId.includes("/") || runId.includes("\\")) {
    throw new Error("trial-nano-pro-storage: invalid trialRunId");
  }

  const date = utcDateStamp(params.date ?? new Date());
  const ext = extensionForMime(params.mimeType ?? "image/png");
  const filename = (params.filename ?? `output.${ext}`).replace(
    /^\/+/,
    "",
  );
  const key = `${TRIAL_NANO_PRO_STORAGE_PREFIX}${date}/${runId}/${filename}`;
  assertTrialNanoProObjectKeySafe(key);
  return key;
}

export function assertTrialNanoProObjectKeySafe(objectKey: string): void {
  if (!objectKey.startsWith(TRIAL_NANO_PRO_STORAGE_PREFIX)) {
    throw new Error(
      `trial-nano-pro-storage: object key must start with ${TRIAL_NANO_PRO_STORAGE_PREFIX}`,
    );
  }
  if (objectKey.includes("..")) {
    throw new Error("trial-nano-pro-storage: path traversal is not allowed");
  }
  if (
    objectKey.startsWith("renders/") ||
    objectKey.includes("/renders/") ||
    /(^|\/)renders\/\d+\//.test(objectKey)
  ) {
    throw new Error(
      "trial-nano-pro-storage: refusing to write under production renders/ prefix",
    );
  }
}

function buildPublicObjectUrl(publicBase: string, objectKey: string): string {
  return `${publicBase}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

export type TrialNanoProPersistResult = {
  objectKey: string;
  outputUrl: string;
  bucket: string;
  sizeBytes: number;
};

/**
 * Persist a trial output data-URI under trial/nano-pro/… only.
 * Optional — local QA may skip persistence.
 */
export async function persistTrialNanoProOutput(params: {
  trialRunId: string;
  dataUri: string;
  /** Optional filename under the trial run folder (e.g. stage1-identity-anchor.png). */
  filename?: string;
}): Promise<TrialNanoProPersistResult> {
  const config = getR2Config();
  if (!config) {
    throw new Error(
      "trial-nano-pro-storage: R2 is not configured (missing environment variables)",
    );
  }

  const commaIdx = params.dataUri.indexOf(",");
  if (commaIdx === -1) {
    throw new Error("trial-nano-pro-storage: malformed data-URI");
  }

  const header = params.dataUri.slice(0, commaIdx);
  const b64data = params.dataUri.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType = mimeMatch?.[1] ?? "image/png";
  const buffer = Buffer.from(b64data, "base64");
  const objectKey = buildTrialNanoProObjectKey({
    trialRunId: params.trialRunId,
    mimeType,
    filename: params.filename,
  });

  assertTrialNanoProObjectKeySafe(objectKey);

  const client = createR2S3Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  const outputUrl = buildPublicObjectUrl(config.publicUrl, objectKey);

  logger.info(
    {
      experimental: true,
      trialRunId: params.trialRunId,
      objectKey,
      sizeBytes: buffer.length,
      bucket: config.bucket,
    },
    "trial-nano-pro-storage: upload complete",
  );

  return {
    objectKey,
    outputUrl,
    bucket: config.bucket,
    sizeBytes: buffer.length,
  };
}
