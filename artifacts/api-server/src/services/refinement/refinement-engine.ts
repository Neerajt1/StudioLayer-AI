// ---------------------------------------------------------------------------
// StudioLayer AI — Reliable Refine Engine (Batch 21 / 21A / 22)
//
// V1 exposes exactly three AI refinements. Each consumes 1 Studio Credit.
// Batch 21A: Preservation Contract via composeRefinementInstruction().
// Batch 22: Identity Protection for Enhance Model Face (complements contract).
//
// Pipeline (Enhance Model Face):
//   Original → Enhance Model Face → Identity Lock → Contract → OpenRouter
// ---------------------------------------------------------------------------

import {
  composeRefinementInstruction,
} from "./refinement-preservation-contract.js";
import {
  isRefinementType,
  type RefinementType,
  V1_REFINEMENT_TYPES,
} from "./refinement-types.js";

export type { RefinementType } from "./refinement-types.js";
export { V1_REFINEMENT_TYPES, isRefinementType } from "./refinement-types.js";

export interface RefinementBrief {
  type: RefinementType;
  /** Human label for logs — never surfaced as marketing copy in UI. */
  label: string;
  /** When false, the pipeline uses image processing (BirefNet) instead of OpenRouter. */
  usesOpenRouter: boolean;
  instruction: string;
}

const REFINEMENT_LABELS: Record<RefinementType, string> = {
  remove_background:  "Remove Background",
  enhance_model_face: "Enhance Model Face",
  enhance_garment:    "Enhance Garment",
};

/** Map legacy refinementPrompt button text to V1 types (backward compat). */
const PROMPT_TO_TYPE: Record<string, RefinementType> = {
  "remove background":  "remove_background",
  "enhance model face": "enhance_model_face",
  "enhance face":       "enhance_model_face",
  "enhance garment":    "enhance_garment",
};

/**
 * Validation Rules — reject unknown or legacy experimental refinements.
 */
export function resolveRefinementType(input: {
  refinementType?: string | null;
  refinementPrompt?: string | null;
}): RefinementType | null {
  if (input.refinementType && isRefinementType(input.refinementType)) {
    return input.refinementType;
  }

  if (input.refinementPrompt) {
    const normalized = input.refinementPrompt.trim().toLowerCase();
    return PROMPT_TO_TYPE[normalized] ?? null;
  }

  return null;
}

export function assertValidRefinementRequest(input: {
  parentRenderId?: number | null;
  refinementType?: string | null;
  refinementPrompt?: string | null;
}): RefinementType {
  if (!input.parentRenderId) {
    throw new RefinementValidationError("parentRenderId is required for refinements");
  }

  const type = resolveRefinementType(input);
  if (!type) {
    throw new RefinementValidationError(
      "Unsupported refinement. V1 supports: remove_background, enhance_model_face, enhance_garment",
    );
  }

  return type;
}

export class RefinementValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefinementValidationError";
  }
}

/** Task-specific instruction — preservation rules appended centrally by composeRefinementInstruction. */
function buildRemoveBackgroundTaskInstruction(): string {
  return [
    "REMOVE BACKGROUND — targeted operation only:",
    "Remove only the studio background from Reference Image 3 (the current generated image).",
    "Output a transparent PNG with original image dimensions, resolution, aspect ratio, and framing preserved.",
    "The white background alone becomes fully transparent.",
  ].join(" ");
}

function buildEnhanceFaceTaskInstruction(): string {
  return [
    "ENHANCE MODEL FACE — professional beauty retouching quality improvement only.",
    "Reference Image 3 is the exact current state — the person to preserve.",
    "Improve photograph quality as if shot with a better camera: facial sharpness, skin detail and texture,",
    "eye clarity, natural lighting, fine facial detail, natural contrast, and image clarity.",
    "Apply conservative, subtle enhancement — minimal change if quality is already high.",
    "Preserve the subject's original facial expression, emotional tone, gaze direction, and head orientation exactly.",
    "Improve only facial quality — do not introduce a different expression.",
    "The output must clearly depict the same individual — enhancement, never replacement.",
  ].join(" ");
}

function buildEnhanceGarmentTaskInstruction(): string {
  return [
    "ENHANCE GARMENT — targeted realism improvement only.",
    "Reference Image 3 is the exact current state.",
    "Improve: texture clarity, stitch definition, natural wrinkle quality, fabric detail, material realism, edge sharpness.",
    "Objective: improve how convincingly the garment is photographed — never what the garment is.",
  ].join(" ");
}

function buildTaskInstruction(type: RefinementType): string {
  switch (type) {
    case "remove_background":
      return buildRemoveBackgroundTaskInstruction();
    case "enhance_model_face":
      return buildEnhanceFaceTaskInstruction();
    case "enhance_garment":
      return buildEnhanceGarmentTaskInstruction();
    default: {
      const _exhaustive: never = type;
      throw new RefinementValidationError(`Unknown refinement type: ${_exhaustive}`);
    }
  }
}

/**
 * Builds the full refinement instruction with the Preservation Contract appended.
 * Single entry point for all refinement prompts sent to OpenRouter.
 */
export function buildRefinementBrief(type: RefinementType): RefinementBrief {
  const usesOpenRouter = type !== "remove_background";
  const taskInstruction = buildTaskInstruction(type);

  return {
    type,
    label: REFINEMENT_LABELS[type],
    usesOpenRouter,
    instruction: composeRefinementInstruction(type, taskInstruction),
  };
}

// Re-export contract utilities for future refinement registration.
export {
  composeRefinementInstruction,
  getRefinementPreservationPolicy,
  DEFAULT_REFINEMENT_PRESERVATION_POLICY,
  REFINEMENT_PRESERVATION_CONTRACT,
  refinementHasDeclaredPolicy,
} from "./refinement-preservation-contract.js";
export type { RefinementPreservationPolicy } from "./refinement-preservation-contract.js";
export {
  FACE_IDENTITY_PROTECTION_BLOCK,
  FACE_EXPRESSION_PRESERVATION_BLOCK,
  FACE_IDENTITY_AND_EXPRESSION_PROTECTION,
  appendIdentityProtectionIfRequired,
  refinementRequiresIdentityProtection,
} from "./refinement-identity-protection.js";
