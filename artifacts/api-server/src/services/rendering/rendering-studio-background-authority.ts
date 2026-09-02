// ---------------------------------------------------------------------------
// StudioLayer AI — Studio Background Authority (global Create SoT)
//
// Single canonical background contract for every fresh production Create path.
// Lighting, pose, garment, and furniture layers must not reinterpret background
// colour. Pose Master illustration tones are never authoritative for background.
// ---------------------------------------------------------------------------

/** Authoritative V1 studio background block — mandatory pure white. */
export const STUDIO_BACKGROUND_AUTHORITY_SOT = `BACKGROUND AUTHORITY — PURE WHITE (NON-NEGOTIABLE):
Every output must use a pure white seamless studio background (#FFFFFF / RGB 255,255,255) — clean, uniform, and immediately usable for fashion e-commerce and catalogue presentation.
The empty background plane itself must remain pure #FFFFFF. Do NOT substitute grey, gray, light-grey, near-white, off-white, cream, beige, warm white, cool white, tinted, gradient, or intentionally coloured backgrounds — including soft studio-wall greys that only look "almost white."
Do not copy background colour from the Pose Master reference image — pose-illustration backdrop tones are non-authoritative.
No visible cyclorama seams, paper texture, fabric backdrop, environmental scenery, rooms, streets, or lifestyle sets.
Natural contact shadows and subtle floor grounding under the subject and furniture are permitted and must remain — those local contact regions may darken only where the subject/furniture meet the floor. Do NOT grey-fill, tint, soften, or gradient the background plane itself to simulate lighting. Do NOT brighten, wash out, or recolour the subject, garment, or furniture to achieve a white background.
Other creative layers control subject, pose, garment, furniture, composition, and lighting — they must not override this white-background requirement.`;

/** Short summary for ENVIRONMENT AUTHORITY wrappers (Nano Pro layers). */
export const STUDIO_BACKGROUND_ENVIRONMENT_SUMMARY =
  "Pure white (#FFFFFF / RGB 255,255,255) seamless studio background — mandatory. No grey, gray, cream, beige, off-white, near-white, light-grey, tinted, or gradient substitutes. Contact shadows may remain under subject/furniture only.";

/**
 * Closing reinforcement for Stage-1 briefs — last-word pixel precision.
 * Reuses the same SoT; does not invent a parallel background system.
 */
export const STUDIO_BACKGROUND_PIXEL_PRECISION_CLOSER = `BACKGROUND PIXEL PRECISION — FINAL:
The empty background plane must be pure #FFFFFF (RGB 255,255,255). Near-white, light grey, warm white, cool white, cream, beige, and soft studio-wall gradients are not acceptable for the background plane.
Keep natural contact shadows and floor grounding under the subject and furniture only. Do not alter subject, garment, or furniture brightness or colour to force a white look.`;

/** Append the global background authority to a per-shot creative brief (after images in Flash). */
export function appendStudioBackgroundAuthorityToCreativePrompt(
  creativeShotPrompt?: string | null,
): string {
  const parts = [
    creativeShotPrompt?.trim(),
    STUDIO_BACKGROUND_AUTHORITY_SOT,
  ].filter(Boolean);
  return parts.join("\n\n");
}
