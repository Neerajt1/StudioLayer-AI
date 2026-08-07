// ---------------------------------------------------------------------------
// StudioLayer AI — Rendering Layer Types (SL-017)
//
// Shared types for the Render Orchestrator, strategies, and providers.
// Completely independent of any AI provider implementation.
// ---------------------------------------------------------------------------

import type { IntelligenceResult } from "../intelligence";
import type { StyleTemplate } from "../data/base-model-library";

export type { StyleTemplate };

// ---------------------------------------------------------------------------
// Render Mode
// ---------------------------------------------------------------------------

/**
 * Rendering mode controls which strategy the orchestrator selects.
 *
 * STANDARD — always use StandardRenderingStrategy (production-safe baseline).
 * HYBRID   — always use HybridRenderingStrategy (FLUX + FASHN).
 * AUTO     — orchestrator decides based on feature flags and provider health.
 *            Currently resolves to STANDARD; will activate HYBRID once validated.
 */
export type RenderMode = "STANDARD" | "HYBRID" | "AUTO";

// ---------------------------------------------------------------------------
// FASHN category — the three values fal-ai/fashn/tryon/v1.6 accepts
// ---------------------------------------------------------------------------

export type FashnCategory = "tops" | "bottoms" | "one-pieces";

/**
 * Maps an Intelligence Engine GarmentCategory to a FASHN V1.6 category.
 * tops / outerwear / footwear / accessories → "tops"
 * bottoms                                   → "bottoms"
 * one-pieces                                → "one-pieces"
 */
export function mapToFashnCategory(intelligenceCategory: string): FashnCategory {
  if (intelligenceCategory === "bottoms")    return "bottoms";
  if (intelligenceCategory === "one-pieces") return "one-pieces";
  return "tops";
}

// ---------------------------------------------------------------------------
// Rendering Request — raw inputs from the API route / ai-pipeline entry point
// ---------------------------------------------------------------------------

export interface RenderingRequest {
  renderId: number;
  sourceImageUrl: string;
  modelGender?: string | null;
  modelAgeRange?: string | null;
  modelPose?: string | null;
  garmentPlacement?: string | null;
  /** Full Outfit length selection — "auto" or manual override. */
  garmentLengthSelection?: string | null;
  modelIdentityId?: string | null;
  /** Optional override of the global RENDERING_CONFIG.renderMode. */
  renderMode?: RenderMode;
  /**
   * Complete the Look style selection from the UI (SL-018B).
   * One of: ai_recommended | formal | business_casual | casual | denim |
   *         streetwear | ethnic | sportswear | none
   * When present and not "none", the PromptComposer uses the outfit
   * specification from the Outfit Style Override module instead of the
   * Intelligence Engine's own recommendation.
   */
  outfitStyle?: string | null;
}

// ---------------------------------------------------------------------------
// Model Image Context — describes how the model image was selected (SL-016)
// ---------------------------------------------------------------------------

export type ModelImageSource =
  | "identity_override"
  | "base_model_selector"
  | "attribute_routing_fallback";

export interface ModelImageContext {
  imageUrl: string;
  source: ModelImageSource;
  baseModelId: string | null;
  identityId: string | null;
  identityOverride: boolean;
  fallbackReason: string | null;
  selectionDurationMs: number;
}

// ---------------------------------------------------------------------------
// Orchestrator Context — fully resolved rendering context built by orchestrator
// before handing off to a strategy. Strategies never call the Intelligence
// Engine or perform model selection; they receive a complete context.
// ---------------------------------------------------------------------------

export interface OrchestratorContext {
  renderId: number;
  request: RenderingRequest;
  /** Full intelligence engine output including garment profile, outfit recommendation, and prompt. */
  intelligenceResult: IntelligenceResult;
  /** Transparent PNG garment cutout from BirefNet preprocessing. */
  garmentImageUrl: string;
  /** Full model image selection context (SL-016 logging). */
  modelImageContext: ModelImageContext;
  /** Resolved model image URL (convenience accessor for modelImageContext.imageUrl). */
  modelImageUrl: string;
  /** FASHN V1.6 category derived from intelligenceResult.profile.category. */
  category: FashnCategory;
  /** Style template derived from intelligenceResult.recommendation.styleMode. */
  styleTemplate: StyleTemplate;
  /** Milliseconds taken to prepare this context (BirefNet + Intelligence + Model selection). */
  preparationDurationMs: number;
}

// ---------------------------------------------------------------------------
// Strategy Result — what a rendering strategy returns to the orchestrator
// ---------------------------------------------------------------------------

export interface StrategyResult {
  outputImageUrl: string;
  /** The fal.ai model ID actually used for the final try-on step. */
  fashnModelUsed: string;
  fashnLatencyMs: number;
  /** Null for StandardRenderingStrategy; populated for HybridRenderingStrategy. */
  fluxLatencyMs: number | null;
  /** True if the scene was served from the SceneCache (Hybrid only). */
  cacheHit: boolean;
  /** SHA-256 prompt hash used as cache key (Hybrid only; null for Standard). */
  promptHash: string | null;
  /** Set when an internal fallback was triggered (e.g. FASHN V1.6 → image-apps-v2). */
  fallbackReason: string | null;
}

// ---------------------------------------------------------------------------
// Rendering Result — what the orchestrator returns to the caller
// ---------------------------------------------------------------------------

export interface RenderingResult {
  outputImageUrl: string;
  /** Name of the strategy that produced the final render. */
  strategyUsed: string;
  /** Name of the scene generation provider used (Hybrid only; null for Standard). */
  providerUsed: string | null;
  cacheHit: boolean;
  promptHash: string | null;
  fluxLatencyMs: number | null;
  fashnLatencyMs: number;
  /** Total wall-clock duration from orchestrate() call to output URL. */
  totalDurationMs: number;
  /** Time taken to select the strategy (<10ms target per Part 15). */
  strategySelectionMs: number;
  /** Reason a strategy was downgraded to a fallback, if applicable. */
  fallbackReason: string | null;
}
