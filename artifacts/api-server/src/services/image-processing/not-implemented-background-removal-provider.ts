// ---------------------------------------------------------------------------
// Background Removal Provider — placeholder (engine not yet integrated)
// ---------------------------------------------------------------------------

import { ImageProcessingNotImplementedError } from "./errors.js";
import type { BackgroundRemovalProvider } from "./background-removal-provider.js";
import type { BackgroundRemovalInput, BackgroundRemovalResult } from "./types.js";

export class NotImplementedBackgroundRemovalProvider implements BackgroundRemovalProvider {
  readonly name = "not-implemented";

  processBackgroundRemoval(_input: BackgroundRemovalInput): Promise<BackgroundRemovalResult> {
    return Promise.reject(new ImageProcessingNotImplementedError("background removal"));
  }
}
