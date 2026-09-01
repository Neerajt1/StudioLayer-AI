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
import {
  runIntelligenceAnalysis,
  buildShotPromptsWithPlan,
  buildShotPromptAtSlot,
  imageCountToShootType,
} from "../intelligence";
import type { ShootType as PoseShootType } from "../intelligence/pose-library";
import type { GenerationType } from "@workspace/studio-credit-engine";
import type { PoseFamily, PoseName } from "../intelligence/pose-library";
import { getAllPoseDefinitions, getPoseDefinition } from "../intelligence/pose-library";
import type { PlannedPose } from "../intelligence/pose-planner";
import type { RecentPoseSelection } from "../intelligence/pose-selection-engine";
import { resolveFurnitureForPose } from "../intelligence/pose-selection-engine";
import type { FurnitureAsset } from "../intelligence/furniture-catalog";
import {
  furnitureDiversitySeed,
  type FurnitureUsageRecord,
} from "../intelligence/furniture-selector";
import type { GarmentProfile } from "../intelligence/types";
import { deriveGarmentTone } from "../intelligence/garment-tone";
import { loadRecentPoseSelections } from "./pose-history-service";
import { loadRecentFurnitureUsage } from "./furniture-usage-service";
import {
  buildRefinementBrief,
  resolveRefinementType,
  type RefinementType,
} from "./refinement/refinement-engine.js";
import { runRemoveBackgroundRefine } from "./refinement/run-remove-background-refine.js";
import {
  resolveModelImage,
  mapStyleModeToTemplate,
  isLocalIdentityImageUrl,
  loadStudioTalentImageAsDataUri,
}                                    from "../rendering/preprocessing";
import { loadStage1PoseReferenceImageAsDataUri } from "../rendering/pose-face-neutral-backend.js";
import {
  resolvePerShotFurnitureReferences,
} from "../rendering/furniture-reference-contract.js";
import {
  buildGarmentReferenceCorrespondenceInstruction,
  prepareGarmentReferenceForGeneration,
} from "./image-processing/garment-reference-sheet.js";
import {
  buildGarmentEvidenceSetLayout,
  remapCreativePromptReferenceNumbers,
  resolveGarmentEvidenceMode,
} from "./image-processing/garment-evidence-set.js";
import { mapToFashnCategory }        from "../rendering/types";
import { uploadBase64Image }         from "../rendering/image-storage";
import { getRenderingEngine }        from "./rendering/RenderingEngine";
import { resolveV1CreateLocationEnvironment } from "./rendering/nano-pro-authority-layers.js";
import { resolveIdentityGenerationMode } from "./rendering/identity-forensics";
import { findIdentityById } from "../data/identity-library.js";
import { classifyTask, routeTask }   from "../router/ai-router";
import { startGenerationHeartbeat }  from "./generation-heartbeat.js";

function generationTypeToPoseShootType(generationType: GenerationType): PoseShootType {
  if (generationType === "editorial") return "editorial";
  if (generationType === "campaign") return "campaign";
  return "hero";
}

function resolvePoseShootType(shots: number, generationType?: GenerationType): PoseShootType {
  if (generationType) return generationTypeToPoseShootType(generationType);
  return imageCountToShootType(shots);
}

/** Resolve an explicitly selected Direct Shoot pose by canonical name or Pose ID. */
function resolveDirectedPoseDefinition(poseNameOrId: string) {
  return getPoseDefinition(poseNameOrId);
}

/**
 * Hard-force a manually directed pose into a global shot slot.
 * Explicit user selection bypasses Hero/Campaign/Editorial eligibility filters.
 */
