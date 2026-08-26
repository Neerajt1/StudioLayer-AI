// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — flash-images-api-packaging-experiment
//
// Isolates HYPOTHESIS A: does OpenRouter Images API packaging weaken Studio
// Talent identity vs the same Flash model on Chat Completions?
//
// CONTROL A (production Nano Regular): Chat Completions + interleaved parts
// CONTROL B (this module):             Images API + prompt + input_references
//
// SAME model: google/gemini-3.1-flash-image
// SAME assets / order: GARMENT → TALENT → POSE_MASTER
// ONLY variable: request packaging / API
//
// Does NOT touch production Create, Nano Pro, Pose Master, billing, or credits.
// Easy to delete: this file + routes/test-flash-images-api-packaging.ts
//   (+ mount in routes/index) + this *.test.ts + .env.example flag line.
//
// PROMPT TRANSFORMATION (structural only — no identity wording changes):
//   Flash Chat content sequence:
//     [text: primaryInstruction] → [image×N detail:high] → [text?: creativeShotPrompt]
//   Images API requires a single `prompt` string, so the two text segments are
//   concatenated with "\n\n" (creative omitted when empty). Image bytes move to
//   `input_references` without `detail` (unsupported on Images API).
// ---------------------------------------------------------------------------

import sharp from "sharp";
import { logger } from "../../../lib/logger.js";
import { OPENROUTER_RENDERING_CONFIG } from "../rendering.config.js";
import {
  assembleFreshGenerationPrimaryInstruction,
  buildFreshGenerationImageParts,
} from "./OpenRouterProvider.js";

export const FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME =
  "flash-images-api-packaging-experiment" as const;

/** Locked to production Nano Regular Flash slug — do not use Pro. */
export const FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL =
  "google/gemini-3.1-flash-image" as const;

export const FLASH_IMAGES_API_PACKAGING_EXPERIMENT_API =
  "POST /api/v1/images" as const;

export const FLASH_IMAGES_API_PACKAGING_EXPERIMENT_ENDPOINT_PATH =
  "/images" as const;

export const FLASH_IMAGES_API_PACKAGING_REFERENCE_ORDER = [
  "GARMENT",
  "TALENT",
  "POSE_MASTER",
] as const;

export type FlashImagesApiPackagingExperimentInput = {
  garmentImageUrl: string;
  talentImageUrl: string;
  poseImageUrl: string;
  /**
   * Trailing creative shot text from Flash Chat (second text part after images).
   * Optional — when omitted, prompt is primaryInstruction only (same as Flash
   * when `prompt` is empty).
   */
  creativeShotPrompt?: string;
  /** Defaults to Flash fresh-generation primary instruction (unchanged wording). */
  primaryInstruction?: string;
  outputResolution?: "2K" | "4K";
  timeoutMs?: number;
};

export type FlashChatControlSerializedShape = {
  api: "POST /api/v1/chat/completions";
  model: typeof FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL;
  body: {
    model: typeof FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL;
    messages: [
      {
        role: "user";
        content: Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string; detail: "high" } }
        >;
      },
    ];
    modalities: ["image", "text"];
    image_config: {
      aspect_ratio: "4:5";
      image_size: "2K" | "4K";
    };
  };
};

export type FlashImagesApiExperimentSerializedShape = {
  api: typeof FLASH_IMAGES_API_PACKAGING_EXPERIMENT_API;
  model: typeof FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL;
  body: {
    model: typeof FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL;
    prompt: string;
    n: 1;
    aspect_ratio: "4:5";
    resolution: "2K" | "4K";
    input_references: Array<{
      type: "image_url";
      image_url: { url: string };
    }>;
  };
};

export type FlashImagesApiPackagingExperimentBuildResult = {
  experiment: typeof FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME;
  model: typeof FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL;
  referenceOrder: typeof FLASH_IMAGES_API_PACKAGING_REFERENCE_ORDER;
  primaryInstruction: string;
  creativeShotPrompt: string | null;
  /**
   * Documented structural transform only — concatenates Flash's two text
   * segments; does not rewrite identity language.
   */
  promptTransform: {
    flashChatTextParts: ["primaryInstruction", "creativeShotPrompt?"];
    imagesApiPrompt: "primaryInstruction + optional \\n\\n + creativeShotPrompt";
    imagesLoseDetailHigh: true;
  };
  flashChatControl: FlashChatControlSerializedShape;
  flashImagesExperiment: FlashImagesApiExperimentSerializedShape;
};

