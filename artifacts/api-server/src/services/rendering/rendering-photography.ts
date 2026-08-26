// ---------------------------------------------------------------------------
// StudioLayer AI — Photography Authority (Pass D)
//
// Single shared photography source of truth for Hero / Editorial / Campaign.
// Covers: white studio background, fashion presentation, lighting/finish,
// framing presentation defaults, and colour-neutral studio presentation.
//
// Does NOT own garment construction/colour identity (GARMENT_AUTHORITY_SOT),
// pose geometry (Pass B), furniture (Pass C), or mode-specific shot directions.
// ---------------------------------------------------------------------------

/**
 * Shared photography contract appended to every fresh generation.
 * Shot-specific camera/energy remain in HERO / Editorial / Campaign directions.
 */
export const PHOTOGRAPHY_AUTHORITY_SOT = `PHOTOGRAPHY:
Pure white (#FFFFFF) seamless studio background — no gradients, vignettes, colour casts, texture, or environmental scenery.
Professional fashion-studio presentation: soft neutral lighting, balanced exposure, natural skin tones, high garment visibility, controlled highlights and shadows.
Colour-neutral presentation — background and lighting must not tint, warm, cool, or recolour the garment.
Subtle realistic grounding shadow and natural floor contact; no floating model or garment.
Follow the shot's camera/framing direction; do not invent lifestyle locations or competing props.
Across this generation batch, keep background and lighting setup identical — only pose, camera, expression, and composition may vary.`;

/** @deprecated Use PHOTOGRAPHY_AUTHORITY_SOT — retained for import stability. */
export const RENDERING_PHOTOGRAPHY_INSTRUCTION = `
${PHOTOGRAPHY_AUTHORITY_SOT}`;
