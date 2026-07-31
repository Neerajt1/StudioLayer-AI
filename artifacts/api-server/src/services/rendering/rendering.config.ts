// ---------------------------------------------------------------------------
// StudioLayer AI — OpenRouter Rendering Service — Configuration
//
// Single source of truth for the OpenRouter rendering layer.
// No values are hardcoded inside the provider — everything is read from here.
//
// Environment variables:
//   OPENROUTER_API_KEY          Required. User-supplied OpenRouter API key.
//   OR_RENDER_MODEL             Override the default generation model.
//   OR_RENDER_TIMEOUT_MS        Override per-request timeout (ms). Default 90 000.
//   OR_RENDER_RETRY_COUNT       Override retry count. Default 1.
// ---------------------------------------------------------------------------

export const OPENROUTER_RENDERING_CONFIG = {
  /** Provider label — internal only, never surfaced in UI. */
  provider: "openrouter" as const,

  /**
   * Default image-generation model on OpenRouter.
   * google/gemini-3.1-flash-image accepts vision inputs (garment + model)
   * and returns generated images — ideal for fashion photoshoot prompts.
   * Override with OR_RENDER_MODEL if you want to test another model.
   */
  defaultModel:
    process.env["OR_RENDER_MODEL"] ?? "google/gemini-3.1-flash-image",

  /**
   * Wall-clock timeout per provider request (ms).
   * Image generation is slow — default 90 s gives headroom for busy periods.
   */
  timeoutMs: Number(process.env["OR_RENDER_TIMEOUT_MS"] ?? 90_000),

  /**
   * How many times to retry a single shot on transient failure.
   * 1 = one automatic retry, then propagate the error.
   */
  retryCount: Number(process.env["OR_RENDER_RETRY_COUNT"] ?? 1),

  /**
   * Primary instruction sent to the model as the first content part.
   *
   * Reference Image 1 = garment (sent immediately after this text).
   * Reference Image 2 = model   (sent immediately after the garment image).
   *
   * This is the authoritative instruction for virtual try-on generation.
   * Do not modify without reviewing the content-array order in callOpenRouter.
   */
  garmentInstruction: `Reference Image 1 is the garment.

Reference Image 2 is the human model.

Your task is to dress the person shown in Reference Image 2 using the exact garment shown in Reference Image 1.

The uploaded garment is the single source of truth. It must appear in the output exactly as uploaded.

STRUCTURAL ELEMENTS — YOU MUST PRESERVE EVERY ONE OF THESE EXACTLY:

1. Neckline shape — the exact cut and depth of the neckline (V-neck, scoop, square, boat, crew, etc.) must not change in any way.
2. Straps — every strap must be preserved exactly: count, thickness, placement, and attachment point. Do not add, remove, reposition, or narrow any strap.
3. Collar — the collar shape, stand height, and lapel style must not be altered.
4. Sleeves — sleeve type, length, and cut (sleeveless, cap, short, long, balloon, off-shoulder) must be exactly reproduced.
5. Cuffs — cuff style and length must not change.
6. Garment length and hemline — the exact hem position relative to the body must be preserved. Do not shorten or lengthen the garment by even a small amount.
7. Silhouette — the overall outline and drape of the garment (A-line, fitted, relaxed, boxy, flared, etc.) must be maintained.
8. Seam placement — visible seams, darts, and panel lines must appear in the same position as the original.
9. Construction details — buttons, pockets, zippers, drawstrings, belts, ties, and trims must appear as shown.
10. Surface details — colour, fabric texture, prints, patterns, embroidery, logos, graphics, and branding must be reproduced faithfully.

WHAT MUST NEVER CHANGE:
- Do not redesign, reinterpret, alter, replace, or restyle the uploaded garment in any way.
- Do not remove straps or change their position.
- Do not change the neckline depth or shape.
- Do not shorten or lengthen the garment.
- Do not change the sleeve length or type.
- Do not alter the silhouette or overall shape.

ORIENTATION — Reproduce the garment in its exact original left/right orientation as shown in Reference Image 1. Do not flip, mirror, or horizontally reverse the garment for any reason. All asymmetric details — embroidery, prints, logos, button plackets, chest pockets, side slits, off-shoulder drops, and any embellishments — must remain on the same side as the original. If the garment has a logo on the left chest, it must appear on the left chest in the output.

COMPLETE GARMENT REPLACEMENT — CRITICAL FOR BOTTOMS:
When the uploaded garment is jeans, trousers, chinos, shorts, a skirt, or any lower-body garment, you must COMPLETELY replace the corresponding garment on the model. This means:
- The entire waistband must be replaced — no remnants of any previous waistband remain visible.
- The full trouser legs or skirt panels must be replaced from hip to hem — no previous fabric bleeds through.
- Cuffs and hems must be naturally rendered at the correct position.
- The fabric must wrap naturally around the body — it should never appear pasted, composited, or floating.
- Seams along the inner leg, outer leg, crotch, and waistband must read as continuous, natural clothing.
- If the result looks like the garment was digitally pasted onto a different pair of trousers, you have failed.

OUTFIT COMPLETION — When generating complementary clothing to complete the outfit around the uploaded garment, select intentional, fashion-forward pieces that a professional fashion stylist would choose. Never default to a plain grey T-shirt, plain white undershirt, or any generic filler garment as an inner layer or companion piece unless the uploaded garment is structured outerwear (a tailored blazer, coat, or jacket) that physically requires an inner layer. For tops, shirts, and blouses, complete the outfit with styled bottoms and footwear only — do not add any inner layer beneath the uploaded garment.

WHAT MAY VARY NATURALLY:
- Model pose and body position
- Facial expression
- Lighting and shadows cast by the garment
- Background and environment
- Camera angle and framing
- Complementary clothing items (shoes, trousers, skirt) that complete the outfit around the uploaded garment — these must not cover or obscure the uploaded garment in any way

If the uploaded garment represents only part of an outfit (such as a blazer, jacket, shirt, top, skirt or trousers), intelligently generate the remaining clothing so that it naturally complements the uploaded garment while keeping the uploaded garment completely unchanged.

Ignore the hanger, background and any non-garment objects present in Reference Image 1. Use only the garment itself for dressing the model.

Generate a premium commercial fashion photograph suitable for an ecommerce clothing brand with realistic lighting, natural body proportions, accurate garment draping, and a clean professional studio appearance.`,

  /**
   * OpenRouter API base URL.
   * Do not change — uses the user's own OPENROUTER_API_KEY, not the
   * Replit AI Integration managed key (which does not support image generation).
   */
  baseUrl: "https://openrouter.ai/api/v1",
} as const;

