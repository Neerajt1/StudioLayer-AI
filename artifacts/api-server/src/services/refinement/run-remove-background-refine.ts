// ---------------------------------------------------------------------------
// Remove Background refinement — resolution-preserving mask composite (Phase 1)
//
// Does not invoke OpenRouter. FAL mask → composite on original → R2.
// ---------------------------------------------------------------------------

import { logger } from "../../lib/logger.js";
import {
  logPipelineStage,
  PipelineStage,
  type PipelineTraceContext,
} from "../../lib/render-pipeline-observability.js";
import { uploadTransparentPngBufferToR2 } from "../../rendering/image-storage.js";
import {
  FAL_BIREFNET_TIMEOUT_MS,
} from "../image-processing/birefnet-background-removal-provider.js";
import {
  FeatureTemporarilyUnavailableError,
  isImageProcessingNotImplementedError,
} from "../image-processing/index.js";
import {
  isRemoveBackgroundFailedError,
  produceResolutionPreservingTransparentPng,
  RemoveBackgroundFailedError,
} from "../remove-background-service.js";

export { RemoveBackgroundFailedError };

/** Overall refinement deadline — FAL mask + fetch + composite + verify + R2 upload. */
const REMOVE_BACKGROUND_PIPELINE_TIMEOUT_MS =
  FAL_BIREFNET_TIMEOUT_MS + 60_000;

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

async function runRemoveBackgroundPipeline(params: {
  renderId: number;
  previousOutputUrl: string;
  pipelineTrace: PipelineTraceContext;
}): Promise<string> {
  const { renderId, previousOutputUrl, pipelineTrace } = params;

  logPipelineStage(pipelineTrace, PipelineStage.AI_PIPELINE_STARTED, {
    refinement: "remove_background",
    provider: "birefnet",
  });

  const { buffer, alphaVerification } = await produceResolutionPreservingTransparentPng({
    sourceImageUrl: previousOutputUrl,
    renderId,
    purpose: "refine-remove-background",
  });

  logger.info(
    {
      renderId,
      contentType: "image/png",
      colorType: alphaVerification.colorType,
      width: alphaVerification.width,
      height: alphaVerification.height,
      transparentPixelCount: alphaVerification.transparentPixelCount,
    },
    "refinement: transparent PNG alpha verified at source resolution",
  );

  const transparentUrl = await uploadTransparentPngBufferToR2(buffer, renderId);

  logger.info(
    { renderId, transparentUrl },
    "refinement: remove background complete",
  );

  logPipelineStage(pipelineTrace, PipelineStage.OPENROUTER_RESPONSE_RECEIVED, {
    refinement: "remove_background",
    provider: "birefnet",
    shotsReturned: 1,
    transparentPixelCount: alphaVerification.transparentPixelCount,
  });

  return transparentUrl;
}

export async function runRemoveBackgroundRefine(params: {
  renderId: number;
  previousOutputUrl: string;
  pipelineTrace: PipelineTraceContext;
}): Promise<string> {
  try {
    return await withAsyncTimeout(
      runRemoveBackgroundPipeline(params),
      REMOVE_BACKGROUND_PIPELINE_TIMEOUT_MS,
      `remove-background-refine: timed out after ${REMOVE_BACKGROUND_PIPELINE_TIMEOUT_MS}ms`,
    );
  } catch (error) {
    if (isImageProcessingNotImplementedError(error)) {
      throw new FeatureTemporarilyUnavailableError();
    }
    if (isRemoveBackgroundFailedError(error)) {
      throw error;
    }
    if (error instanceof Error && error.message.includes("timed out")) {
      throw new RemoveBackgroundFailedError(error.message);
    }
    throw error;
  }
}
