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

export type PreviewHydrateRender = {
  id: number;
  status?: string | null;
  outputImageUrl?: string | null;
  /**
   * Completion liveness timestamp — drizzle `$onUpdate` refreshes this when
   * onComplete sets status=completed (and on later row updates).
   */
  updatedAt?: Date | string | null;
};

type HeadPreviewResult =
  | { exists: false }
  | { exists: true; lastModified: Date | undefined };

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

/** @internal True when hydrate/upload has marked this render's preview usable. */
export function hasPreviewAvailability(renderId: number): boolean {
  return availablePreviews.has(renderId);
}

/**
 * Gallery may advertise a preview only for completed rows with real output.
 * An R2 object alone must never make failed/incomplete renders look usable.
 */
export function canAdvertiseGalleryPreview(render: {
  status?: string | null;
  outputImageUrl?: string | null;
}): boolean {
  if (render.status !== "completed") return false;
  return (
    typeof render.outputImageUrl === "string" && render.outputImageUrl.length > 0
  );
}

function parseTimeMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Preview object is fresh only when Last-Modified is not older than the
 * render's completion/update timestamp (`updatedAt`).
 */
export function isPreviewLastModifiedFresh(
  lastModified: Date | undefined | null,
  renderUpdatedAt: Date | string | null | undefined,
): boolean {
  if (lastModified == null) return false;
  const updatedMs = parseTimeMs(renderUpdatedAt);
  if (updatedMs == null) return false;
  const lastMs = lastModified.getTime();
  if (!Number.isFinite(lastMs)) return false;
  return lastMs >= updatedMs;
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

async function headPreviewObjectDefault(
  renderId: number,
  format: PreviewFormat,
): Promise<HeadPreviewResult> {
  const config = getR2Config();
  if (!config) return { exists: false };

  const client = createR2S3Client(config);
  try {
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: previewObjectKey(renderId, format),
      }),
    );
    return {
      exists: true,
      lastModified:
        response.LastModified instanceof Date ? response.LastModified : undefined,
    };
  } catch {
    return { exists: false };
  }
}

let headPreviewObjectImpl: (
  renderId: number,
  format: PreviewFormat,
) => Promise<HeadPreviewResult> = headPreviewObjectDefault;

/** @internal Test-only HEAD override. */
export function setHeadPreviewObjectForTests(
  impl:
    | ((
        renderId: number,
        format: PreviewFormat,
      ) => Promise<HeadPreviewResult>)
    | null,
): void {
  headPreviewObjectImpl = impl ?? headPreviewObjectDefault;
}

async function hydrateSingleRender(render: PreviewHydrateRender): Promise<void> {
  if (!shouldHydrateRenderId(render.id)) return;

  if (!canAdvertiseGalleryPreview(render)) {
    negativeCacheUntil.set(render.id, Date.now() + NEGATIVE_CACHE_MS);
    return;
  }

  for (const format of ["webp", "png"] as const) {
    const head = await headPreviewObjectImpl(render.id, format);
    if (!head.exists) continue;

    if (isPreviewLastModifiedFresh(head.lastModified, render.updatedAt)) {
      markPreviewAvailable(render.id, format);
      return;
    }
    // Object exists but is stale for this completion — try next format.
  }

  negativeCacheUntil.set(render.id, Date.now() + NEGATIVE_CACHE_MS);
}

/**
 * Populates the in-memory preview registry for completed renders.
 * Only marks previews whose R2 Last-Modified is not older than render.updatedAt.
 */
export async function hydratePreviewCache(
  renders: readonly PreviewHydrateRender[],
): Promise<void> {
  if (renders.length === 0) return;

  const pending = renders.filter((render) => shouldHydrateRenderId(render.id));
  if (pending.length === 0) return;

  for (let offset = 0; offset < pending.length; offset += HYDRATE_CONCURRENCY) {
    const batch = pending.slice(offset, offset + HYDRATE_CONCURRENCY);
    await Promise.all(batch.map((render) => hydrateSingleRender(render)));
  }
}
