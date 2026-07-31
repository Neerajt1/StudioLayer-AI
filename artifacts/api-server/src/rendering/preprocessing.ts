// ---------------------------------------------------------------------------
// StudioLayer AI — Shared Rendering Preprocessing Utilities
//
// Extracted from RenderOrchestrator (SL-017) so that any pipeline entry
// point — the Render Orchestrator *and* the OpenRouter pipeline — can reuse
// the same BirefNet garment preprocessing and model image resolution logic
// without duplicating it.
//
// Public surface:
//   prepareGarmentImage(sourceImageUrl, renderId)   → garment PNG URL
//   resolveModelImage(request, category, styleTemplate, renderId)
//                                                   → { modelImageContext, modelImageUrl }
//
// Nothing here is FASHN-specific.  The `category` parameter accepted by
// resolveModelImage is the same FashnCategory used by the base-model
// selector — it happens to share the vocabulary but is not sent to FASHN
// by callers in the OpenRouter path.
// ---------------------------------------------------------------------------

import { fal }                       from "@fal-ai/client";
import { logger }                    from "../lib/logger";
import { findIdentityById }          from "../data/identity-library";
import {
  selectBaseModel,
  mapStyleModeToTemplate,
}                                    from "../data/base-model-library";
import type {
  FashnCategory,
  ModelImageContext,
  ModelImageSource,
  RenderingRequest,
} from "./types";

export type { FashnCategory, ModelImageContext };

// Ensure fal is configured whenever this module is loaded.
// Calling fal.config multiple times with the same value is safe.
fal.config({ credentials: process.env["FAL_KEY"] });

// ---------------------------------------------------------------------------
// Re-export mapStyleModeToTemplate for pipeline callers
// ---------------------------------------------------------------------------
export { mapStyleModeToTemplate };

// ---------------------------------------------------------------------------
// BirefNet garment preprocessing
// ---------------------------------------------------------------------------

/**
 * Passes the uploaded garment image through fal-ai/birefnet to remove
 * hanger/background.  Returns a transparent PNG cutout URL.
 * Falls back to the original URL on any error so renders never hard-fail
 * due to preprocessing.
 */
export async function prepareGarmentImage(
  sourceImageUrl: string,
  renderId: number,
): Promise<string> {
  try {
    logger.info(
      { renderId, sourceImageUrl },
      "preprocessing: garment BirefNet background removal",
    );

    const result = await fal.subscribe("fal-ai/birefnet", {
      input: {
        image_url:            sourceImageUrl,
        model:                "General Use (Light)",
        output_format:        "png",
        operating_resolution: "1024x1024",
        refine_foreground:    true,
      },
      logs: false,
    });

    const data = result.data as Record<string, unknown> | undefined;
    const candidates: unknown[] = [
      (data?.["image"]  as { url?: string } | undefined)?.url,
      data?.["image_url"],
      data?.["url"],
      (data?.["images"] as Array<{ url: string }> | undefined)?.[0]?.url,
    ];

    for (const c of candidates) {
      if (typeof c === "string" && c.startsWith("http")) {
        logger.info(
          { renderId, preprocessedGarmentUrl: c },
          "preprocessing: garment background removed",
        );
        return c;
      }
    }

    logger.warn({ renderId }, "preprocessing: BirefNet returned no URL — using original");
    return sourceImageUrl;
  } catch (err) {
    logger.warn(
      { renderId, err },
      "preprocessing: BirefNet failed — using original garment image",
    );
    return sourceImageUrl;
  }
}

// ---------------------------------------------------------------------------
// Model image resolution (SL-016 4-branch priority chain)
// ---------------------------------------------------------------------------

/**
 * Result of resolveModelImage — the resolved URL (absolute) plus full
 * selection context for logging and telemetry.
 */
export interface ModelResolutionResult {
  modelImageContext: ModelImageContext;
  /** Absolute HTTPS URL, ready to send to any rendering provider. */
  modelImageUrl: string;
}

/**
 * Resolves the model image URL using the SL-016 4-branch priority chain and
 * converts any relative path to an absolute URL.
 *
 * Branch A: modelIdentityId supplied + found in Identity Library (user override)
 * Branch B: modelIdentityId supplied but not found → Base Model Selector
 * Branch C: No modelIdentityId → Base Model Selector
 * Branch D: Base Model Selector returns null → attribute-routing fallback
 */
