// ---------------------------------------------------------------------------
// StudioLayer AI — Scene Provider Interface (SL-017, Part 5)
//
// Provider abstraction layer for scene generation.
//
// The orchestrator and strategies depend ONLY on this interface.
// No provider-specific code (FLUX, SDXL, Midjourney, etc.) may appear
// outside the artifacts/api-server/src/rendering/providers/ directory.
//
// To add a new provider:
//   1. Create rendering/providers/{name}-provider.ts
//   2. Implement SceneProvider
//   3. Register in render-orchestrator.ts
//   Zero changes to strategies or orchestrator logic required.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Provider Health
// ---------------------------------------------------------------------------

/**
 * Three-state health signal for a scene generation provider.
 *
 * healthy     — nominal; use as primary provider.
 * slow        — degraded performance; usable but may breach latency targets.
 * unavailable — do not attempt; immediately skip to next provider or strategy.
 */
export type ProviderHealth = "healthy" | "slow" | "unavailable";

// ---------------------------------------------------------------------------
// Scene Generation Input / Output
// ---------------------------------------------------------------------------

export interface SceneGenerationInput {
  /** Full natural language scene prompt (from PromptComposer). */
  prompt: string;
  /** Optional fixed seed for reproducible generation. */
  seed?: number;
  /**
   * Optional inference step count override.
   * FLUX.1-schnell default is 4; FLUX.1-dev default is 28.
   */
  numInferenceSteps?: number;
}

export interface SceneGenerationResult {
  /** Absolute HTTPS URL of the generated scene image. */
  imageUrl: string;
  /** Wall-clock latency of the generation call in ms. */
  latencyMs: number;
  /** Provider name (matches SceneProvider.name). */
  provider: string;
}

// ---------------------------------------------------------------------------
// Cost Estimate
// ---------------------------------------------------------------------------

export interface CostEstimate {
  /** Estimated USD cost per generation call. */
  estimatedUsd: number;
  /** Human-readable explanation (model name, resolution, etc.). */
  description: string;
}

// ---------------------------------------------------------------------------
// SceneProvider interface
// ---------------------------------------------------------------------------

/**
 * Every scene generation provider must implement this interface.
 *
 * generateScene  — generate a complete styled fashion scene from a text prompt.
 * health         — report current operational status.
 * costEstimate   — return the estimated USD cost per call.
 *
 * Providers are selected by the orchestrator based on health and configuration.
 * The orchestrator must never call any provider directly — only through this interface.
 */
export interface SceneProvider {
  /** Stable identifier matching the underlying model ID. */
  readonly name: string;

  /** Generate a complete fashion scene from the given prompt. May throw on failure. */
  generateScene(input: SceneGenerationInput): Promise<SceneGenerationResult>;

  /** Report current health status. Should resolve quickly (< 100 ms). */
  health(): Promise<ProviderHealth>;

  /** Return cost estimate for a single generation call. Synchronous. */
  costEstimate(input: SceneGenerationInput): CostEstimate;
}
