// ---------------------------------------------------------------------------
// Remove Background refinement — image processing path (Batch 21)
//
// Does not invoke OpenRouter. Produces transparent PNG via BirefNet.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import { db, rendersTable } from "@workspace/db";
import { logger } from "../../lib/logger.js";
import {
  logPipelineStage,
  PipelineStage,
  type PipelineTraceContext,
} from "../../lib/render-pipeline-observability.js";
import { uploadRemoteImageToR2 } from "../../rendering/image-storage.js";
import {
  FeatureTemporarilyUnavailableError,
  getImageProcessingProvider,
  isImageProcessingNotImplementedError,
} from "../image-processing/index.js";

export async function runRemoveBackgroundRefine(params: {
  renderId: number;
  previousOutputUrl: string;
  pipelineTrace: PipelineTraceContext;
}): Promise<string> {
  const { renderId, previousOutputUrl, pipelineTrace } = params;

  logPipelineStage(pipelineTrace, PipelineStage.AI_PIPELINE_STARTED, {
    refinement: "remove_background",
    provider: "birefnet",
  });

  const imageProcessing = getImageProcessingProvider();

  try {
    const removalResult = await imageProcessing.processBackgroundRemoval({
      sourceImageUrl: previousOutputUrl,
      renderId,
      purpose: "refine-remove-background",
    });

    if (removalResult.kind !== "url") {
      throw new Error("remove-background-refine: buffer output not supported");
    }

    const transparentUrl = await uploadRemoteImageToR2(
      removalResult.url,
      renderId,
      "transparent",
    );

    await db
      .update(rendersTable)
      .set({
        outputImageUrl: transparentUrl,
        transparentOutputImageUrl: transparentUrl,
      })
      .where(eq(rendersTable.id, renderId));

    logger.info(
      { renderId, transparentUrl },
      "refinement: remove background complete",
    );

    logPipelineStage(pipelineTrace, PipelineStage.OPENROUTER_RESPONSE_RECEIVED, {
      refinement: "remove_background",
      provider: "birefnet",
      shotsReturned: 1,
    });

    return transparentUrl;
  } catch (error) {
    if (isImageProcessingNotImplementedError(error)) {
      throw new FeatureTemporarilyUnavailableError();
    }
    throw error;
  }
}
