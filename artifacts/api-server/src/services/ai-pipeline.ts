import OpenAI from "openai";
import { fal } from "@fal-ai/client";
import { logger } from "../lib/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAPI_API_KEY });
fal.config({ credentials: process.env.FAL_KEY });

// ---------------------------------------------------------------------------
// Model image dictionary
// Key: demographics -> persona -> Unsplash CDN URL (public, free to use)
// ---------------------------------------------------------------------------
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

/** Returns the pre-configured model image URL for the given demographics + persona/expression combo. */
function selectModelImage(
  demographics: string | null | undefined,
  persona: string,
): string {
  const internalKey = EXPRESSION_TO_PERSONA[persona] ?? persona;
  const key = demographics ?? "default";
  const group = MODEL_IMAGE_URLS[key] ?? MODEL_IMAGE_URLS["default"]!;
  return (
    group[internalKey] ??
    group["casual"] ??
    MODEL_IMAGE_URLS["default"]!["casual"]!
  );
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
  onComplete: (outputImageUrl: string) => Promise<void>;
  onError: (error: Error) => Promise<void>;
}): Promise<void> {
  const {
    renderId,
    sourceImageUrl,
    modelPersona,
    modelDemographics,
    modelPose,
  } = params;

  try {
    // 1. Prepare the garment image
    const garmentImage = prepareGarmentImage(sourceImageUrl);

    // 2. Select model image — maps expression UI values to persona image keys
    const modelImageUrl = selectModelImage(modelDemographics, modelPersona);
    logger.info(
      { renderId, modelImageUrl, modelDemographics, modelPersona, modelPose },
      "AI pipeline: model image selected",
    );

    // 3. Detect garment category (hanger-aware prompt)
    const category = await detectGarmentCategory(garmentImage);
    logger.info({ renderId, category }, "AI pipeline: garment category detected");

    // 4. Call fashn/tryon/v1.6 — primary virtual try-on endpoint
    logger.info({ renderId }, "AI pipeline: calling fal-ai/fashn/tryon/v1.6");

    let outputImageUrl: string | undefined;

    try {
      const result = await fal.subscribe("fal-ai/fashn/tryon/v1.6", {
        input: {
          model_image: modelImageUrl,
          garment_image: garmentImage,
          category,
          garment_photo_type: "flat-lay",
          mode: "quality",
          num_samples: 1,
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
