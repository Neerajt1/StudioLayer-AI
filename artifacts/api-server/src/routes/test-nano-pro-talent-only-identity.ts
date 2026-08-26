// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — Nano Pro Talent-only identity isolation
//
// POST /api/test/nano-pro-talent-only-identity-experiment
//
// Gated by EXPERIMENTAL_NANO_PRO_TALENT_ONLY_IDENTITY_ENABLED=true.
// Does NOT use production Create. Does NOT deduct Studio Credits.
//
// Body:
// {
//   "garmentImageUrl": "...",   // required for CONTROL parity / dry-run compare
//   "modelIdentityId": "F-IN-01",
//   "poseId": "Pose36",
//   "creativeShotPrompt": "<same production creative text>",
//   "dryRun": true,
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
  NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL,
  NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
  buildNanoProTalentOnlyIdentityExperimentRequest,
  generateNanoProTalentOnlyIdentityExperiment,
  redactNanoProTalentOnlyRequestForInspection,
} from "../services/rendering/providers/nano-pro-talent-only-identity-experiment.js";

const testNanoProTalentOnlyIdentityRouter = Router();

function isExperimentalEnabled(): boolean {
  const raw =
    process.env["EXPERIMENTAL_NANO_PRO_TALENT_ONLY_IDENTITY_ENABLED"] ?? "";
  return (
    raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes"
  );
}

logger.info(
  {
    experimental: true,
    experiment: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
    route: "POST /api/test/nano-pro-talent-only-identity-experiment",
    enabled: isExperimentalEnabled(),
    model: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL,
    envRaw:
      process.env["EXPERIMENTAL_NANO_PRO_TALENT_ONLY_IDENTITY_ENABLED"] ??
      "(unset)",
  },
  "test-nano-pro-talent-only-identity: router module loaded",
);

testNanoProTalentOnlyIdentityRouter.get(
  "/test/nano-pro-talent-only-identity-experiment",
  (_req, res): void => {
    res.json({
      ok: true,
      experimental: true,
      experiment: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
      route: "POST /api/test/nano-pro-talent-only-identity-experiment",
      enabled: isExperimentalEnabled(),
      model: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL,
      api: "POST /api/v1/images",
      hypothesis:
        "garment and/or Pose Master visual refs may compete with Talent for Nano Pro identity",
      productionCreateUntouched: true,
      credits: "none — experimental route does not deduct Studio Credits",
      control: "GARMENT → TALENT → POSE_MASTER",
      experimentVariant: "TALENT only",
      envRaw:
        process.env["EXPERIMENTAL_NANO_PRO_TALENT_ONLY_IDENTITY_ENABLED"] ??
        "(unset)",
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
      `${NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME}: poseId or poseImageUrl is required (needed for CONTROL parity / dry-run)`,
    );
  }

  const definition = getPoseDefinition(poseId);
  const relativePath =
    definition?.poseReferenceImage ??
    (definition as { visualPath?: string } | undefined)?.visualPath ??
    `/pose-references/${poseId}.png`;

  if (!relativePath) {
    throw new Error(
      `${NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME}: Pose Master path missing for ${poseId}`,
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
      `${NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME}: modelIdentityId, talentImageUrl, or modelImageUrl is required`,
    );
  }

  const identity = findIdentityById(modelIdentityId);
  if (!identity) {
    throw new Error(
      `${NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME}: Studio Talent not found for id ${modelIdentityId}`,
    );
  }
  return {
    url: loadStudioTalentImageAsDataUri(identity.imageUrl),
    modelIdentityId,
  };
}

testNanoProTalentOnlyIdentityRouter.post(
  "/test/nano-pro-talent-only-identity-experiment",
  async (req, res): Promise<void> => {
    logger.info(
      {
        experimental: true,
        experiment: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
        path: req.originalUrl,
        enabled: isExperimentalEnabled(),
      },
      "test-nano-pro-talent-only-identity: POST hit",
    );

    if (!isExperimentalEnabled()) {
      res.status(403).json({
        ok: false,
        experimental: true,
        experiment: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
        error:
          "Nano Pro Talent-only identity experiment is disabled. Set EXPERIMENTAL_NANO_PRO_TALENT_ONLY_IDENTITY_ENABLED=true to enable.",
        model: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL,
        productionCreateUntouched: true,
        creditsDeducted: 0,
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
        experiment: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
        error:
          "garmentImageUrl is required (used for CONTROL parity comparison; not sent in Talent-only variant)",
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

    const locationEnvironment =
      typeof body["locationEnvironment"] === "string" &&
      body["locationEnvironment"].trim()
        ? body["locationEnvironment"].trim()
        : null;

    try {
      const talent = resolveTalentImageUrl(body);
      const poseImageUrl = resolvePoseImageUrl(body);
      const poseIdUsed =
        typeof body["poseId"] === "string" && body["poseId"].trim()
          ? body["poseId"].trim()
          : typeof body["poseImageUrl"] === "string"
            ? "(poseImageUrl)"
            : null;

      const built = buildNanoProTalentOnlyIdentityExperimentRequest({
        garmentImageUrl,
        talentImageUrl: talent.url,
        poseImageUrl,
        creativeShotPrompt,
        locationEnvironment,
        outputResolution,
      });

      if (dryRun) {
        res.json({
          ok: true,
          dryRun: true,
          experimental: true,
          experiment: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
          model: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL,
          productionCreateUntouched: true,
          creditsDeducted: 0,
          billingUntouched: true,
          openRouterCalled: false,
          modelIdentityId: talent.modelIdentityId ?? null,
          poseIdUsed,
          inspection: redactNanoProTalentOnlyRequestForInspection(built),
        });
        return;
      }

      logger.info(
        {
          experimental: true,
          experiment: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
          model: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL,
          outputResolution,
          poseIdUsed,
          modelIdentityId: talent.modelIdentityId ?? null,
          credits: "none — experimental route does not deduct Studio Credits",
        },
        "test-nano-pro-talent-only-identity: invoking OpenRouter Images API (Talent only)",
      );

      const result = await generateNanoProTalentOnlyIdentityExperiment({
        garmentImageUrl,
        talentImageUrl: talent.url,
        poseImageUrl,
        creativeShotPrompt,
        locationEnvironment,
        outputResolution,
      });

      res.json({
        ...result,
        modelIdentityId: talent.modelIdentityId ?? null,
        poseIdUsed,
        billingUntouched: true,
        openRouterCalled: true,
        comparisonHint:
          "Compare identity only vs one production Nano Pro Create (OR_RENDER_ENGINE=nano_pro) with the same Talent / garment / pose — reference count is the only intentional variable.",
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
          experiment: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
          openRouterRequestId,
          httpStatus,
        },
        "test-nano-pro-talent-only-identity: failed",
      );

      res
        .status(httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500)
        .json({
          ok: false,
          experimental: true,
          experiment: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
          model: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL,
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

export default testNanoProTalentOnlyIdentityRouter;

export const NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_ROUTE =
  "/test/nano-pro-talent-only-identity-experiment" as const;
