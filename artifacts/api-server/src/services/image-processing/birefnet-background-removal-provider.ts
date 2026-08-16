// ---------------------------------------------------------------------------
// BirefNet Background Removal — segmentation mask only (Phase 1)
//
// FAL produces a segmentation mask at operating_resolution. The final
// transparent PNG is composited server-side onto the original full-res image.
// ---------------------------------------------------------------------------

import { fal } from "@fal-ai/client";
import { logger } from "../../lib/logger.js";
import type { BackgroundRemovalProvider } from "./background-removal-provider.js";
import type { BackgroundRemovalInput, BackgroundRemovalResult } from "./types.js";
import {
  resolveBirefNetOperatingResolution,
  type BirefNetOperatingResolution,
} from "./resolve-birefnet-operating-resolution.js";

fal.config({ credentials: process.env["FAL_KEY"] });

/** BirefNet subscribe deadline — prevents indefinite hangs (live V1: ~5s typical). */
export const FAL_BIREFNET_TIMEOUT_MS = Number(
  process.env["FAL_BIREFNET_TIMEOUT_MS"] ?? 120_000,
);

/** FAL request parameters for mask-only segmentation (fal-ai/birefnet v1). */
export const BIREFNET_MASK_REQUEST = {
  model: "General Use (Light)" as const,
  output_format: "png" as const,
  mask_only: true,
  output_mask: true,
  refine_foreground: false,
};

function withAsyncTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function extractMaskUrl(data: Record<string, unknown> | undefined): string | null {
  const maskImage = (data?.["mask_image"] as { url?: string } | undefined)?.url;
  if (typeof maskImage === "string" && maskImage.startsWith("http")) {
    return maskImage;
  }

  // mask_only: true — segmentation mask is returned in the image field.
  const image = (data?.["image"] as { url?: string } | undefined)?.url;
  if (typeof image === "string" && image.startsWith("http")) {
    return image;
  }

  return null;
}

export class BirefNetBackgroundRemovalProvider implements BackgroundRemovalProvider {
  readonly name = "fal-ai/birefnet";

  async processBackgroundRemoval(
    input: BackgroundRemovalInput,
  ): Promise<BackgroundRemovalResult> {
    const { sourceImageUrl, renderId, purpose, sourceWidth, sourceHeight } = input;

    const operatingResolution: BirefNetOperatingResolution =
      sourceWidth != null && sourceHeight != null
        ? resolveBirefNetOperatingResolution(sourceWidth, sourceHeight)
        : "2048x2048";

    logger.info(
      {
        renderId,
        purpose,
        provider: this.name,
        timeoutMs: FAL_BIREFNET_TIMEOUT_MS,
        operatingResolution,
        sourceWidth,
        sourceHeight,
        ...BIREFNET_MASK_REQUEST,
      },
      "background-removal: BirefNet mask request started",
    );

    const result = await withAsyncTimeout(
      fal.subscribe("fal-ai/birefnet", {
        input: {
          image_url: sourceImageUrl,
          operating_resolution: operatingResolution,
          ...BIREFNET_MASK_REQUEST,
        },
        logs: false,
      }),
      FAL_BIREFNET_TIMEOUT_MS,
      `background-removal: BirefNet timed out after ${FAL_BIREFNET_TIMEOUT_MS}ms`,
    );

    const maskUrl = extractMaskUrl(result.data as Record<string, unknown> | undefined);
    if (!maskUrl) {
      throw new Error("background-removal: BirefNet returned no mask URL");
    }

    logger.info(
      { renderId, purpose, provider: this.name, maskUrl, operatingResolution },
      "background-removal: BirefNet mask complete",
    );

    return { kind: "mask_url", maskUrl };
  }
}
