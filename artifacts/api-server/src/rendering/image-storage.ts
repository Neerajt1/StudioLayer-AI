// ---------------------------------------------------------------------------
// StudioLayer AI — Image Storage Utility
//
// Uploads a base64 data-URI (e.g. from OpenRouter image-generation) to
// Cloudflare R2 and returns a persistent, publicly-accessible HTTPS URL.
//
// BirefNet garment preprocessing may use a future ImageProcessingProvider —
// that is a separate dependency and is not handled here.
//
// Usage:
//   const url = await uploadBase64Image("data:image/png;base64,iVBOR...");
//   // → "https://<R2_PUBLIC_URL>/renders/42/....png"
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../lib/logger";
import { createR2S3Client, getR2Config } from "../lib/r2-config.js";
import {
  logPipelineStage,
  PipelineStage,
  type PipelineTraceContext,
} from "../lib/render-pipeline-observability.js";
import { traceRenderFailure } from "../lib/render-pipeline-trace.js";

export interface UploadBase64ImageOptions {
  pipelineTrace?: PipelineTraceContext;
  imageIndex?: number;
}

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

function buildObjectKey(renderId: number | undefined, mimeType: string): string {
  const ext = extensionForMime(mimeType);
  const idPart = renderId != null ? String(renderId) : "unknown";
  return `renders/${idPart}/${randomUUID()}.${ext}`;
}

function buildTransparentObjectKey(renderId: number): string {
  return `renders/${renderId}/transparent-${randomUUID()}.png`;
}

function buildPublicObjectUrl(publicBase: string, objectKey: string): string {
  return `${publicBase}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Uploads a base64 data-URI to Cloudflare R2.
 *
 * @param dataUri  A string of the form "data:<mime>;base64,<data>".
 *                 If the string is already an https:// URL (e.g. the provider
 *                 already returned a hosted URL) it is returned unchanged.
 * @param renderId Optional render ID for log correlation and key prefixing.
 * @returns        A persistent HTTPS URL pointing to the stored image.
 */
export async function uploadBase64Image(
  dataUri: string,
  renderId?: number,
  options?: UploadBase64ImageOptions,
): Promise<string> {
  if (dataUri.startsWith("http")) {
    return dataUri;
  }

  const config = getR2Config();
  if (!config) {
    throw new Error("image-storage: R2 is not configured (missing environment variables)");
  }

  const t0 = Date.now();
  const commaIdx = dataUri.indexOf(",");
  if (commaIdx === -1) {
    throw new Error("image-storage: malformed data-URI — missing comma separator");
  }

  const header = dataUri.slice(0, commaIdx);
  const b64data = dataUri.slice(commaIdx + 1);
  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType = mimeMatch?.[1] ?? "image/png";
  const buffer = Buffer.from(b64data, "base64");
  const objectKey = buildObjectKey(renderId, mimeType);

  logger.info(
    { renderId, mimeType, sizeBytes: buffer.length, bucket: config.bucket, objectKey },
    "image-storage: uploading generated image to R2",
  );

  const client = createR2S3Client(config);

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    const url = buildPublicObjectUrl(config.publicUrl, objectKey);
    const durationMs = Date.now() - t0;

    if (options?.pipelineTrace) {
      logPipelineStage(options.pipelineTrace, PipelineStage.R2_UPLOAD_COMPLETED, {
        renderId,
        imageIndex: options.imageIndex,
        durationMs,
        sizeBytes: buffer.length,
      });
    }

    logger.info(
      { renderId, objectKey, durationMs, sizeBytes: buffer.length },
      "image-storage: upload complete",
    );

    return url;
  } catch (error) {
    traceRenderFailure(PipelineStage.R2_UPLOAD_COMPLETED, error, {
      pipelineTrace: options?.pipelineTrace,
      renderId,
      imageIndex: options?.imageIndex,
    });
    throw error;
  }
}

/**
 * Fetches a remote image URL and persists it to R2.
 * Used to cache provider-hosted transparent PNGs for reuse.
 */
export async function uploadRemoteImageToR2(
  imageUrl: string,
  renderId: number,
  variant: "transparent" | "default" = "default",
): Promise<string> {
  if (imageUrl.startsWith("http") && variant === "default") {
    const config = getR2Config();
    if (config != null) {
      const publicBase = config.publicUrl.replace(/\/$/, "");
      if (imageUrl.startsWith(publicBase)) {
        return imageUrl;
      }
    }
  }

  const config = getR2Config();
  if (!config) {
    throw new Error("image-storage: R2 is not configured (missing environment variables)");
  }

  const upstream = await fetch(imageUrl, { redirect: "follow" });
  if (!upstream.ok) {
    throw new Error(`image-storage: upstream fetch failed: HTTP ${upstream.status}`);
  }

  const contentType = upstream.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await upstream.arrayBuffer());
  const objectKey =
    variant === "transparent"
      ? buildTransparentObjectKey(renderId)
      : buildObjectKey(renderId, contentType);

  const client = createR2S3Client(config);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  const url = buildPublicObjectUrl(config.publicUrl, objectKey);
  logger.info(
    { renderId, url, objectKey, variant, sizeBytes: buffer.length },
    "image-storage: remote image persisted to R2",
  );
  return url;
}
