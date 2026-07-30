// ---------------------------------------------------------------------------
// StudioLayer AI — Render Orchestrator (SL-017, Part 1)
//
// The single entry point for all rendering in StudioLayer.
//
// Responsibilities:
//   1. Receive a RenderingRequest from the pipeline entry point.
//   2. Prepare the OrchestratorContext — BirefNet, Intelligence Engine,
//      and model image selection — all in parallel where independent.
//   3. Select the optimal rendering strategy.
//   4. Execute the strategy with a multi-level fallback chain.
//   5. Return a RenderingResult with full telemetry.
//
// The orchestrator contains NO provider-specific logic.
// Provider-specific logic lives in rendering/providers/.
// Strategy-specific logic lives in rendering/strategies/.
//
// Singleton pattern: use getOrchestrator() to obtain the shared instance.
// The SceneCache is owned by the singleton and persists across requests.
//
// Fallback chain (Part 10):
//   Selected strategy (Hybrid if enabled) → Standard Strategy → Error
//   StandardStrategy internally: FASHN V1.6 → image-apps-v2 → Error
// ---------------------------------------------------------------------------

import { fal }                             from "@fal-ai/client";
import { logger }                           from "../lib/logger";
import { findIdentityById }                 from "../data/identity-library";
import {
  selectBaseModel,
  mapStyleModeToTemplate,
}                                           from "../data/base-model-library";
import {
  runIntelligenceAnalysis,
}                                           from "../intelligence";
import { SceneCache }                       from "./scene-cache";
import { FluxSceneProvider }               from "./providers/flux-provider";
import { StandardRenderingStrategy }       from "./strategies/standard-strategy";
import { HybridRenderingStrategy }         from "./strategies/hybrid-strategy";
import { RENDERING_CONFIG }                from "./rendering-config";
import {
  mapToFashnCategory,
  type RenderingRequest,
  type RenderingResult,
  type OrchestratorContext,
  type ModelImageContext,
  type ModelImageSource,
} from "./types";
import type { RenderingStrategy }          from "./strategies/rendering-strategy";

fal.config({ credentials: process.env["FAL_KEY"] });

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

let _instance: RenderOrchestrator | null = null;

/** Returns the shared orchestrator instance (lazy-initialised). */
export function getOrchestrator(): RenderOrchestrator {
  if (!_instance) _instance = new RenderOrchestrator();
  return _instance;
}

// ---------------------------------------------------------------------------
// RenderOrchestrator
// ---------------------------------------------------------------------------

export class RenderOrchestrator {
  private readonly strategies: RenderingStrategy[];
  private readonly standardStrategy: StandardRenderingStrategy;

