// ---------------------------------------------------------------------------
// EXPERIMENTAL — Nano Banana 2 single-pass Create engine
//
// When STUDIOLAYER_NANO2_SINGLE_PASS_ENABLED is on, production Create uses
// exactly ONE OpenRouter Chat Completions generation with:
//   model: google/gemini-3.1-flash-image-preview
//   provider: Google AI Studio only (allow_fallbacks: false)
//   refs: TALENT → GARMENT → POSE_MASTER → FURNITURE (when present)
//
// Does NOT execute Headless Stage 1/2, EVF-SAM, YuNet, or any second generation.
// Does NOT call Google directly. Does NOT use Nano Pro.
// Reversible: disable the flag to restore Headless / prior Create path.
// ---------------------------------------------------------------------------

import { logger } from "../../../lib/logger.js";
import {
  isNano2SinglePassEnabled,
  OPENROUTER_RENDERING_CONFIG,
  STUDIOLAYER_NANO2_SINGLE_PASS_ENV,
  type NativeOutputResolution,
} from "../rendering.config.js";
import {
  STUDIO_BACKGROUND_AUTHORITY_SOT,
  STUDIO_BACKGROUND_PIXEL_PRECISION_CLOSER,
} from "../rendering-studio-background-authority.js";

export {
  isNano2SinglePassEnabled,
  STUDIOLAYER_NANO2_SINGLE_PASS_ENV,
};

export const NANO_BANANA_2_SINGLE_PASS_NAME =
  "nano-banana-2-single-pass" as const;

/** Alias for tests / logs — same as STUDIOLAYER_NANO2_SINGLE_PASS_ENV. */
export const NANO_BANANA_2_SINGLE_PASS_ENV = STUDIOLAYER_NANO2_SINGLE_PASS_ENV;

export const NANO_BANANA_2_SINGLE_PASS_MODEL =
  "google/gemini-3.1-flash-image-preview" as const;

export const NANO_BANANA_2_SINGLE_PASS_API =
  "POST /api/v1/chat/completions" as const;

export const NANO_BANANA_2_SINGLE_PASS_ENDPOINT_PATH =
  "/chat/completions" as const;

export const NANO_BANANA_2_REFERENCE_ORDER_WITH_FURNITURE = [
  "TALENT",
  "GARMENT",
  "POSE_MASTER",
  "FURNITURE",
] as const;

export const NANO_BANANA_2_REFERENCE_ORDER_WITHOUT_FURNITURE = [
  "TALENT",
  "GARMENT",
  "POSE_MASTER",
] as const;

export const NANO_BANANA_2_PROVIDER_PIN = {
  order: ["google-ai-studio"] as const,
  allow_fallbacks: false as const,
};

export type NanoBanana2SinglePassInput = {
  shotIndex: number;
  talentImageUrl: string;
  garmentImageUrl: string;
  poseImageUrl: string;
  poseId: string;
  furnitureReferenceImageUrl?: string | null;
  furnitureAssetId?: string | null;
  /** Upstream shot brief — must retain garment-length intelligence when present. */
  creativeShotPrompt?: string;
  outputResolution?: NativeOutputResolution;
  timeoutMs?: number;
  renderId?: number | null;
  sessionId?: string | null;
};

export type NanoBanana2BuiltRequest = {
  experiment: typeof NANO_BANANA_2_SINGLE_PASS_NAME;
  model: typeof NANO_BANANA_2_SINGLE_PASS_MODEL;
  api: typeof NANO_BANANA_2_SINGLE_PASS_API;
  provider: typeof NANO_BANANA_2_PROVIDER_PIN;
  referenceOrder:
    | typeof NANO_BANANA_2_REFERENCE_ORDER_WITH_FURNITURE
    | typeof NANO_BANANA_2_REFERENCE_ORDER_WITHOUT_FURNITURE;
  hasTalent: true;
  hasGarment: true;
  hasPoseMaster: true;
  hasFurniture: boolean;
  resolution: "2K" | "4K";
  aspectRatio: "4:5";
  promptUsed: string;
  body: Record<string, unknown>;
};

function toImagePart(url: string): {
  type: "image_url";
  image_url: { url: string; detail: "high" };
} {
  return {
    type: "image_url",
    image_url: { url, detail: "high" },
  };
}