/**
 * Build the refinement instruction block appended to the garment instruction
 * when the user requests a change to an already-generated image.
 *
 * Reference Image 3 = previous generated output (provided by the caller).
 */
export function buildRefinementInstruction(refinementPrompt: string): string {
  return `
REFINEMENT MODE — TARGETED EDIT ONLY.

Reference Image 3 is the exact current state of the image. You are editing this existing image — not creating a new one. Treat this like a Photoshop layer operation: touch only the pixels that must change.

THE REQUESTED CHANGE IS: "${refinementPrompt}"

LOCKED — THESE ELEMENTS ARE COMPLETELY FROZEN AND MUST NOT CHANGE UNDER ANY CIRCUMSTANCES:
✗ Model face, skin tone, hair colour, and hairstyle
✗ Model pose, body position, limb placement
✗ Camera angle, framing, and composition
✗ The uploaded garment (Reference Image 1) — every detail: neckline, straps, collar, sleeves, hem length, silhouette, colour, fabric, texture, print, embroidery, buttons, and construction
✗ All complementary outfit items not mentioned in the request
✗ Background (unless the request explicitly asks to change the background)
✗ Overall lighting direction and quality (unless the request explicitly asks to change lighting)
✗ Expression and gaze direction

CHANGE ONLY:
Apply the minimum change necessary to fulfil the request. If ambiguous, choose the most conservative interpretation.

EXAMPLES OF CORRECT BEHAVIOUR:
• Request "Change Background" → only background pixels change; model, garment, pose, lighting are untouched
• Request "Replace Shoes" → only footwear changes; everything else is pixel-identical to Reference Image 3
• Request "Change Lighting" → only light direction/quality changes; garment and model are untouched
• Request "Add Accessories" → add only accessories; nothing else changes
• Request "Replace Shirt" → only the complementary shirt (not the uploaded garment) changes

IMPORTANT: The output must look like Reference Image 3 with one specific element swapped. If the output looks like a new generation, you have failed. The model's face must be recognisably identical to Reference Image 3.`;
}
