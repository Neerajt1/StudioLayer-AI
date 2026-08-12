// ---------------------------------------------------------------------------
// StudioLayer AI — OpenRouter Rendering Service — Types
//
// Defines the public contract between RenderingEngine, providers, and callers.
// No FAL / FASHN types here — this layer is independent of the existing pipeline.
// ---------------------------------------------------------------------------

/** Number of images the engine should produce (1, 2, 4 presets or 4–20 Custom Campaign). */
export type ShotCount = number;

/** Input accepted by RenderingEngine.generatePhotoshoot() */
export interface PhotoshootInput {
  /** URL or data-URI of the garment image (the hero product). */
  garmentImageUrl: string;
  /** URL or data-URI of the base model image. */
  modelImageUrl: string;
  /** User-provided creative prompt. The engine will append the fixed quality suffix. */
  prompt: string;
  /** How many distinct output images to produce. */
  shots: ShotCount;
  /**
   * Optional per-shot creative prompts for editorial diversity.
   *
   * When provided (and length === shots), each shot uses perShotPrompts[i]
   * instead of the shared `prompt`.  This enables Editorial mode (shots=4)
   * to generate genuinely different fashion photographs rather than four
   * non-deterministic variations of the same brief.
   *
   * When absent, all shots share the same `prompt` (existing behaviour).
   */
  perShotPrompts?: string[];
  /**
   * Optional per-shot Pose Master visual references (data URIs or URLs).
   * When provided, shot[i] attaches perShotPoseReferenceUrls[i] as
   * Reference Image 3 — BODY POSE ONLY (not identity/garment/styling).
   */
  perShotPoseReferenceUrls?: Array<string | null | undefined>;
  /**
   * URL of the previously generated output image (refinement mode).
   * When set, the provider includes it as Reference Image 3 for visual context.
   */
  previousOutputUrl?: string;
  /**
   * Pre-built refinement instruction to append to the garment instruction.
   * Tells the model exactly what the user wants changed, while preserving everything else.
   */
  refinementInstruction?: string;
  /** Pipeline observability context — diagnostics only, no behavior change. */
  pipelineTrace?: import("../../lib/render-pipeline-observability.js").PipelineTraceContext;
}

/** A single generated image returned by the engine. */
export interface GeneratedImage {
  /** Public URL or data-URI of the generated image. */
  url: string;
  /** 0-based index within this generation batch. */
  index: number;
}

/** Full result returned by RenderingEngine.generatePhotoshoot() */
export interface PhotoshootResult {
  images: GeneratedImage[];
  /** Human-readable provider identifier (never exposed in UI). */
  provider: string;
  /** Model identifier used for this generation (never exposed in UI). */
  model: string;
  /** Wall-clock duration of the generation call(s) in milliseconds. */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Provider interface — any concrete provider must implement this.
// ---------------------------------------------------------------------------

/** Input passed from RenderingEngine down to a provider. */
export interface ProviderInput {
  garmentImageUrl: string;
  modelImageUrl: string;
  /** Final prompt — already includes the fixed quality suffix. */
  prompt: string;
  shots: ShotCount;
  /**
   * Optional per-shot creative prompts for editorial diversity.
   * When provided and length === shots, shot[i] uses perShotPrompts[i].
   */
  perShotPrompts?: string[];
  /**
   * Optional per-shot Pose Master visual references (data URIs or URLs).
   * When provided, shot[i] attaches perShotPoseReferenceUrls[i] as
   * Reference Image 3 — BODY POSE ONLY.
   */
  perShotPoseReferenceUrls?: Array<string | null | undefined>;
  /** Previous output image URL for refinement (Reference Image 3). */
  previousOutputUrl?: string;
  /** Pre-built refinement instruction appended to the garment instruction. */
  refinementInstruction?: string;
  /** Pipeline observability context — diagnostics only, no behavior change. */
  pipelineTrace?: import("../../lib/render-pipeline-observability.js").PipelineTraceContext;
}

/** Contract every rendering provider must satisfy. */
export interface RenderingProvider {
  readonly name: string;
  readonly model: string;
  generate(input: ProviderInput): Promise<GeneratedImage[]>;
}
