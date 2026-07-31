// ---------------------------------------------------------------------------
// StudioLayer AI — AI Pipeline Entry Point
//
// This file is the bridge between the renders route and the rendering backend.
// It is intentionally thin — all provider logic lives in:
//
//   src/rendering/preprocessing.ts          — BirefNet + model image resolution
//   src/rendering/image-storage.ts          — base64 → fal CDN upload
//   src/services/rendering/RenderingEngine  — OpenRouter image generation
//   src/services/rendering/providers/       — OpenRouterProvider
//   src/services/rendering/rendering.config — garmentInstruction, model, timeouts
//   src/intelligence/                       — garment analysis + prompt composition
//
// History:
//   SL-011A — FASHN V1.6 compliance + FASHN_CONFIG
//   SL-012  — Identity library + SL-012 identity log
//   SL-013A — Intelligence layer (fire-and-forget)
//   SL-014  — Intelligence layer integrated into pipeline (parallel execution)
//   SL-016  — Base Model Selector replaces selectModelImage()
//   SL-017  — Render Orchestrator replaces all pipeline logic in this file.
//   SL-019  — Rendering backend replaced: FASHN → OpenRouter (Gemini image).
//             Preprocessing (BirefNet, intelligence, model resolution) retained.
//             FASHN/Orchestrator path removed from main generate flow.
//             Public signature of runAIPipeline() is unchanged.
// ---------------------------------------------------------------------------

import { logger }                    from "../lib/logger";
import { runIntelligenceAnalysis }   from "../intelligence";
import {
  prepareGarmentImage,
  resolveModelImage,
  mapStyleModeToTemplate,
}                                    from "../rendering/preprocessing";
import { mapToFashnCategory }        from "../rendering/types";
import { uploadBase64Image }         from "../rendering/image-storage";
import { getRenderingEngine }        from "./rendering/RenderingEngine";

// ---------------------------------------------------------------------------
// runAIPipeline — public API (signature unchanged from SL-017)
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
  /** Complete the Look selection from the UI (SL-018B). */
  outfitStyle?:        string | null;
  onComplete:          (outputImageUrl: string) => Promise<void>;
  onError:             (error: Error) => Promise<void>;
}): Promise<void> {
  const {
    renderId,
    sourceImageUrl,
    modelGender,
    modelAgeRange,
    modelPose,
    garmentPlacement,
    modelIdentityId,
    outfitStyle,
  } = params;

  try {
    const pipelineStart = Date.now();

    // ── Step 1: BirefNet garment preprocessing + Intelligence Engine (parallel) ──
    const [garmentImageUrl, intelligenceResult] = await Promise.all([
      prepareGarmentImage(sourceImageUrl, renderId),
      runIntelligenceAnalysis({
        renderId,
        garmentImageUrl:  sourceImageUrl,
        garmentPlacement,
        modelGender,
        modelAgeRange,
        outfitStyle,
      }),
    ]);

    // ── Step 2: Derive category + style template; resolve model image ──────────
    const category      = mapToFashnCategory(intelligenceResult.profile.category);
    const styleTemplate = mapStyleModeToTemplate(intelligenceResult.recommendation.styleMode);

    const { modelImageContext, modelImageUrl } = resolveModelImage(
      { renderId, sourceImageUrl, modelGender, modelAgeRange, modelPose, garmentPlacement, modelIdentityId, outfitStyle },
      category,
      styleTemplate,
      renderId,
    );

    logger.info(
      {
        renderId,
        garmentImageUrl,
        modelImageUrl,
        modelSource:     modelImageContext.source,
        baseModelId:     modelImageContext.baseModelId,
        category,
        styleTemplate,
        intelligenceMs:  intelligenceResult.durationMs,
      },
      "AI pipeline (OpenRouter): preprocessing complete",
    );

    // ── Step 3: OpenRouter image generation ───────────────────────────────────
    //
    // The creative prompt from the Intelligence Engine is forwarded as optional
    // context appended after the authoritative garmentInstruction in the provider.
    // This lets the model factor in outfit style, location environment, and
    // garment-specific composition hints from the intelligence layer.
    const creativePrompt = intelligenceResult.prompt ?? "";

    const photoshootResult = await getRenderingEngine().generatePhotoshoot({
      garmentImageUrl,
      modelImageUrl,
      prompt: creativePrompt,
      shots: 1,
    });

    if (photoshootResult.images.length === 0) {
      throw new Error("OpenRouter returned zero images");
    }

    const rawImageUrl = photoshootResult.images[0]!.url;

    logger.info(
      {
        renderId,
        provider:    photoshootResult.provider,
        model:       photoshootResult.model,
        durationMs:  photoshootResult.durationMs,
        isBase64:    rawImageUrl.startsWith("data:"),
      },
      "AI pipeline (OpenRouter): generation complete",
    );

    // ── Step 4: Upload base64 result to fal CDN → get HTTPS URL ──────────────
    const outputImageUrl = await uploadBase64Image(rawImageUrl, renderId);

    const totalMs = Date.now() - pipelineStart;

    logger.info(
      {
        renderId,
        outputImageUrl,
        totalMs,
        generationMs:  photoshootResult.durationMs,
      },
      "AI pipeline (OpenRouter): pipeline complete",
    );

    await params.onComplete(outputImageUrl);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(
      { renderId, err: err.message },
      "AI pipeline (OpenRouter): pipeline failed",
    );
    await params.onError(err);
  }
}
