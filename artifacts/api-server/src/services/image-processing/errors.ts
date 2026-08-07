// ---------------------------------------------------------------------------
// Image processing — domain errors
// ---------------------------------------------------------------------------

/** Raised when an image-processing capability is architecturally ready but not yet implemented. */
export class ImageProcessingNotImplementedError extends Error {
  readonly code = "IMAGE_PROCESSING_NOT_IMPLEMENTED";

  constructor(capability = "background removal") {
    super(`Image processing capability not implemented: ${capability}`);
    this.name = "ImageProcessingNotImplementedError";
  }
}

/** Raised when transparent PNG download cannot be fulfilled (user-facing). */
export class FeatureTemporarilyUnavailableError extends Error {
  readonly code = "FEATURE_TEMPORARILY_UNAVAILABLE";

  constructor(
    message = "Transparent PNG download is temporarily unavailable. Please try again later.",
  ) {
    super(message);
    this.name = "FeatureTemporarilyUnavailableError";
  }
}

export function isFeatureTemporarilyUnavailableError(
  error: unknown,
): error is FeatureTemporarilyUnavailableError {
  return error instanceof FeatureTemporarilyUnavailableError;
}

export function isImageProcessingNotImplementedError(
  error: unknown,
): error is ImageProcessingNotImplementedError {
  return error instanceof ImageProcessingNotImplementedError;
}
