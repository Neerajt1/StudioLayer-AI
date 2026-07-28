import OpenAI from "openai";
import { fal } from "@fal-ai/client";
import { logger } from "../lib/logger";

const openai = new OpenAI({
  apiKey: process.env.OPENAPI_API_KEY,
});

fal.config({ credentials: process.env.FAL_KEY });

const MODEL_PERSONA_LABELS: Record<string, string> = {
  casual: "casual lifestyle",
  high_fashion: "high-fashion editorial",
  athletic: "athletic sportswear",
  minimalist: "minimalist chic",
};

const DEMOGRAPHICS_LABELS: Record<string, string> = {
  caucasian: "Caucasian",
  east_asian: "East Asian",
  south_asian: "South Asian",
  afro_american: "Afro-American",
  hispanic: "Hispanic/Latino",
};

const LOCATION_LABELS: Record<string, string> = {
  photo_studio: "a pristine white photo studio",
  urban_street: "an urban street setting",
  luxury_interior: "a luxurious interior space",
  nature: "a natural outdoor environment",
};

const DIMENSIONS_TO_FAL: Record<string, string> = {
  portrait_45: "portrait_4_3",
  portrait_916: "portrait_16_9",
  square_11: "square_hd",
  landscape_169: "landscape_16_9",
};

async function uploadToFalStorage(sourceImageUrl: string): Promise<string> {
  if (!sourceImageUrl.startsWith("data:")) {
    return sourceImageUrl;
  }

  const [header, base64Data] = sourceImageUrl.split(",");
  const mimeType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
  const buffer = Buffer.from(base64Data, "base64");
  const blob = new Blob([buffer], { type: mimeType });
  const file = new File([blob], "garment.jpg", { type: mimeType });

  return fal.storage.upload(file);
}

async function analyzeGarment(imageUrl: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "Analyze the garment present in this uploaded photo. Isolate and describe its specific clothing item type, exact color palette tone, and fabric texture material. Output a single descriptive string containing only these data properties.",
      },
      {
        role: "user",
        content: [{ type: "image_url", image_url: { url: imageUrl } }],
      },
    ],
    max_tokens: 200,
  });

  return (
    response.choices[0]?.message?.content?.trim() ??
    "a stylish fashion garment"
  );
}

export async function runAIPipeline(params: {
  renderId: number;
  sourceImageUrl: string;
  modelPersona: string;
  locationEnvironment: string;
  modelDemographics?: string | null;
  imageDimensions?: string | null;
  smartLighting?: boolean | null;
  onComplete: (outputImageUrl: string) => Promise<void>;
  onError: (error: Error) => Promise<void>;
}): Promise<void> {
  const {
    renderId,
    sourceImageUrl,
    modelPersona,
    locationEnvironment,
    modelDemographics,
    imageDimensions,
    smartLighting,
  } = params;

  try {
    logger.info({ renderId }, "AI pipeline: uploading source image");
    const imageUrl = await uploadToFalStorage(sourceImageUrl);

    logger.info({ renderId }, "AI pipeline: analyzing garment with GPT-4o");
    const garmentDescription = await analyzeGarment(imageUrl);
    logger.info({ renderId, garmentDescription }, "AI pipeline: garment analyzed");

    const persona =
      MODEL_PERSONA_LABELS[modelPersona] ?? modelPersona.replace(/_/g, " ");
    const location =
      LOCATION_LABELS[locationEnvironment] ??
      locationEnvironment.replace(/_/g, " ");
    const ethnicity = modelDemographics
      ? DEMOGRAPHICS_LABELS[modelDemographics] ?? modelDemographics
      : null;
    const lightingClause = smartLighting
      ? ", professional studio three-point lighting, shadow-fabric detail"
      : "";

    const modelDesc = ethnicity
      ? `${ethnicity} ${persona}`
      : persona;

    const prompt = `A premium, ultra-realistic editorial studio fashion photograph of a ${modelDesc} model professionally posing and wearing a ${garmentDescription}, naturally positioned inside ${location}${lightingClause}. Flawless clothing wrinkles, natural skin lighting shadows, 8k resolution, high-end commercial look`;

    const imageSize = imageDimensions
      ? (DIMENSIONS_TO_FAL[imageDimensions] ?? "square_hd")
      : "square_hd";

    logger.info({ renderId, prompt, imageSize }, "AI pipeline: sending to fal.ai");

    const result = await fal.subscribe("fal-ai/flux/dev/image-to-image", {
      input: {
        image_url: imageUrl,
        prompt,
        strength: 0.85,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        image_size: imageSize,
      } as any,
      logs: false,
    });

    const outputImageUrl = (result.data as any)?.images?.[0]?.url as
      | string
      | undefined;

    if (!outputImageUrl) {
      throw new Error("fal.ai returned no image URL");
    }

    logger.info({ renderId, outputImageUrl }, "AI pipeline: complete");
    await params.onComplete(outputImageUrl);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ renderId, err }, "AI pipeline: failed");
    await params.onError(err);
  }
}
