import { fal } from "@fal-ai/client";
import OpenAI from "openai";
import { logger } from "../lib/logger";
import { findIdentityById } from "../data/identity-library";

fal.config({ credentials: process.env.FAL_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAPI_API_KEY });

// ---------------------------------------------------------------------------
// FASHN V1.6 DEVELOPER CONFIGURATION (SL-011A)
//
// Centralised config object for all official V1.6 API parameters that are
// not driven by user input. Do NOT expose in the production UI.
// Change values here to tune behaviour for the entire pipeline.
//
// Official V1.6 reference: https://fal.ai/models/fal-ai/fashn/tryon/v1.6/api
// ---------------------------------------------------------------------------
const FASHN_CONFIG = {
  /** "quality" = slower, highest output quality. */
  mode: "quality" as const,

  /**
   * segmentation_free: false → enables body-part segmentation during garment
   * placement. Default is true (disabled). Enabling segmentation gives the
   * model explicit torso / arm / leg zone boundaries, which directly improves
   * garment boundary accuracy and reduces reference-clothing bleed-through.
   * This is the single highest-impact official parameter for overlay reduction.
   */
  segmentation_free: false,

  /**
   * garment_photo_type: "auto" → let V1.6 classify the garment image itself.
   * After BirefNet preprocessing the uploaded garment is a transparent PNG
   * cutout — no longer a flat-lay — so auto-detection is more accurate than
   * hard-coding "flat-lay".
   */
  garment_photo_type: "auto" as const,

  /**
   * output_format: "png" → lossless output. Preserves stitching, logos,
   * embroidery, seams, and fine fabric texture with no JPEG compression
   * artefacts. Default for the V1.6 API.
   */
  output_format: "png" as const,

  /** Number of output images per request. Increase for stochastic variety. */
  num_samples: 1,

  /**
   * seed: undefined → random generation each time (default behaviour).
   * Set to a fixed integer to reproduce results for A/B testing, e.g.:
   *   seed: 42
   * Passing undefined omits the field from the payload entirely.
   */
  seed: undefined as number | undefined,
} satisfies {
  mode: "performance" | "balanced" | "quality";
  segmentation_free: boolean;
  garment_photo_type: "auto" | "model" | "flat-lay";
  output_format: "png" | "jpeg";
  num_samples: number;
  seed: number | undefined;
};

// ---------------------------------------------------------------------------
// MODEL IMAGE SELECTOR — pure conditional logic, zero dictionary lookups.
//
// Resolution: gender broad-match → pose stance → age refinement (for frontal)
// ---------------------------------------------------------------------------

/** Returns a base human model image URL matched to gender + pose + age. */
function selectModelImage(
  modelGender: string | null | undefined,
  modelAgeRange: string | null | undefined,
  modelPose: string | null | undefined,
): string {
  const pose = modelPose ?? "standing_frontal";

  // ── KIDS ──────────────────────────────────────────────────────────────────
  if (modelGender === "kids") {
    if (pose === "walking_dynamic")
      return "https://images.unsplash.com/photo-1555009393-f20bdb245c4d?w=768&q=85&fit=crop&crop=top";
    if (pose === "sideways_posing")
      return "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "teen_youth")
      return "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=768&q=85&fit=crop&crop=top";
    return "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=768&q=85&fit=crop&crop=top";
  }

  // ── MEN'S ─────────────────────────────────────────────────────────────────
  if (modelGender === "mens") {
    if (pose === "walking_dynamic")
      return "https://images.unsplash.com/photo-1488161628813-04466f872be2?w=768&q=85&fit=crop&crop=top";
    if (pose === "sideways_posing")
      return "https://images.unsplash.com/photo-1490367532201-b9bc1dc483f6?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "mature_executive")
      return "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "classic_mid_age")
      return "https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "teen_youth")
      return "https://images.unsplash.com/photo-1534367610401-9f5ed68180aa?w=768&q=85&fit=crop&crop=top";
    return "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=768&q=85&fit=crop&crop=top";
  }

  // ── WOMEN'S (default — covers any unrecognised gender value) ──────────────
  if (pose === "walking_dynamic")
    return "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=768&q=85&fit=crop&crop=top";
  if (pose === "sideways_posing")
    return "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=768&q=85&fit=crop&crop=top";
  if (modelAgeRange === "mature_executive")
    return "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=768&q=85&fit=crop&crop=top";
  if (modelAgeRange === "classic_mid_age")
    return "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=768&q=85&fit=crop&crop=top";
  if (modelAgeRange === "teen_youth")
    return "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=768&q=85&fit=crop&crop=top";
  return "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=768&q=85&fit=crop&crop=top";
}

