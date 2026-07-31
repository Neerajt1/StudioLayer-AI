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
//   src/intelligence/creative-director.ts   — action intelligence + editorial diversity
//   src/router/ai-router.ts                 — task classification + provider routing
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
//   SL-020  — Multi-image support: shots parameter (1/2/4) + indexed onComplete.
//             All shots share one preprocessing pass; results distributed by index.
//   SL-021  — Creative Intelligence & AI Routing sprint.
//             • Creative Director: classifies refinement actions + builds rich
//               creative briefs (background/camera/pose/styling each get distinct
//               locked-element sets and intelligent content selections).
//             • AI Router: classifies tasks and routes to providers.
//             • Editorial diversity: shots=4 generates 4 genuinely different
//               shot briefs (hero front, walking, side profile, magazine crop).
//             • Garment replacement improvements in rendering.config.
// ---------------------------------------------------------------------------

import { logger }                    from "../lib/logger";
import { runIntelligenceAnalysis, buildCreativeBrief, buildEditorialShotPrompts } from "../intelligence";
import {
  prepareGarmentImage,
  resolveModelImage,
  mapStyleModeToTemplate,
}                                    from "../rendering/preprocessing";
import { mapToFashnCategory }        from "../rendering/types";
import { uploadBase64Image }         from "../rendering/image-storage";
import { getRenderingEngine }        from "./rendering/RenderingEngine";
import type { ShotCount }            from "./rendering/types";
import { classifyTask, routeTask }   from "../router/ai-router";

// ---------------------------------------------------------------------------
// runAIPipeline — public API
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
  /**
   * Number of images to generate (SL-020).
   * Each shot is an independent OpenRouter call.
   * Defaults to 1.
   */
  shots?:              ShotCount;
  /**
   * URL of the previously generated output image (refinement mode).
   * When set, the provider includes it as Reference Image 3.
   */
  previousOutputUrl?:  string | null;
  /**
   * Natural language description of the change the user wants to make.
   * When set, the Creative Director classifies the action type and builds
   * a rich, context-aware creative brief instead of a generic wrapper.
   */
  refinementPrompt?:   string | null;
  /**
   * Called once per successfully generated image.
   * imageIndex is 0-based within this generation batch.
   */
  onComplete:          (outputImageUrl: string, imageIndex: number) => Promise<void>;
  /**
   * Called for each individual shot that failed to generate (partial failure).
   * Not called when ALL shots fail — in that case only onError is called.
   */
  onShotError?:        (error: Error, imageIndex: number) => Promise<void>;
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
    shots = 1,
    previousOutputUrl,
    refinementPrompt,
  } = params;

  // ── AI Router: classify task + select provider ─────────────────────────────
  const taskType    = classifyTask({ isRefinement: !!refinementPrompt, shots });
  const routeDecision = routeTask(taskType, renderId);

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

    // ── Step 3: Creative Director — build action-specific creative brief ────────
    //
    // For refinements: classify the raw button text into an ActionType and
    // build a rich, garment-aware creative brief with action-specific
    // locked elements.  Replaces the generic buildRefinementInstruction().
    //
    // For initial renders: no refinement instruction needed.
    const refinementInstruction = refinementPrompt
      ? buildCreativeBrief(refinementPrompt, intelligenceResult.profile).instruction
      : undefined;

    if (refinementPrompt) {
      const brief = buildCreativeBrief(refinementPrompt, intelligenceResult.profile);
      logger.info(
        {
          renderId,
          actionType:      brief.actionType,
          creativeConcept: brief.creativeConcept,
          refinementPrompt,
        },
        "Creative Director: refinement brief built",
      );
    }

    logger.info(
      {
        renderId,
        garmentImageUrl,
        modelImageUrl,
        modelSource:     modelImageContext.source,
        baseModelId:     modelImageContext.baseModelId,
        category,
        styleTemplate,
        shots,
        taskType,
        provider:        routeDecision.provider,
        editorialDiversity: routeDecision.supportsPerShotPrompts && shots > 1 && !refinementPrompt,
        intelligenceMs:  intelligenceResult.durationMs,
      },
      "AI pipeline: preprocessing complete",
    );

    // ── Step 4: Editorial diversity — build per-shot prompts ──────────────────
    //
    // When shots === 4 (Editorial) and this is not a refinement, the Creative
    // Director generates four genuinely different shot briefs:
    //   Shot 0: Hero front (eye contact, full body)
    //   Shot 1: Walking three-quarter (dynamic, editorial)
    //   Shot 2: Side profile (silhouette, architectural)
    //   Shot 3: Magazine close crop (intimate, artistic)
    //
    // For Hero (1 shot) and Campaign (2 shots), shots share the same prompt
    // and rely on non-deterministic generation for natural variation.
    const basePrompt = intelligenceResult.prompt ?? "";

    const perShotPrompts: string[] | undefined =
      routeDecision.supportsPerShotPrompts && shots === 4 && !refinementPrompt
        ? buildEditorialShotPrompts(basePrompt, intelligenceResult.profile)
        : undefined;

    if (perShotPrompts) {
      logger.info(
        { renderId, shots, editorialShotCount: perShotPrompts.length },
        "Creative Director: editorial diversity — 4 distinct shot briefs generated",
      );
    }

    // ── Step 5: OpenRouter image generation ───────────────────────────────────
    const photoshootResult = await getRenderingEngine().generatePhotoshoot({
      garmentImageUrl,
      modelImageUrl,
      prompt: basePrompt,
      shots,
      perShotPrompts,
      previousOutputUrl: previousOutputUrl ?? undefined,
      refinementInstruction,
    });

    if (photoshootResult.images.length === 0) {
      throw new Error("OpenRouter returned zero images");
    }

    logger.info(
      {
        renderId,
        provider:       photoshootResult.provider,
        model:          photoshootResult.model,
        durationMs:     photoshootResult.durationMs,
        shotsRequested: shots,
        shotsReturned:  photoshootResult.images.length,
      },
      "AI pipeline: generation complete",
    );

    // ── Step 6: Upload each image to fal CDN and invoke onComplete ────────────
    //
    // Uploads run serially to avoid hammering the CDN, but each completes its
    // DB write immediately so the UI can stream results as they arrive.
    const successfulIndices = new Set(photoshootResult.images.map((img) => img.index));

    for (const image of photoshootResult.images) {
      const outputImageUrl = await uploadBase64Image(image.url, renderId);

      logger.info(
        { renderId, imageIndex: image.index, outputImageUrl },
        "AI pipeline: image uploaded",
      );

      await params.onComplete(outputImageUrl, image.index);
    }

    // ── Step 7: Mark individually failed shots (partial failure) ──────────────
    if (photoshootResult.images.length < shots && params.onShotError) {
      for (let i = 0; i < shots; i++) {
        if (!successfulIndices.has(i)) {
          logger.warn(
            { renderId, shotIndex: i },
            "AI pipeline: shot failed — marking row as failed",
          );
          await params.onShotError(
            new Error(`Shot ${i} failed to generate`),
            i,
          );
        }
      }
    }

    const totalMs = Date.now() - pipelineStart;

    logger.info(
      {
        renderId,
        totalMs,
        generationMs:    photoshootResult.durationMs,
        imagesDelivered: photoshootResult.images.length,
      },
      "AI pipeline: pipeline complete",
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(
      { renderId, err: err.message },
      "AI pipeline: pipeline failed",
    );
    await params.onError(err);
  }
}
