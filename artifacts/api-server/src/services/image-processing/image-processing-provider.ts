// ---------------------------------------------------------------------------
// ImageProcessingProvider — facade for post-render image utilities
//
// TransparentDownloadService calls this layer — never a concrete engine directly.
//
// Future capabilities (stubs reserved in the interface, not implemented):
//   upscaleImage(), denoiseImage(), generateMask(), colourMatch(), exportPsd()
// ---------------------------------------------------------------------------

import type { BackgroundRemovalProvider } from "./background-removal-provider.js";
import type { BackgroundRemovalInput, BackgroundRemovalResult } from "./types.js";

export interface ImageProcessingProvider {
  readonly backgroundRemoval: BackgroundRemovalProvider;

  /** Remove background from an editorial render → transparent PNG. */
  processBackgroundRemoval(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult>;
}

export function createImageProcessingProvider(
  backgroundRemoval: BackgroundRemovalProvider,
): ImageProcessingProvider {
  return {
    backgroundRemoval,
    processBackgroundRemoval(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult> {
      return backgroundRemoval.processBackgroundRemoval(input);
    },
  };
}
