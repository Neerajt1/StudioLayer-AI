// ---------------------------------------------------------------------------
// StudioLayer AI — AI Pipeline Entry Point (SL-017)
//
// This file is the bridge between the renders route and the Render Orchestrator.
// It is intentionally thin — all rendering logic now lives in:
//
//   src/rendering/render-orchestrator.ts   — context preparation, strategy selection
//   src/rendering/strategies/              — StandardRenderingStrategy, HybridRenderingStrategy
//   src/rendering/providers/               — FluxSceneProvider
//   src/rendering/scene-cache.ts           — scene cache
//   src/rendering/rendering-config.ts      — FASHN_CONFIG, RENDERING_CONFIG
//
// History:
//   SL-011A — FASHN V1.6 compliance + FASHN_CONFIG
//   SL-012  — Identity library + SL-012 identity log
//   SL-013A — Intelligence layer (fire-and-forget)
//   SL-014  — Intelligence layer integrated into pipeline (parallel execution)
//   SL-016  — Base Model Selector replaces selectModelImage()
//   SL-017  — Render Orchestrator replaces all pipeline logic in this file.
//             This file is now a < 40 line wrapper. All implementation is in
//             src/rendering/. The public signature of runAIPipeline() is
//             unchanged — no callers require modification.
// ---------------------------------------------------------------------------

import { logger }          from "../lib/logger";
import { getOrchestrator } from "../rendering";
import type { RenderingRequest } from "../rendering";

// ---------------------------------------------------------------------------
// runAIPipeline — public API (signature unchanged from SL-016)
// ---------------------------------------------------------------------------

export async function runAIPipeline(params: {
  renderId:            number;
  sourceImageUrl:      string;
  modelPersona:        string;
  locationEnvironment: string;
  modelDemographics?:  string | null;
  imageDimensions?:    string | null;
  smartLighting?:      boolean | null;
  modelPose?:          string | null;
  modelGender?:        string | null;
  modelAgeRange?:      string | null;
  cameraFraming?:      string | null;
  garmentPlacement?:   string | null;
  modelIdentityId?:    string | null;
  onComplete:          (outputImageUrl: string) => Promise<void>;
  onError:             (error: Error) => Promise<void>;
}): Promise<void> {
  const request: RenderingRequest = {
    renderId:        params.renderId,
    sourceImageUrl:  params.sourceImageUrl,
    modelGender:     params.modelGender,
    modelAgeRange:   params.modelAgeRange,
    modelPose:       params.modelPose,
    garmentPlacement: params.garmentPlacement,
    modelIdentityId: params.modelIdentityId,
    // renderMode: omitted — orchestrator uses RENDERING_CONFIG.renderMode (env-driven)
  };

  try {
    const result = await getOrchestrator().orchestrate(request);

    logger.info(
      {
        renderId:      params.renderId,
        strategyUsed:  result.strategyUsed,
        totalMs:       result.totalDurationMs,
        cacheHit:      result.cacheHit,
        fallbackReason: result.fallbackReason,
      },
      "AI pipeline: orchestration complete",
    );

    await params.onComplete(result.outputImageUrl);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(
      { renderId: params.renderId, err: err.message },
      "AI pipeline: orchestration failed",
    );
    await params.onError(err);
  }
}
