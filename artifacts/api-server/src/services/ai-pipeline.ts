import OpenAI from "openai";
import { fal } from "@fal-ai/client";
import { logger } from "../lib/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAPI_API_KEY });
fal.config({ credentials: process.env.FAL_KEY });

// ---------------------------------------------------------------------------
// PRIMARY model image dictionary — keyed by gender → ageRange
// These are the confirmed, high-fidelity base human model URLs that are
// checked FIRST. The legacy demographics+persona dicts below act as fallback.
// ---------------------------------------------------------------------------
const AGE_KEYED_MODEL_IMAGES: Record<string, Record<string, string>> = {
  mens: {
    // Men's Fashion — 20–30 Years: clean, front-facing, open-palm young male
    young_adult:
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=768&q=85&fit=crop&crop=top",
    // Men's Fashion — 30–40 Years: mature corporate executive male portrait
    classic_mid_age:
      "https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=768&q=85&fit=crop&crop=top",
    // Men's Fashion — 40–50 Years: seasoned executive, confident posture
    mature_executive:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=768&q=85&fit=crop&crop=top",
    // Men's Fashion — 10–15 Years: teen/youth male
    teen_youth:
      "https://images.unsplash.com/photo-1534367610401-9f5ed68180aa?w=768&q=85&fit=crop&crop=top",
  },
  womens: {
    // Women's Fashion — 20–30 Years: elite, front-facing editorial female lookbook
    young_adult:
      "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=768&q=85&fit=crop&crop=top",
    // Women's Fashion — 30–40 Years: clean, professional studio-lit woman
    classic_mid_age:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=768&q=85&fit=crop&crop=top",
    // Women's Fashion — 40–50 Years: mature, polished professional woman
    mature_executive:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=768&q=85&fit=crop&crop=top",
    // Women's Fashion — 10–15 Years: teen/youth female
    teen_youth:
      "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=768&q=85&fit=crop&crop=top",
  },
  kids: {
    // Kids' Fashion — 5–10 Years: perfectly scaled front-standing child model
    young_child:
      "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=768&q=85&fit=crop&crop=top",
    // Kids' Fashion — 10–15 Years: teen/youth child model
    teen_youth:
      "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=768&q=85&fit=crop&crop=top",
  },
};

// ---------------------------------------------------------------------------
// LEGACY model image dictionaries — female (default), male, and kids
// Key: demographics -> persona -> Unsplash CDN URL (public, free to use)
// Used as fallback when no age-range-keyed image exists.
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
 *
 * Resolution order (first match wins):
 *   1. AGE_KEYED_MODEL_IMAGES[gender][ageRange]  ← primary, most specific
 *   2. Legacy demographics+persona dict           ← fallback for unmatched combos
 */