  constructor() {
    const cache         = new SceneCache();
    const fluxProvider  = new FluxSceneProvider();

    this.standardStrategy = new StandardRenderingStrategy();

    // Strategy priority order: highest-quality eligible strategy first.
    // canHandle() is evaluated in this order; first truthy result wins.
    this.strategies = [
      new HybridRenderingStrategy(fluxProvider, cache),
      this.standardStrategy,
    ];

    logger.info(
      {
        renderMode:     RENDERING_CONFIG.renderMode,
        hybridEnabled:  RENDERING_CONFIG.hybrid.enabled,
        strategies:     this.strategies.map((s) => s.name),
      },
      "Render Orchestrator: initialised",
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Orchestrates a complete render from raw request to output URL.
   *
   * Steps:
   *   1. Prepare OrchestratorContext (BirefNet + Intelligence + model selection)
   *   2. Select strategy
   *   3. Execute with fallback chain
   *   4. Log Part 11 fields
   *   5. Return RenderingResult
   */
  async orchestrate(request: RenderingRequest): Promise<RenderingResult> {
    const orchestrationStart = Date.now();
    const { renderId } = request;

    logger.info(
      {
        renderId,
        renderMode:   request.renderMode ?? RENDERING_CONFIG.renderMode,
        hybridEnabled: RENDERING_CONFIG.hybrid.enabled,
      },
      "Render Orchestrator: orchestration started",
    );

    // ── Step 1: Prepare context ──────────────────────────────────────────────
    const context = await this.prepare(request);

    // ── Step 2: Select strategy ──────────────────────────────────────────────
    const strategySelectionStart = Date.now();
    const selectedStrategy = this.selectStrategy(context);
    const strategySelectionMs = Date.now() - strategySelectionStart;

    if (strategySelectionMs > RENDERING_CONFIG.performance.strategySelectionTargetMs) {
      logger.warn(
        { renderId, strategySelectionMs, target: RENDERING_CONFIG.performance.strategySelectionTargetMs },
        "Render Orchestrator: strategy selection exceeded target",
      );
    }

    logger.info(
      { renderId, selectedStrategy: selectedStrategy.name, strategySelectionMs },
      "Render Orchestrator: strategy selected",
    );

    // ── Step 3: Execute with fallback chain ──────────────────────────────────
    let strategyResult;
    let strategyUsed = selectedStrategy.name;
    let overallFallbackReason: string | null = null;

    try {
      strategyResult = await selectedStrategy.execute(context);
    } catch (strategyError) {
      // If the selected strategy is NOT the standard strategy, try standard
      if (selectedStrategy !== this.standardStrategy) {
        const errMsg = strategyError instanceof Error ? strategyError.message : String(strategyError);
        logger.warn(
          { renderId, failedStrategy: selectedStrategy.name, error: errMsg },
          "Render Orchestrator: strategy failed — falling back to standard strategy",
        );

        strategyUsed            = this.standardStrategy.name;
        overallFallbackReason   = `${selectedStrategy.name}_failed`;

        strategyResult = await this.standardStrategy.execute(context);
      } else {
        // Standard strategy itself failed — propagate to caller
        throw strategyError;
      }
    }

    // ── Step 4: Part 11 Render Orchestrator log ──────────────────────────────
    const totalDurationMs = Date.now() - orchestrationStart;
    const { modelImageContext } = context;

    logger.info(
      {
        renderId,
        orchestration: {
          // Part 11 required fields
          selectedStrategy:    strategyUsed,
          selectedProvider:    strategyResult.fluxLatencyMs !== null
            ? RENDERING_CONFIG.hybrid.fluxModel
            : null,
          promptHash:          strategyResult.promptHash,
          cacheHit:            strategyResult.cacheHit,
          fluxLatencyMs:       strategyResult.fluxLatencyMs,
          fashnLatencyMs:      strategyResult.fashnLatencyMs,
          totalRenderTimeMs:   totalDurationMs,
          strategySelectionMs,
          preparationMs:       context.preparationDurationMs,
          fallbackReason:      overallFallbackReason ?? strategyResult.fallbackReason,
          finalStrategyUsed:   strategyUsed,
          // Intelligence summary
          garmentCategory:     context.category,
          styleTemplate:       context.styleTemplate,
          intelligenceMs:      context.intelligenceResult.durationMs,
          // Model selection summary (SL-016)
          modelSource:         modelImageContext.source,
          baseModelId:         modelImageContext.baseModelId,
          identityOverride:    modelImageContext.identityOverride,
          modelSelectionMs:    modelImageContext.selectionDurationMs,
          // Performance targets
          meetsFluxTarget:     strategyResult.fluxLatencyMs === null
            ? null
            : strategyResult.fluxLatencyMs <= RENDERING_CONFIG.performance.fluxTargetMs,
          meetsFashnTarget:    strategyResult.fashnLatencyMs <= RENDERING_CONFIG.performance.fashnTargetMs,
          meetsTotalTarget:    totalDurationMs <= RENDERING_CONFIG.performance.totalTargetMs,
        },
      },
      "Render Orchestrator: SL-017 render summary",
    );

    return {
      outputImageUrl:       strategyResult.outputImageUrl,
      strategyUsed,
      providerUsed:         strategyResult.fluxLatencyMs !== null
        ? RENDERING_CONFIG.hybrid.fluxModel
        : null,
      cacheHit:             strategyResult.cacheHit,
      promptHash:           strategyResult.promptHash,
      fluxLatencyMs:        strategyResult.fluxLatencyMs,
      fashnLatencyMs:       strategyResult.fashnLatencyMs,
      totalDurationMs,
      strategySelectionMs,
      fallbackReason:       overallFallbackReason ?? strategyResult.fallbackReason,
    };
  }

  // ── Context preparation ────────────────────────────────────────────────────

  /**
   * Prepares the complete OrchestratorContext from a raw RenderingRequest.
   *
   * Concurrency: BirefNet and Intelligence Engine run in parallel.
   * Model image selection runs after both complete (needs intelligence category).
   */
  private async prepare(request: RenderingRequest): Promise<OrchestratorContext> {
    const prepStart = Date.now();
    const { renderId } = request;

    // ── Parallel: BirefNet preprocessing + Intelligence Engine ───────────────
    const [garmentImageUrl, intelligenceResult] = await Promise.all([
      this.prepareGarmentImage(request.sourceImageUrl, renderId),
      runIntelligenceAnalysis({
        renderId,
        garmentImageUrl:  request.sourceImageUrl,
        garmentPlacement: request.garmentPlacement,
        modelGender:      request.modelGender,
        modelAgeRange:    request.modelAgeRange,
      }),
    ]);

    // ── Derive FASHN category + style template from intelligence result ───────
    const category      = mapToFashnCategory(intelligenceResult.profile.category);
    const styleTemplate = mapStyleModeToTemplate(intelligenceResult.recommendation.styleMode);

    // ── Model image selection (SL-016 4-branch logic) ────────────────────────
    const modelImageContext = this.selectModelImage(
      request,
      category,
      styleTemplate,
      renderId,
    );

    // ── Resolve root-relative paths to absolute URLs ─────────────────────────
    let modelImageUrl = modelImageContext.imageUrl;
    if (modelImageUrl.startsWith("/")) {
      const domain = process.env["REPLIT_DEV_DOMAIN"];
      modelImageUrl = domain
        ? `https://${domain}${modelImageUrl}`
        : `http://localhost:25562${modelImageUrl}`;

      logger.info(
        { renderId, resolvedModelImageUrl: modelImageUrl },
        "Render Orchestrator: resolved relative identity imageUrl to absolute URL",
      );
    }

    const preparationDurationMs = Date.now() - prepStart;

    logger.info(
      {
        renderId,
        preparation: {
          garmentImageUrl,
          modelImageUrl,
          modelSource:   modelImageContext.source,
          baseModelId:   modelImageContext.baseModelId,
          category,
          styleTemplate,
          intelligenceMs: intelligenceResult.durationMs,
          totalMs:        preparationDurationMs,
        },
      },
      "Render Orchestrator: context prepared",
    );

    return {
      renderId,
      request,
      intelligenceResult,
      garmentImageUrl,
      modelImageContext: { ...modelImageContext, imageUrl: modelImageUrl },
      modelImageUrl,
      category,
      styleTemplate,
      preparationDurationMs,
    };
  }

  // ── Strategy selection ─────────────────────────────────────────────────────

  /**
   * Selects the rendering strategy based on render mode and strategy availability.
   *
   * STANDARD → StandardRenderingStrategy always.
   * HYBRID   → HybridRenderingStrategy if canHandle, else Standard.
   * AUTO     → First strategy whose canHandle() returns true (Hybrid → Standard).
   *
   * request.renderMode overrides the global RENDERING_CONFIG.renderMode.
   */
  private selectStrategy(context: OrchestratorContext): RenderingStrategy {
    const mode = context.request.renderMode ?? RENDERING_CONFIG.renderMode;

    if (mode === "STANDARD") return this.standardStrategy;

    if (mode === "HYBRID") {
      const hybrid = this.strategies.find((s) => s.name === "hybrid");
      if (hybrid?.canHandle(context)) return hybrid;
      logger.warn(
        { renderId: context.renderId },
        "Render Orchestrator: HYBRID mode requested but Hybrid strategy unavailable — using Standard",
      );
      return this.standardStrategy;
    }

    // AUTO: first strategy that canHandle wins
    for (const strategy of this.strategies) {
      if (strategy.canHandle(context)) return strategy;
    }

    return this.standardStrategy; // should never reach here; Standard always canHandle
  }

  // ── BirefNet garment preprocessing ────────────────────────────────────────

  /**
   * Passes the uploaded garment through fal-ai/birefnet to remove hanger/background.
   * Returns a transparent PNG cutout URL. Falls back to original on any error.
   */
  private async prepareGarmentImage(
    sourceImageUrl: string,
    renderId: number,
  ): Promise<string> {
    try {
      logger.info(
        { renderId, sourceImageUrl },
        "Render Orchestrator: garment preprocessing — BirefNet hanger removal",
      );

      const result = await fal.subscribe("fal-ai/birefnet", {
        input: {
          image_url:            sourceImageUrl,
          model:                "General Use (Light)",
          output_format:        "png",
          operating_resolution: "1024x1024",
          refine_foreground:    true,
        },
        logs: false,
      });

      const data = result.data as Record<string, unknown> | undefined;
      const candidates: unknown[] = [
        (data?.["image"]  as { url?: string } | undefined)?.url,
        data?.["image_url"],
        data?.["url"],
        (data?.["images"] as Array<{ url: string }> | undefined)?.[0]?.url,
      ];

      for (const c of candidates) {
        if (typeof c === "string" && c.startsWith("http")) {
          logger.info(
            { renderId, preprocessedGarmentUrl: c },
            "Render Orchestrator: garment background removed",
          );
          return c;
        }
      }

      logger.warn({ renderId }, "Render Orchestrator: BirefNet returned no URL — using original");
      return sourceImageUrl;
    } catch (err) {
      logger.warn(
        { renderId, err },
        "Render Orchestrator: BirefNet failed — falling back to original garment image",
      );
      return sourceImageUrl;
    }
  }

  // ── Model image selection (SL-016) ────────────────────────────────────────

  /**
   * Resolves the model image URL using the SL-016 4-branch priority chain.
   *
   * Branch A: modelIdentityId supplied + resolved in Identity Library (user override — always wins)
   * Branch B: modelIdentityId supplied but NOT found → Base Model Selector
   * Branch C: No modelIdentityId → Base Model Selector (standard SL-016 path)
   * Branch D: Base Model Selector null → selectAttributeRoutedModel() (emergency fallback)
   */
  private selectModelImage(
    request: RenderingRequest,
    category: OrchestratorContext["category"],
    styleTemplate: OrchestratorContext["styleTemplate"],
    renderId: number,
  ): ModelImageContext {
    const selectionStart = Date.now();
    const { modelIdentityId, modelGender, modelAgeRange, modelPose } = request;

    let imageUrl: string;
    let source: ModelImageSource;
    let baseModelId: string | null = null;
    let identityId: string | null = null;
    let identityOverride = false;
    let fallbackReason: string | null = null;

    if (modelIdentityId) {
      // ── Branch A: User-selected identity ──────────────────────────────────
      const identity = findIdentityById(modelIdentityId);
      if (identity) {
        imageUrl         = identity.imageUrl;
        source           = "identity_override";
        identityId       = modelIdentityId;
        identityOverride = true;

        logger.info(
          { renderId, modelIdentityId, identityName: identity.displayName },
          "Render Orchestrator: model image from Identity Library (identity override)",
        );
      } else {
        // ── Branch B: Identity not found → Base Model Selector ──────────────
        logger.warn(
          { renderId, modelIdentityId },
          "Render Orchestrator: modelIdentityId not found — falling back to Base Model Selector",
        );

        const baseModel = selectBaseModel(modelGender, category, styleTemplate);
        if (baseModel) {
          imageUrl              = baseModel.imageUrl;
          source                = "base_model_selector";
          baseModelId           = baseModel.id;
          fallbackReason        = "identity_not_found";
        } else {
          imageUrl              = this.selectAttributeRoutedModel(modelGender, modelAgeRange, modelPose);
          source                = "attribute_routing_fallback";
          fallbackReason        = "identity_not_found_and_base_model_null";
        }
      }
    } else {
      // ── Branch C: No identity selected — Base Model Selector ────────────────
      const baseModel = selectBaseModel(modelGender, category, styleTemplate);
      if (baseModel) {
        imageUrl    = baseModel.imageUrl;
        source      = "base_model_selector";
        baseModelId = baseModel.id;
      } else {
        // ── Branch D: Base Model Selector null — emergency attribute routing ──
        imageUrl       = this.selectAttributeRoutedModel(modelGender, modelAgeRange, modelPose);
        source         = "attribute_routing_fallback";
        fallbackReason = "base_model_selector_null";
      }
    }

    const selectionDurationMs = Date.now() - selectionStart;

    logger.info(
      {
        renderId,
        modelSelection: {
          source, baseModelId, identityId, identityOverride,
          fallbackReason, category, styleTemplate,
          resolvedImageUrl: imageUrl, durationMs: selectionDurationMs,
        },
      },
      "Render Orchestrator: model image selected",
    );

    return {
      imageUrl,
      source,
      baseModelId,
      identityId,
      identityOverride,
      fallbackReason,
      selectionDurationMs,
    };
  }

  // ── Emergency attribute-routing fallback ──────────────────────────────────

  /**
   * Last-resort model image selection matching gender + age + pose to a
   * known-good Unsplash URL. Behaviour identical to the pre-SL-016 pipeline.
   * Used only when both Identity Library and Base Model Selector return null.
   */
  private selectAttributeRoutedModel(
    modelGender:   string | null | undefined,
    modelAgeRange: string | null | undefined,
    modelPose:     string | null | undefined,
  ): string {
    const pose = modelPose ?? "standing_frontal";

    if (modelGender === "kids") {
      if (pose === "walking_dynamic")   return "https://images.unsplash.com/photo-1555009393-f20bdb245c4d?w=768&q=85&fit=crop&crop=top";
      if (pose === "sideways_posing")   return "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=768&q=85&fit=crop&crop=top";
      if (modelAgeRange === "teen_youth") return "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=768&q=85&fit=crop&crop=top";
      return "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=768&q=85&fit=crop&crop=top";
    }

    if (modelGender === "mens") {
      if (pose === "walking_dynamic")       return "https://images.unsplash.com/photo-1488161628813-04466f872be2?w=768&q=85&fit=crop&crop=top";
      if (pose === "sideways_posing")       return "https://images.unsplash.com/photo-1490367532201-b9bc1dc483f6?w=768&q=85&fit=crop&crop=top";
      if (modelAgeRange === "mature_executive") return "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=768&q=85&fit=crop&crop=top";
      if (modelAgeRange === "classic_mid_age")  return "https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=768&q=85&fit=crop&crop=top";
      if (modelAgeRange === "teen_youth")       return "https://images.unsplash.com/photo-1534367610401-9f5ed68180aa?w=768&q=85&fit=crop&crop=top";
      return "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=768&q=85&fit=crop&crop=top";
    }

    // Women's (default)
    if (pose === "walking_dynamic")       return "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=768&q=85&fit=crop&crop=top";
    if (pose === "sideways_posing")       return "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "mature_executive") return "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "classic_mid_age")  return "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "teen_youth")       return "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=768&q=85&fit=crop&crop=top";
    return "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=768&q=85&fit=crop&crop=top";
  }
}
