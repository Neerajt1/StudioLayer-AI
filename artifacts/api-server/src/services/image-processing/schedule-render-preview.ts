// ---------------------------------------------------------------------------
// Fire-and-forget Gallery preview generation (does not block generation)
// ---------------------------------------------------------------------------

import { logger } from "../../lib/logger.js";
import { fetchRemoteImageBuffer } from "../../rendering/image-storage.js";
import { generatePreviewBuffer } from "./generate-preview.js";
import { markPreviewAvailable } from "./preview-registry.js";
import { uploadPreviewBufferToR2 } from "./preview-storage.js";

const previewInFlight = new Set<number>();

export interface ScheduleRenderPreviewInput {
  renderId: number;
  sourceImageUrl: string;
  preserveAlpha?: boolean;
}

/**
 * Schedules async preview generation after the full-resolution asset is persisted.
 * Failures are logged; callers are never rejected.
 */
export function scheduleRenderPreviewGeneration(input: ScheduleRenderPreviewInput): void {
  const { renderId, sourceImageUrl, preserveAlpha } = input;

  if (!sourceImageUrl.startsWith("http")) {
    logger.warn({ renderId }, "preview: skipped — source URL is not HTTP(S)");
    return;
  }

  if (previewInFlight.has(renderId)) {
    return;
  }

  previewInFlight.add(renderId);

  void (async () => {
    try {
      const { buffer } = await fetchRemoteImageBuffer(sourceImageUrl);
      const preview = await generatePreviewBuffer(buffer, { preserveAlpha });
      await uploadPreviewBufferToR2(preview.buffer, renderId, preview.format);
      markPreviewAvailable(renderId, preview.format);
    } catch (error) {
      logger.error(
        {
          renderId,
          preserveAlpha: preserveAlpha === true,
          err: error instanceof Error ? error.message : String(error),
        },
        "preview: async generation failed — gallery will fall back to original",
      );
    } finally {
      previewInFlight.delete(renderId);
    }
  })();
}

/** @internal Test-only reset for in-flight coalescing state. */
export function resetScheduleRenderPreviewState(): void {
  previewInFlight.clear();
}
