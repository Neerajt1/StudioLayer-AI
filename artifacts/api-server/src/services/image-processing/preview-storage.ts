// ---------------------------------------------------------------------------
// R2 persistence for Gallery preview objects (separate from full-resolution)
// ---------------------------------------------------------------------------

import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../../lib/logger.js";
import { createR2S3Client, getR2Config } from "../../lib/r2-config.js";
import {
  type PreviewFormat,
  previewObjectKey,
} from "./generate-preview.js";
import {
  buildPreviewPublicUrl,
  clearPreviewAvailability,
} from "./preview-registry.js";

const PREVIEW_CACHE_CONTROL = "public, max-age=31536000, immutable";

function contentTypeForFormat(format: PreviewFormat): string {
  return format === "png" ? "image/png" : "image/webp";
}

export async function uploadPreviewBufferToR2(
  buffer: Buffer,
  renderId: number,
  format: PreviewFormat,
): Promise<string> {
  const config = getR2Config();
  if (!config) {
    throw new Error("preview-storage: R2 is not configured");
  }

  const objectKey = previewObjectKey(renderId, format);
  const client = createR2S3Client(config);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: contentTypeForFormat(format),
      CacheControl: PREVIEW_CACHE_CONTROL,
    }),
  );

  const url = buildPreviewPublicUrl(renderId, format);
  logger.info(
    { renderId, objectKey, format, sizeBytes: buffer.length, url },
    "preview-storage: gallery preview uploaded",
  );
  return url;
}

export async function deleteRenderPreviewFromR2(renderId: number): Promise<void> {
  const config = getR2Config();
  if (!config) return;

  const client = createR2S3Client(config);
  const keys = [
    previewObjectKey(renderId, "webp"),
    previewObjectKey(renderId, "png"),
  ];

  await Promise.all(
    keys.map(async (Key) => {
      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: config.bucket,
            Key,
          }),
        );
      } catch (error) {
        logger.warn(
          {
            renderId,
            key: Key,
            err: error instanceof Error ? error.message : String(error),
          },
          "preview-storage: preview delete failed (non-fatal)",
        );
      }
    }),
  );
}

/**
 * Failure / delete hygiene: drop in-memory advertisement and best-effort
 * remove R2 preview objects for this render ID only.
 * Always idempotent and non-fatal — never throws to callers.
 */
export async function discardRenderGalleryPreview(
  renderId: number,
): Promise<void> {
  clearPreviewAvailability(renderId);
  try {
    await deleteRenderPreviewFromR2(renderId);
  } catch (error) {
    logger.warn(
      {
        renderId,
        err: error instanceof Error ? error.message : String(error),
      },
      "preview-storage: discard gallery preview failed (non-fatal)",
    );
  }
}

export async function previewObjectExists(
  renderId: number,
  format: PreviewFormat,
): Promise<boolean> {
  const config = getR2Config();
  if (!config) return false;

  const client = createR2S3Client(config);
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: previewObjectKey(renderId, format),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
