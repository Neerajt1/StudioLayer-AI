// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — Nano Pro Identity-First / Pose-Second Trial route
//
// POST /api/test/nano-pro-identity-first-trial
// GET  /api/test/nano-pro-identity-first-trial  (gate status)
//
// Gated by EXPERIMENTAL_NANO_PRO_IDENTITY_FIRST_TRIAL_ENABLED=true
//   OR EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_ENABLED=true (shared local QA).
// Does NOT enter POST /renders, V1 Create, credits, Gallery, or cascade.
// Pose Master MUST be face-neutral Stage-1 backend assets.
// Does NOT modify the single-shot nano-pro-standalone-trial.
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
  NANO_PRO_IDENTITY_FIRST_TRIAL_ENV,
  NANO_PRO_IDENTITY_FIRST_TRIAL_NAME,
  buildIdentityFirstStage1Request,
  buildIdentityFirstStage2Request,
  generateNanoProIdentityFirstTrial,
  isNanoProIdentityFirstTrialEnabled,
  redactIdentityFirstStageRequestForInspection,
  resolveNanoProIdentityFirstTrialModel,
  IdentityFirstStage2FailureError,
} from "../services/rendering/providers/nano-pro-identity-first-trial.js";
import {
  TRIAL_NANO_PRO_STORAGE_PREFIX,
  persistTrialNanoProOutput,
} from "../services/rendering/trial-nano-pro-storage.js";
import {
  V1_CREATE_USE_NANO_PRO_CASCADE,
  resolveOpenRouterRenderEngine,
} from "../services/rendering/rendering.config.js";
import { resolveNanoProStandaloneTrialPackaging } from "../services/rendering/providers/nano-pro-standalone-trial.js";

const testNanoProIdentityFirstTrialRouter = Router();

const ROUTE_PATH = "/test/nano-pro-identity-first-trial";

logger.info(
  {
    experimental: true,
    experiment: NANO_PRO_IDENTITY_FIRST_TRIAL_NAME,
    route: `POST /api${ROUTE_PATH}`,
    enabled: isNanoProIdentityFirstTrialEnabled(),
    model: resolveNanoProIdentityFirstTrialModel(),
    envRaw: process.env[NANO_PRO_IDENTITY_FIRST_TRIAL_ENV] ?? "(unset)",
    cascadeFlag: V1_CREATE_USE_NANO_PRO_CASCADE,
    productionEngine: resolveOpenRouterRenderEngine(),
  },
  "test-nano-pro-identity-first-trial: router module loaded",
);

testNanoProIdentityFirstTrialRouter.get(ROUTE_PATH, (_req, res): void => {
  res.json({
    ok: true,
    experimental: true,
    experiment: NANO_PRO_IDENTITY_FIRST_TRIAL_NAME,
    architecture: "identity-first-pose-second",
    route: `POST /api${ROUTE_PATH}`,
    enabled: isNanoProIdentityFirstTrialEnabled(),
    model: resolveNanoProIdentityFirstTrialModel(),
    api: "POST /api/v1/images",
    engine: "nano_pro",
    cascade: false,
    V1_CREATE_USE_NANO_PRO_CASCADE,
    productionOR_RENDER_ENGINE: resolveOpenRouterRenderEngine(),
    packaging: resolveNanoProStandaloneTrialPackaging(),
    stage1ReferenceOrder: ["TALENT"],
    stage2ReferenceOrder: ["IDENTITY_ANCHOR", "GARMENT", "POSE_MASTER"],
    poseMaster: "face-neutral Stage-1 backend (loadStage1PoseReferenceImageAsDataUri)",
    storagePrefix: TRIAL_NANO_PRO_STORAGE_PREFIX,
    credits: "none — experimental route does not deduct Studio Credits",
    gallery: false,
    createsRenderRow: false,
    productionCreateUntouched: true,
    initialResolution: "2K",
    envRaw: process.env[NANO_PRO_IDENTITY_FIRST_TRIAL_ENV] ?? "(unset)",
    sharedStandaloneGate:
      process.env["EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_ENABLED"] ?? "(unset)",
  });
});

