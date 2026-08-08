// ---------------------------------------------------------------------------
// StudioLayer AI — Identity Protection (Batch 22 / 22A)
//
// Applies only to Enhance Model Face. Complements — does not replace —
// the Refinement Preservation Contract (Batch 21A).
//
// Batch 22A strengthens the Identity Lock with Expression Preservation.
// ---------------------------------------------------------------------------

import type { RefinementType } from "./refinement-types.js";

/** Identity lock block injected into Enhance Model Face prompts before OpenRouter. */
export const FACE_IDENTITY_PROTECTION_BLOCK = `
IDENTITY PROTECTION — ENHANCE MODEL FACE (MANDATORY):

A face enhancement improves the photograph — it must NEVER replace the person.
The output must look like the same individual photographed by a better camera, not a different model.
Preserve the person's identity exactly. Improve quality only.

IDENTITY LOCK — preserve exactly:
Face shape, eyes, eye spacing, eye colour, nose, lips, jawline, cheek structure, eyebrows, ears,
skin tone, hairstyle, hair colour, hair length, age appearance, ethnicity, and overall facial proportions.
The refined image must clearly depict the same individual.

ALLOWED IMPROVEMENTS ONLY (subtle and realistic):
Facial sharpness, skin detail, skin texture, eye clarity, natural lighting, fine facial detail,
natural contrast, image clarity, resolution perception.

NEVER INTRODUCE:
A different face, different eyes, nose, lips, jawline, hairstyle, hair colour, age, or ethnicity.
Makeup that was not present, facial accessories, facial hair, cosmetic surgery effects, or beauty filter appearance.
The output must never resemble another person.
Do not alter facial structure. Do not change facial proportions. Do not apply beauty filters.

CONSERVATIVE ENHANCEMENT:
If the face already has high quality, apply only minimal enhancement.
Never force visible changes simply because refinement was requested.
Prefer a small improvement over a large unnecessary modification.

VALIDATION — every output must satisfy:
Same person · Same hairstyle · Same skin tone · Same facial proportions · Same age appearance ·
Same expression · Same emotion · Same gaze · Same head orientation · Better quality (sharpness, detail, skin, lighting only).
If any attribute cannot be preserved, fall back to minimal enhancement rather than speculative changes.

The person before refinement and after refinement must be unmistakably the same individual,
with only subtle, professional-quality enhancements.`;

/** Batch 22A — expression and emotional tone lock for Enhance Model Face. */
export const FACE_EXPRESSION_PRESERVATION_BLOCK = `
EXPRESSION PRESERVATION — ENHANCE MODEL FACE (MANDATORY):

Preserve the subject's original facial expression exactly. Preserve emotional tone.
The refined image must communicate the same emotion as the original photograph.
Improve only facial quality — do not introduce a different expression.

PRESERVE EXACTLY:
Facial expression, emotional tone, smile intensity, mouth position, eye openness,
eyebrow position, head orientation, and gaze direction.

NEVER INTRODUCE:
A new smile, bigger smile, smaller smile, serious-to-smiling, smiling-to-serious,
closed mouth to open mouth, open mouth to closed mouth, different gaze direction,
different head tilt, or a different emotional appearance.

Unless correcting a clear rendering artifact, the original expression must remain unchanged.

CONSERVATIVE RULE:
If the expression is already natural, leave it unchanged.
Prefer better quality over a different emotion.`;

/** Pose and composition lock for all OpenRouter refinements. */
export const REFINEMENT_POSE_PRESERVATION_BLOCK = `
POSE & COMPOSITION PRESERVATION — ALL REFINEMENTS (MANDATORY):

Reference Image 2 is the authoritative photograph. Refinement is an EDIT, not a regeneration.

Preserve pixel-identically from Reference Image 2:
- Model body position, stance, and pose
- Hand and arm placement — never move hands into pockets unless already there in Reference Image 2
- Leg and foot placement
- Camera angle, framing, crop, and composition
- Overall lighting direction (except Remove Background)

The output must look like Reference Image 2 with only the approved refinement applied.
If the output appears to be a new photoshoot or different pose, you have failed.`;

/** Combined identity + expression protection for Enhance Model Face. */
export const FACE_IDENTITY_AND_EXPRESSION_PROTECTION = [
  FACE_IDENTITY_PROTECTION_BLOCK,
  FACE_EXPRESSION_PRESERVATION_BLOCK,
].join("\n\n");

/** Whether Identity Protection applies to this refinement type. */
export function refinementRequiresIdentityProtection(type: RefinementType): boolean {
  return type === "enhance_model_face";
}

/**
 * Appends Identity Protection to a composed refinement instruction when applicable.
 * Called centrally from composeRefinementInstruction() — after task instruction,
 * before the preservation policy block and platform contract.
 */
export function appendIdentityProtectionIfRequired(
  type: RefinementType,
  instruction: string,
): string {
  if (!refinementRequiresIdentityProtection(type)) {
    return instruction;
  }

  return [instruction.trim(), FACE_IDENTITY_AND_EXPRESSION_PROTECTION].join("\n\n");
}
