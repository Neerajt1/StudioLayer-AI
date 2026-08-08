// ---------------------------------------------------------------------------
// Remove Background refinement — Fal/BirefNet path (V1)
//
// Does not invoke OpenRouter. Produces verified transparent PNG via BirefNet.
// ---------------------------------------------------------------------------

import { logger } from "../../lib/logger.js";
import {
  logPipelineStage,
  PipelineStage,
  type PipelineTraceContext,
} from "../../lib/render-pipeline-observability.js";
import {
  fetchRemoteImageBuffer,
  uploadTransparentPngBufferToR2,
} from "../../rendering/image-storage.js";
import {
  FAL_BIREFNET_TIMEOUT_MS,
} from "../image-processing/birefnet-background-removal-provider.js";
import {
  FeatureTemporarilyUnavailableError,
  getImageProcessingProvider,
  isImageProcessingNotImplementedError,
} from "../image-processing/index.js";
import {
  assertPngHasTransparency,
  PngTransparencyVerificationError,
} from "../image-processing/verify-png-alpha.js";

export class RemoveBackgroundFailedError extends Error {
  readonly code = "REMOVE_BACKGROUND_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "RemoveBackgroundFailedError";
  }
}

/** Overall refinement deadline — BirefNet + fetch + alpha verify + R2 upload. */
const REMOVE_BACKGROUND_PIPELINE_TIMEOUT_MS =
  FAL_BIREFNET_TIMEOUT_MS + 45_000;

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

  const imageProcessing = getImageProcessingProvider();

  const removalResult = await imageProcessing.processBackgroundRemoval({
    sourceImageUrl: previousOutputUrl,
    renderId,
    purpose: "refine-remove-background",
  });

  if (removalResult.kind !== "url") {
    throw new RemoveBackgroundFailedError(
      "remove-background-refine: buffer output not supported",
    );
  }

  const { buffer, contentType } = await fetchRemoteImageBuffer(removalResult.url, {
    timeoutMs: 30_000,
  });

  if (
    !contentType.includes("png")
    && !buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  ) {
    throw new RemoveBackgroundFailedError(
      `remove-background-refine: provider returned non-PNG asset (${contentType})`,
    );
  }

  const alphaVerification = assertPngHasTransparency(buffer);

  logger.info(
    {
      renderId,
      contentType: "image/png",
      colorType: alphaVerification.colorType,
      width: alphaVerification.width,
      height: alphaVerification.height,
      transparentPixelCount: alphaVerification.transparentPixelCount,
    },
    "refinement: transparent PNG alpha verified",
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
    if (error instanceof PngTransparencyVerificationError) {
      throw new RemoveBackgroundFailedError(error.message);
    }
    if (error instanceof Error && error.message.includes("timed out")) {
      throw new RemoveBackgroundFailedError(error.message);
    }
    throw error;
  }
}