// ---------------------------------------------------------------------------
// GARMENT PREPROCESSING (SL-010A)
//
// Passes the uploaded garment through fal-ai/birefnet to strip the hanger
// and background, returning a clean transparent PNG cutout. Falls back to
// the original image on any error so the pipeline never hard-fails.
// ---------------------------------------------------------------------------
async function prepareGarmentImage(
  sourceImageUrl: string,
  renderId: number,
): Promise<string> {
  try {
    logger.info(
      { renderId, sourceImageUrl },
      "AI pipeline: garment preprocessing — removing hanger/background via birefnet",
    );

    const result = await fal.subscribe("fal-ai/birefnet", {
      input: {
        image_url: sourceImageUrl,
        model: "General Use (Light)",
        output_format: "png",
        operating_resolution: "1024x1024",
        refine_foreground: true,
      },
      logs: false,
    });

    const data = result.data as Record<string, unknown> | undefined;

    // birefnet returns { image: { url } }
    const candidates = [
      (data?.["image"] as { url?: string } | undefined)?.url,
      data?.["image_url"],
      data?.["url"],
      (data?.["images"] as Array<{ url: string }> | undefined)?.[0]?.url,
    ];

    for (const c of candidates) {
      if (typeof c === "string" && c.startsWith("http")) {
        logger.info(
          { renderId, preprocessedGarmentUrl: c },
          "AI pipeline: garment background removed — hanger eliminated",
        );
        return c;
      }
    }

    logger.warn(
      { renderId },
      "AI pipeline: birefnet returned no URL — using original garment image",
    );
    return sourceImageUrl;
  } catch (preprocessErr) {
    logger.warn(
      { renderId, preprocessErr },
      "AI pipeline: garment preprocessing failed — falling back to original image",
    );
    return sourceImageUrl;
  }
}

// ---------------------------------------------------------------------------
// GARMENT CATEGORY DETECTION — GPT-4o vision fallback
//
// Used only when the user has not set an explicit garment placement.
// Maps to the official V1.6 `category` values: tops / bottoms / one-pieces.
// ---------------------------------------------------------------------------
type GarmentCategory = "tops" | "bottoms" | "one-pieces" | "auto";

async function detectGarmentCategory(
  imageUrl: string,
): Promise<GarmentCategory> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            'You are a garment classifier. IMPORTANT: Ignore any clothes hanger, hook, rod, or mounting apparatus visible in the image — focus ONLY on the fabric garment itself. Classify the clothing item into exactly one of these three categories: "tops" (shirts, blouses, jackets, hoodies, t-shirts, coats, etc.), "bottoms" (pants, jeans, skirts, shorts, etc.), or "one-pieces" (dresses, jumpsuits, full-body outfits, rompers). Reply with only the category word, nothing else.',
        },
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: imageUrl } }],
        },
      ],
      max_tokens: 10,
    });

    const raw =
      response.choices[0]?.message?.content?.trim().toLowerCase() ?? "";
    if (raw === "tops" || raw === "bottoms" || raw === "one-pieces") {
      return raw;
    }
    return "auto";
  } catch {
    return "auto";
  }
}

