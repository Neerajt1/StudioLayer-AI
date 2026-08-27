// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — Nano Pro Standalone Trial route
//
// POST /api/test/nano-pro-standalone-trial
// GET  /api/test/nano-pro-standalone-trial  (gate status)
//
// Gated by EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_ENABLED=true.
// Does NOT enter POST /renders, V1 Create, credits, Gallery, or cascade.
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
  NANO_PRO_STANDALONE_TRIAL_ENV,
  NANO_PRO_STANDALONE_TRIAL_NAME,
  NANO_PRO_STANDALONE_TRIAL_PACKAGING_ENV,
  buildNanoProStandaloneTrialRequest,
  generateNanoProStandaloneTrial,
  isNanoProStandaloneTrialEnabled,
  redactNanoProStandaloneTrialRequestForInspection,
  resolveNanoProStandaloneTrialModel,
  resolveNanoProStandaloneTrialPackaging,
} from "../services/rendering/providers/nano-pro-standalone-trial.js";
import {
  TRIAL_NANO_PRO_STORAGE_PREFIX,
  persistTrialNanoProOutput,
} from "../services/rendering/trial-nano-pro-storage.js";
import {
  V1_CREATE_USE_NANO_PRO_CASCADE,
  resolveOpenRouterRenderEngine,
} from "../services/rendering/rendering.config.js";

const testNanoProStandaloneTrialRouter = Router();

const ROUTE_PATH = "/test/nano-pro-standalone-trial";

logger.info(
  {
    experimental: true,
    experiment: NANO_PRO_STANDALONE_TRIAL_NAME,
    route: `POST /api${ROUTE_PATH}`,
    enabled: isNanoProStandaloneTrialEnabled(),
    model: resolveNanoProStandaloneTrialModel(),
    envRaw: process.env[NANO_PRO_STANDALONE_TRIAL_ENV] ?? "(unset)",
    cascadeFlag: V1_CREATE_USE_NANO_PRO_CASCADE,
    productionEngine: resolveOpenRouterRenderEngine(),
  },
  "test-nano-pro-standalone-trial: router module loaded",
);

