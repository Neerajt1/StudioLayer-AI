// ---------------------------------------------------------------------------
// Background Removal Provider — interface
//
// Pluggable engines (self-hosted worker, rembg, BiRefNet ONNX, commercial API, …)
// implement this contract without changing TransparentDownloadService or routes.
// ---------------------------------------------------------------------------

import type { BackgroundRemovalInput, BackgroundRemovalResult } from "./types.js";

export interface BackgroundRemovalProvider {
  readonly name: string;

  /** Remove the background and return a transparent PNG representation. */
  processBackgroundRemoval(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult>;
}
