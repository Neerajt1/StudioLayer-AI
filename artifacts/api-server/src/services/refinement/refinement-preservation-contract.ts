// ---------------------------------------------------------------------------
// StudioLayer AI — Refinement Preservation Contract (Batch 21A)
//
// Platform-wide architectural safeguard. Every AI refinement inherits these
// rules automatically — current and future refinements.
//
// Principle: refinements behave like a professional retoucher — improve quality,
// never reinterpret what was photographed.
//
// Central injection point: composeRefinementInstruction()
// ---------------------------------------------------------------------------

import type { RefinementType } from "./refinement-types.js";
import { appendIdentityProtectionIfRequired, REFINEMENT_POSE_PRESERVATION_BLOCK } from "./refinement-identity-protection.js";
import { REFINEMENT_MASTER_ASSET_PRESERVATION } from "../image-architecture/master-asset.js";

/** Declarative policy for a refinement type. Undeclared types inherit defaults. */
export interface RefinementPreservationPolicy {
  /** Attributes this refinement is explicitly permitted to modify. */
  allowedToModify: readonly string[];
  /** Optional extra preservation clauses beyond the platform contract. */
  additionalPreserve?: readonly string[];
  /**
   * Background handling exception.
   * - preserve: background must not change (default)
   * - transparent_png: background replaced with transparency (Remove Background only)
   */
  backgroundMode?: "preserve" | "transparent_png";
}

/**
 * Default contract — applied to every refinement unless a specific attribute
 * appears on that refinement's allowedToModify list.
 */
export const REFINEMENT_PRESERVATION_CONTRACT = `
REFINEMENT PRESERVATION CONTRACT — MANDATORY (NON-NEGOTIABLE):

A refinement may improve quality. It must NEVER reinterpret the image.
Behave like a professional retoucher: make the image better, never different.

1. MODEL IDENTITY — always preserve unless this refinement explicitly targets identity (none do in V1):
Face, eyes, nose, lips, facial proportions, skin tone, hairstyle, and identity.
Never generate a different person.

2. GARMENT — always preserve unless explicitly allowed to modify garment rendering quality only:
Garment design, dimensions, proportions, length, silhouette, construction, neckline, sleeve length, hemline, waist placement, shoulder fit.
Never redesign the garment.

3. MATERIAL — always preserve:
Fabric type, surface finish, matte/gloss level, sheen, weave, texture, fabric weight appearance.
Never reinterpret the material.

4. COLOURS — always preserve:
Primary, secondary, and accent colours; colour balance, saturation, and colour temperature.
No colour shifts.

5. SURFACE DETAILS — always preserve:
Prints, patterns, checks, stripes, logos, embroidery, decorative stitching, trims, labels.
No distortion, stretching, or disappearance.

6. PHOTOGRAPHY — always preserve unless a future refinement is explicitly designed to change one of these:
Pose, camera angle, composition, lighting direction, perspective.

7. BACKGROUND — default: preserve exactly.
Exception: Remove Background replaces background with transparent PNG only.
No other refinement may modify the background.

8. IMAGE DIMENSIONS — always preserve:
Resolution, aspect ratio, crop, and framing.
Exception: Studio Crop Tool (non-AI, client-side only).

9. FOOTWEAR — always preserve unless a future refinement explicitly targets footwear replacement:
Footwear type, style, colour, placement, and visibility state (including intentional barefoot).
Enhance Model Face and Enhance Garment must NEVER add, remove, or change footwear.
Remove Background is a pixel-preserving background operation — it must not alter footwear at all.

The uploaded garment (Reference Image 1) and the current photograph (Reference Image 2)
are the source of truth — preserve them exactly except for the single approved modification.`;

