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

The uploaded garment is the primary source of truth.

Preserve the garment exactly as uploaded, including its:

- colour
- texture
- fabric
- stitching
- construction
- silhouette
- proportions
- fit
- collar
- lapels
- sleeves
- cuffs
- buttons
- pockets
- zippers
- branding
- logos
- graphics
- embroidery
- prints
- patterns

Do not redesign, reinterpret, alter, replace, or restyle the uploaded garment in any way.

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
