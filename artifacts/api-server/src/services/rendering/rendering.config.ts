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
   * Fixed suffix appended to every user prompt.
   * Spec §8: pass the prompt almost exactly; append only these four lines.
   */
  promptSuffix: [
    "Preserve garment colour.",
    "Preserve garment texture.",
    "Preserve garment construction.",
    "Commercial fashion photography.",
  ].join("\n"),

  /**
   * OpenRouter API base URL.
   * Do not change — uses the user's own OPENROUTER_API_KEY, not the
   * Replit AI Integration managed key (which does not support image generation).
   */
  baseUrl: "https://openrouter.ai/api/v1",
} as const;