function resolveTalent(body: Record<string, unknown>): {
  url: string;
  modelIdentityId: string | null;
} {
  if (typeof body["talentImageUrl"] === "string" && body["talentImageUrl"].trim()) {
    return {
      url: body["talentImageUrl"].trim(),
      modelIdentityId:
        typeof body["modelIdentityId"] === "string" && body["modelIdentityId"].trim()
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
      `${NANO_PRO_IDENTITY_FIRST_TRIAL_NAME}: modelIdentityId or talentImageUrl is required`,
    );
  }

  const identity = findIdentityById(modelIdentityId);
  if (!identity) {
    throw new Error(
      `${NANO_PRO_IDENTITY_FIRST_TRIAL_NAME}: Studio Talent not found for id ${modelIdentityId}`,
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
    (typeof body["garmentImageUrl"] === "string" && body["garmentImageUrl"].trim()
      ? body["garmentImageUrl"].trim()
      : null) ??
    (typeof body["sourceImageUrl"] === "string" && body["sourceImageUrl"].trim()
      ? body["sourceImageUrl"].trim()
      : null);

  if (!url) {
    throw new Error(
      `${NANO_PRO_IDENTITY_FIRST_TRIAL_NAME}: garmentImageUrl (or sourceImageUrl) is required`,
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
      : "Pose50";

  const poseId = normalizeProductionPoseId(rawPoseId);
  if (!poseId) {
    throw new Error(
      `${NANO_PRO_IDENTITY_FIRST_TRIAL_NAME}: invalid poseId "${rawPoseId}"`,
    );
  }

  // HARD RULE — face-neutral Stage-1 only. Never /pose-references/PoseN.png.
  const poseImageUrl = loadStage1PoseReferenceImageAsDataUri(poseId);
  const faceNeutralFilename = faceNeutralBackendFilenameForPoseId(poseId);

  return { poseId, poseImageUrl, faceNeutralFilename };
}

testNanoProIdentityFirstTrialRouter.post(
  ROUTE_PATH,
  async (req, res): Promise<void> => {
    logger.info(
      {
        experimental: true,
        experiment: NANO_PRO_IDENTITY_FIRST_TRIAL_NAME,
        path: req.originalUrl,
        enabled: isNanoProIdentityFirstTrialEnabled(),
      },
      "test-nano-pro-identity-first-trial: POST hit",
    );

    if (!isNanoProIdentityFirstTrialEnabled()) {
      res.status(403).json({
        ok: false,
        experimental: true,
        experiment: NANO_PRO_IDENTITY_FIRST_TRIAL_NAME,
        error: `Nano Pro Identity-First Trial is disabled. Set ${NANO_PRO_IDENTITY_FIRST_TRIAL_ENV}=true (or EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_ENABLED=true) to enable.`,
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

    // Initial experiment: 2K only. 4K accepted in schema for later expansion.
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
        const stage1 = buildIdentityFirstStage1Request({
          talentImageUrl: talent.url,
          modelIdentityId: talent.modelIdentityId,
          outputResolution: outputResolution as "2K" | "4K",
        });
        // Dry-run Stage 2 uses a sentinel placeholder (no Stage-1 bytes yet).
        const stage2 = buildIdentityFirstStage2Request({
          identityAnchorImageUrl:
            "data:image/png;base64,IDENTITY_FIRST_STAGE1_PLACEHOLDER",
          garmentImageUrl: garment.url,
          poseImageUrl: pose.poseImageUrl,
          poseId: pose.poseId,
          creativeShotPrompt,
          outputResolution: outputResolution as "2K" | "4K",
        });

        res.json({
          ok: true,
          dryRun: true,
          experimental: true,
          experiment: NANO_PRO_IDENTITY_FIRST_TRIAL_NAME,
          architecture: "identity-first-pose-second",
          openRouterCalled: false,
          r2Written: false,
          createsRenderRow: false,
          creditsDeducted: 0,
          gallery: false,
          cascade: false,
          nanoRegularInvoked: false,
          packaging: resolveNanoProStandaloneTrialPackaging(),
          V1_CREATE_USE_NANO_PRO_CASCADE,
          productionOR_RENDER_ENGINE: resolveOpenRouterRenderEngine(),
          poseMasterPath: `assets/pose-references-face-neutral/${pose.faceNeutralFilename}`,
          faceNeutralFilename: pose.faceNeutralFilename,
          storagePrefix: TRIAL_NANO_PRO_STORAGE_PREFIX,
          stage1: redactIdentityFirstStageRequestForInspection(stage1),
          stage2: redactIdentityFirstStageRequestForInspection(stage2),
        });
        return;
      }

      const result = await generateNanoProIdentityFirstTrial({
        talentImageUrl: talent.url,
        garmentImageUrl: garment.url,
        poseImageUrl: pose.poseImageUrl,
        poseId: pose.poseId,
        modelIdentityId: talent.modelIdentityId,
        garmentId: garment.garmentId,
        creativeShotPrompt,
        outputResolution: outputResolution as "2K" | "4K",
      });

      let stage1Storage: {
        objectKey: string;
        outputUrl: string;
      } | null = null;
      let stage2Storage: {
        objectKey: string;
        outputUrl: string;
      } | null = null;

      if (persistToR2) {
        if (result.stage1.imageDataUri) {
          stage1Storage = await persistTrialNanoProOutput({
            trialRunId: `${result.trialRunId}-stage1`,
            dataUri: result.stage1.imageDataUri,
            filename: "stage1-identity-anchor.png",
          });
        }
        if (result.stage2.imageDataUri) {
          stage2Storage = await persistTrialNanoProOutput({
            trialRunId: `${result.trialRunId}-stage2`,
            dataUri: result.stage2.imageDataUri,
            filename: "stage2-final.png",
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
      if (error instanceof IdentityFirstStage2FailureError) {
        logger.error(
          {
            experimental: true,
            experiment: NANO_PRO_IDENTITY_FIRST_TRIAL_NAME,
            err: error.message,
            trialRunId: error.trialRunId,
            stage1RunId: error.stage1.stageRunId,
            stage2RunId: error.stage2RunId,
          },
          "test-nano-pro-identity-first-trial: Stage 2 failed",
        );

        res.status(
          error.httpStatus >= 400 && error.httpStatus < 600
            ? error.httpStatus
            : 500,
        ).json({
          ok: false,
          experimental: true,
          experiment: NANO_PRO_IDENTITY_FIRST_TRIAL_NAME,
          architecture: "identity-first-pose-second",
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
      const openRouterRequestId =
        (error as { openRouterRequestId?: string | null }).openRouterRequestId ??
        null;
      const trialRunId =
        (error as { trialRunId?: string }).trialRunId ?? null;
      const stage =
        typeof (error as { stage?: number }).stage === "number"
          ? (error as { stage: number }).stage
          : null;
      const stageRunId =
        (error as { stageRunId?: string }).stageRunId ?? null;

      logger.error(
        {
          experimental: true,
          experiment: NANO_PRO_IDENTITY_FIRST_TRIAL_NAME,
          err: message,
          trialRunId,
          stage,
          stageRunId,
          openRouterRequestId,
        },
        "test-nano-pro-identity-first-trial: failed",
      );

      res.status(httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500).json({
        ok: false,
        experimental: true,
        experiment: NANO_PRO_IDENTITY_FIRST_TRIAL_NAME,
        architecture: "identity-first-pose-second",
        error: message,
        stageFailed: stage,
        trialRunId,
        stageRunId,
        openRouterRequestId,
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

export default testNanoProIdentityFirstTrialRouter;
