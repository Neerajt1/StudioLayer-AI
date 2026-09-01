// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — Nano Pro Headless Mannequin Identity Trial route
//
// POST /api/test/nano-pro-headless-mannequin-trial
// GET  /api/test/nano-pro-headless-mannequin-trial  (gate status)
//
// Gated by EXPERIMENTAL_NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_ENABLED=true
//   OR EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_ENABLED=true (shared local QA).
// Does NOT enter POST /renders, V1 Create, credits, Gallery, or cascade.
// Does NOT reuse or alter the identity-first trial.
// Pose Master MUST be face-neutral Stage-1 backend assets.
// ---------------------------------------------------------------------------

import { Router } from "express";
import { logger } from "../lib/logger.js";
import { loadStudioTalentImageAsDataUri } from "../rendering/preprocessing.js";
import {
  faceNeutralBackendFilenameForPoseId,
  loadStage1PoseReferenceImageAsDataUri,
  normalizeProductionPoseId,
} from "../rendering/pose-face-neutral-backend.js";
import { findIdentityById } from "../data/identity-library.js";
import {
  HEADLESS_TRIAL_TOTAL_GENERATION_CALLS,
  HEADLESS_STAGE1_REFERENCE_ORDER,
  HEADLESS_STAGE2_REFERENCE_ORDER,
  HeadlessMaskFailureError,
  HeadlessIdentityReferenceFailureError,
  HeadlessStage2FailureError,
  NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_ENV,
  NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
  buildHeadlessStage1Request,
  buildHeadlessStage2Request,
  generateNanoProHeadlessMannequinTrial,
  isNanoProHeadlessMannequinTrialEnabled,
  redactHeadlessStageRequestForInspection,
  resolveNanoProHeadlessMannequinTrialModel,
} from "../services/rendering/providers/nano-pro-headless-mannequin-trial.js";
import {
  TRIAL_NANO_PRO_STORAGE_PREFIX,
  persistTrialNanoProOutput,
} from "../services/rendering/trial-nano-pro-storage.js";
import {
  V1_CREATE_USE_NANO_PRO_CASCADE,
  resolveOpenRouterRenderEngine,
} from "../services/rendering/rendering.config.js";
import { resolveNanoProStandaloneTrialPackaging } from "../services/rendering/providers/nano-pro-standalone-trial.js";

const testNanoProHeadlessMannequinTrialRouter = Router();

const ROUTE_PATH = "/test/nano-pro-headless-mannequin-trial";

/** Narrow first experiment: default to a pose that requires no furniture. */
const DEFAULT_POSE_ID = "Pose50";

logger.info(
  {
    experimental: true,
    experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
    route: `POST /api${ROUTE_PATH}`,
    enabled: isNanoProHeadlessMannequinTrialEnabled(),
    model: resolveNanoProHeadlessMannequinTrialModel(),
    envRaw: process.env[NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_ENV] ?? "(unset)",
    cascadeFlag: V1_CREATE_USE_NANO_PRO_CASCADE,
    productionEngine: resolveOpenRouterRenderEngine(),
  },
  "test-nano-pro-headless-mannequin-trial: router module loaded",
);