function resolveDirectedPoseAtSlot(
  basePrompt: string,
  profile: GarmentProfile,
  options: {
    shootType: PoseShootType;
    poseName: string;
    slotIndex: number;
    furnitureAsset?: FurnitureAsset | null;
    furnitureUserHistory?: FurnitureUsageRecord[];
  },
): {
  prompt: string;
  plannedPose: PlannedPose;
  furnitureAsset: FurnitureAsset | null;
  planNote?: string;
} | null {
  const { shootType, poseName, slotIndex } = options;

  const definition = resolveDirectedPoseDefinition(poseName);
  if (definition) {
    const poseId = definition.poseId ?? poseName;
    const furnitureAsset =
      options.furnitureAsset !== undefined
        ? options.furnitureAsset
        : resolveFurnitureForPose({
            prop: definition.prop,
            poseIdOrName: poseId,
            pose: definition,
            garmentTone: deriveGarmentTone(profile),
            userHistory: options.furnitureUserHistory,
            seed: furnitureDiversitySeed({
              poseIdOrName: poseId,
              slotIndex,
              historyLength: options.furnitureUserHistory?.length ?? 0,
            }),
          });
    return {
      prompt: buildShotPromptAtSlot(
        basePrompt,
        profile,
        shootType,
        poseId,
        slotIndex,
        { manualDirected: true, furnitureAsset },
      ),
      plannedPose: {
        name: definition.name,
        family: definition.poseFamily,
        selectionClass: definition.selectionClass,
        poseId: definition.poseId ?? poseId,
      },
      furnitureAsset: furnitureAsset ?? null,
    };
  }

  return null;
}

function buildShotPlanWithDirectedPoses(
  basePrompt: string,
  profile: GarmentProfile,
  options: {
    shootType: PoseShootType;
    modelGender?: string | null;
    recentPoseSelections?: RecentPoseSelection[];
    shots: number;
    useCampaignComposition: boolean;
    directedPoses?: string[];
    furnitureUserHistory?: FurnitureUsageRecord[];
  },
): {
  prompts: string[];
  plannedPoses: PlannedPose[];
  planNotes: string[];
  furnitureSelections: Array<FurnitureAsset | null>;
} {
  const {
    shootType,
    modelGender,
    recentPoseSelections,
    shots,
    useCampaignComposition,
    directedPoses,
    furnitureUserHistory,
  } = options;

  const directed = directedPoses
    ?.filter((name) => name.trim().length > 0)
    .slice(0, shots) ?? [];

  if (directed.length === 0) {
    const autoPlan = buildShotPromptsWithPlan(basePrompt, profile, {
      shootType,
      modelGender,
      recentPoseSelections,
      count: shots,
      useCampaignComposition,
      furnitureUserHistory,
    });
    return {
      ...autoPlan,
      furnitureSelections: autoPlan.furnitureSelections ?? [],
    };
  }

  const prompts: string[] = [];
  const plannedPoses: PlannedPose[] = [];
  const planNotes: string[] = [];
  const furnitureSelections: Array<FurnitureAsset | null> = [];
  const batchAssetIds: string[] = [];
  const batchFamilies: string[] = [];

  for (let slotIndex = 0; slotIndex < directed.length; slotIndex++) {
    const directedName = directed[slotIndex]!;
    const definition = resolveDirectedPoseDefinition(directedName);
    const poseId = definition?.poseId ?? directedName;
    const furnitureAsset = resolveFurnitureForPose({
      prop: definition?.prop,
      poseIdOrName: poseId,
      pose: definition,
      garmentTone: deriveGarmentTone(profile),
      userHistory: furnitureUserHistory,
      excludeAssetIdsInBatch: batchAssetIds,
      excludeFamiliesInBatch: batchFamilies,
      seed: furnitureDiversitySeed({
        poseIdOrName: poseId,
        slotIndex,
        historyLength: furnitureUserHistory?.length ?? 0,
      }),
    });
    if (furnitureAsset) {
      batchAssetIds.push(furnitureAsset.id);
      batchFamilies.push(furnitureAsset.family);
    }

    const resolved = resolveDirectedPoseAtSlot(basePrompt, profile, {
      shootType,
      poseName: directedName,
      slotIndex,
      furnitureAsset,
      furnitureUserHistory,
    });
    if (!resolved) continue;
    prompts.push(resolved.prompt);
    plannedPoses.push(resolved.plannedPose);
    furnitureSelections.push(resolved.furnitureAsset);
    if (resolved.planNote) {
      planNotes.push(resolved.planNote);
      logger.warn(
        { directedPose: directedName, slotIndex, shootType },
        resolved.planNote,
      );
    }
  }

  const autoCount = shots - directed.length;
  if (autoCount > 0) {
    const autoPlan = buildShotPromptsWithPlan(basePrompt, profile, {
      shootType,
      modelGender,
      recentPoseSelections,
      count: autoCount,
      usedPoses: directed,
      useCampaignComposition,
      furnitureUserHistory,
      furnitureExcludeAssetIdsInBatch: batchAssetIds,
      furnitureExcludeFamiliesInBatch: batchFamilies,
    });

    for (let autoIndex = 0; autoIndex < autoPlan.prompts.length; autoIndex++) {
      prompts.push(autoPlan.prompts[autoIndex]!);
      plannedPoses.push(autoPlan.plannedPoses[autoIndex]!);
      furnitureSelections.push(autoPlan.furnitureSelections?.[autoIndex] ?? null);
    }
    planNotes.push(...autoPlan.planNotes);
  }

  return { prompts, plannedPoses, planNotes, furnitureSelections };
}