testNanoProStandaloneTrialRouter.get(ROUTE_PATH, (_req, res): void => {
  res.json({
    ok: true,
    experimental: true,
    experiment: NANO_PRO_STANDALONE_TRIAL_NAME,
    route: `POST /api${ROUTE_PATH}`,
    enabled: isNanoProStandaloneTrialEnabled(),
    model: resolveNanoProStandaloneTrialModel(),
    api: "POST /api/v1/images",
    engine: "nano_pro",
    cascade: false,
    V1_CREATE_USE_NANO_PRO_CASCADE,
    productionOR_RENDER_ENGINE: resolveOpenRouterRenderEngine(),
    packaging: resolveNanoProStandaloneTrialPackaging(),
    referenceOrder: ["GARMENT", "TALENT", "POSE_MASTER"],
    poseMaster: "face-neutral Stage-1 backend (loadStage1PoseReferenceImageAsDataUri)",
    storagePrefix: TRIAL_NANO_PRO_STORAGE_PREFIX,
    credits: "none — experimental route does not deduct Studio Credits",
    gallery: false,
    createsRenderRow: false,
    productionCreateUntouched: true,
    envRaw: process.env[NANO_PRO_STANDALONE_TRIAL_ENV] ?? "(unset)",
    packagingEnv:
      process.env[NANO_PRO_STANDALONE_TRIAL_PACKAGING_ENV] ?? "(default v2)",
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
      `${NANO_PRO_STANDALONE_TRIAL_NAME}: modelIdentityId or talentImageUrl is required`,
    );
  }

  const identity = findIdentityById(modelIdentityId);
  if (!identity) {
    throw new Error(
      `${NANO_PRO_STANDALONE_TRIAL_NAME}: Studio Talent not found for id ${modelIdentityId}`,
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
      `${NANO_PRO_STANDALONE_TRIAL_NAME}: garmentImageUrl (or sourceImageUrl) is required`,
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
      `${NANO_PRO_STANDALONE_TRIAL_NAME}: invalid poseId "${rawPoseId}"`,
    );
  }

  // HARD RULE — face-neutral Stage-1 only. Never /pose-references/PoseN.png.
  const poseImageUrl = loadStage1PoseReferenceImageAsDataUri(poseId);
  const faceNeutralFilename = faceNeutralBackendFilenameForPoseId(poseId);

  return { poseId, poseImageUrl, faceNeutralFilename };
}

testNanoProStandaloneTrialRouter.post(
  ROUTE_PATH,
  async (req, res): Promise<void> => {
    logger.info(
      {
        experimental: true,
        experiment: NANO_PRO_STANDALONE_TRIAL_NAME,
        path: req.originalUrl,
        enabled: isNanoProStandaloneTrialEnabled(),
      },
      "test-nano-pro-standalone-trial: POST hit",
    );

    if (!isNanoProStandaloneTrialEnabled()) {
      res.status(403).json({
        ok: false,
        experimental: true,
        experiment: NANO_PRO_STANDALONE_TRIAL_NAME,
        error: `Nano Pro Standalone Trial is disabled. Set ${NANO_PRO_STANDALONE_TRIAL_ENV}=true to enable.`,
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

      const trialInput = {
        garmentImageUrl: garment.url,
        talentImageUrl: talent.url,
        poseImageUrl: pose.poseImageUrl,
        poseId: pose.poseId,
        modelIdentityId: talent.modelIdentityId,
        garmentId: garment.garmentId,
        creativeShotPrompt,
        outputResolution: outputResolution as "2K" | "4K",
      };

      if (dryRun) {
        const built = buildNanoProStandaloneTrialRequest(trialInput);
        res.json({
          ok: true,
          dryRun: true,
          experimental: true,
          experiment: NANO_PRO_STANDALONE_TRIAL_NAME,
          openRouterCalled: false,
          r2Written: false,
          createsRenderRow: false,
          creditsDeducted: 0,
          gallery: false,
          cascade: false,
          nanoRegularInvoked: false,
          packaging: built.packaging,
          forensics: built.forensics,
          V1_CREATE_USE_NANO_PRO_CASCADE,
          productionOR_RENDER_ENGINE: resolveOpenRouterRenderEngine(),
          poseMasterPath: `assets/pose-references-face-neutral/${pose.faceNeutralFilename}`,
          faceNeutralFilename: pose.faceNeutralFilename,
          storagePrefix: TRIAL_NANO_PRO_STORAGE_PREFIX,
          request: redactNanoProStandaloneTrialRequestForInspection(built),
        });
        return;
      }

      const result = await generateNanoProStandaloneTrial(trialInput);

      let storage: {
        objectKey: string;
        outputUrl: string;
        bucket: string;
        sizeBytes: number;
      } | null = null;

      if (persistToR2 && result.imageDataUri) {
        storage = await persistTrialNanoProOutput({
          trialRunId: result.trialRunId,
          dataUri: result.imageDataUri,
        });
      }

      const status = result.resolutionMismatch ? 422 : 200;

      res.status(status).json({
        ...result,
        // Prefer persisted URL in images[0] when available; keep data URI too.
        outputUrl: storage?.outputUrl ?? null,
        objectKey: storage?.objectKey ?? null,
        r2Written: Boolean(storage),
        openRouterCalled: true,
        poseMasterPath: `assets/pose-references-face-neutral/${pose.faceNeutralFilename}`,
        faceNeutralFilename: pose.faceNeutralFilename,
        V1_CREATE_USE_NANO_PRO_CASCADE,
        productionOR_RENDER_ENGINE: resolveOpenRouterRenderEngine(),
        images: result.images.map((img) => ({
          ...img,
          url: storage?.outputUrl ?? img.url,
        })),
        imageDataUri: storage ? null : result.imageDataUri,
      });
    } catch (error) {
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

      logger.error(
        {
          experimental: true,
          experiment: NANO_PRO_STANDALONE_TRIAL_NAME,
          err: message,
          trialRunId,
          openRouterRequestId,
        },
        "test-nano-pro-standalone-trial: failed",
      );

      res.status(httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500).json({
        ok: false,
        experimental: true,
        experiment: NANO_PRO_STANDALONE_TRIAL_NAME,
        error: message,
        trialRunId,
        openRouterRequestId,
        createsRenderRow: false,
        creditsDeducted: 0,
        gallery: false,
        cascade: false,
        V1_CREATE_USE_NANO_PRO_CASCADE,
        productionOR_RENDER_ENGINE: resolveOpenRouterRenderEngine(),
      });
    }
  },
);

export default testNanoProStandaloneTrialRouter;