const V1_REFINEMENT_POLICIES: Record<RefinementType, RefinementPreservationPolicy> = {
  remove_background: {
    allowedToModify: ["background only — replace with transparent PNG"],
    backgroundMode: "transparent_png",
    additionalPreserve: [
      "Garment, model, pose, lighting, colours, materials, construction, dimensions, and footwear must remain pixel-faithful.",
      "Only the studio background becomes transparent — nothing else changes.",
    ],
  },
  enhance_model_face: {
    allowedToModify: [
      "skin detail and natural skin texture",
      "eye clarity and catchlights",
      "facial sharpness and fine facial details",
      "natural balanced facial lighting",
    ],
    additionalPreserve: [
      "Identity must remain unmistakably the same individual — enhancement, not replacement.",
      "Pose, body position, limb placement, hand position, camera angle, framing, and composition must remain pixel-identical to Reference Image 2.",
      "Footwear must remain exactly as in Reference Image 2 — same type, style, colour, placement, and visibility (including barefoot if barefoot). Never add or remove footwear.",
    ],
  },
  enhance_garment: {
    allowedToModify: [
      "texture clarity and fabric micro-detail",
      "stitch definition and seam visibility",
      "natural wrinkle quality",
      "material realism and edge sharpness",
      "garment wearability rendering quality",
    ],
    additionalPreserve: [
      "The product must remain exactly the same garment — improve how it is photographed, never what it is.",
      "Pose, body position, limb placement, hand position, camera angle, framing, and composition must remain pixel-identical to Reference Image 2.",
      "Footwear must remain exactly as in Reference Image 2 — same type, style, colour, placement, and visibility (including barefoot if barefoot). Never add or remove footwear.",
    ],
  },
};

/** Default policy for future refinements without an explicit declaration. */
export const DEFAULT_REFINEMENT_PRESERVATION_POLICY: RefinementPreservationPolicy = {
  allowedToModify: [],
  backgroundMode: "preserve",
};

/**
 * Returns the preservation policy for a refinement type.
 * Future refinements without a declared policy inherit the default contract only.
 */
export function getRefinementPreservationPolicy(
  type: RefinementType,
): RefinementPreservationPolicy {
  return V1_REFINEMENT_POLICIES[type] ?? DEFAULT_REFINEMENT_PRESERVATION_POLICY;
}

function buildPolicyBlock(type: RefinementType): string {
  const policy = getRefinementPreservationPolicy(type);

  const allowed = policy.allowedToModify.length
    ? policy.allowedToModify.join("; ")
    : "nothing — quality improvement only within existing pixels; no structural changes";

  const backgroundRule = policy.backgroundMode === "transparent_png"
    ? "Background exception active: replace background with transparent PNG only."
    : "Background: preserve exactly — do not modify.";

  const additional = policy.additionalPreserve?.length
    ? `Additional rules: ${policy.additionalPreserve.join(" ")}`
    : "";

  return [
    "REFINEMENT-SPECIFIC ALLOW LIST:",
    `This refinement MAY modify: ${allowed}.`,
    `This refinement MUST preserve: everything not listed above.`,
    backgroundRule,
    additional,
  ].filter(Boolean).join(" ");
}

/**
 * Central composition — append Identity Protection (face only), policy block,
 * and the platform contract to every refinement instruction before OpenRouter.
 *
 * Pipeline order (Enhance Model Face):
 *   Task instruction → Identity Lock → Allow list → Preservation Contract
 *
 * All current and future refinements should pass through this function.
 */
export function composeRefinementInstruction(
  type: RefinementType,
  taskInstruction: string,
): string {
  const withIdentity = appendIdentityProtectionIfRequired(type, taskInstruction.trim());

  return [
    withIdentity,
    REFINEMENT_POSE_PRESERVATION_BLOCK,
    REFINEMENT_MASTER_ASSET_PRESERVATION,
    buildPolicyBlock(type),
    REFINEMENT_PRESERVATION_CONTRACT,
  ].join("\n\n");
}

/**
 * Validates that a future refinement type has an explicit policy declaration.
 * Returns true when registered; false triggers default-only inheritance (still safe).
 */
export function refinementHasDeclaredPolicy(type: RefinementType): boolean {
  return type in V1_REFINEMENT_POLICIES;
}
