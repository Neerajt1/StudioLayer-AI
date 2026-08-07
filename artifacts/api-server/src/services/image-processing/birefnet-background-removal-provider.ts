// ---------------------------------------------------------------------------
// BirefNet Background Removal — editorial output cutout (Batch 21)
//
// Removes the studio background from a generated fashion image.
// Used by Remove Background refinement and transparent download cache.
// ---------------------------------------------------------------------------

import { fal } from "@fal-ai/client";
import { logger } from "../../lib/logger.js";
import type { BackgroundRemovalProvider } from "./background-removal-provider.js";
import type { BackgroundRemovalInput, BackgroundRemovalResult } from "./types.js";

fal.config({ credentials: process.env["FAL_KEY"] });

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
      { renderId, purpose, provider: this.name },
      "background-removal: BirefNet started",
    );

    const result = await fal.subscribe("fal-ai/birefnet", {
      input: {
        image_url:         sourceImageUrl,
        model:             "General Use (Light)",
        output_format:     "png",
        operating_resolution: "2048x2048",
        refine_foreground: true,
      },
      logs: false,
    });

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