/**
 * Binding Stage-1-equivalent authority for the single Nano Banana 2 call.
 * Reference indices match attached image order.
 */
export function buildNanoBanana2AuthorityPrompt(params: {
  hasFurniture: boolean;
  creativeShotPrompt?: string;
}): string {
  const hasFurniture = params.hasFurniture;
  const talentRef = 1;
  const garmentRef = 2;
  const poseRef = 3;
  const furnitureRef = 4;

  const referenceContract = hasFurniture
    ? [
        "REFERENCE IMAGE CONTRACT (BINDING):",
        `Reference Image ${talentRef} = TALENT — person identity, face, facial characteristics, hair, skin appearance, age appearance, and natural body proportions ONLY.`,
        `Reference Image ${garmentRef} = GARMENT — highest fidelity priority. Exact garment identity, design, colour, material/fabric, construction, neckline, sleeves, silhouette, seams, visible details, and garment length.`,
        `Reference Image ${poseRef} = POSE MASTER — pose, body position, limb placement, hand position, gesture, pose geometry, and pose-related framing ONLY.`,
        `Reference Image ${furnitureRef} = FURNITURE — exact furniture identity, design, shape, material, colour, upholstery, and proportions ONLY.`,
        "Exactly four reference images are attached.",
      ].join("\n")
    : [
        "REFERENCE IMAGE CONTRACT (BINDING):",
        `Reference Image ${talentRef} = TALENT — person identity, face, facial characteristics, hair, skin appearance, age appearance, and natural body proportions ONLY.`,
        `Reference Image ${garmentRef} = GARMENT — highest fidelity priority. Exact garment identity, design, colour, material/fabric, construction, neckline, sleeves, silhouette, seams, visible details, and garment length.`,
        `Reference Image ${poseRef} = POSE MASTER — pose, body position, limb placement, hand position, gesture, pose geometry, and pose-related framing ONLY.`,
        "Exactly three reference images are attached. No furniture reference image is attached.",
      ].join("\n");

  const isolation = [
    "AUTHORITY SUMMARY:",
    "Talent reference controls the person and identity.",
    "Garment reference controls the exact garment.",
    "Pose Master controls pose and framing only.",
    hasFurniture
      ? "Furniture reference controls the exact furniture."
      : "No furniture catalogue reference is attached — do not invent branded furniture from the Pose Master.",
    "Do not transfer unrelated visual attributes between references.",
    "",
    "GARMENT PRIORITY (HIGHEST):",
    `The final garment must be the SAME garment shown in Reference Image ${garmentRef}.`,
    "Do not create an inspired, similar, redesigned, or substituted garment.",
    `The Pose Master must never override the garment reference. Do not copy clothing, colour, print, or construction from Reference Image ${poseRef}.`,
    "",
    "POSE MASTER ISOLATION:",
    `Use Reference Image ${poseRef} for pose and pose geometry only.`,
    `Do NOT derive garment, person identity, hairstyle, body appearance redesign, furniture, background, clothing, or footwear from Reference Image ${poseRef}.`,
    "",
    hasFurniture
      ? [
          "FURNITURE AUTHORITY:",
          `Reproduce the exact furniture from Reference Image ${furnitureRef}.`,
          `Do not use furniture appearing in Reference Image ${poseRef}.`,
          "Do not substitute a similar chair or furniture item.",
        ].join("\n")
      : "FURNITURE: Do not copy furniture design or material from the Pose Master.",
    "",
    "TALENT / IDENTITY:",
    `Preserve the same person from Reference Image ${talentRef}.`,
    `Do not allow the Pose Master to replace or redesign the person.`,
    "",
    "OUTPUT STYLE:",
    "Generate a photorealistic premium fashion editorial photograph.",
    "Require realistic human anatomy, natural body proportions, realistic skin, realistic fabric behaviour, accurate garment construction, professional fashion photography, realistic lighting and shadows, and premium editorial quality.",
    "Do NOT generate illustration, sketch, fashion illustration, CGI-looking render, 3D character, stylized artwork, garment concept art, mannequin, or catalogue illustration.",
    "The uploaded garment reference must result in an actual garment worn by the Talent in the final photograph.",
  ].join("\n");

  const parts = [
    STUDIO_BACKGROUND_AUTHORITY_SOT,
    referenceContract,
    isolation,
    params.creativeShotPrompt?.trim() || undefined,
    STUDIO_BACKGROUND_PIXEL_PRECISION_CLOSER,
  ].filter(Boolean);

  return parts.join("\n\n");
}

