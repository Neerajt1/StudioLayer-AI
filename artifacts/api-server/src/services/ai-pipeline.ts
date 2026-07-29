import OpenAI from "openai";
import { fal } from "@fal-ai/client";
import { logger } from "../lib/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAPI_API_KEY });
fal.config({ credentials: process.env.FAL_KEY });

// ---------------------------------------------------------------------------
// Model image dictionaries — female (default), male, and kids
// Key: demographics -> persona -> Unsplash CDN URL (public, free to use)
// ---------------------------------------------------------------------------

// Kids model images — used when modelGender === 'kids'
const KIDS_MODEL_IMAGE_URLS: Record<string, Record<string, string>> = {
  default: {
    high_fashion:
      "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=768&q=85&fit=crop",
    casual:
      "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=768&q=85&fit=crop",
    athletic:
      "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=768&q=85&fit=crop",
    minimalist:
      "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=768&q=85&fit=crop",
  },
};

// Male model images — used when modelGender === 'mens'
const MALE_MODEL_IMAGE_URLS: Record<string, Record<string, string>> = {
  caucasian: {
    high_fashion:
      "https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=768&q=85&fit=crop",
    casual:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=768&q=85&fit=crop",
    athletic:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=768&q=85&fit=crop",
    minimalist:
      "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=768&q=85&fit=crop",
  },
  east_asian: {
    high_fashion:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=768&q=85&fit=crop",
    casual:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=768&q=85&fit=crop",
    athletic:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=768&q=85&fit=crop",
    minimalist:
      "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=768&q=85&fit=crop",
  },
  south_asian: {
    high_fashion:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=768&q=85&fit=crop",
    casual:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=768&q=85&fit=crop",
    athletic:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=768&q=85&fit=crop",
    minimalist:
      "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=768&q=85&fit=crop",
  },
  afro_american: {
    high_fashion:
      "https://images.unsplash.com/photo-1504199367641-aba8151af406?w=768&q=85&fit=crop",
    casual:
      "https://images.unsplash.com/photo-1504199367641-aba8151af406?w=768&q=85&fit=crop",
    athletic:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=768&q=85&fit=crop",
    minimalist:
      "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=768&q=85&fit=crop",
  },
  hispanic: {
    high_fashion:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=768&q=85&fit=crop",
    casual:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=768&q=85&fit=crop",
    athletic:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=768&q=85&fit=crop",
    minimalist:
      "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=768&q=85&fit=crop",
  },
  default: {
    high_fashion:
      "https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=768&q=85&fit=crop",
    casual:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=768&q=85&fit=crop",
    athletic:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=768&q=85&fit=crop",
    minimalist:
      "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=768&q=85&fit=crop",
  },
};

// Female model images — used for womens_top, full_body_dress, or when garmentType is unset
const MODEL_IMAGE_URLS: Record<string, Record<string, string>> = {
  caucasian: {
    high_fashion:
      "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=768&q=85&fit=crop",
    casual:
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=768&q=85&fit=crop",
    athletic:
      "https://images.unsplash.com/photo-1517365830460-955ce3be0547?w=768&q=85&fit=crop",
    minimalist:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=768&q=85&fit=crop",
  },
  east_asian: {
    high_fashion:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=768&q=85&fit=crop",
    casual:
      "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=768&q=85&fit=crop",
    athletic:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=768&q=85&fit=crop",
    minimalist:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=768&q=85&fit=crop",
  },
  south_asian: {
    high_fashion:
      "https://images.unsplash.com/photo-1597223557154-721c1cecc4aa?w=768&q=85&fit=crop",
    casual:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=768&q=85&fit=crop",
    athletic:
      "https://images.unsplash.com/photo-1597223557154-721c1cecc4aa?w=768&q=85&fit=crop",
    minimalist:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=768&q=85&fit=crop",
  },
  afro_american: {
    high_fashion:
      "https://images.unsplash.com/photo-1531384441138-2736e62e0919?w=768&q=85&fit=crop",
    casual:
      "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=768&q=85&fit=crop",
    athletic:
      "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=768&q=85&fit=crop",
    minimalist:
      "https://images.unsplash.com/photo-1531384441138-2736e62e0919?w=768&q=85&fit=crop",
  },
  hispanic: {
    high_fashion:
      "https://images.unsplash.com/photo-1614124865-d837e3f3c8af?w=768&q=85&fit=crop",
    casual:
      "https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?w=768&q=85&fit=crop",
    athletic:
      "https://images.unsplash.com/photo-1614124865-d837e3f3c8af?w=768&q=85&fit=crop",
    minimalist:
      "https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?w=768&q=85&fit=crop",
  },
  default: {
    high_fashion:
      "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=768&q=85&fit=crop",
    casual:
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=768&q=85&fit=crop",
    athletic:
      "https://images.unsplash.com/photo-1517365830460-955ce3be0547?w=768&q=85&fit=crop",
    minimalist:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=768&q=85&fit=crop",
  },
};

