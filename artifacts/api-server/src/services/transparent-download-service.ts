// ---------------------------------------------------------------------------
// StudioLayer AI — Transparent PNG download service (Batch 6.1)
//
// Flow:
//   TransparentDownloadService → ImageProcessingProvider → BackgroundRemovalProvider
//   → R2 persist → renders.transparent_output_image_url
//
// No Fal, OpenRouter, or third-party engine assumptions in this module.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import { db, rendersTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { traceRenderFailure, traceRenderStage } from "../lib/render-pipeline-trace.js";
import { uploadRemoteImageToR2 } from "../rendering/image-storage.js";
import type { BackgroundRemovalResult } from "./image-processing/types.js";
import {
  FeatureTemporarilyUnavailableError,
  getImageProcessingProvider,
  isImageProcessingNotImplementedError,
} from "./image-processing/index.js";

export async function ensureTransparentOutputUrl(input: {
  renderId: number;
  outputImageUrl: string;
  cachedTransparentUrl: string | null;
}): Promise<string> {
  if (input.cachedTransparentUrl) {
    traceRenderStage("Transparent download cache hit", {
      renderId: input.renderId,
      transparentOutputImageUrl: input.cachedTransparentUrl,
    });
    return input.cachedTransparentUrl;
  }

  traceRenderStage("Transparent download generation started", {
    renderId: input.renderId,
    outputImageUrl: input.outputImageUrl,
  });

  const imageProcessing = getImageProcessingProvider();

  try {
    const removalResult = await imageProcessing.processBackgroundRemoval({
      sourceImageUrl: input.outputImageUrl,
      renderId: input.renderId,
      purpose: "transparent-download",
    });

    const persistedUrl = await persistBackgroundRemovalResult(
      removalResult,
      input.renderId,
    );

    await db
      .update(rendersTable)
      .set({ transparentOutputImageUrl: persistedUrl })
      .where(eq(rendersTable.id, input.renderId));

    traceRenderStage("Transparent download generation complete", {
      renderId: input.renderId,
      transparentOutputImageUrl: persistedUrl,
    });

    logger.info(
      { renderId: input.renderId, transparentOutputImageUrl: persistedUrl },
      "transparent-download: cached transparent PNG",
    );

    return persistedUrl;
  } catch (error) {
    if (isImageProcessingNotImplementedError(error)) {
      throw new FeatureTemporarilyUnavailableError();
    }

    traceRenderFailure("Transparent download generation", error, {
      renderId: input.renderId,
    });
    throw error;
  }
}

async function persistBackgroundRemovalResult(
  result: BackgroundRemovalResult,
  renderId: number,
): Promise<string> {
  if (result.kind === "url") {
    return uploadRemoteImageToR2(result.url, renderId, "transparent");
  }

  throw new Error(
    "transparent-download: buffer persistence is not wired yet — provider must return kind:url",
  );
}