function selectModelImage(
  demographics: string | null | undefined,
  persona: string,
  modelGender?: string | null,
  modelAgeRange?: string | null,
): string {
  // 1 — Age-keyed primary lookup
  if (modelGender && modelAgeRange) {
    const genderSlot = AGE_KEYED_MODEL_IMAGES[modelGender];
    if (genderSlot) {
      const ageUrl = genderSlot[modelAgeRange];
      if (ageUrl) return ageUrl;
    }
  }

  // 2 — Legacy demographics+persona fallback
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
    modelGender,
    modelAgeRange,
    cameraFraming,
    locationEnvironment,
  } = params;

  try {
    // 1. Prepare the garment image — this is the primary input to the Flux
    //    image-to-image diffusion pipeline (no separate model image needed).
    const garmentImage = prepareGarmentImage(sourceImageUrl);

    // 2. Extract structural garment details via GPT-4o vision to enrich the
    //    lookbook prompt with real fabric/cut/hardware descriptors.
    const garmentDetails = await extractGarmentDetails(garmentImage);
    logger.info(
      { renderId, garmentDetails: garmentDetails.slice(0, 80) },
      "AI pipeline: garment details extracted for prompt",
    );

    // 3. Build the dynamic lookbook prompt from active UI selector tokens.
    //    Template: gender + age + framing + location + garment micro-details.
    const GENDER_LABELS: Record<string, string> = {
      mens: "male",
      womens: "female",
      kids: "child",
    };
    const AGE_RANGE_LABELS: Record<string, string> = {
      young_child: "5–10 years old",
      teen_youth: "10–15 years old",
      young_adult: "20–30 years old",
      classic_mid_age: "30–40 years old",
      mature_executive: "40–50 years old",
    };
    const FRAMING_LABELS: Record<string, string> = {
      full_body: "full body catalog shot",
      mid_shot: "mid-shot portrait",
      close_up: "texture close-up",
    };
    const LOCATION_LABELS: Record<string, string> = {
      photo_studio: "clean professional photo studio",
      urban_street: "urban street",
      luxury_interior: "luxurious interior",
      nature: "natural outdoor",
    };

    const genderLabel = modelGender ? (GENDER_LABELS[modelGender] ?? "human") : "human";
    const ageLabel = modelAgeRange ? (AGE_RANGE_LABELS[modelAgeRange] ?? "") : "";
    const framingLabel = cameraFraming
      ? (FRAMING_LABELS[cameraFraming] ?? "full body catalog shot")
      : "full body catalog shot";
    const locationLabel = locationEnvironment
      ? (LOCATION_LABELS[locationEnvironment] ?? "clean professional photo studio")
      : "clean professional photo studio";

    const prompt =
      `A high-resolution, sharp, professional commercial e-commerce studio catalog lookbook photograph ` +
      `of a real human ${genderLabel} model${ageLabel ? ` aged ${ageLabel}` : ""}, ` +
      `cleanly wearing the uploaded clothing item in a ${framingLabel}, ` +
      `standing in a straight front-facing pose directly looking at the camera lens ` +
      `with perfectly natural hands and open-palm fingers, photorealistic skin texture, ` +
      `situated inside a beautifully blurred ${locationLabel} scene.` +
      (garmentDetails ? ` ${garmentDetails}` : "");

    const NEGATIVE_PROMPT =
      "deformed hands, abnormal fingers, extra digits, broken anatomy, " +
      "distorted face, plastic skin texture, blurry, low resolution, floating artifacts, " +
      "visible clothes hanger, wooden hanger remnants, hanger hook artifact";

    logger.info(
      { renderId, prompt: prompt.slice(0, 140) },
      "AI pipeline: calling fal-ai/flux/schnell/image-to-image",
    );

    let outputImageUrl: string | undefined;

    try {
      // PRIMARY: Flux Schnell image-to-image
      //   image_url → uploaded hanger flat-lay (input structure preserved)
      //   strength  → 0.45 (critical quality gate — preserves exact garment colours,
      //               patterns and stitching while diffusing a realistic human around it)
      //   steps     → 4 (Schnell is optimised for 1–4 step inference)
      const result = await fal.subscribe("fal-ai/flux/schnell/image-to-image", {
        input: {
          image_url: garmentImage,
          prompt,
          negative_prompt: NEGATIVE_PROMPT,
          strength: 0.45,
          num_inference_steps: 4,
          num_images: 1,
          output_format: "jpeg",
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

      logger.info({ renderId, outputImageUrl }, "AI pipeline: flux/schnell/image-to-image succeeded");
    } catch (primaryError) {
      // FALLBACK: Flux General (higher-quality, more inference steps)
      logger.warn(
        { renderId, primaryError },
        "AI pipeline: flux/schnell failed — falling back to fal-ai/flux-general",
      );

      const fallbackResult = await fal.subscribe("fal-ai/flux-general", {
        input: {
          image_url: garmentImage,
          prompt,
          negative_prompt: NEGATIVE_PROMPT,
          strength: 0.45,
          num_inference_steps: 28,
          num_images: 1,
          output_format: "jpeg",
        },
        logs: false,
      });

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

      logger.info({ renderId, outputImageUrl }, "AI pipeline: flux-general fallback succeeded");
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
