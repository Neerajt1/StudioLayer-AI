// ---------------------------------------------------------------------------
// StudioLayer AI — OpenRouter Rendering Service — Types
//
// Defines the public contract between RenderingEngine, providers, and callers.
// No FAL / FASHN types here — this layer is independent of the existing pipeline.
// ---------------------------------------------------------------------------

/** Number of images the engine should produce. */
export type ShotCount = 1 | 2 | 4 | 8;

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
   * URL of the previously generated output image (refinement mode).
   * When set, the provider includes it as Reference Image 3 for visual context.
   */
  previousOutputUrl?: string;
  /**
   * Pre-built refinement instruction to append to the garment instruction.
   * Tells the model exactly what the user wants changed, while preserving everything else.
   */
  refinementInstruction?: string;
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
  /** Previous output image URL for refinement (Reference Image 3). */
  previousOutputUrl?: string;
  /** Pre-built refinement instruction appended to the garment instruction. */
  refinementInstruction?: string;
}

/** Contract every rendering provider must satisfy. */
export interface RenderingProvider {
  readonly name: string;
  readonly model: string;
  generate(input: ProviderInput): Promise<GeneratedImage[]>;
}