testNanoProHeadlessMannequinTrialRouter.get(ROUTE_PATH, (_req, res): void => {
  res.json({
    ok: true,
    experimental: true,
    experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
    architecture: "headless-mannequin-identity-second",
    route: `POST /api${ROUTE_PATH}`,
    enabled: isNanoProHeadlessMannequinTrialEnabled(),
    model: resolveNanoProHeadlessMannequinTrialModel(),
    api: "POST /api/v1/images",
    engine: "nano_pro",
    cascade: false,
    generationCalls: HEADLESS_TRIAL_TOTAL_GENERATION_CALLS,
    V1_CREATE_USE_NANO_PRO_CASCADE,
    productionOR_RENDER_ENGINE: resolveOpenRouterRenderEngine(),
    packaging: resolveNanoProStandaloneTrialPackaging(),
    stage1ReferenceOrder: HEADLESS_STAGE1_REFERENCE_ORDER,
    stage2ReferenceOrder: HEADLESS_STAGE2_REFERENCE_ORDER,
    defaultPoseId: DEFAULT_POSE_ID,
    poseMaster:
      "face-neutral Stage-1 backend (loadStage1PoseReferenceImageAsDataUri)",
    storagePrefix: TRIAL_NANO_PRO_STORAGE_PREFIX,
    credits: "none — experimental route does not deduct Studio Credits",
    gallery: false,
    createsRenderRow: false,
    productionCreateUntouched: true,
    identityFirstTrialUntouched: true,
    initialResolution: "2K",
    envRaw: process.env[NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_ENV] ?? "(unset)",
    sharedStandaloneGate:
      process.env["EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_ENABLED"] ?? "(unset)",
  });
});

function resolveTalent(body: Record<string, unknown>): {
  url: string;
  modelIdentityId: string | null;
} {
  if (
    typeof body["talentImageUrl"] === "string" &&
    body["talentImageUrl"].trim()
  ) {
    return {
      url: body["talentImageUrl"].trim(),
      modelIdentityId:
        typeof body["modelIdentityId"] === "string" &&
        body["modelIdentityId"].trim()
          ? body["modelIdentityId"].trim()
          : null,
    };
  }

  const modelIdentityId =
    typeof body["modelIdentityId"] === "string" && body["modelIdentityId"].trim()
      ? body["modelIdentityId"].trim()
      : typeof body["talentId"] === "string" && body["talentId"].trim()
        ? body["talentId"].trim()
        : null;

  if (!modelIdentityId) {
    throw new Error(
      `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: modelIdentityId or talentImageUrl is required`,
    );
  }

  const identity = findIdentityById(modelIdentityId);
  if (!identity) {
    throw new Error(
      `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: Studio Talent not found for id ${modelIdentityId}`,
    );
  }

  return {
    url: loadStudioTalentImageAsDataUri(identity.imageUrl),
    modelIdentityId,
  };
}

function resolveGarment(body: Record<string, unknown>): {
  url: string;
  garmentId: string | null;
} {
  const url =
    (typeof body["garmentImageUrl"] === "string" &&
    body["garmentImageUrl"].trim()
      ? body["garmentImageUrl"].trim()
      : null) ??
    (typeof body["sourceImageUrl"] === "string" && body["sourceImageUrl"].trim()
      ? body["sourceImageUrl"].trim()
      : null);

  if (!url) {
    throw new Error(
      `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: garmentImageUrl (or sourceImageUrl) is required`,
    );
  }

  const garmentId =
    typeof body["garmentId"] === "string" && body["garmentId"].trim()
      ? body["garmentId"].trim()
      : null;

  return { url, garmentId };
}

function resolvePose(body: Record<string, unknown>): {
  poseId: string;
  poseImageUrl: string;
  faceNeutralFilename: string;
} {
  const rawPoseId =
    typeof body["poseId"] === "string" && body["poseId"].trim()
      ? body["poseId"].trim()
      : DEFAULT_POSE_ID;

  const poseId = normalizeProductionPoseId(rawPoseId);
  if (!poseId) {
    throw new Error(
      `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: invalid poseId "${rawPoseId}"`,
    );
  }

  // HARD RULE — face-neutral Stage-1 only. Never /pose-references/PoseN.png.
  const poseImageUrl = loadStage1PoseReferenceImageAsDataUri(poseId);
  const faceNeutralFilename = faceNeutralBackendFilenameForPoseId(poseId);

  return { poseId, poseImageUrl, faceNeutralFilename };
}

