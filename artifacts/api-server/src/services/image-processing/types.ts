// ---------------------------------------------------------------------------
// Image processing — shared types
//
// Provider-agnostic contracts for post-render image utilities.
// No Fal, OpenRouter, or third-party assumptions.
// ---------------------------------------------------------------------------

/** Input shared by background-removal operations. */
export interface BackgroundRemovalInput {
  /** Source editorial image URL (typically renders.outputImageUrl). */
  sourceImageUrl: string;
  renderId: number;
  purpose?: string;
  /** Original pixel width — used to select FAL operating resolution. */
  sourceWidth?: number;
  /** Original pixel height — used to select FAL operating resolution. */
  sourceHeight?: number;
}

/**
 * Result of a successful background-removal mask request.
 * FAL returns a segmentation mask only — never the final composited asset.
 */
export type BackgroundRemovalResult =
  | { kind: "mask_url"; maskUrl: string }
  | { kind: "buffer"; buffer: Buffer; mimeType: "image/png" };

/** Future: upscaleImage(), denoiseImage(), generateMask(), colourMatch(), exportPsd(), … */
