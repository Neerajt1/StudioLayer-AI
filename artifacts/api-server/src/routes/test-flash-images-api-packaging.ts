// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — Flash Images API packaging experiment
//
// POST /api/test/flash-images-api-packaging-experiment
//
// Gated by EXPERIMENTAL_FLASH_IMAGES_API_PACKAGING_ENABLED=true.
// Does NOT use production Create / Nano Pro / Studio Credits / Gallery.
//
// Body (typical):
// {
//   "garmentImageUrl": "https://... | data:...",
//   "modelIdentityId": "F-IN-01",
//   "poseId": "Pose36",
//   "creativeShotPrompt": "<same trailing Flash shot text>",  // optional
//   "dryRun": true,   // build request only — no OpenRouter call
//   "outputResolution": "2K"
// }
// ---------------------------------------------------------------------------

import { Router } from "express";
import { logger } from "../lib/logger.js";
import {
  loadPoseReferenceImageAsDataUri,
  loadStudioTalentImageAsDataUri,
} from "../rendering/preprocessing.js";
import { getPoseDefinition } from "../intelligence/pose-library.js";
import { findIdentityById } from "../data/identity-library.js";
import {
  FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
  FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
  buildFlashImagesApiPackagingExperimentRequest,
  generateFlashImagesApiPackagingExperiment,
  redactExperimentRequestForInspection,
} from "../services/rendering/providers/flash-images-api-packaging-experiment.js";

const testFlashImagesApiPackagingRouter = Router();

function isExperimentalEnabled(): boolean {
  const raw =
    process.env["EXPERIMENTAL_FLASH_IMAGES_API_PACKAGING_ENABLED"] ?? "";
  return (
    raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes"
  );
}

logger.info(
  {
    experimental: true,
    experiment: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
    route: "POST /api/test/flash-images-api-packaging-experiment",
    enabled: isExperimentalEnabled(),
    model: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
    envRaw:
      process.env["EXPERIMENTAL_FLASH_IMAGES_API_PACKAGING_ENABLED"] ??
      "(unset)",
  },
  "test-flash-images-api-packaging: router module loaded",
);

/** Reachability / gate status without calling OpenRouter. */
testFlashImagesApiPackagingRouter.get(
  "/test/flash-images-api-packaging-experiment",
  (_req, res): void => {
    res.json({
      ok: true,
      experimental: true,
      experiment: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
      route: "POST /api/test/flash-images-api-packaging-experiment",
      enabled: isExperimentalEnabled(),
      model: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
      api: "POST /api/v1/images",
      hypothesis: "A — Images API packaging vs Flash Chat packaging",
      productionCreateUntouched: true,
      credits: "none — experimental route does not deduct Studio Credits",
      envRaw:
        process.env["EXPERIMENTAL_FLASH_IMAGES_API_PACKAGING_ENABLED"] ??
        "(unset)",
      fixedVariables: {
        model: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
        referenceOrder: ["GARMENT", "TALENT", "POSE_MASTER"],
        aspect_ratio: "4:5",
        resolution: "2K",
      },
    });
  },
);

function resolvePoseImageUrl(body: Record<string, unknown>): string {
  if (typeof body["poseImageUrl"] === "string" && body["poseImageUrl"].trim()) {
    return body["poseImageUrl"].trim();
  }

  const poseId =
    typeof body["poseId"] === "string" && body["poseId"].trim()
      ? body["poseId"].trim()
      : undefined;

  if (!poseId) {
    throw new Error(
      `${FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME}: poseId or poseImageUrl is required`,
    );
  }

  const definition = getPoseDefinition(poseId);
  const relativePath =
    definition?.poseReferenceImage ??
    (definition as { visualPath?: string } | undefined)?.visualPath ??
    `/pose-references/${poseId}.png`;

  if (!relativePath) {
    throw new Error(
      `${FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME}: Pose Master path missing for ${poseId}`,
    );
  }
  return loadPoseReferenceImageAsDataUri(relativePath);
}

function resolveTalentImageUrl(body: Record<string, unknown>): {
  url: string;
  modelIdentityId?: string;
} {
  if (typeof body["talentImageUrl"] === "string" && body["talentImageUrl"].trim()) {
    return { url: body["talentImageUrl"].trim() };
  }
  if (typeof body["modelImageUrl"] === "string" && body["modelImageUrl"].trim()) {
    return { url: body["modelImageUrl"].trim() };
  }

  const modelIdentityId =
    typeof body["modelIdentityId"] === "string" && body["modelIdentityId"].trim()
      ? body["modelIdentityId"].trim()
      : undefined;

  if (!modelIdentityId) {
    throw new Error(
      `${FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME}: modelIdentityId, talentImageUrl, or modelImageUrl is required`,
    );
  }

  const identity = findIdentityById(modelIdentityId);
  if (!identity) {
    throw new Error(
      `${FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME}: Studio Talent not found for id ${modelIdentityId}`,
    );
  }
  return {
    url: loadStudioTalentImageAsDataUri(identity.imageUrl),
    modelIdentityId,
  };
}

