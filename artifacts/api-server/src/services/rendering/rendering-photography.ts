// ---------------------------------------------------------------------------
// StudioLayer AI — Photography Authority (Pass D)
//
// Single shared photography source of truth for fresh Create generation.
// Background colour is owned by STUDIO_BACKGROUND_AUTHORITY_SOT.
// Covers: fashion presentation, lighting/finish, framing defaults, colour-neutral studio.
//
// Does NOT own garment construction/colour identity (GARMENT_AUTHORITY_SOT),
// pose geometry (Pass B), furniture (Pass C), or mode-specific shot directions.
// ---------------------------------------------------------------------------

import { STUDIO_BACKGROUND_AUTHORITY_SOT } from "./rendering-studio-background-authority.js";

/**
 * Shared photography contract appended to every fresh generation.
 * Shot-specific camera/energy remain in per-shot creative directions.
 */
export const PHOTOGRAPHY_AUTHORITY_SOT = `${STUDIO_BACKGROUND_AUTHORITY_SOT}

PHOTOGRAPHY (lighting and presentation):
Professional fashion-studio presentation: soft neutral lighting, balanced exposure, natural skin tones, high garment visibility, controlled highlights and shadows.
Colour-neutral presentation — background and lighting must not tint, warm, cool, or recolour the garment.
Follow the shot's camera/framing direction; do not invent lifestyle locations or competing props.
Across this generation batch, keep background and lighting setup identical — only pose, camera, expression, and composition may vary.`;

/** @deprecated Use PHOTOGRAPHY_AUTHORITY_SOT — retained for import stability. */
export const RENDERING_PHOTOGRAPHY_INSTRUCTION = `
${PHOTOGRAPHY_AUTHORITY_SOT}`;