export function buildNanoBanana2SinglePassRequest(
  input: NanoBanana2SinglePassInput,
): NanoBanana2BuiltRequest {
  const furnitureUrl =
    typeof input.furnitureReferenceImageUrl === "string" &&
    input.furnitureReferenceImageUrl.trim().length > 0
      ? input.furnitureReferenceImageUrl.trim()
      : null;
  const hasFurniture = Boolean(furnitureUrl);
  const resolution: "2K" | "4K" =
    input.outputResolution === "4K" ? "4K" : "2K";

  const promptUsed = buildNanoBanana2AuthorityPrompt({
    hasFurniture,
    creativeShotPrompt: input.creativeShotPrompt,
  });

  const imageParts = [
    toImagePart(input.talentImageUrl),
    toImagePart(input.garmentImageUrl),
    toImagePart(input.poseImageUrl),
    ...(furnitureUrl ? [toImagePart(furnitureUrl)] : []),
  ];

  const referenceOrder = hasFurniture
    ? NANO_BANANA_2_REFERENCE_ORDER_WITH_FURNITURE
    : NANO_BANANA_2_REFERENCE_ORDER_WITHOUT_FURNITURE;

  const body = {
    model: NANO_BANANA_2_SINGLE_PASS_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: promptUsed },
          ...imageParts,
        ],
      },
    ],
    modalities: ["image", "text"],
    image_config: {
      aspect_ratio: OPENROUTER_RENDERING_CONFIG.outputAspectRatio,
      image_size: resolution,
    },
    provider: {
      order: [...NANO_BANANA_2_PROVIDER_PIN.order],
      allow_fallbacks: NANO_BANANA_2_PROVIDER_PIN.allow_fallbacks,
    },
  };

  return {
    experiment: NANO_BANANA_2_SINGLE_PASS_NAME,
    model: NANO_BANANA_2_SINGLE_PASS_MODEL,
    api: NANO_BANANA_2_SINGLE_PASS_API,
    provider: NANO_BANANA_2_PROVIDER_PIN,
    referenceOrder,
    hasTalent: true,
    hasGarment: true,
    hasPoseMaster: true,
    hasFurniture,
    resolution,
    aspectRatio: "4:5",
    promptUsed,
    body,
  };
}

function extractChatImageUrls(responseBody: unknown): string[] {
  const body = responseBody as Record<string, unknown>;
  const choices = body?.["choices"] as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(choices) || choices.length === 0) return [];

  const urls: string[] = [];
  const extractFromParts = (parts: Array<Record<string, unknown>>): void => {
    for (const part of parts) {
      if (part["type"] === "image_url") {
        const imageUrl = part["image_url"] as Record<string, string> | undefined;
        if (imageUrl?.["url"]) urls.push(imageUrl["url"]);
      }
    }
  };

  for (const choice of choices) {
    const message = choice?.["message"] as Record<string, unknown> | undefined;
    if (!message) continue;
    const images = message["images"];
    if (Array.isArray(images) && images.length > 0) {
      extractFromParts(images as Array<Record<string, unknown>>);
      continue;
    }
    const content = message["content"];
    if (typeof content === "string") {
      if (content.startsWith("http") || content.startsWith("data:")) {
        urls.push(content);
      }
    } else if (Array.isArray(content)) {
      extractFromParts(content as Array<Record<string, unknown>>);
    }
  }
  return urls;
}

function extractGenerationCost(parsedBody: unknown): unknown {
  if (!parsedBody || typeof parsedBody !== "object") return null;
  const usage = (parsedBody as Record<string, unknown>)["usage"];
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  return {
    promptTokens: u["prompt_tokens"] ?? null,
    completionTokens: u["completion_tokens"] ?? null,
    totalTokens: u["total_tokens"] ?? null,
    cost: u["cost"] ?? null,
  };
}

/**
 * Exactly ONE OpenRouter image-generation call. No Stage 1/2, no mask, no YuNet.
 */