testNanoProHeadlessMannequinTrialRouter.post(
  ROUTE_PATH,
  async (req, res): Promise<void> => {
    logger.info(
      {
        experimental: true,
        experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
        path: req.originalUrl,
        enabled: isNanoProHeadlessMannequinTrialEnabled(),
      },
      "test-nano-pro-headless-mannequin-trial: POST hit",
    );

    if (!isNanoProHeadlessMannequinTrialEnabled()) {
      res.status(403).json({
        ok: false,
        experimental: true,
        experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
        error: `Nano Pro Headless Mannequin Trial is disabled. Set ${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_ENV}=true (or EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_ENABLED=true) to enable.`,
        enabled: false,
        openRouterCalled: false,
        r2Written: false,
        createsRenderRow: false,
        creditsDeducted: 0,
        gallery: false,
        cascade: false,
        V1_CREATE_USE_NANO_PRO_CASCADE,
        productionOR_RENDER_ENGINE: resolveOpenRouterRenderEngine(),
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const dryRun =
      body["dryRun"] === true ||
      body["dryRun"] === "true" ||
      body["dryRun"] === 1 ||
      body["dryRun"] === "1";
    const persistToR2 =
      body["persistToR2"] === true ||
      body["persistToR2"] === "true" ||
      body["persistToR2"] === 1 ||
      body["persistToR2"] === "1";

    const rawResolution = String(body["outputResolution"] ?? "2K").toUpperCase();
    const outputResolution = rawResolution === "4K" ? "4K" : "2K";

    try {
      const talent = resolveTalent(body);
      const garment = resolveGarment(body);
      const pose = resolvePose(body);

      const creativeShotPrompt =
        typeof body["creativeShotPrompt"] === "string" &&
        body["creativeShotPrompt"].trim()
          ? body["creativeShotPrompt"].trim()
          : undefined;

      if (dryRun) {
        const stage1 = buildHeadlessStage1Request({
          garmentImageUrl: garment.url,
          poseImageUrl: pose.poseImageUrl,
          creativeShotPrompt,
          outputResolution: outputResolution as "2K" | "4K",
        });
        // Dry-run Stage 2 uses a sentinel placeholder (no Stage-1 bytes yet).
        const stage2 = buildHeadlessStage2Request({
          headlessBaseImageUrl:
            "data:image/png;base64,HEADLESS_STAGE1_PLACEHOLDER",
          identityReferenceImageUrl:
            "data:image/png;base64,IDENTITY_REFERENCE_PLACEHOLDER",
          outputResolution: outputResolution as "2K" | "4K",
        });

        res.json({
          ok: true,
          dryRun: true,
          experimental: true,
          experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
          architecture: "headless-mannequin-identity-second",
          openRouterCalled: false,
          r2Written: false,
          createsRenderRow: false,
          creditsDeducted: 0,
          gallery: false,
          cascade: false,
          nanoRegularInvoked: false,
          generationCalls: HEADLESS_TRIAL_TOTAL_GENERATION_CALLS,
          packaging: resolveNanoProStandaloneTrialPackaging(),
          V1_CREATE_USE_NANO_PRO_CASCADE,
          productionOR_RENDER_ENGINE: resolveOpenRouterRenderEngine(),
          poseId: pose.poseId,
          poseMasterPath: `assets/pose-references-face-neutral/${pose.faceNeutralFilename}`,
          faceNeutralFilename: pose.faceNeutralFilename,
          storagePrefix: TRIAL_NANO_PRO_STORAGE_PREFIX,
          stage1: redactHeadlessStageRequestForInspection(stage1),
          stage2: redactHeadlessStageRequestForInspection(stage2),
          stage1PromptUsed: stage1.promptUsed,
          stage2PromptUsed: stage2.promptUsed,
        });
        return;
      }

      const result = await generateNanoProHeadlessMannequinTrial({
        talentImageUrl: talent.url,
        garmentImageUrl: garment.url,
        poseImageUrl: pose.poseImageUrl,
        poseId: pose.poseId,
        modelIdentityId: talent.modelIdentityId,
        garmentId: garment.garmentId,
        creativeShotPrompt,
        outputResolution: outputResolution as "2K" | "4K",
      });

      let stage1Storage: { objectKey: string; outputUrl: string } | null = null;
      let stage2Storage: { objectKey: string; outputUrl: string } | null = null;
      let maskedStorage: { objectKey: string; outputUrl: string } | null = null;

      if (persistToR2) {
        if (result.stage1.imageDataUri) {
          stage1Storage = await persistTrialNanoProOutput({
            trialRunId: `${result.trialRunId}-headless-stage1`,
            dataUri: result.stage1.imageDataUri,
            filename: "stage1-headless-base.png",
          });
        }
        if (result.headMask.maskedImageDataUri) {
          maskedStorage = await persistTrialNanoProOutput({
            trialRunId: `${result.trialRunId}-headless-masked`,
            dataUri: result.headMask.maskedImageDataUri,
            filename: "stage1-masked-headless.png",
          });
        }
        if (result.stage2.imageDataUri) {
          stage2Storage = await persistTrialNanoProOutput({
            trialRunId: `${result.trialRunId}-headless-stage2`,
            dataUri: result.stage2.imageDataUri,
            filename: "stage2-identity-applied.png",
          });
        }
      }

      const status =
        result.stage1.resolutionMismatch || result.stage2.resolutionMismatch
          ? 422
          : 200;

      const stage1ImageUrl =
        stage1Storage?.outputUrl ?? result.stage1.imageDataUri;
      const stage2ImageUrl =
        stage2Storage?.outputUrl ?? result.stage2.imageDataUri;

      res.status(status).json({
        ...result,
        stage1: {
          ...result.stage1,
          imageDataUri: stage1Storage ? null : result.stage1.imageDataUri,
          images: [{ url: stage1ImageUrl, index: 0 }],
          outputUrl: stage1Storage?.outputUrl ?? null,
          objectKey: stage1Storage?.objectKey ?? null,
        },
        stage2: {
          ...result.stage2,
          imageDataUri: stage2Storage ? null : result.stage2.imageDataUri,
          images: [{ url: stage2ImageUrl, index: 0 }],
          outputUrl: stage2Storage?.outputUrl ?? null,
          objectKey: stage2Storage?.objectKey ?? null,
        },
        identityReference: result.identityReference,
        headMask: {
          ...result.headMask,
          maskedImageDataUri: maskedStorage
            ? null
            : result.headMask.maskedImageDataUri,
          outputUrl: maskedStorage?.outputUrl ?? null,
          objectKey: maskedStorage?.objectKey ?? null,
        },
        imageDataUri: stage2Storage ? null : result.imageDataUri,
        images: [{ url: stage2ImageUrl, index: 0 }],
        outputUrl: stage2Storage?.outputUrl ?? null,
        objectKey: stage2Storage?.objectKey ?? null,
        r2Written: Boolean(stage1Storage || stage2Storage),
        openRouterCalled: true,
        poseMasterPath: `assets/pose-references-face-neutral/${pose.faceNeutralFilename}`,
        faceNeutralFilename: pose.faceNeutralFilename,
        V1_CREATE_USE_NANO_PRO_CASCADE,
        productionOR_RENDER_ENGINE: resolveOpenRouterRenderEngine(),
      });
    } catch (error) {
      if (error instanceof HeadlessIdentityReferenceFailureError) {
        logger.error(
          {
            experimental: true,
            experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
            err: error.message,
            trialRunId: error.trialRunId,
            stage1RunId: error.stage1.stageRunId,
            reason: error.reason,
          },
          "test-nano-pro-headless-mannequin-trial: identity reference failed — Stage 2 aborted",
        );

        res.status(error.httpStatus).json({
          ok: false,
          experimental: true,
          experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
          architecture: "headless-mannequin-identity-second",
          error: error.message,
          stageFailed: "identity-reference",
          identityReferenceFailureReason: error.reason,
          identityReferenceFailureDetail: error.detail,
          generationCalls: error.generationCalls,
          stage2Attempted: false,
          trialRunId: error.trialRunId,
          stage1RunId: error.stage1.stageRunId,
          stage1: error.stage1,
          createsRenderRow: false,
          creditsDeducted: 0,
          gallery: false,
          cascade: false,
          nanoRegularInvoked: false,
          V1_CREATE_USE_NANO_PRO_CASCADE,
          productionOR_RENDER_ENGINE: resolveOpenRouterRenderEngine(),
        });
        return;
      }

      if (error instanceof HeadlessMaskFailureError) {
        logger.error(
          {
            experimental: true,
            experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
            err: error.message,
            trialRunId: error.trialRunId,
            stage1RunId: error.stage1.stageRunId,
            reasons: error.reasons,
            metrics: error.metrics,
          },
          "test-nano-pro-headless-mannequin-trial: head masking failed — Stage 2 aborted",
        );

        res.status(error.httpStatus).json({
          ok: false,
          experimental: true,
          experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
          architecture: "headless-mannequin-identity-second",
          error: error.message,
          stageFailed: "head-mask",
          maskFailureReasons: error.reasons,
          maskFailureDetail: error.detail,
          maskMetrics: error.metrics,
          generationCalls: error.generationCalls,
          stage2Attempted: false,
          trialRunId: error.trialRunId,
          stage1RunId: error.stage1.stageRunId,
          stage1: error.stage1,
          createsRenderRow: false,
          creditsDeducted: 0,
          gallery: false,
          cascade: false,
          nanoRegularInvoked: false,
          V1_CREATE_USE_NANO_PRO_CASCADE,
          productionOR_RENDER_ENGINE: resolveOpenRouterRenderEngine(),
        });
        return;
      }

      if (error instanceof HeadlessStage2FailureError) {
        logger.error(
          {
            experimental: true,
            experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
            err: error.message,
            trialRunId: error.trialRunId,
            stage1RunId: error.stage1.stageRunId,
            stage2RunId: error.stage2RunId,
          },
          "test-nano-pro-headless-mannequin-trial: Stage 2 failed",
        );

        res
          .status(
            error.httpStatus >= 400 && error.httpStatus < 600
              ? error.httpStatus
              : 500,
          )
          .json({
            ok: false,
            experimental: true,
            experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
            architecture: "headless-mannequin-identity-second",
            error: error.message,
            stageFailed: 2,
            trialRunId: error.trialRunId,
            stage1RunId: error.stage1.stageRunId,
            stage2RunId: error.stage2RunId,
            stage1: error.stage1,
            createsRenderRow: false,
            creditsDeducted: 0,
            gallery: false,
            cascade: false,
            nanoRegularInvoked: false,
            V1_CREATE_USE_NANO_PRO_CASCADE,
            productionOR_RENDER_ENGINE: resolveOpenRouterRenderEngine(),
          });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      const httpStatus =
        typeof (error as { httpStatus?: number }).httpStatus === "number"
          ? (error as { httpStatus: number }).httpStatus
          : 500;

      logger.error(
        {
          experimental: true,
          experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
          err: message,
        },
        "test-nano-pro-headless-mannequin-trial: failed",
      );

      res.status(httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500).json({
        ok: false,
        experimental: true,
        experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
        architecture: "headless-mannequin-identity-second",
        error: message,
        createsRenderRow: false,
        creditsDeducted: 0,
        gallery: false,
        cascade: false,
        nanoRegularInvoked: false,
        V1_CREATE_USE_NANO_PRO_CASCADE,
        productionOR_RENDER_ENGINE: resolveOpenRouterRenderEngine(),
      });
    }
  },
);

export default testNanoProHeadlessMannequinTrialRouter;
