// ---------------------------------------------------------------------------
// StudioLayer AI — Studio Background Authority (global Create SoT)
//
// Single canonical background contract for every fresh production Create path.
// Lighting, pose, garment, and furniture layers must not reinterpret background
// colour. Pose Master illustration tones are never authoritative for background.
// ---------------------------------------------------------------------------

/** Authoritative V1 studio background block — mandatory pure white. */
export const STUDIO_BACKGROUND_AUTHORITY_SOT = `BACKGROUND AUTHORITY — PURE WHITE (NON-NEGOTIABLE):
Every output must use a pure white seamless studio background (#FFFFFF) — clean, uniform, and immediately usable for fashion e-commerce and catalogue presentation.
The background plane itself must remain white. Do NOT substitute grey, gray, cream, beige, off-white, tinted, gradient, or intentionally coloured backgrounds.
Do not copy background colour from the Pose Master reference image — pose-illustration backdrop tones are non-authoritative.
No visible cyclorama seams, paper texture, fabric backdrop, environmental scenery, rooms, streets, or lifestyle sets.
Natural contact shadows, subtle floor grounding, and soft tonal variation from professional studio lighting ON the white background are permitted — never remove realistic grounding or contact shadow to flatten the scene.
Other creative layers control subject, pose, garment, furniture, composition, and lighting — they must not override this white-background requirement.`;

/** Short summary for ENVIRONMENT AUTHORITY wrappers (Nano Pro layers). */
export const STUDIO_BACKGROUND_ENVIRONMENT_SUMMARY =
  "Pure white (#FFFFFF) seamless studio background — mandatory. No grey, gray, cream, beige, off-white, tinted, or gradient substitutes.";

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