// ---------------------------------------------------------------------------
// runAIPipeline — public API
// ---------------------------------------------------------------------------

export async function runAIPipeline(params: {
  renderId:            number;
  /** Required for same-garment pose history (Phase 2). */
  userId?:             number;
  sourceImageUrl:      string;
  /** Optional back-view garment image — forwarded to garment analysis only. */
  backImageUrl?:       string;
  /** Optional detail/close-up garment image — forwarded to garment analysis only. */
  detailImageUrl?:     string;
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
  shots?:              number;
  /**
   * Workspace generation type — drives pose shoot type for Custom Campaign batches.
   * When omitted, falls back to image-count heuristics.
   */
  generationType?:     GenerationType;
  /** Custom Campaign (4–20) — enables bucket recipe composition (Phase 5). */
  customCampaign?:     boolean;
  /** Native output resolution — 2K (default) or 4K. Refinements ignore this. */
  outputResolution?:   import("@workspace/studio-credit-engine").OutputResolution;
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
   * poseSelection is set when Pose Intelligence planned this shot.
   */
  onComplete:          (
    outputImageUrl: string,
    imageIndex: number,
    poseSelection?: { poseName: PoseName; poseFamily: PoseFamily },
    furnitureSelection?: { assetId: string; family: string } | null,
  ) => Promise<void>;
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
    userId,
    sourceImageUrl,
    backImageUrl,
    detailImageUrl,
    modelGender,
    modelAgeRange,
    modelPose,
    garmentPlacement,
    garmentLengthSelection,
    modelIdentityId,
    outfitStyle,
    shots = 1,
    generationType,
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
  const heartbeatRenderIds =
    pipelineTrace.renderIds.length > 0 ? pipelineTrace.renderIds : [renderId];
  const stopHeartbeat = startGenerationHeartbeat(heartbeatRenderIds);

  try {
    logPipelineStage(pipelineTrace, PipelineStage.AI_PIPELINE_STARTED, { shots, taskType });

    // ── Remove Background — resolution-preserving mask composite (no OpenRouter) ─
    if (resolvedRefinementType === "remove_background") {
      if (!previousOutputUrl) {
        throw new Error(
          "remove-background: parent render has no output image URL",
        );
      }
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

    const [garmentReference, intelligenceResult] = await Promise.all([
      prepareGarmentReferenceForGeneration({
        frontImageUrl: sourceImageUrl,
        backImageUrl,
        detailImageUrl,
        renderId,
        // Refinement keeps the historical sheet packaging — do not send
        // separate Back/Detail into the refine OpenRouter request.
        evidenceMode: resolvedRefinementType ? "sheet" : resolveGarmentEvidenceMode(),
      }).then((resolved) => {
        logPipelineStage(pipelineTrace, PipelineStage.GARMENT_PREPROCESSING_COMPLETED, {
          durationMs: Date.now() - garmentStartedAt,
          externalProvider: PipelineExternalProvider.GARMENT_PREPROCESSING,
          usedReferenceSheet: resolved.usedReferenceSheet,
          garmentReferenceMode: resolved.mode,
          garmentEvidencePackaging: resolved.packaging,
        });
        return resolved;
      }),
      runIntelligenceAnalysis({
        renderId,
        garmentImageUrl: sourceImageUrl,
        backImageUrl,
        detailImageUrl,
        garmentPlacement,
        garmentLengthSelection: garmentLengthSelection as never,
        modelGender,
        modelAgeRange,
        outfitStyle,
        shots,
        generationType,
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

    const garmentImageUrl = garmentReference.garmentImageUrl;
    const useSeparateEvidence =
      garmentReference.packaging === "separate"
      && Boolean(
        garmentReference.garmentBackImageUrl || garmentReference.garmentDetailImageUrl,
      );
    const useSupplementalSheet =
      garmentReference.packaging === "sheet"
      && Boolean(garmentReference.garmentReferenceSheetImageUrl);

    // Sheet correspondence only when a composite sheet was composed.
    // Separate evidence uses a dynamic evidence-set mapping instead.
    const garmentReferenceCorrespondenceInstruction =
      !resolvedRefinementType && garmentReference.usedReferenceSheet
        ? buildGarmentReferenceCorrespondenceInstruction(garmentReference.mode)
        : undefined;

    // Separate-mode layout is finalized after pose refs are known (for Pose index).
    // Placeholder talent-only layout used if no poses; rebuilt below with hasPose.
    let garmentEvidenceSetMappingInstruction: string | undefined;
    let garmentEvidenceTalentReferenceImageNumber: number | undefined;
    let evidenceLayout:
      | ReturnType<typeof buildGarmentEvidenceSetLayout>
      | undefined;

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

    const additionalTalentImageUrls: string[] = [];
    if (modelIdentityId) {
      const identity = findIdentityById(modelIdentityId);
      for (const path of identity?.additionalIdentityImageUrls ?? []) {
        if (!path || path === modelImageUrl) continue;
        try {
          additionalTalentImageUrls.push(
            isLocalIdentityImageUrl(path)
              ? loadStudioTalentImageAsDataUri(path, renderId)
              : path,
          );
        } catch (err) {
          logger.warn(
            {
              renderId,
              modelIdentityId,
              path,
              error: err instanceof Error ? err.message : String(err),
            },
            "AI pipeline: optional Talent identity reference skipped",
          );
        }
      }
    }

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
    // When shots === 1 (Hero), 2 (Editorial), or 4 (Campaign) and this is not
    // a refinement, the Pose Selection Engine generates distinct per-shot briefs
    // from the professional pose library.
    const basePrompt = intelligenceResult.prompt ?? "";
    const shootType = resolvePoseShootType(shots, generationType);

    const recentPoseSelections =
      userId && sourceImageUrl
        ? await loadRecentPoseSelections({
            userId,
            sourceImageUrl,
            profile: intelligenceResult.profile,
          })
        : [];

    const furnitureUserHistory =
      userId != null
        ? await loadRecentFurnitureUsage({ userId }).catch((error) => {
            logger.warn(
              {
                userId,
                err: error instanceof Error ? error.message : String(error),
              },
              "furniture history load failed — continuing without cooldown history",
            );
            return [] as FurnitureUsageRecord[];
          })
        : [];

    const shotPlan =
      routeDecision.supportsPerShotPrompts && !resolvedRefinementType
        ? buildShotPlanWithDirectedPoses(basePrompt, intelligenceResult.profile, {
            shootType,
            modelGender,
            recentPoseSelections,
            shots,
            useCampaignComposition: params.customCampaign === true,
            directedPoses: usedPoses,
            furnitureUserHistory,
          })
        : undefined;

    const perShotPrompts = shotPlan?.prompts;

    const perShotPoseReferenceUrls =
      shotPlan && !resolvedRefinementType
        ? shotPlan.plannedPoses.map((planned) => {
            const lookupKey = planned.poseId ?? planned.name;
            const definition = getPoseDefinition(lookupKey);
            const relativePath = definition?.poseReferenceImage;
            // Stage-1 uses backend-only face-neutral Pose Master bytes.
            // Frontend display assets (PoseN.png) remain face-bearing and unchanged.
            const stage1PoseKey =
              definition?.poseId ?? planned.poseId ?? relativePath ?? lookupKey;

            if (!relativePath && !definition?.poseId && !planned.poseId) {
              logger.warn(
                { renderId, poseKey: lookupKey },
                "AI pipeline: Pose Master visual reference path missing",
              );
              return null;
            }
            try {
              return loadStage1PoseReferenceImageAsDataUri(
                stage1PoseKey,
                renderId,
              );
            } catch (error) {
              logger.warn(
                {
                  renderId,
                  poseKey: lookupKey,
                  stage1PoseKey,
                  relativePath,
                  err: error,
                },
                "AI pipeline: failed to load face-neutral Stage-1 Pose Master — continuing without it",
              );
              return null;
            }
          })
        : undefined;

    // Furniture reference contract — per slot. Each shot must carry a loadable
    // product reference for its selected asset. Silent null → text-only is forbidden.
    let perShotFurnitureReferenceUrls: Array<string | null> | undefined;
    if (shotPlan && !resolvedRefinementType) {
      const furnitureResolution = resolvePerShotFurnitureReferences({
        furnitureSelections: shotPlan.furnitureSelections ?? [],
        plannedPoses: shotPlan.plannedPoses,
        garmentTone: deriveGarmentTone(intelligenceResult.profile),
        furnitureUserHistory,
        renderId,
      });
      perShotFurnitureReferenceUrls = furnitureResolution.referenceUrls;
      shotPlan.furnitureSelections = furnitureResolution.furnitureSelections;
    }

    const identityForensics =
      !resolvedRefinementType
        ? {
            generationMode: resolveIdentityGenerationMode({
              generationType,
              shots,
              customCampaign: params.customCampaign === true,
            }),
            modelIdentityId: modelIdentityId ?? null,
            talentAssetPath: isLocalIdentityImageUrl(modelImageUrl)
              ? modelImageUrl
              : null,
            perShotPoseIds: shotPlan
              ? shotPlan.plannedPoses.map(
                  (planned) => planned.poseId ?? planned.name ?? null,
                )
              : undefined,
            perShotPoseAssetPaths: shotPlan
              ? shotPlan.plannedPoses.map((planned) => {
                  const lookupKey = planned.poseId ?? planned.name;
                  return getPoseDefinition(lookupKey)?.poseReferenceImage ?? null;
                })
              : undefined,
          }
        : undefined;

    if (perShotPrompts) {
      logger.info(
        {
          renderId,
          generationSessionId: pipelineTrace.generationSessionId,
          shots,
          perShotPromptCount: perShotPrompts.length,
          poseReferenceCount: perShotPoseReferenceUrls?.filter(Boolean).length ?? 0,
          diversityMode: resolvePoseShootType(shots, generationType),
        },
        "Creative Director: per-shot pose diversity briefs generated",
      );
    }

    if ((useSeparateEvidence || useSupplementalSheet) && !resolvedRefinementType) {
      const hasPose = Boolean(
        perShotPoseReferenceUrls?.some((url) => Boolean(url)),
      );
      evidenceLayout = buildGarmentEvidenceSetLayout({
        hasBack: Boolean(garmentReference.garmentBackImageUrl),
        hasDetail: Boolean(garmentReference.garmentDetailImageUrl),
        hasPose,
        hasSupplementalSheet: useSupplementalSheet,
      });
      garmentEvidenceSetMappingInstruction = evidenceLayout.mappingInstruction;
      garmentEvidenceTalentReferenceImageNumber = evidenceLayout.talentRef;
    }

    const remappedPerShotPrompts =
      evidenceLayout && perShotPrompts
        ? perShotPrompts.map((p) =>
            remapCreativePromptReferenceNumbers(p, evidenceLayout!),
          )
        : perShotPrompts;

    const remappedBasePrompt =
      evidenceLayout && !resolvedRefinementType
        ? remapCreativePromptReferenceNumbers(basePrompt, evidenceLayout)
        : basePrompt;

    logPipelineStage(pipelineTrace, PipelineStage.PROMPT_GENERATION_COMPLETED, {
      shots,
      perShotPromptCount: remappedPerShotPrompts?.length ?? 1,
      provider: routeDecision.provider,
    });

    const photoshootResult = await getRenderingEngine().generatePhotoshoot({
      garmentImageUrl,
      modelImageUrl: providerModelImageUrl,
      prompt: resolvedRefinementType ? "" : remappedBasePrompt,
      shots,
      perShotPrompts: remappedPerShotPrompts,
      perShotPoseReferenceUrls,
      previousOutputUrl: previousOutputUrl ?? undefined,
      refinementInstruction,
      garmentReferenceCorrespondenceInstruction:
        resolvedRefinementType ? undefined : garmentReferenceCorrespondenceInstruction,
      garmentEvidencePackaging: useSeparateEvidence
        ? "separate"
        : "sheet",
      garmentReferenceSheetImageUrl: useSupplementalSheet
        ? garmentReference.garmentReferenceSheetImageUrl
        : undefined,
      garmentBackImageUrl: useSeparateEvidence
        ? garmentReference.garmentBackImageUrl
        : undefined,
      garmentDetailImageUrl: useSeparateEvidence
        ? garmentReference.garmentDetailImageUrl
        : undefined,
      garmentEvidenceSetMappingInstruction: resolvedRefinementType
        ? undefined
        : garmentEvidenceSetMappingInstruction,
      garmentEvidenceTalentReferenceImageNumber: resolvedRefinementType
        ? undefined
        : garmentEvidenceTalentReferenceImageNumber,
      pipelineTrace,
      outputResolution: params.outputResolution ?? "2K",
      identityForensics,
      // V1 Create — always white studio; ignore user/stale locationEnvironment.
      locationEnvironment: resolvedRefinementType
        ? undefined
        : resolveV1CreateLocationEnvironment(params.locationEnvironment),
      additionalTalentImageUrls:
        additionalTalentImageUrls.length > 0 ? additionalTalentImageUrls : undefined,
      // Observability only — sheet path does not forward Back/Detail URLs.
      garmentEvidenceHasBack: Boolean(backImageUrl),
      garmentEvidenceHasDetail: Boolean(detailImageUrl),
      garmentReferenceMode: garmentReference.mode,
      perShotFurnitureRequired: shotPlan?.furnitureSelections?.map(
        (asset) => asset != null,
      ),
      perShotFurnitureReferenceUrls,
      perShotFurnitureAssetIds: shotPlan?.furnitureSelections?.map(
        (asset) => asset?.id ?? null,
      ),
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

    const settledShotIndices = new Set<number>();

    for (const image of photoshootResult.images) {
      logPipelineStage(pipelineTrace, PipelineStage.R2_UPLOAD_STARTED, {
        imageIndex: image.index,
      });

      try {
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

        const furniture = shotPlan?.furnitureSelections?.[image.index] ?? null;
        await params.onComplete(
          outputImageUrl,
          image.index,
          shotPlan?.plannedPoses[image.index]
            ? {
                poseName: shotPlan.plannedPoses[image.index]!.name,
                poseFamily: shotPlan.plannedPoses[image.index]!.family,
              }
            : undefined,
          furniture
            ? { assetId: furniture.id, family: furniture.family }
            : null,
        );
        settledShotIndices.add(image.index);
      } catch (uploadError) {
        const err =
          uploadError instanceof Error
            ? uploadError
            : new Error(String(uploadError));
        logger.warn(
          { renderId, shotIndex: image.index, err: err.message },
          "AI pipeline: shot upload failed — marking row as failed",
        );
        if (params.onShotError) {
          await params.onShotError(err, image.index);
          settledShotIndices.add(image.index);
        }
      }
    }

    // ── Step 7: Mark individually failed shots (generation partial failure) ─
    if (params.onShotError) {
      for (let i = 0; i < shots; i++) {
        if (settledShotIndices.has(i)) continue;
        logger.warn(
          { renderId, shotIndex: i },
          "AI pipeline: shot failed — marking row as failed",
        );
        await params.onShotError(new Error(`Shot ${i} failed to generate`), i);
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
  } finally {
    stopHeartbeat();
  }
}