testFlashImagesApiPackagingRouter.post(
  "/test/flash-images-api-packaging-experiment",
  async (req, res): Promise<void> => {
    logger.info(
      {
        experimental: true,
        experiment: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
        path: req.originalUrl,
        enabled: isExperimentalEnabled(),
      },
      "test-flash-images-api-packaging: POST hit",
    );

    if (!isExperimentalEnabled()) {
      res.status(403).json({
        ok: false,
        experimental: true,
        experiment: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
        error:
          "Flash Images API packaging experiment is disabled. Set EXPERIMENTAL_FLASH_IMAGES_API_PACKAGING_ENABLED=true to enable.",
        model: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
        productionCreateUntouched: true,
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const dryRun =
      body["dryRun"] === true ||
      body["dryRun"] === 1 ||
      body["dryRun"] === "true";

    const garmentImageUrl =
      typeof body["garmentImageUrl"] === "string" && body["garmentImageUrl"].trim()
        ? body["garmentImageUrl"].trim()
        : undefined;

    if (!garmentImageUrl) {
      res.status(400).json({
        ok: false,
        experimental: true,
        experiment: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
        error: "garmentImageUrl is required",
      });
      return;
    }

    const rawResolution = String(body["outputResolution"] ?? "2K").toUpperCase();
    const outputResolution = rawResolution === "4K" ? "4K" : "2K";

    const creativeShotPrompt =
      typeof body["creativeShotPrompt"] === "string" &&
      body["creativeShotPrompt"].trim()
        ? body["creativeShotPrompt"].trim()
        : typeof body["prompt"] === "string" && body["prompt"].trim()
          ? body["prompt"].trim()
          : undefined;

    try {
      const talent = resolveTalentImageUrl(body);
      const poseImageUrl = resolvePoseImageUrl(body);
      const poseIdUsed =
        typeof body["poseId"] === "string" && body["poseId"].trim()
          ? body["poseId"].trim()
          : typeof body["poseImageUrl"] === "string"
            ? "(poseImageUrl)"
            : null;

      const built = buildFlashImagesApiPackagingExperimentRequest({
        garmentImageUrl,
        talentImageUrl: talent.url,
        poseImageUrl,
        creativeShotPrompt,
        outputResolution,
      });

      if (dryRun) {
        res.json({
          ok: true,
          dryRun: true,
          experimental: true,
          experiment: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
          model: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
          productionCreateUntouched: true,
          creditsDeducted: 0,
          billingUntouched: true,
          openRouterCalled: false,
          modelIdentityId: talent.modelIdentityId ?? null,
          poseIdUsed,
          inspection: redactExperimentRequestForInspection(built),
        });
        return;
      }

      logger.info(
        {
          experimental: true,
          experiment: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
          model: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
          outputResolution,
          poseIdUsed,
          modelIdentityId: talent.modelIdentityId ?? null,
          credits: "none — experimental route does not deduct Studio Credits",
        },
        "test-flash-images-api-packaging: invoking OpenRouter Images API",
      );

      const result = await generateFlashImagesApiPackagingExperiment({
        garmentImageUrl,
        talentImageUrl: talent.url,
        poseImageUrl,
        creativeShotPrompt,
        outputResolution,
      });

      res.json({
        ...result,
        modelIdentityId: talent.modelIdentityId ?? null,
        poseIdUsed,
        creditsDeducted: 0,
        billingUntouched: true,
        openRouterCalled: true,
        comparisonHint:
          "Compare identity fidelity vs one Flash Chat Create (OR_RENDER_ENGINE=flash) using the same talent, garment, and pose — packaging is the only intentional variable.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const httpStatus =
        err &&
        typeof err === "object" &&
        typeof (err as { httpStatus?: unknown }).httpStatus === "number"
          ? (err as { httpStatus: number }).httpStatus
          : 500;
      const openRouterRequestId =
        err && typeof err === "object"
          ? ((err as { openRouterRequestId?: string | null })
              .openRouterRequestId ?? null)
          : null;
      const responseBody =
        err && typeof err === "object"
          ? ((err as { responseBody?: string }).responseBody ?? null)
          : null;

      logger.error(
        {
          error: message,
          experimental: true,
          experiment: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
          openRouterRequestId,
          httpStatus,
        },
        "test-flash-images-api-packaging: failed",
      );

      res
        .status(httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500)
        .json({
          ok: false,
          experimental: true,
          experiment: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
          model: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
          error: message,
          httpStatus,
          openRouterRequestId,
          responseBody,
          creditsDeducted: 0,
          productionCreateUntouched: true,
        });
    }
  },
);

export default testFlashImagesApiPackagingRouter;

/** Exported for isolation tests — Create must never import this router. */
export const FLASH_IMAGES_API_PACKAGING_EXPERIMENT_ROUTE =
  "/test/flash-images-api-packaging-experiment" as const;
