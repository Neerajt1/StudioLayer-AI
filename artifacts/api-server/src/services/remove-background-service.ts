// ---------------------------------------------------------------------------
// Resolution-preserving background removal — shared orchestration (Phase 1)
//
// Used by refinement pipeline and transparent-download service.
// FAL → mask → composite onto original → validate → PNG buffer.
// ---------------------------------------------------------------------------

import { logger } from "../lib/logger.js";
import { fetchRemoteImageBuffer } from "../rendering/image-storage.js";
import {
  applyMaskToOriginal,
  MaskCompositeError,
  readImageDimensions,
} from "./image-processing/apply-mask-to-original.js";
import type { BackgroundRemovalInput, BackgroundRemovalResult } from "./image-processing/types.js";
import {
  assertPngDimensionsMatch,
  PngDimensionMismatchError,
  PngTransparencyVerificationError,
  type PngAlphaVerificationResult,
} from "./image-processing/verify-png-alpha.js";

export class RemoveBackgroundFailedError extends Error {
  readonly code = "REMOVE_BACKGROUND_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "RemoveBackgroundFailedError";
  }
}

export interface ProduceTransparentPngInput {
  sourceImageUrl: string;
  renderId: number;
  purpose: string;
}

export interface ProduceTransparentPngResult {
  buffer: Buffer;
  sourceWidth: number;
  sourceHeight: number;
  alphaVerification: PngAlphaVerificationResult;
}

export interface RemoveBackgroundDeps {
  processBackgroundRemoval: (
    input: BackgroundRemovalInput,
  ) => Promise<BackgroundRemovalResult>;
  fetchImageBuffer: (
    url: string,
    options?: { timeoutMs?: number },
  ) => Promise<{ buffer: Buffer; contentType: string }>;
}

async function resolveDefaultProcessBackgroundRemoval(
  input: BackgroundRemovalInput,
): Promise<BackgroundRemovalResult> {
  const { getImageProcessingProvider } = await import("./image-processing/index.js");
  return getImageProcessingProvider().processBackgroundRemoval(input);
}

/**
 * Fetch original image, obtain FAL mask, composite at full resolution, validate.
 * Never persists FAL's downscaled composited PNG.
 */
export async function produceResolutionPreservingTransparentPng(
  input: ProduceTransparentPngInput,
  deps?: Partial<RemoveBackgroundDeps>,
): Promise<ProduceTransparentPngResult> {
  const fetchImageBuffer = deps?.fetchImageBuffer ?? fetchRemoteImageBuffer;
  const processBackgroundRemoval =
    deps?.processBackgroundRemoval ?? resolveDefaultProcessBackgroundRemoval;

  const { sourceImageUrl, renderId, purpose } = input;

  let originalBuffer: Buffer;
  try {
    const fetched = await fetchImageBuffer(sourceImageUrl, { timeoutMs: 30_000 });
    originalBuffer = fetched.buffer;
  } catch (error) {
    throw new RemoveBackgroundFailedError(
      `remove-background: failed to fetch original image (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  const { width: sourceWidth, height: sourceHeight } =
    await readImageDimensions(originalBuffer);

  let removalResult: BackgroundRemovalResult;
  try {
    removalResult = await processBackgroundRemoval({
      sourceImageUrl,
      renderId,
      purpose,
      sourceWidth,
      sourceHeight,
    });
  } catch (error) {
    throw new RemoveBackgroundFailedError(
      `remove-background: FAL mask request failed (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  if (removalResult.kind === "buffer") {
    throw new RemoveBackgroundFailedError(
      "remove-background: direct buffer result is not supported — mask URL required",
    );
  }

  if (removalResult.kind !== "mask_url") {
    throw new RemoveBackgroundFailedError(
      "remove-background: provider returned unsupported result kind",
    );
  }

  let maskBuffer: Buffer;
  try {
    const fetched = await fetchImageBuffer(removalResult.maskUrl, { timeoutMs: 30_000 });
    maskBuffer = fetched.buffer;
  } catch (error) {
    throw new RemoveBackgroundFailedError(
      `remove-background: failed to fetch FAL mask (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  if (maskBuffer.length === 0) {
    throw new RemoveBackgroundFailedError("remove-background: FAL mask is empty");
  }

  let transparentBuffer: Buffer;
  try {
    transparentBuffer = await applyMaskToOriginal(originalBuffer, maskBuffer);
  } catch (error) {
    if (error instanceof MaskCompositeError) {
      throw new RemoveBackgroundFailedError(error.message);
    }
    throw error;
  }

  let alphaVerification: PngAlphaVerificationResult;
  try {
    alphaVerification = assertPngDimensionsMatch(transparentBuffer, {
      width: sourceWidth,
      height: sourceHeight,
    });
  } catch (error) {
    if (
      error instanceof PngDimensionMismatchError
      || error instanceof PngTransparencyVerificationError
    ) {
      throw new RemoveBackgroundFailedError(error.message);
    }
    throw error;
  }

  logger.info(
    {
      renderId,
      purpose,
      sourceWidth,
      sourceHeight,
      outputWidth: alphaVerification.width,
      outputHeight: alphaVerification.height,
      transparentPixelCount: alphaVerification.transparentPixelCount,
    },
    "remove-background: resolution-preserving transparent PNG produced",
  );

  return {
    buffer: transparentBuffer,
    sourceWidth,
    sourceHeight,
    alphaVerification,
  };
}

export function isRemoveBackgroundFailedError(
  error: unknown,
): error is RemoveBackgroundFailedError {
  return error instanceof RemoveBackgroundFailedError;
}