export type FlashImagesApiPackagingExperimentResult = {
  ok: true;
  experimental: true;
  experiment: typeof FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME;
  images: Array<{ url: string; index: number; width?: number; height?: number }>;
  durationMs: number;
  provider: "openrouter-flash-images-api-packaging-experiment";
  model: typeof FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL;
  api: typeof FLASH_IMAGES_API_PACKAGING_EXPERIMENT_API;
  promptUsed: string;
  referenceOrder: typeof FLASH_IMAGES_API_PACKAGING_REFERENCE_ORDER;
  aspectRatioRequested: "4:5";
  aspectRatioApplied: "4:5";
  resolutionRequested: "2K" | "4K";
  resolutionApplied: "2K" | "4K";
  outputDimensions?: { width: number; height: number };
  usage?: unknown;
  costUsd?: number | null;
  openRouterRequestId?: string | null;
  httpStatus: number;
  productionCreateUntouched: true;
};

function mapPartsToInputReferencesWithoutDetail(
  imageContent: ReadonlyArray<{
    type: "image_url";
    image_url: { url: string; detail?: string };
  }>,
): Array<{ type: "image_url"; image_url: { url: string } }> {
  return imageContent.map((part) => ({
    type: "image_url" as const,
    image_url: { url: part.image_url.url },
  }));
}

/**
 * Assemble Images API `prompt` from Flash Chat text segments.
 * Semantic content unchanged — only structural join required by Images API.
 */
export function assembleFlashImagesApiPromptFromFlashTextParts(params: {
  primaryInstruction: string;
  creativeShotPrompt?: string | null;
}): string {
  const primary = params.primaryInstruction.trim();
  const creative = params.creativeShotPrompt?.trim() ?? "";
  if (!creative) return primary;
  return `${primary}\n\n${creative}`;
}

/**
 * Build both CONTROL A (Flash Chat shape) and CONTROL B (Flash Images shape)
 * from identical assets. Does not call OpenRouter.
 */
export function buildFlashImagesApiPackagingExperimentRequest(
  input: FlashImagesApiPackagingExperimentInput,
): FlashImagesApiPackagingExperimentBuildResult {
  const resolution: "2K" | "4K" =
    input.outputResolution === "4K" ? "4K" : "2K";
  const primaryInstruction = (
    input.primaryInstruction ?? assembleFreshGenerationPrimaryInstruction()
  ).trim();
  const creativeShotPrompt = input.creativeShotPrompt?.trim()
    ? input.creativeShotPrompt.trim()
    : null;

  // Same builder as production Flash / Pro fresh generation.
  const imageParts = buildFreshGenerationImageParts({
    garmentImageUrl: input.garmentImageUrl,
    modelImageUrl: input.talentImageUrl,
    poseReferenceImageUrl: input.poseImageUrl,
  });

  if (imageParts.length !== 3) {
    throw new Error(
      `${FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME}: expected exactly 3 references (GARMENT→TALENT→POSE_MASTER), got ${imageParts.length}`,
    );
  }

  const flashChatContent: FlashChatControlSerializedShape["body"]["messages"][0]["content"] =
    [
      { type: "text", text: primaryInstruction },
      ...imageParts,
      ...(creativeShotPrompt
        ? [{ type: "text" as const, text: creativeShotPrompt }]
        : []),
    ];

  const imagesApiPrompt = assembleFlashImagesApiPromptFromFlashTextParts({
    primaryInstruction,
    creativeShotPrompt,
  });

  const inputReferences = mapPartsToInputReferencesWithoutDetail(imageParts);

  return {
    experiment: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
    model: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
    referenceOrder: FLASH_IMAGES_API_PACKAGING_REFERENCE_ORDER,
    primaryInstruction,
    creativeShotPrompt,
    promptTransform: {
      flashChatTextParts: ["primaryInstruction", "creativeShotPrompt?"],
      imagesApiPrompt:
        "primaryInstruction + optional \\n\\n + creativeShotPrompt",
      imagesLoseDetailHigh: true,
    },
    flashChatControl: {
      api: "POST /api/v1/chat/completions",
      model: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
      body: {
        model: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
        messages: [
          {
            role: "user",
            content: flashChatContent,
          },
        ],
        modalities: ["image", "text"],
        image_config: {
          aspect_ratio: OPENROUTER_RENDERING_CONFIG.outputAspectRatio,
          image_size: resolution,
        },
      },
    },
    flashImagesExperiment: {
      api: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_API,
      model: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
      body: {
        model: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
        prompt: imagesApiPrompt,
        n: 1,
        aspect_ratio: OPENROUTER_RENDERING_CONFIG.outputAspectRatio,
        resolution,
        input_references: inputReferences,
      },
    },
  };
}

