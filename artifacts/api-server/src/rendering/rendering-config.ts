// ---------------------------------------------------------------------------
// StudioLayer AI — Rendering Configuration (SL-017)
//
// Single source of truth for all rendering tuning knobs.
// Strategies and providers read from here — never from scattered constants.
//
// Environment variables:
//   RENDER_MODE                  "STANDARD" | "HYBRID" | "AUTO"  (default: "AUTO")
//   HYBRID_RENDERING_ENABLED     "true" to enable Hybrid strategy (default: false)
//   SCENE_CACHE_ENABLED          "false" to disable scene caching  (default: true)
// ---------------------------------------------------------------------------

import type { RenderMode } from "./types";
export type { RenderMode };

// ---------------------------------------------------------------------------
// Master rendering configuration
// ---------------------------------------------------------------------------

export const RENDERING_CONFIG = {
  /**
   * Active render mode.
   * AUTO currently resolves to STANDARD — safe production default.
   * Once HybridRenderingStrategy is validated, set RENDER_MODE=HYBRID or flip
   * HYBRID_RENDERING_ENABLED=true to graduate AUTO → HYBRID.
   */
  renderMode: (process.env["RENDER_MODE"] as RenderMode | undefined) ?? "AUTO",

  hybrid: {
    /**
     * Master feature flag for HybridRenderingStrategy.
     * Must be explicitly set to "true" in environment to enable.
     * All other config is irrelevant when this is false.
     */
    enabled: process.env["HYBRID_RENDERING_ENABLED"] === "true",

    /** fal.ai model ID for scene generation Stage 1. Swap to "fal-ai/flux/dev" for quality tier. */
    fluxModel: "fal-ai/flux/schnell" as const,

    /** Hard timeout for FLUX scene generation. Triggers fallback to Standard if exceeded. */
    fluxTimeoutMs: 15_000,

    /** When false, every request generates a fresh scene even with an identical prompt. */
    cacheEnabled: process.env["SCENE_CACHE_ENABLED"] !== "false",

    /** Cache TTL in ms — 24 hours. Identical outfit prompts reuse the scene for a full day. */
    cacheTtlMs: 24 * 60 * 60 * 1000,

    /** Maximum number of cached scenes. Oldest entry evicted (LRU) when this is reached. */
    cacheMaxSize: 500,
  },

  performance: {
    /** Target strategy selection time (ms). Measured and logged per Part 11. */
    strategySelectionTargetMs: 10,
    /** FLUX generation target. Alert if exceeded. */
    fluxTargetMs: 6_000,
    /** FASHN rendering target. Alert if exceeded. */
    fashnTargetMs: 25_000,
    /** End-to-end total render target. */
    totalTargetMs: 30_000,
  },
} as const;

// ---------------------------------------------------------------------------
// FASHN V1.6 Configuration (SL-011A — moved from ai-pipeline.ts to SL-017)
//
// Official V1.6 reference: https://fal.ai/models/fal-ai/fashn/tryon/v1.6/api
// ---------------------------------------------------------------------------

export const FASHN_CONFIG = {
  /** "quality" = highest output fidelity, slower processing. */
  mode: "quality" as const,

  /**
   * false = body-part segmentation ENABLED (highest-impact V1.6 parameter).
   * Gives the model explicit torso/arm/leg zone boundaries — improves garment
   * boundary accuracy and reduces reference-clothing bleed-through.
   */
  segmentation_free: false,

  /**
   * "auto" = let V1.6 classify the garment image type.
   * After BirefNet the garment is a transparent PNG cutout, not a flat-lay,
   * so auto-detection is more accurate than hard-coding "flat-lay".
   */
  garment_photo_type: "auto" as const,

  /** Lossless output — preserves stitching, logos, embroidery, fine fabric texture. */
  output_format: "png" as const,

  num_samples: 1,

  /**
   * undefined = random seed (default). Set to a fixed integer to reproduce
   * results during A/B testing, e.g. seed: 42.
   */
  seed: undefined as number | undefined,
} satisfies {
  mode: "performance" | "balanced" | "quality";
  segmentation_free: boolean;
  garment_photo_type: "auto" | "model" | "flat-lay";
  output_format: "png" | "jpeg";
  num_samples: number;
  seed: number | undefined;
};

/** Primary FASHN try-on model (fal.ai). */
export const FASHN_PRIMARY_MODEL = "fal-ai/fashn/tryon/v1.6" as const;

/**
 * Emergency fallback try-on model.
 * Used when FASHN_PRIMARY_MODEL call fails — preserves 100% render success rate.
 */
export const FASHN_FALLBACK_MODEL = "fal-ai/image-apps-v2/virtual-try-on" as const;