// ---------------------------------------------------------------------------
// Expression / Pose → internal persona key mapping
// The UI now sends "Model Expression" values; map them to MODEL_IMAGE_URLS keys.
// ---------------------------------------------------------------------------
const EXPRESSION_TO_PERSONA: Record<string, string> = {
  high_fashion_editorial: "high_fashion",
  natural_smile: "casual",
  confident_commercial: "athletic",
  // Legacy values pass through unchanged
  high_fashion: "high_fashion",
  casual: "casual",
  athletic: "athletic",
  minimalist: "minimalist",
};

/**
 * Returns the pre-configured model image URL.
 * modelGender drives which image dict is used:
 *   'mens'  → male model images
 *   'kids'  → child model images
 *   'womens' / unset → female model images
 */
function selectModelImage(
  demographics: string | null | undefined,
  persona: string,
  modelGender?: string | null,
): string {
  const internalKey = EXPRESSION_TO_PERSONA[persona] ?? persona;
  const key = demographics ?? "default";
  let dict: Record<string, Record<string, string>>;
  if (modelGender === "mens") {
    dict = MALE_MODEL_IMAGE_URLS;
  } else if (modelGender === "kids") {
    dict = KIDS_MODEL_IMAGE_URLS;
  } else {
    dict = MODEL_IMAGE_URLS;
  }
  const group = dict[key] ?? dict["default"]!;
  return (
    group[internalKey] ??
    group["casual"] ??
    dict["default"]!["casual"]!
  );
}

/**
 * Calls GPT-4o Vision to extract microscopic garment design details
 * (zipper shapes, button materials, collar seams, fabric textures) from the
 * hanger photo. Returns a short descriptive string to enrich the Fal.ai prompt.
 *
 * HANGER ISOLATION: The system prompt explicitly instructs the vision model to
 * treat the hanger as transparent void — only the fabric garment geometry matters.
 */