// ---------------------------------------------------------------------------
// MAIN PIPELINE
// ---------------------------------------------------------------------------
export async function runAIPipeline(params: {
  renderId: number;
  sourceImageUrl: string;
  modelPersona: string;
  locationEnvironment: string;
  modelDemographics?: string | null;
  imageDimensions?: string | null;
  smartLighting?: boolean | null;
  modelPose?: string | null;
  modelGender?: string | null;
  modelAgeRange?: string | null;
  cameraFraming?: string | null;
  garmentPlacement?: string | null;
  modelIdentityId?: string | null;
  onComplete: (outputImageUrl: string) => Promise<void>;
  onError: (error: Error) => Promise<void>;
}): Promise<void> {
  const {
    renderId,
    sourceImageUrl,
    modelPose,
    modelGender,
    modelAgeRange,
    garmentPlacement,
    modelIdentityId,
  } = params;

  try {
    // 1. Preprocess garment — strip hanger/background via birefnet
    const garmentImage = await prepareGarmentImage(sourceImageUrl, renderId);

    // 2. Select model image
    //
    //    Identity Library path (SL-009): if a modelIdentityId is supplied and
    //    resolves, use that portrait directly — no attribute routing needed.
    //    Falls through to selectModelImage() if the ID is unknown or absent.
    let modelImageUrl: string;
    if (modelIdentityId) {
      const identity = findIdentityById(modelIdentityId);
      if (identity) {
        modelImageUrl = identity.imageUrl;
        logger.info(
          { renderId, modelIdentityId, identityName: identity.displayName, modelImageUrl },
          "AI pipeline: model image resolved from Identity Library",
        );
      } else {
        logger.warn(
          { renderId, modelIdentityId },
          "AI pipeline: modelIdentityId not found in library — falling back to attribute routing",
        );
        modelImageUrl = selectModelImage(modelGender, modelAgeRange, modelPose);
      }
    } else {
      modelImageUrl = selectModelImage(modelGender, modelAgeRange, modelPose);
    }

    // Resolve root-relative identity paths to absolute URLs.
    // fal.ai requires a publicly reachable URL; local /identities/... paths
    // are served by the Vite frontend at REPLIT_DEV_DOMAIN.
    if (modelImageUrl.startsWith("/")) {
      const domain = process.env.REPLIT_DEV_DOMAIN;
      modelImageUrl = domain
        ? `https://${domain}${modelImageUrl}`
        : `http://localhost:25562${modelImageUrl}`;
      logger.info(
        { renderId, resolvedModelImageUrl: modelImageUrl },
        "AI pipeline: resolved relative identity imageUrl to absolute URL",
      );
    }

    logger.info(
      { renderId, modelImageUrl, modelIdentityId, modelPose, modelGender, modelAgeRange, garmentPlacement },
      "AI pipeline: model image selected",
    );

    // 3. Resolve garment category (official V1.6 `category` parameter)
    //
    //    Explicit user selection takes priority. GPT-4o auto-detection is the
    //    fallback when the user has not set a garment placement preference.
    let category: GarmentCategory;
    if (garmentPlacement === "upper_body") {
      category = "tops";
    } else if (garmentPlacement === "lower_body") {
      category = "bottoms";
    } else if (garmentPlacement === "full_body") {
      category = "one-pieces";
    } else {
      category = await detectGarmentCategory(garmentImage);
    }
    logger.info({ renderId, category, garmentPlacement }, "AI pipeline: garment category resolved");

    // 4. Build the V1.6 payload — official parameters only (SL-011A)
    //
    //    All unsupported parameters have been removed:
    //      ✗ prompt            (not in V16Input)
    //      ✗ negative_prompt   (not in V16Input)
    //      ✗ denoise_strength  (not in V16Input)
    //      ✗ fidelity_weight   (not in V16Input)
    //      ✗ cover_weight      (not in V16Input)
    //      ✗ restore_clothes   (not in V16Input)
    //
    //    Key compliance changes:
    //      segmentation_free: false   — enables body-part segmentation
    //      garment_photo_type: "auto" — correct for transparent PNG cutout
    //      output_format: "png"       — lossless (was "jpeg")
    //      seed: from FASHN_CONFIG    — omitted when undefined (random)
    const falPayload = {
      model_image:        modelImageUrl,
      garment_image:      garmentImage,
      category,
      mode:               FASHN_CONFIG.mode,
      segmentation_free:  FASHN_CONFIG.segmentation_free,
      garment_photo_type: FASHN_CONFIG.garment_photo_type,
      output_format:      FASHN_CONFIG.output_format,
      num_samples:        FASHN_CONFIG.num_samples,
      ...(FASHN_CONFIG.seed !== undefined ? { seed: FASHN_CONFIG.seed } : {}),
    };

    logger.info(
      { renderId, payload: falPayload },
      "AI pipeline: fal.ai V1.6 compliant payload",
    );
    logger.info({ renderId }, "AI pipeline: calling fal-ai/fashn/tryon/v1.6");

    let outputImageUrl: string | undefined;

    try {
      const result = await fal.subscribe("fal-ai/fashn/tryon/v1.6", {
        input: falPayload,
        logs: false,
      });

      // V16Output shape: { images: Array<{ url: string, ... }> }
      // Check the canonical key first, then defensive fallbacks.
      const data = result.data as Record<string, unknown> | undefined;
      const candidates = [
        (data?.["images"] as Array<{ url: string }> | undefined)?.[0]?.url,
        (data?.["image"] as { url?: string } | undefined)?.url,
        data?.["image_url"],
        data?.["url"],
      ];
      for (const c of candidates) {
        if (typeof c === "string" && c.startsWith("http")) {
          outputImageUrl = c;
          break;
        }
      }

      logger.info({ renderId, outputImageUrl }, "AI pipeline: fashn/tryon/v1.6 succeeded");
    } catch (primaryError) {
      // Fallback: image-apps-v2/virtual-try-on
      logger.warn(
        { renderId, primaryError },
        "AI pipeline: fashn/tryon/v1.6 failed — falling back to image-apps-v2/virtual-try-on",
      );

      const fallbackResult = await fal.subscribe("fal-ai/image-apps-v2/virtual-try-on", {
        input: {
          person_image_url:   modelImageUrl,
          clothing_image_url: garmentImage,
          preserve_pose:      true,
        },
        logs: false,
      });

      const fd = fallbackResult.data as Record<string, unknown> | undefined;
      const fallbackCandidates = [
        (fd?.["images"] as Array<{ url: string }> | undefined)?.[0]?.url,
        (fd?.["image"] as { url?: string } | undefined)?.url,
        fd?.["image_url"],
        fd?.["url"],
      ];
      for (const c of fallbackCandidates) {
        if (typeof c === "string" && c.startsWith("http")) {
          outputImageUrl = c;
          break;
        }
      }

      logger.info({ renderId, outputImageUrl }, "AI pipeline: fallback succeeded");
    }

    if (!outputImageUrl) {
      throw new Error("No output image URL returned from fal.ai");
    }

    await params.onComplete(outputImageUrl);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ renderId, err: err.message }, "AI pipeline: failed");
    await params.onError(err);
  }
}