function extractImageDataUris(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  const urls: string[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row["b64_json"] === "string" && row["b64_json"].length > 0) {
      const b64 = row["b64_json"];
      const mime =
        (typeof row["media_type"] === "string" && row["media_type"].includes("/")
          ? row["media_type"]
          : null) ??
        (typeof row["mime_type"] === "string" && row["mime_type"].includes("/")
          ? row["mime_type"]
          : "image/png");
      urls.push(b64.startsWith("data:") ? b64 : `data:${mime};base64,${b64}`);
      continue;
    }
    if (typeof row["url"] === "string" && row["url"].length > 0) {
      urls.push(row["url"]);
    }
  }
  return urls;
}

async function measureDataUri(
  dataUri: string,
): Promise<{ width: number; height: number } | undefined> {
  try {
    const match = /^data:[^;]+;base64,(.+)$/s.exec(dataUri);
    if (!match?.[1]) return undefined;
    const buf = Buffer.from(match[1], "base64");
    const meta = await sharp(buf).metadata();
    if (meta.width && meta.height) {
      return { width: meta.width, height: meta.height };
    }
  } catch {
    // non-fatal
  }
  return undefined;
}

function extractCostUsd(usage: unknown): number | null {
  if (!usage || typeof usage !== "object") return null;
  const cost = (usage as { cost?: unknown }).cost;
  return typeof cost === "number" && Number.isFinite(cost) ? cost : null;
}