async function extractGarmentDetails(imageUrl: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a precision garment analyst for a luxury fashion AI rendering engine. " +
            "CRITICAL MASKING DIRECTIVE: The image will show a garment on a clothes hanger. " +
            "You MUST mentally isolate and completely discard the hanger object from your analysis — " +
            "treat the hanger, hook, rod, and any mounting hardware as transparent empty space. " +
            "Capture ONLY the pure fabric edge borders and garment geometry itself. " +
            "STRUCTURAL TOKEN PRIORITY RULE: Lead your response with the most visually defining structural " +
            "tokens in this order — front button plackets, collar construction (e.g. linen collar, lapel, " +
            "band collar), sleeve style (e.g. rolled sleeves, dropped shoulder), hem line (e.g. loose bottom hem, " +
            "curved hem), then fabric type. This ordering is mandatory — structural details FIRST. " +
            "Format: '[structural tokens], [fabric], [silhouette]' — all in one compact paragraph. " +
            "Be extremely specific. No filler phrases. Never mention hangers or hooks in your output.",
        },
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: imageUrl } }],
        },
      ],
      max_tokens: 120,
    });
    return response.choices[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

function prepareGarmentImage(sourceImageUrl: string): string {
  return sourceImageUrl;
}

// ---------------------------------------------------------------------------
// Garment category detection via OpenAI vision
// Includes hanger masking instruction so the model ignores hanger geometry.
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
// Main pipeline
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
  onComplete: (outputImageUrl: string) => Promise<void>;
  onError: (error: Error) => Promise<void>;
}): Promise<void> {
  const {
    renderId,
    sourceImageUrl,
    modelPersona,
    modelDemographics,
    modelPose,
    modelGender,
    modelAgeRange,
    cameraFraming,
  } = params;

  try {
    // 1. Prepare the garment image
    const garmentImage = prepareGarmentImage(sourceImageUrl);

    // 2. Select model image — gender-aware routing
    const modelImageUrl = selectModelImage(modelDemographics, modelPersona, modelGender);
    logger.info(
      { renderId, modelImageUrl, modelDemographics, modelPersona, modelPose, modelGender, modelAgeRange, cameraFraming },
      "AI pipeline: model image selected",
    );

    // 3. Detect garment category + extract microscopic design details in parallel
    // Kids/womens full-body selection: let AI classifier decide; mens defaults to tops.
    const [detectedCategory, garmentDetails] = await Promise.all([
      detectGarmentCategory(garmentImage),
      extractGarmentDetails(garmentImage),
    ]);
    const category: GarmentCategory = detectedCategory;
    logger.info(
      { renderId, category, garmentDetails: garmentDetails.slice(0, 80) },
      "AI pipeline: garment analysis complete",
    );

    // 4. Call fashn/tryon/v1.6 — primary virtual try-on endpoint
    logger.info({ renderId }, "AI pipeline: calling fal-ai/fashn/tryon/v1.6");

    let outputImageUrl: string | undefined;

    try {
      // ── Open-palm hand posing constraint — appended to every positive prompt ──
      const HAND_POSE_CONSTRAINT =
        "model standing in a clean symmetrical catalog posture with hands open and fingers completely " +
        "separated down at their sides, showing clear natural hand anatomy, relaxed open palms, " +
        "no clenched fists, no crossed arms";

      // ── Negative prompt: anatomical distortion protection ──
      const NEGATIVE_PROMPT =
        "deformed hands, abnormal fingers, extra digits, broken anatomy, " +
        "distorted facial features, blurry resolution, low quality, floating artifacts, " +
        "visible clothes hanger, wooden hanger remnants, hanger shadow inside collar, " +
        "hanger hook on shoulder, metal hook artifact";

      // ── Gender + Pose → hyper-focused commercial studio prompt ──
      type PoseKey = "standing_frontal" | "walking_dynamic" | "sideways_posing" | "default";
      type GenderKey = "mens" | "womens" | "kids" | "default";
      const GENDER_POSE_PROMPTS: Record<GenderKey, Record<PoseKey, string>> = {
        mens: {
          standing_frontal:
            "A clear, sharp, high-resolution front-facing commercial studio catalog lookbook photograph of a professional male model standing directly facing the camera in a perfectly symmetrical frontal pose, clean neutral background, full body visible",
          walking_dynamic:
            "A high-resolution dynamic commercial studio photograph of a professional male model captured mid-stride walking confidently forward, editorial lookbook quality",
          sideways_posing:
            "A high-resolution commercial studio photograph of a professional male model posed elegantly sideways at a three-quarter angle, clean neutral background",
          default:
            "A high-resolution commercial studio catalog photograph of a professional male model, editorial lookbook quality, clean neutral background",
        },
        womens: {
          standing_frontal:
            "A clear, sharp, high-resolution front-facing commercial studio catalog lookbook photograph of a professional female model standing directly facing the camera in a perfectly symmetrical frontal pose, clean neutral background, full body visible",
          walking_dynamic:
            "A high-resolution dynamic commercial studio photograph of a professional female model captured mid-stride walking confidently forward, editorial lookbook quality",
          sideways_posing:
            "A high-resolution commercial studio photograph of a professional female model posed elegantly sideways at a three-quarter angle, clean neutral background",
          default:
            "A high-resolution commercial studio catalog photograph of a professional female model, editorial lookbook quality, clean neutral background",
        },
        kids: {
          standing_frontal:
            "A clear, sharp, high-resolution front-facing commercial children's fashion catalog photograph of a young model standing directly facing the camera, clean neutral background",
          walking_dynamic:
            "A high-resolution commercial children's fashion catalog photograph of a young model captured mid-stride walking forward, clean neutral background",
          sideways_posing:
            "A high-resolution commercial children's fashion catalog photograph of a young model posed sideways, clean neutral background",
          default:
            "A high-resolution commercial children's fashion catalog photograph, clean neutral background",
        },
        default: {
          standing_frontal:
            "A clear, sharp, high-resolution front-facing commercial studio catalog lookbook photograph of a professional model standing directly facing the camera in a symmetrical frontal pose, clean neutral background",
          walking_dynamic:
            "A high-resolution dynamic commercial studio photograph of a professional model captured mid-stride, editorial lookbook quality",
          sideways_posing:
            "A high-resolution commercial studio photograph of a professional model posed sideways at a three-quarter angle, clean neutral background",
          default:
            "A high-resolution commercial studio catalog fashion photograph, clean neutral background",
        },
      };
      const genderKey: GenderKey =
        modelGender === "mens" || modelGender === "womens" || modelGender === "kids"
          ? (modelGender as GenderKey)
          : "default";
      const poseKey: PoseKey =
        modelPose === "standing_frontal" ||
        modelPose === "walking_dynamic" ||
        modelPose === "sideways_posing"
          ? (modelPose as PoseKey)
          : "default";
      const basePrompt = GENDER_POSE_PROMPTS[genderKey][poseKey];

      // ── Camera framing directive appended after base pose prompt ──
      const CAMERA_FRAMING_DIRECTIVES: Record<string, string> = {
        full_body: "Full body catalog composition from head to toe, model centered, minimal negative space above frame.",
        mid_shot: "Mid-shot portrait composition, waist up, clean background.",
        close_up: "Extreme texture close-up, detailed fabric and material focus.",
      };
      const AGE_RANGE_LABELS: Record<string, string> = {
        young_child: "child model aged 5-10",
        teen_youth: "teen/youth model aged 10-15",
        young_adult: "young adult model aged 20-30",
        classic_mid_age: "classic mid-age model aged 30-40",
        mature_executive: "mature executive model aged 40-50",
      };
      const framingDirective = cameraFraming ? CAMERA_FRAMING_DIRECTIVES[cameraFraming] ?? "" : "";
      const ageLabel = modelAgeRange ? `Featuring a ${AGE_RANGE_LABELS[modelAgeRange] ?? ""}.` : "";
      // Structural garment tokens go FIRST so the renderer prioritises exact cut replication
      const promptParts = [
        garmentDetails ? `Garment: ${garmentDetails}.` : "",
        basePrompt,
        HAND_POSE_CONSTRAINT,
        ageLabel,
        framingDirective,
      ].filter(Boolean).join(" ");

      const result = await fal.subscribe("fal-ai/fashn/tryon/v1.6", {
        input: {
          model_image: modelImageUrl,
          garment_image: garmentImage,
          category,
          garment_photo_type: "flat-lay",
          mode: "quality",
          num_samples: 1,
          output_format: "jpeg",
          // cover_weight at 1.0 = maximum garment fidelity — forces exact button/collar/fabric
          // replication rather than degrading to generic shapes
          cover_weight: 1.0,
          prompt: promptParts,
          negative_prompt: NEGATIVE_PROMPT,
        },
        logs: false,
      });

      // Defensively check all common output URL keys
      const data = result.data as Record<string, unknown> | undefined;
      const candidates = [
        data?.["image_url"],
        data?.["url"],
        (data?.["images"] as Array<{ url: string }> | undefined)?.[0]?.url,
        (data?.["image"] as { url: string } | undefined)?.url,
      ];
      for (const c of candidates) {
        if (typeof c === "string" && c.startsWith("http")) {
          outputImageUrl = c;
          break;
        }
      }

      logger.info({ renderId, outputImageUrl }, "AI pipeline: fashn/tryon/v1.6 succeeded");
    } catch (primaryError) {
      // 4b. Fallback: image-apps-v2/virtual-try-on
      logger.warn(
        { renderId, primaryError },
        "AI pipeline: fashn/tryon/v1.6 failed — falling back to image-apps-v2/virtual-try-on",
      );

      const fallbackResult = await fal.subscribe(
        "fal-ai/image-apps-v2/virtual-try-on",
        {
          input: {
            person_image_url: modelImageUrl,
            clothing_image_url: garmentImage,
            preserve_pose: true,
          },
          logs: false,
        },
      );

      const fd = fallbackResult.data as Record<string, unknown> | undefined;
      const fallbackCandidates = [
        fd?.["image_url"],
        fd?.["url"],
        (fd?.["images"] as Array<{ url: string }> | undefined)?.[0]?.url,
        (fd?.["image"] as { url: string } | undefined)?.url,
      ];
      for (const c of fallbackCandidates) {
        if (typeof c === "string" && c.startsWith("http")) {
          outputImageUrl = c;
          break;
        }
      }

      logger.info(
        { renderId, outputImageUrl },
        "AI pipeline: fallback succeeded",
      );
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