export async function generateNanoBanana2SinglePass(
  input: NanoBanana2SinglePassInput,
): Promise<string> {
  const built = buildNanoBanana2SinglePassRequest(input);
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    throw new Error(
      `${NANO_BANANA_2_SINGLE_PASS_NAME}: OPENROUTER_API_KEY is not set`,
    );
  }

  const timeoutMs =
    input.timeoutMs ??
    Number(process.env["OR_RENDER_TIMEOUT_MS"] ?? OPENROUTER_RENDERING_CONFIG.timeoutMs);

  logger.info(
    {
      experiment: NANO_BANANA_2_SINGLE_PASS_NAME,
      experimentEnabled: true,
      shotIndex: input.shotIndex,
      renderId: input.renderId ?? null,
      sessionId: input.sessionId ?? null,
      model: built.model,
      provider: built.provider,
      resolution: built.resolution,
      aspectRatio: built.aspectRatio,
      referenceOrder: built.referenceOrder,
      talentPresent: built.hasTalent,
      garmentPresent: built.hasGarment,
      poseMasterPresent: built.hasPoseMaster,
      furniturePresent: built.hasFurniture,
      furnitureAssetId: input.furnitureAssetId ?? null,
      poseId: input.poseId,
      promptLength: built.promptUsed.length,
      generationPhase: "start",
    },
    "nano-banana-2-single-pass: generation start",
  );

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(
      `${OPENROUTER_RENDERING_CONFIG.baseUrl}${NANO_BANANA_2_SINGLE_PASS_ENDPOINT_PATH}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://studiolayer.ai",
          "X-Title": "StudioLayer AI",
        },
        body: JSON.stringify(built.body),
      },
    );
  } catch (error) {
    clearTimeout(timer);
    const durationMs = Date.now() - startedAt;
    logger.error(
      {
        experiment: NANO_BANANA_2_SINGLE_PASS_NAME,
        shotIndex: input.shotIndex,
        renderId: input.renderId ?? null,
        model: built.model,
        durationMs,
        generationPhase: "failure",
        err: error instanceof Error ? error.message : String(error),
      },
      "nano-banana-2-single-pass: generation failed (fetch)",
    );
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const bodyText = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    parsed = null;
  }
  const durationMs = Date.now() - startedAt;
  const cost = extractGenerationCost(parsed);

  if (!response.ok) {
    const detail =
      typeof parsed === "object" &&
      parsed &&
      "error" in (parsed as Record<string, unknown>)
        ? JSON.stringify((parsed as Record<string, unknown>)["error"]).slice(0, 500)
        : bodyText.slice(0, 500);
    logger.error(
      {
        experiment: NANO_BANANA_2_SINGLE_PASS_NAME,
        shotIndex: input.shotIndex,
        renderId: input.renderId ?? null,
        model: built.model,
        provider: built.provider,
        httpStatus: response.status,
        durationMs,
        openRouterError: detail,
        generationCost: cost,
        generationPhase: "failure",
      },
      "nano-banana-2-single-pass: generation failed (OpenRouter)",
    );
    throw new Error(
      `${NANO_BANANA_2_SINGLE_PASS_NAME} OpenRouter error: HTTP ${response.status} — ${detail}`,
    );
  }

  const urls = parsed ? extractChatImageUrls(parsed) : [];
  const imageUrl = urls[0];
  if (!imageUrl) {
    logger.error(
      {
        experiment: NANO_BANANA_2_SINGLE_PASS_NAME,
        shotIndex: input.shotIndex,
        renderId: input.renderId ?? null,
        model: built.model,
        durationMs,
        generationCost: cost,
        generationPhase: "failure",
      },
      "nano-banana-2-single-pass: response OK but no image",
    );
    throw new Error(
      `${NANO_BANANA_2_SINGLE_PASS_NAME}: response OK but no image data found`,
    );
  }

  logger.info(
    {
      experiment: NANO_BANANA_2_SINGLE_PASS_NAME,
      shotIndex: input.shotIndex,
      renderId: input.renderId ?? null,
      sessionId: input.sessionId ?? null,
      model: built.model,
      provider: built.provider,
      resolution: built.resolution,
      aspectRatio: built.aspectRatio,
      referenceOrder: built.referenceOrder,
      durationMs,
      generationCost: cost,
      generationPhase: "completion",
      generationCallCount: 1,
    },
    "nano-banana-2-single-pass: generation completion",
  );

  return imageUrl;
}
