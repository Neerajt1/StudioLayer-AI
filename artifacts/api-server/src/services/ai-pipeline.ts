// ---------------------------------------------------------------------------
// StudioLayer AI — AI Pipeline Entry Point
//
// This file is the bridge between the renders route and the rendering backend.
// It is intentionally thin — all provider logic lives in:
//
//   src/rendering/preprocessing.ts          — FAL BirefNet garment cutout + model resolution
//   src/rendering/image-storage.ts          — base64 → Cloudflare R2 upload
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
import { traceRenderFailure, traceRenderStage } from "../lib/render-pipeline-trace.js";
import {
  logPipelineStage,
  PipelineExternalProvider,
  PipelineStage,
  type PipelineTraceContext,
} from "../lib/render-pipeline-observability.js";
import { runIntelligenceAnalysis, buildShotPrompts, imageCountToShootType } from "../intelligence";
import {
  buildRefinementBrief,
  resolveRefinementType,
  type RefinementType,
} from "./refinement/refinement-engine.js";
import { runRemoveBackgroundRefine } from "./refinement/run-remove-background-refine.js";
import {
  prepareGarmentImage,
  resolveModelImage,
  mapStyleModeToTemplate,
  isLocalIdentityImageUrl,
  loadStudioTalentImageAsDataUri,
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
  /** Full Outfit length selection — forwarded to Garment Intelligence. */
  garmentLengthSelection?: string | null;
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
  /** Batch 21 — reliable refine type (V1). Takes precedence over refinementPrompt. */
  refinementType?:     RefinementType | string | null;
  /**
   * Camera Angle Director session memory.
   * List of camera angle names already used in this session.
   * When provided, the Camera Angle Director deterministically selects
   * the first unused angle from the canonical 12-angle library.
   * When absent, the AI visually inspects Reference Image 3 (visual fallback).
   */
  usedCameraAngles?:   string[];
  /**
   * Pose Director session memory.
   * List of pose names already used in this session.
   * When provided, the Pose Director deterministically selects
   * the first garment-appropriate unused pose from the 30-pose canonical library.
   * When absent, the AI visually inspects Reference Image 3 (visual fallback).
   */
  usedPoses?:          string[];
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
  /** Correlated pipeline trace — created at POST /renders entry. */
  pipelineTrace:       PipelineTraceContext;
}): Promise<void> {
  const {
    renderId,
    sourceImageUrl,
    modelGender,
    modelAgeRange,
    modelPose,
    garmentPlacement,
    garmentLengthSelection,
    modelIdentityId,
    outfitStyle,
    shots = 1,
    previousOutputUrl,
    refinementPrompt,
    refinementType,
    usedCameraAngles,
    usedPoses,
    pipelineTrace,
  } = params;

  // ── AI Router: classify task + select provider ─────────────────────────────
  const resolvedRefinementType = (refinementType || refinementPrompt)
    ? resolveRefinementType({ refinementType, refinementPrompt })
    : null;

  const taskType    = classifyTask({
    isRefinement: !!(resolvedRefinementType || refinementPrompt),
    shots,
  });
  const routeDecision = routeTask(taskType, renderId);

  try {
    logPipelineStage(pipelineTrace, PipelineStage.AI_PIPELINE_STARTED, { shots, taskType });

    // ── Batch 21: Remove Background — BirefNet path (no OpenRouter) ──────────
    if (resolvedRefinementType === "remove_background" && previousOutputUrl) {
      const transparentUrl = await runRemoveBackgroundRefine({
        renderId,
        previousOutputUrl,
        pipelineTrace,
      });
      await params.onComplete(transparentUrl, 0);
      logPipelineStage(pipelineTrace, PipelineStage.RENDER_COMPLETED, {
        refinement: "remove_background",
        imagesDelivered: 1,
      });
      return;
    }

    const garmentStartedAt = Date.now();
    const intelligenceStartedAt = Date.now();

    logPipelineStage(pipelineTrace, PipelineStage.GARMENT_PREPROCESSING_STARTED, {
      externalProvider: PipelineExternalProvider.GARMENT_PREPROCESSING,
    });
    logPipelineStage(pipelineTrace, PipelineStage.INTELLIGENCE_ANALYSIS_STARTED, {
      engine: PipelineExternalProvider.INTELLIGENCE_ENGINE,
    });

    const [garmentImageUrl, intelligenceResult] = await Promise.all([
      prepareGarmentImage(sourceImageUrl, renderId).then((url) => {
        logPipelineStage(pipelineTrace, PipelineStage.GARMENT_PREPROCESSING_COMPLETED, {
          durationMs: Date.now() - garmentStartedAt,
          externalProvider: PipelineExternalProvider.GARMENT_PREPROCESSING,
        });
        return url;
      }),
      runIntelligenceAnalysis({
        renderId,
        garmentImageUrl: sourceImageUrl,
        garmentPlacement,
        garmentLengthSelection: garmentLengthSelection as never,
        modelGender,
        modelAgeRange,
        outfitStyle,
        shots,
      }).then((result) => {
        logPipelineStage(pipelineTrace, PipelineStage.INTELLIGENCE_ANALYSIS_COMPLETED, {
          durationMs: Date.now() - intelligenceStartedAt,
          intelligenceDurationMs: result.durationMs,
          engine: PipelineExternalProvider.INTELLIGENCE_ENGINE,
          usedHardFallback: result.usedHardFallback,
        });
        return result;
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

    const providerModelImageUrl = isLocalIdentityImageUrl(modelImageUrl)
      ? loadStudioTalentImageAsDataUri(modelImageUrl, renderId)
      : modelImageUrl;

    // ── Step 3: Batch 21/21A/22 — Refine brief + Identity Lock + Contract ────
    const refinementBrief = resolvedRefinementType
      ? buildRefinementBrief(resolvedRefinementType)
      : null;
    const refinementInstruction = refinementBrief?.usesOpenRouter
      ? refinementBrief.instruction
      : undefined;

    if (refinementBrief) {
      logger.info(
        {
          renderId,
          refinementType: refinementBrief.type,
          label:          refinementBrief.label,
          usesOpenRouter: refinementBrief.usesOpenRouter,
        },
        "Refinement engine: brief built",
      );
    }

    logger.info(
      {
        renderId,
        garmentImageUrl,
        modelImageUrl: isLocalIdentityImageUrl(modelImageUrl)
          ? `${modelImageUrl} (base64 data URI)`
          : modelImageUrl,
        modelSource:     modelImageContext.source,
        baseModelId:     modelImageContext.baseModelId,
        category,
        styleTemplate,
        shots,
        taskType,
        provider:        routeDecision.provider,
        editorialDiversity: routeDecision.supportsPerShotPrompts && shots > 1 && !resolvedRefinementType,
        intelligenceMs:  intelligenceResult.durationMs,
      },
      "AI pipeline: preprocessing complete",
    );

    // ── Step 4: Editorial diversity — build per-shot prompts ──────────────────
    //
    // When shots === 1 (Hero), 2 (Campaign), or 4 (Editorial) and this is not
    // a refinement, the Pose Selection Engine generates distinct per-shot briefs
    // from the professional pose library.
    const basePrompt = intelligenceResult.prompt ?? "";

    const perShotPrompts: string[] | undefined =
      routeDecision.supportsPerShotPrompts && !resolvedRefinementType
        ? buildShotPrompts(basePrompt, intelligenceResult.profile, {
            shootType: imageCountToShootType(shots),
            modelGender,
          })
        : undefined;

    if (perShotPrompts) {
      logger.info(
        {
          renderId,
          generationSessionId: pipelineTrace.generationSessionId,
          shots,
          perShotPromptCount: perShotPrompts.length,
          diversityMode: imageCountToShootType(shots),
        },
        "Creative Director: per-shot pose diversity briefs generated",
      );
    }

    logPipelineStage(pipelineTrace, PipelineStage.PROMPT_GENERATION_COMPLETED, {
      shots,
      perShotPromptCount: perShotPrompts?.length ?? 1,
      provider: routeDecision.provider,
    });

    const photoshootResult = await getRenderingEngine().generatePhotoshoot({
      garmentImageUrl,
      modelImageUrl: providerModelImageUrl,
      prompt: resolvedRefinementType ? "" : basePrompt,
      shots,
      perShotPrompts,
      previousOutputUrl: previousOutputUrl ?? undefined,
      refinementInstruction,
      pipelineTrace,
    });

    if (photoshootResult.images.length === 0) {
      throw new Error("OpenRouter returned zero images");
    }

    logPipelineStage(pipelineTrace, PipelineStage.OPENROUTER_RESPONSE_RECEIVED, {
      provider: photoshootResult.provider,
      model: photoshootResult.model,
      shotsReturned: photoshootResult.images.length,
      durationMs: photoshootResult.durationMs,
      openRouterRetryCount: pipelineTrace.openRouterRetryCount,
    });

    logger.info(
      {
        renderId,
        generationSessionId: pipelineTrace.generationSessionId,
        provider: photoshootResult.provider,
        model: photoshootResult.model,
        durationMs: photoshootResult.durationMs,
        shotsRequested: shots,
        shotsReturned: photoshootResult.images.length,
      },
      "AI pipeline: generation complete",
    );

    const successfulIndices = new Set(photoshootResult.images.map((img) => img.index));

    for (const image of photoshootResult.images) {
      logPipelineStage(pipelineTrace, PipelineStage.R2_UPLOAD_STARTED, {
        imageIndex: image.index,
      });

      const outputImageUrl = await uploadBase64Image(image.url, renderId, {
        pipelineTrace,
        imageIndex: image.index,
      });

      logger.info(
        {
          renderId,
          generationSessionId: pipelineTrace.generationSessionId,
          imageIndex: image.index,
        },
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

    logPipelineStage(pipelineTrace, PipelineStage.RENDER_COMPLETED, {
      generationMs: photoshootResult.durationMs,
      imagesDelivered: photoshootResult.images.length,
      openRouterRetryCount: pipelineTrace.openRouterRetryCount,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    traceRenderFailure(PipelineStage.RENDER_FAILED, err, {
      pipelineTrace,
      openRouterRetryCount: pipelineTrace.openRouterRetryCount,
    });
    logger.error(
      {
        renderId,
        generationSessionId: pipelineTrace.generationSessionId,
        err: err.message,
      },
      "AI pipeline: pipeline failed",
    );
    await params.onError(err);
  }
}
