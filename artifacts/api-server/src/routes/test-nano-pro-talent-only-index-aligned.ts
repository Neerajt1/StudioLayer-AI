// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — Nano Pro Talent-only index-aligned identity experiment
//
// POST /api/test/nano-pro-talent-only-index-aligned
//
// Gated by EXPERIMENTAL_NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_ENABLED=true.
// Does NOT use production Create. Does NOT deduct Studio Credits.
//
// Body:
// {
//   "modelIdentityId": "M-IN-02",   // or talentImageUrl
//   "outputResolution": "2K",
//   "dryRun": true
// }
// ---------------------------------------------------------------------------

import { Router } from "express";
import { logger } from "../lib/logger.js";
import { loadStudioTalentImageAsDataUri } from "../rendering/preprocessing.js";
import { findIdentityById } from "../data/identity-library.js";
import {
  NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME,
  NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL,
  buildNanoProTalentOnlyIndexAlignedRequest,
  generateNanoProTalentOnlyIndexAligned,
  redactTalentOnlyIndexAlignedRequestForInspection,
} from "../services/rendering/providers/nano-pro-talent-only-index-aligned.js";

const testNanoProTalentOnlyIndexAlignedRouter = Router();

function isExperimentalEnabled(): boolean {
  const raw =
    process.env["EXPERIMENTAL_NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_ENABLED"] ??
    "";
  return (
    raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes"
  );
}

logger.info(
  {
    experimental: true,
    experiment: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME,
    route: "POST /api/test/nano-pro-talent-only-index-aligned",
    enabled: isExperimentalEnabled(),
    model: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL,
    envRaw:
      process.env["EXPERIMENTAL_NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_ENABLED"] ??
      "(unset)",
  },
  "test-nano-pro-talent-only-index-aligned: router module loaded",
);

testNanoProTalentOnlyIndexAlignedRouter.get(
  "/test/nano-pro-talent-only-index-aligned",
  (_req, res): void => {
    res.json({
      ok: true,
      experimental: true,
      experiment: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME,
      route: "POST /api/test/nano-pro-talent-only-index-aligned",
      enabled: isExperimentalEnabled(),
      model: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL,
      api: "POST /api/v1/images",
      purpose:
        "Talent-only Nano Pro with prompt/reference index alignment (Ref1 = Talent)",
      productionCreateUntouched: true,
      credits: "none — experimental route does not deduct Studio Credits",
      referenceOrder: ["TALENT"],
      envRaw:
        process.env["EXPERIMENTAL_NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_ENABLED"] ??
        "(unset)",
    });
  },
);

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
      `${NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME}: modelIdentityId, talentImageUrl, or modelImageUrl is required`,
    );
  }

  const identity = findIdentityById(modelIdentityId);
  if (!identity) {
    throw new Error(
      `${NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME}: Studio Talent not found for id ${modelIdentityId}`,
    );
  }
  return {
    url: loadStudioTalentImageAsDataUri(identity.imageUrl),
    modelIdentityId,
  };
}

testNanoProTalentOnlyIndexAlignedRouter.post(
  "/test/nano-pro-talent-only-index-aligned",
  async (req, res): Promise<void> => {
    logger.info(
      {
        experimental: true,
        experiment: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME,
        path: req.originalUrl,
        enabled: isExperimentalEnabled(),
      },
      "test-nano-pro-talent-only-index-aligned: POST hit",
    );

    if (!isExperimentalEnabled()) {
      res.status(403).json({
        ok: false,
        experimental: true,
        experiment: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME,
        error:
          "Nano Pro Talent-only index-aligned experiment is disabled. Set EXPERIMENTAL_NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_ENABLED=true to enable.",
        model: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL,
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

    const rawResolution = String(body["outputResolution"] ?? "2K").toUpperCase();
    const outputResolution = rawResolution === "4K" ? "4K" : "2K";

    try {
      const talent = resolveTalentImageUrl(body);
      const built = buildNanoProTalentOnlyIndexAlignedRequest({
        talentImageUrl: talent.url,
        outputResolution,
      });

      if (dryRun) {
        res.json({
          ok: true,
          dryRun: true,
          experimental: true,
          experiment: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME,
          model: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL,
          productionCreateUntouched: true,
          creditsDeducted: 0,
          billingUntouched: true,
          openRouterCalled: false,
          modelIdentityId: talent.modelIdentityId ?? null,
          inspection: redactTalentOnlyIndexAlignedRequestForInspection(built),
        });
        return;
      }

      logger.info(
        {
          experimental: true,
          experiment: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME,
          model: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL,
          outputResolution,
          modelIdentityId: talent.modelIdentityId ?? null,
          credits: "none — experimental route does not deduct Studio Credits",
        },
        "test-nano-pro-talent-only-index-aligned: invoking OpenRouter Images API",
      );

      const result = await generateNanoProTalentOnlyIndexAligned({
        talentImageUrl: talent.url,
        outputResolution,
      });

      res.json({
        ...result,
        modelIdentityId: talent.modelIdentityId ?? null,
        billingUntouched: true,
        openRouterCalled: true,
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
          experiment: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME,
          openRouterRequestId,
          httpStatus,
        },
        "test-nano-pro-talent-only-index-aligned: failed",
      );

      res
        .status(httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500)
        .json({
          ok: false,
          experimental: true,
          experiment: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME,
          model: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL,
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

export default testNanoProTalentOnlyIndexAlignedRouter;

export const NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_ROUTE =
  "/test/nano-pro-talent-only-index-aligned" as const;
