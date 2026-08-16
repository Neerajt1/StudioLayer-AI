// ---------------------------------------------------------------------------
// In-memory Gallery preview availability — avoids per-serialize R2 HeadObject
// ---------------------------------------------------------------------------

import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { createR2S3Client, getR2Config } from "../../lib/r2-config.js";
import {
  type PreviewFormat,
  previewObjectKey,
} from "./generate-preview.js";

const availablePreviews = new Map<number, PreviewFormat>();
const negativeCacheUntil = new Map<number, number>();

const NEGATIVE_CACHE_MS = 30_000;
const HYDRATE_CONCURRENCY = 12;

export function buildPreviewPublicUrl(renderId: number, format: PreviewFormat): string {
  const config = getR2Config();
  if (!config) {
    throw new Error("preview-registry: R2 is not configured");
  }

  const key = previewObjectKey(renderId, format);
  return `${config.publicUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function markPreviewAvailable(renderId: number, format: PreviewFormat): void {
  availablePreviews.set(renderId, format);
  negativeCacheUntil.delete(renderId);
}

export function clearPreviewAvailability(renderId: number): void {
  availablePreviews.delete(renderId);
  negativeCacheUntil.delete(renderId);
}

export function getPreviewImageUrl(renderId: number): string | null {
  const format = availablePreviews.get(renderId);
  if (!format) return null;

  try {
    return buildPreviewPublicUrl(renderId, format);
  } catch {
    return null;
  }
}

/** @internal Test-only reset. */
export function resetPreviewRegistryState(): void {
  availablePreviews.clear();
  negativeCacheUntil.clear();
}

function shouldHydrateRenderId(renderId: number): boolean {
  if (availablePreviews.has(renderId)) return false;
  const until = negativeCacheUntil.get(renderId);
  return until == null || until <= Date.now();
}

async function headPreviewFormat(
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

async function hydrateSingleRenderId(renderId: number): Promise<void> {
  if (!shouldHydrateRenderId(renderId)) return;

  if (await headPreviewFormat(renderId, "webp")) {
    markPreviewAvailable(renderId, "webp");
    return;
  }

  if (await headPreviewFormat(renderId, "png")) {
    markPreviewAvailable(renderId, "png");
    return;
  }

  negativeCacheUntil.set(renderId, Date.now() + NEGATIVE_CACHE_MS);
}

/**
 * Populates the in-memory preview registry for render IDs not yet known.
 * Batched with concurrency limits — called once per Gallery list fetch.
 */
export async function hydratePreviewCache(renderIds: readonly number[]): Promise<void> {
  if (renderIds.length === 0 || getR2Config() == null) return;

  const pending = renderIds.filter(shouldHydrateRenderId);
  if (pending.length === 0) return;

  for (let offset = 0; offset < pending.length; offset += HYDRATE_CONCURRENCY) {
    const batch = pending.slice(offset, offset + HYDRATE_CONCURRENCY);
    await Promise.all(batch.map((renderId) => hydrateSingleRenderId(renderId)));
  }
}
