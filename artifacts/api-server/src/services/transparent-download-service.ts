// ---------------------------------------------------------------------------
// StudioLayer AI — Transparent PNG download service (Batch 6.1 / Phase 1)
//
// Flow:
//   ensureTransparentOutputUrl → produceResolutionPreservingTransparentPng
//   → R2 persist → renders.transparent_output_image_url
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import { db, rendersTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { traceRenderFailure, traceRenderStage } from "../lib/render-pipeline-trace.js";
import { uploadTransparentPngBufferToR2 } from "../rendering/image-storage.js";
import {
  FeatureTemporarilyUnavailableError,
  isImageProcessingNotImplementedError,
} from "./image-processing/index.js";
import {
  isRemoveBackgroundFailedError,
  produceResolutionPreservingTransparentPng,
} from "./remove-background-service.js";

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

  try {
    const { buffer } = await produceResolutionPreservingTransparentPng({
      sourceImageUrl: input.outputImageUrl,
      renderId: input.renderId,
      purpose: "transparent-download",
    });

    const persistedUrl = await uploadTransparentPngBufferToR2(
      buffer,
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
    if (isRemoveBackgroundFailedError(error)) {
      traceRenderFailure("Transparent download generation", error, {
        renderId: input.renderId,
      });
      throw error;
    }

    traceRenderFailure("Transparent download generation", error, {
      renderId: input.renderId,
    });
    throw error;
  }
}
