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

import { logger }                           from "../lib/logger";
import {
  runIntelligenceAnalysis,
}                                           from "../intelligence";
import { SceneCache }                       from "./scene-cache";
import { FluxSceneProvider }               from "./providers/flux-provider";
import { StandardRenderingStrategy }       from "./strategies/standard-strategy";
import { HybridRenderingStrategy }         from "./strategies/hybrid-strategy";
import { RENDERING_CONFIG }                from "./rendering-config";
import {
  prepareGarmentReferenceForGeneration,
}                                           from "../services/image-processing/garment-reference-sheet.js";
import {
  resolveModelImage,
  mapStyleModeToTemplate,
}                                           from "./preprocessing";
import {
  mapToFashnCategory,
  type RenderingRequest,
  type RenderingResult,
  type OrchestratorContext,
} from "./types";
import type { RenderingStrategy }          from "./strategies/rendering-strategy";

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
      prepareGarmentReferenceForGeneration({
        frontImageUrl: request.sourceImageUrl,
        backImageUrl: request.backImageUrl,
        detailImageUrl: request.detailImageUrl,
        renderId,
      }).then((resolved) => resolved.garmentImageUrl),
      runIntelligenceAnalysis({
        renderId,
        garmentImageUrl:  request.sourceImageUrl,
        backImageUrl:     request.backImageUrl,
        detailImageUrl:   request.detailImageUrl,
        garmentPlacement: request.garmentPlacement,
        garmentLengthSelection: request.garmentLengthSelection as never,
        modelGender:      request.modelGender,
        modelAgeRange:    request.modelAgeRange,
        // SL-018B: forward Complete the Look selection so the PromptComposer
        // can override the Intelligence Engine's own outfit recommendation.
        outfitStyle:      request.outfitStyle,
      }),
    ]);

    // ── Derive FASHN category + style template from intelligence result ───────
    const category      = mapToFashnCategory(intelligenceResult.profile.category);
    const styleTemplate = mapStyleModeToTemplate(intelligenceResult.recommendation.styleMode);

    // ── Model image selection + URL resolution (SL-016 4-branch logic) ───────
    const { modelImageContext, modelImageUrl } = resolveModelImage(
      request,
      category,
      styleTemplate,
      renderId,
    );

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
      modelImageContext,
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

}