function extractOpenRouterRequestId(
  response: Response,
  body: unknown,
): string | null {
  const header =
    response.headers.get("x-request-id") ??
    response.headers.get("x-openrouter-request-id") ??
    response.headers.get("openrouter-request-id");
  if (header?.trim()) return header.trim();

  if (body && typeof body === "object") {
    const id = (body as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

/**
 * Manual experiment runner only — call from gated test route.
 * Does not touch production Create. Does not auto-run on import.
 */
export async function generateFlashImagesApiPackagingExperiment(
  input: FlashImagesApiPackagingExperimentInput,
): Promise<FlashImagesApiPackagingExperimentResult> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    throw new Error(
      `${FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME}: OPENROUTER_API_KEY is not set`,
    );
  }

  const built = buildFlashImagesApiPackagingExperimentRequest(input);
  const payload = built.flashImagesExperiment.body;
  const timeoutMs =
    input.timeoutMs ??
    Number(process.env["OR_RENDER_TIMEOUT_MS"] ?? 180_000);

  logger.info(
    {
      experimental: true,
      experiment: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
      model: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
      api: "images",
      resolution: payload.resolution,
      aspectRatio: payload.aspect_ratio,
      promptLength: payload.prompt.length,
      referenceCount: payload.input_references.length,
      referenceOrder: FLASH_IMAGES_API_PACKAGING_REFERENCE_ORDER,
      productionCreateUntouched: true,
    },
    "flash-images-api-packaging-experiment: starting OpenRouter Images API request",
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  let response: Response;
  try {
    response = await fetch(
      `${OPENROUTER_RENDERING_CONFIG.baseUrl}${FLASH_IMAGES_API_PACKAGING_EXPERIMENT_ENDPOINT_PATH}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://studiolayer.ai",
          "X-Title": "StudioLayer AI Flash Images API Packaging Experiment",
        },
        body: JSON.stringify(payload),
      },
    );
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - t0;
  const bodyText = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    parsed = null;
  }

  const openRouterRequestId = extractOpenRouterRequestId(response, parsed);

  if (!response.ok) {
    const detail =
      parsed && typeof parsed === "object"
        ? JSON.stringify(parsed).slice(0, 1200)
        : bodyText.slice(0, 1200);
    const err = new Error(
      `${FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME} OpenRouter error: HTTP ${response.status} — ${detail}`,
    ) as Error & {
      httpStatus?: number;
      openRouterRequestId?: string | null;
      responseBody?: string;
    };
    err.httpStatus = response.status;
    err.openRouterRequestId = openRouterRequestId;
    err.responseBody = detail;
    throw err;
  }

  const urls = extractImageDataUris(parsed);
  if (urls.length === 0) {
    throw new Error(
      `${FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME}: response OK but no image data found`,
    );
  }

  const usage =
    parsed && typeof parsed === "object"
      ? (parsed as { usage?: unknown }).usage
      : undefined;

  const images: FlashImagesApiPackagingExperimentResult["images"] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    const dims = url.startsWith("data:") ? await measureDataUri(url) : undefined;
    images.push({
      url,
      index: i,
      width: dims?.width,
      height: dims?.height,
    });
  }

  const outputDimensions =
    images[0]?.width && images[0]?.height
      ? { width: images[0].width, height: images[0].height }
      : undefined;

  return {
    ok: true,
    experimental: true,
    experiment: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
    images,
    durationMs,
    provider: "openrouter-flash-images-api-packaging-experiment",
    model: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
    api: FLASH_IMAGES_API_PACKAGING_EXPERIMENT_API,
    promptUsed: payload.prompt,
    referenceOrder: FLASH_IMAGES_API_PACKAGING_REFERENCE_ORDER,
    aspectRatioRequested: "4:5",
    aspectRatioApplied: "4:5",
    resolutionRequested: payload.resolution,
    resolutionApplied: payload.resolution,
    outputDimensions,
    usage,
    costUsd: extractCostUsd(usage),
    openRouterRequestId,
    httpStatus: response.status,
    productionCreateUntouched: true,
  };
}

/** Redact long data URIs / secrets for dry-run JSON responses. */
export function redactExperimentRequestForInspection(
  built: FlashImagesApiPackagingExperimentBuildResult,
): unknown {
  const redactUrl = (url: string): string => {
    if (url.startsWith("data:")) {
      const comma = url.indexOf(",");
      const header = comma >= 0 ? url.slice(0, comma) : "data:";
      const payloadLen = comma >= 0 ? url.length - comma - 1 : 0;
      return `${header},<redacted ${payloadLen} chars>`;
    }
    if (url.length > 120) return `${url.slice(0, 80)}…<redacted>`;
    return url;
  };

  const redactChatContent = (
    content: FlashChatControlSerializedShape["body"]["messages"][0]["content"],
  ) =>
    content.map((part) => {
      if (part.type === "text") {
        return {
          type: "text",
          textLength: part.text.length,
          textPreview: part.text.slice(0, 160),
        };
      }
      return {
        type: "image_url",
        image_url: {
          url: redactUrl(part.image_url.url),
          detail: part.image_url.detail,
        },
      };
    });

  return {
    experiment: built.experiment,
    model: built.model,
    referenceOrder: built.referenceOrder,
    promptTransform: built.promptTransform,
    primaryInstructionLength: built.primaryInstruction.length,
    creativeShotPromptLength: built.creativeShotPrompt?.length ?? 0,
    flashChatControl: {
      api: built.flashChatControl.api,
      model: built.flashChatControl.model,
      body: {
        model: built.flashChatControl.body.model,
        modalities: built.flashChatControl.body.modalities,
        image_config: built.flashChatControl.body.image_config,
        messages: [
          {
            role: "user",
            content: redactChatContent(
              built.flashChatControl.body.messages[0].content,
            ),
          },
        ],
      },
    },
    flashImagesExperiment: {
      api: built.flashImagesExperiment.api,
      model: built.flashImagesExperiment.model,
      body: {
        model: built.flashImagesExperiment.body.model,
        n: built.flashImagesExperiment.body.n,
        aspect_ratio: built.flashImagesExperiment.body.aspect_ratio,
        resolution: built.flashImagesExperiment.body.resolution,
        promptLength: built.flashImagesExperiment.body.prompt.length,
        promptPreview: built.flashImagesExperiment.body.prompt.slice(0, 240),
        input_references: built.flashImagesExperiment.body.input_references.map(
          (ref, index) => ({
            index,
            role: FLASH_IMAGES_API_PACKAGING_REFERENCE_ORDER[index],
            type: ref.type,
            image_url: { url: redactUrl(ref.image_url.url) },
            hasDetail: "detail" in ref.image_url,
          }),
        ),
      },
    },
  };
}
