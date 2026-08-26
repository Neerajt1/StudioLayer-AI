// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — Nano Banana Pro test route (OpenRouter Image API)
//
// POST /api/test/nano-banana-pro-render
//
// Gated by EXPERIMENTAL_NANO_BANANA_PRO_ENABLED=true.
// Does NOT use production Gemini OpenRouterProvider.
// Does NOT deduct Studio Credits.
// Does NOT write to Gallery / renders ledger.
//
// Body:
// {
//   "garmentImageUrl": "https://... | data:...",
//   "modelIdentityId": "M-CA-01",
//   "talentImageUrl":  "...",       // optional override
//   "poseId":          "Pose50",
//   "poseImageUrl":    "...",       // optional override
//   "outputResolution": "2K" | "4K"  // default 2K — sent as OpenRouter resolution
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
  EXPERIMENTAL_NANO_BANANA_PRO_MODEL,
  EXPERIMENTAL_NANO_BANANA_PRO_PROMPT,
  generateExperimentalNanoBananaPro,
  type ExperimentalNanoBananaProResolution,
} from "../services/rendering/providers/experimental-nano-banana-pro-provider.js";

const testNanoBananaProRouter = Router();

const DEFAULT_GARMENT_URL =
  "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80";
const DEFAULT_TALENT_URL =
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=80";

function isExperimentalEnabled(): boolean {
  const raw = process.env["EXPERIMENTAL_NANO_BANANA_PRO_ENABLED"] ?? "";
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

logger.info(
  {
    experimental: true,
    route: "POST /api/test/nano-banana-pro-render",
    enabled: isExperimentalEnabled(),
    model: EXPERIMENTAL_NANO_BANANA_PRO_MODEL,
    envRaw: process.env["EXPERIMENTAL_NANO_BANANA_PRO_ENABLED"] ?? "(unset)",
  },
  "test-nano-banana-pro: router module loaded",
);

/** Reachability / gate status without calling OpenRouter. */
testNanoBananaProRouter.get("/test/nano-banana-pro-render", (_req, res): void => {
  res.json({
    ok: true,
    experimental: true,
    route: "POST /api/test/nano-banana-pro-render",
    enabled: isExperimentalEnabled(),
    model: EXPERIMENTAL_NANO_BANANA_PRO_MODEL,
    envRaw: process.env["EXPERIMENTAL_NANO_BANANA_PRO_ENABLED"] ?? "(unset)",
    verifiedParams: {
      resolution: "2K",
      aspect_ratio: "4:5",
      n: 1,
      input_references: "garment → talent → pose",
    },
  });
});

function resolvePoseImageUrl(body: Record<string, unknown>): string {
  if (typeof body["poseImageUrl"] === "string" && body["poseImageUrl"].trim()) {
    return body["poseImageUrl"].trim();
  }

  const poseId =
    typeof body["poseId"] === "string" && body["poseId"].trim()
      ? body["poseId"].trim()
      : "Pose50";

  const definition = getPoseDefinition(poseId);
  const relativePath =
    definition?.poseReferenceImage ??
    (definition as { visualPath?: string } | undefined)?.visualPath ??
    `/pose-references/${poseId}.png`;

  if (!relativePath) {
    throw new Error(
      `EXPERIMENTAL Nano Banana Pro: Pose Master path missing for ${poseId}`,
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

  if (modelIdentityId) {
    const identity = findIdentityById(modelIdentityId);
    if (!identity) {
      throw new Error(
        `EXPERIMENTAL Nano Banana Pro: Studio Talent not found for id ${modelIdentityId}`,
      );
    }
    return {
      url: loadStudioTalentImageAsDataUri(identity.imageUrl),
      modelIdentityId,
    };
  }

  return { url: DEFAULT_TALENT_URL };
}

testNanoBananaProRouter.post(
  "/test/nano-banana-pro-render",
  async (req, res): Promise<void> => {
    logger.info(
      {
        experimental: true,
        path: req.originalUrl,
        enabled: isExperimentalEnabled(),
        contentType: req.headers["content-type"] ?? null,
      },
      "test-nano-banana-pro: POST hit",
    );

    if (!isExperimentalEnabled()) {
      res.status(403).json({
        ok: false,
        error:
          "Experimental Nano Banana Pro route is disabled. Set EXPERIMENTAL_NANO_BANANA_PRO_ENABLED=true to enable.",
        experimental: true,
        model: EXPERIMENTAL_NANO_BANANA_PRO_MODEL,
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    const garmentImageUrl =
      typeof body["garmentImageUrl"] === "string" && body["garmentImageUrl"].trim()
        ? body["garmentImageUrl"].trim()
        : DEFAULT_GARMENT_URL;

    const rawResolution = String(body["outputResolution"] ?? "2K").toUpperCase();
    const outputResolution: ExperimentalNanoBananaProResolution =
      rawResolution === "4K" ? "4K" : "2K";

    const prompt =
      typeof body["prompt"] === "string" && body["prompt"].trim()
        ? body["prompt"].trim()
        : EXPERIMENTAL_NANO_BANANA_PRO_PROMPT;

    try {
      const talent = resolveTalentImageUrl(body);
      const poseImageUrl = resolvePoseImageUrl(body);
      const poseIdUsed =
        typeof body["poseId"] === "string" && body["poseId"].trim()
          ? body["poseId"].trim()
          : typeof body["poseImageUrl"] === "string"
            ? "(poseImageUrl)"
            : "Pose50";

      logger.info(
        {
          experimental: true,
          model: EXPERIMENTAL_NANO_BANANA_PRO_MODEL,
          outputResolution,
          aspectRatio: "4:5",
          poseIdUsed,
          modelIdentityId: talent.modelIdentityId ?? null,
          hasCustomPrompt: prompt !== EXPERIMENTAL_NANO_BANANA_PRO_PROMPT,
          credits: "none — experimental route does not deduct Studio Credits",
        },
        "test-nano-banana-pro: received request",
      );

      const result = await generateExperimentalNanoBananaPro({
        garmentImageUrl,
        talentImageUrl: talent.url,
        poseImageUrl,
        outputResolution,
        prompt,
      });

      res.json({
        ...result,
        experimental: true,
        productionPathUntouched: true,
        creditsDeducted: 0,
        billingUntouched: true,
        geminiProductionPath: "untouched — uses isolated /api/v1/images provider",
        modelIdentityId: talent.modelIdentityId ?? null,
        poseIdUsed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const httpStatus =
        err && typeof err === "object" && typeof (err as { httpStatus?: unknown }).httpStatus === "number"
          ? (err as { httpStatus: number }).httpStatus
          : 500;
      const openRouterRequestId =
        err && typeof err === "object"
          ? ((err as { openRouterRequestId?: string | null }).openRouterRequestId ?? null)
          : null;
      const responseBody =
        err && typeof err === "object"
          ? ((err as { responseBody?: string }).responseBody ?? null)
          : null;

      logger.error(
        { error: message, experimental: true, openRouterRequestId, httpStatus },
        "test-nano-banana-pro: failed",
      );

      res.status(httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500).json({
        ok: false,
        experimental: true,
        model: EXPERIMENTAL_NANO_BANANA_PRO_MODEL,
        error: message,
        httpStatus,
        openRouterRequestId,
        responseBody,
        creditsDeducted: 0,
      });
    }
  },
);

export default testNanoBananaProRouter;