export function resolveModelImage(
  request: RenderingRequest,
  category: FashnCategory,
  styleTemplate: ReturnType<typeof mapStyleModeToTemplate>,
  renderId: number,
): ModelResolutionResult {
  const selectionStart = Date.now();
  const { modelIdentityId, modelGender, modelAgeRange, modelPose } = request;

  let imageUrl: string;
  let source: ModelImageSource;
  let baseModelId: string | null      = null;
  let identityId: string | null       = null;
  let identityOverride                = false;
  let fallbackReason: string | null   = null;

  if (modelIdentityId) {
    // ── Branch A: User-selected identity ──────────────────────────────────
    const identity = findIdentityById(modelIdentityId);
    if (identity) {
      imageUrl         = identity.imageUrl;
      source           = "identity_override";
      identityId       = modelIdentityId;
      identityOverride = true;

      logger.info(
        { renderId, modelIdentityId, identityName: identity.displayName },
        "preprocessing: model image from Identity Library (identity override)",
      );
    } else {
      // ── Branch B: Identity not found → Base Model Selector ──────────────
      logger.warn(
        { renderId, modelIdentityId },
        "preprocessing: modelIdentityId not found — falling back to Base Model Selector",
      );

      const baseModel = selectBaseModel(modelGender, category, styleTemplate);
      if (baseModel) {
        imageUrl       = baseModel.imageUrl;
        source         = "base_model_selector";
        baseModelId    = baseModel.id;
        fallbackReason = "identity_not_found";
      } else {
        imageUrl       = selectAttributeRoutedModel(modelGender, modelAgeRange, modelPose);
        source         = "attribute_routing_fallback";
        fallbackReason = "identity_not_found_and_base_model_null";
      }
    }
  } else {
    // ── Branch C: No identity selected → Base Model Selector ──────────────
    const baseModel = selectBaseModel(modelGender, category, styleTemplate);
    if (baseModel) {
      imageUrl    = baseModel.imageUrl;
      source      = "base_model_selector";
      baseModelId = baseModel.id;
    } else {
      // ── Branch D: Base Model Selector null → emergency attribute routing ──
      imageUrl       = selectAttributeRoutedModel(modelGender, modelAgeRange, modelPose);
      source         = "attribute_routing_fallback";
      fallbackReason = "base_model_selector_null";
    }
  }

  const selectionDurationMs = Date.now() - selectionStart;

  logger.info(
    {
      renderId,
      modelSelection: {
        source, baseModelId, identityId, identityOverride,
        fallbackReason, category, styleTemplate,
        resolvedImageUrl: imageUrl, durationMs: selectionDurationMs,
      },
    },
    "preprocessing: model image selected",
  );

  const modelImageContext: ModelImageContext = {
    imageUrl,
    source,
    baseModelId,
    identityId,
    identityOverride,
    fallbackReason,
    selectionDurationMs,
  };

  // ── Resolve root-relative paths to absolute URLs ─────────────────────────
  let modelImageUrl = imageUrl;
  if (modelImageUrl.startsWith("/")) {
    const domain = process.env["REPLIT_DEV_DOMAIN"];
    modelImageUrl = domain
      ? `https://${domain}${modelImageUrl}`
      : `http://localhost:25562${modelImageUrl}`;

    logger.info(
      { renderId, resolvedModelImageUrl: modelImageUrl },
      "preprocessing: resolved relative identity imageUrl to absolute URL",
    );
  }

  return { modelImageContext: { ...modelImageContext, imageUrl: modelImageUrl }, modelImageUrl };
}

// ---------------------------------------------------------------------------
// Emergency attribute-routing fallback (internal)
// ---------------------------------------------------------------------------

function selectAttributeRoutedModel(
  modelGender:   string | null | undefined,
  modelAgeRange: string | null | undefined,
  modelPose:     string | null | undefined,
): string {
  const pose = modelPose ?? "standing_frontal";

  if (modelGender === "kids") {
    if (pose === "walking_dynamic")     return "https://images.unsplash.com/photo-1555009393-f20bdb245c4d?w=768&q=85&fit=crop&crop=top";
    if (pose === "sideways_posing")     return "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "teen_youth") return "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=768&q=85&fit=crop&crop=top";
    return "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=768&q=85&fit=crop&crop=top";
  }

  if (modelGender === "mens") {
    if (pose === "walking_dynamic")           return "https://images.unsplash.com/photo-1488161628813-04466f872be2?w=768&q=85&fit=crop&crop=top";
    if (pose === "sideways_posing")           return "https://images.unsplash.com/photo-1490367532201-b9bc1dc483f6?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "mature_executive") return "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "classic_mid_age")  return "https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "teen_youth")       return "https://images.unsplash.com/photo-1534367610401-9f5ed68180aa?w=768&q=85&fit=crop&crop=top";
    return "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=768&q=85&fit=crop&crop=top";
  }

  // Women's (default)
  if (pose === "walking_dynamic")           return "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=768&q=85&fit=crop&crop=top";
  if (pose === "sideways_posing")           return "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=768&q=85&fit=crop&crop=top";
  if (modelAgeRange === "mature_executive") return "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=768&q=85&fit=crop&crop=top";
  if (modelAgeRange === "classic_mid_age")  return "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=768&q=85&fit=crop&crop=top";
  if (modelAgeRange === "teen_youth")       return "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=768&q=85&fit=crop&crop=top";
  return "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=768&q=85&fit=crop&crop=top";
}
