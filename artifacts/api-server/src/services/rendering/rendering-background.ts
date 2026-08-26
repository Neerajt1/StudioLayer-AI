// ---------------------------------------------------------------------------
// StudioLayer AI — Studio Background Standard (Batch 20 → Pass D)
//
// V1 background mode resolution remains here. Prompt text for white-studio
// photography now lives in PHOTOGRAPHY_AUTHORITY_SOT (rendering-photography.ts).
// ---------------------------------------------------------------------------

import {
  PHOTOGRAPHY_AUTHORITY_SOT,
  RENDERING_PHOTOGRAPHY_INSTRUCTION,
} from "./rendering-photography.js";

/** Active background modes — only pure_white_studio is used in V1 generation. */
export type StudioBackgroundMode =
  | "pure_white_studio"
  | "transparent_png"
  | "luxury_editorial"
  | "lifestyle"
  | "ai_scene";

/** V1 default and only active generation background. */
export const V1_STUDIO_BACKGROUND_MODE: StudioBackgroundMode = "pure_white_studio";

/**
 * Resolves the photography/background instruction for a generation request.
 * V1: all modes resolve to the shared PHOTOGRAPHY contract.
 */
export function resolveRenderingBackgroundInstruction(
  mode: StudioBackgroundMode = V1_STUDIO_BACKGROUND_MODE,
): string {
  switch (mode) {
    case "pure_white_studio":
    case "transparent_png":
    case "luxury_editorial":
    case "lifestyle":
    case "ai_scene":
      return RENDERING_PHOTOGRAPHY_INSTRUCTION;
    default:
      return RENDERING_PHOTOGRAPHY_INSTRUCTION;
  }
}

/** Authoritative V1 photography/background block (Pass D SoT). */
export const RENDERING_BACKGROUND_INSTRUCTION = resolveRenderingBackgroundInstruction(
  V1_STUDIO_BACKGROUND_MODE,
);

export { PHOTOGRAPHY_AUTHORITY_SOT, RENDERING_PHOTOGRAPHY_INSTRUCTION };
