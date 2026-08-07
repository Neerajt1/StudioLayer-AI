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
}

/**
 * Result of a successful background-removal operation.
 * Implementations may return a remote URL or in-memory PNG bytes.
 */
export type BackgroundRemovalResult =
  | { kind: "url"; url: string }
  | { kind: "buffer"; buffer: Buffer; mimeType: "image/png" };

/** Future: upscaleImage(), denoiseImage(), generateMask(), colourMatch(), exportPsd(), … */
