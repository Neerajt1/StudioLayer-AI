// ---------------------------------------------------------------------------
// BirefNet Background Removal — editorial output cutout (Batch 21)
//
// Removes the studio background from a generated fashion image.
// V1: used ONLY by Remove Background refinement — not normal generation.
// ---------------------------------------------------------------------------

import { fal } from "@fal-ai/client";
import { logger } from "../../lib/logger.js";
import type { BackgroundRemovalProvider } from "./background-removal-provider.js";
import type { BackgroundRemovalInput, BackgroundRemovalResult } from "./types.js";

fal.config({ credentials: process.env["FAL_KEY"] });

/** BirefNet subscribe deadline — prevents indefinite hangs (live V1: ~5s typical). */
export const FAL_BIREFNET_TIMEOUT_MS = Number(
  process.env["FAL_BIREFNET_TIMEOUT_MS"] ?? 120_000,
);

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

function extractResultUrl(data: Record<string, unknown> | undefined): string | null {
  const candidates: unknown[] = [
    (data?.["image"] as { url?: string } | undefined)?.url,
    data?.["image_url"],
    data?.["url"],
    (data?.["images"] as Array<{ url: string }> | undefined)?.[0]?.url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("http")) {
      return candidate;
    }
  }
  return null;
}

export class BirefNetBackgroundRemovalProvider implements BackgroundRemovalProvider {
  readonly name = "fal-ai/birefnet";

  async processBackgroundRemoval(
    input: BackgroundRemovalInput,
  ): Promise<BackgroundRemovalResult> {
    const { sourceImageUrl, renderId, purpose } = input;

    logger.info(
      { renderId, purpose, provider: this.name, timeoutMs: FAL_BIREFNET_TIMEOUT_MS },
      "background-removal: BirefNet started",
    );

    const result = await withAsyncTimeout(
      fal.subscribe("fal-ai/birefnet", {
        input: {
          image_url: sourceImageUrl,
          model: "General Use (Light)",
          output_format: "png",
          operating_resolution: "2048x2048",
          refine_foreground: true,
        },
        logs: false,
      }),
      FAL_BIREFNET_TIMEOUT_MS,
      `background-removal: BirefNet timed out after ${FAL_BIREFNET_TIMEOUT_MS}ms`,
    );

    const url = extractResultUrl(result.data as Record<string, unknown> | undefined);
    if (!url) {
      throw new Error("background-removal: BirefNet returned no image URL");
    }

    logger.info(
      { renderId, purpose, provider: this.name, outputUrl: url },
      "background-removal: BirefNet complete",
    );

    return { kind: "url", url };
  }
}
