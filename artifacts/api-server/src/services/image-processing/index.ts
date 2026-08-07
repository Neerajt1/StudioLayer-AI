// ---------------------------------------------------------------------------
// Image processing — public entry point
// ---------------------------------------------------------------------------

export {
  FeatureTemporarilyUnavailableError,
  ImageProcessingNotImplementedError,
  isFeatureTemporarilyUnavailableError,
  isImageProcessingNotImplementedError,
} from "./errors.js";

export type { BackgroundRemovalProvider } from "./background-removal-provider.js";
export type { BackgroundRemovalInput, BackgroundRemovalResult } from "./types.js";

export {
  createImageProcessingProvider,
  type ImageProcessingProvider,
} from "./image-processing-provider.js";

export { NotImplementedBackgroundRemovalProvider } from "./not-implemented-background-removal-provider.js";

import { createImageProcessingProvider } from "./image-processing-provider.js";
import { BirefNetBackgroundRemovalProvider } from "./birefnet-background-removal-provider.js";
import { NotImplementedBackgroundRemovalProvider } from "./not-implemented-background-removal-provider.js";
import type { ImageProcessingProvider } from "./image-processing-provider.js";

let cachedProvider: ImageProcessingProvider | null = null;

function createDefaultBackgroundRemovalProvider() {
  if (process.env["FAL_KEY"]) {
    return new BirefNetBackgroundRemovalProvider();
  }
  return new NotImplementedBackgroundRemovalProvider();
}

/**
 * Returns the active ImageProcessingProvider singleton.
 * Swap the background-removal implementation here when an engine is ready.
 */
export function getImageProcessingProvider(): ImageProcessingProvider {
  if (!cachedProvider) {
    cachedProvider = createImageProcessingProvider(
      createDefaultBackgroundRemovalProvider(),
    );
  }
  return cachedProvider;
}

/** Test hook — inject a custom provider without changing production wiring. */
export function setImageProcessingProviderForTests(
  provider: ImageProcessingProvider | null,
): void {
  cachedProvider = provider;
}
