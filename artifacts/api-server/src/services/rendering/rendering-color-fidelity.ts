// ---------------------------------------------------------------------------
// StudioLayer AI — Color Neutrality & Garment Color Fidelity (Batch 20A)
//
// Prompt-only enhancement: ensures the white studio background never alters
// garment appearance. Reproduce the real garment — not an AI colour interpretation.
//
// Does not modify UI, business logic, billing, pipeline architecture, or
// background modes.
// ---------------------------------------------------------------------------

/**
 * Color neutrality and garment fidelity block appended to every OpenRouter
 * generation request — complements Batch 20 white background standard.
 */
export const RENDERING_COLOR_FIDELITY_INSTRUCTION = `
COLOR NEUTRALITY & GARMENT COLOUR FIDELITY (NON-NEGOTIABLE):

Reproduce the real garment from Reference Image 1 — not an AI interpretation of its colours.
Every output must look as though the garment was photographed in a professionally colour-calibrated fashion studio.

NEUTRAL WHITE BACKGROUND — NO COLOUR CAST:
The pure white studio background must remain completely neutral and must never influence garment appearance.
Never introduce warm colour casts, cool colour casts, blue tint, yellow tint, grey tint, green tint, or magenta tint.
The background must behave like a professionally calibrated commercial photography studio — true neutral white only.

PRESERVE ORIGINAL GARMENT COLOURS EXACTLY:
Preserve the uploaded garment's colours exactly as shown in Reference Image 1.
Never alter primary colours, secondary colours, accent colours, colour saturation, colour temperature, or colour balance.
The generated garment must visually match the uploaded garment — hue, saturation, and brightness faithful to the source.

PRESERVE SURFACE DETAILS WITHOUT DISTORTION:
Accurately preserve all prints, patterns, stripes, checks, florals, logos, embroidery, graphics, text, labels, trims, decorative stitching, and surface textures.
These elements must never fade, shift, distort, stretch, recolour, or change scale relative to the upload.
Maintain exact print alignment, logo placement, and pattern registration.

LIGHTING NEUTRALITY — VISIBILITY WITHOUT COLOUR SHIFT:
Studio lighting must enhance visibility without affecting colour accuracy.
Require: neutral white lighting, accurate white balance, consistent exposure, faithful colour reproduction.
Avoid: warm lighting, cool lighting, golden-hour tones, blue cinematic tones, coloured highlights, or tinted shadows that alter garment colour.

BACKGROUND MUST NOT CONTAMINATE THE GARMENT:
The white background must remain colour-neutral and must never reflect tinted light onto the garment.
Preserve the garment's original colours exactly as uploaded under neutral studio lighting.
Maintain colour accuracy — the product's colours, textures, prints, and construction remain true to Reference Image 1.`;
