// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — Nano Banana Pro (google/gemini-3-pro-image) via OpenRouter
//
// Isolated from production Gemini / OpenRouterProvider chat-completions path.
// Easy to delete: this file + routes/test-nano-banana-pro.ts (+ mount in routes/index).
//
// OpenRouter schema (verified 2026-08-23 via GET
//   /api/v1/images/models/google/gemini-3-pro-image/endpoints):
//   POST https://openrouter.ai/api/v1/images
//   supported: resolution (1K|2K|4K — Vertex: 1K|2K only), aspect_ratio (incl. 4:5),
//              n (1), input_references (0–14)
// ---------------------------------------------------------------------------

import sharp from "sharp";
import { logger } from "../../../lib/logger.js";
import { OPENROUTER_RENDERING_CONFIG } from "../rendering.config.js";

export const EXPERIMENTAL_NANO_BANANA_PRO_MODEL =
  "google/gemini-3-pro-image" as const;

/** Controlled QA experiment prompt — does not use StudioLayer Gemini prompt stack. */
export const EXPERIMENTAL_NANO_BANANA_PRO_PROMPT = `Create a premium, photorealistic fashion photograph using the supplied reference images.

REFERENCE AUTHORITY:
- Reference 1: GARMENT — the primary authority for the garment. Preserve its exact design, construction, colour, material, surface texture, weave, seams, edges, proportions and distinctive details. Do not simplify or smooth the fabric.
- Reference 2: TALENT — the primary authority for the model's identity. Preserve her facial identity, facial proportions, eyes, nose, lips, jawline, skin tone, hair characteristics and natural appearance. Do not create a generic look-alike or beautify/change her facial structure.
- Reference 3: POSE 50 — the sole authority for pose, body position, gesture, limb placement, weight distribution and framing. Reproduce the pose faithfully.

IMPORTANT STUDIO LAYER RULES:
- The garment reference controls the hero garment; do not redesign or reinterpret it.
- Preserve fine fabric texture and realistic material behaviour. Avoid plastic, airbrushed or overly smooth surfaces.
- Preserve the talent's identity even when the face is clearly visible. Natural skin texture is preferred over artificial perfection.
- Do not copy the pose reference's model identity, face, wardrobe or styling.
- Independently create the lower-body wardrobe and footwear appropriate to the hero garment. Do not copy trousers, skirt, shorts or shoes from the pose reference.
- Furniture and props in the pose reference are spatial guidance only. They may be changed or replaced unless their specific reproduction is required.
- Maintain realistic human anatomy, natural skin, realistic fabric folds and professional fashion-photography quality.
- Do not make the image look excessively sharpened, waxy or synthetic.`;

/** Verified on OpenRouter Image API endpoints for this model. */
export const NANO_BANANA_PRO_SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

/** Verified resolution tiers (AI Studio includes 4K; Vertex lists 1K|2K). */
export const NANO_BANANA_PRO_SUPPORTED_RESOLUTIONS = [
  "1K",
  "2K",
  "4K",
] as const;

export type ExperimentalNanoBananaProResolution = "2K" | "4K";

export type ExperimentalNanoBananaProInput = {
  garmentImageUrl: string;
  talentImageUrl: string;
  poseImageUrl: string;
  /** Sent as OpenRouter `resolution` — never remapped to quality. */
  outputResolution?: ExperimentalNanoBananaProResolution;
  prompt?: string;
  timeoutMs?: number;
};

export type ExperimentalNanoBananaProResult = {
  ok: true;
  images: Array<{ url: string; index: number; width?: number; height?: number }>;
  durationMs: number;
  provider: "openrouter-experimental-nano-banana-pro";
  model: typeof EXPERIMENTAL_NANO_BANANA_PRO_MODEL;
  api: "POST /api/v1/images";
  promptUsed: string;
  referenceOrder: ["GARMENT", "TALENT", "POSE_MASTER"];
  aspectRatioRequested: "4:5";
  aspectRatioApplied: "4:5";
  resolutionRequested: ExperimentalNanoBananaProResolution;
  resolutionApplied: ExperimentalNanoBananaProResolution;
  outputDimensions?: { width: number; height: number };
  usage?: unknown;
  costUsd?: number | null;
  openRouterRequestId?: string | null;
  httpStatus: number;
};

function toInputReference(url: string): {
  type: "image_url";
  image_url: { url: string };
} {
  return {
    type: "image_url",
    image_url: { url },
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
    // non-fatal — dimensions are diagnostic only
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
 * Call OpenRouter Image API for experimental Nano Banana Pro generation.
 * Does not touch production OpenRouterProvider / Gemini path.
 * Does not retry.
 */
export async function generateExperimentalNanoBananaPro(
  input: ExperimentalNanoBananaProInput,
): Promise<ExperimentalNanoBananaProResult> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "EXPERIMENTAL Nano Banana Pro: OPENROUTER_API_KEY is not set",
    );
  }

  const resolution: ExperimentalNanoBananaProResolution =
    input.outputResolution === "4K" ? "4K" : "2K";
  const aspectRatio = "4:5" as const;
  const prompt = (input.prompt ?? EXPERIMENTAL_NANO_BANANA_PRO_PROMPT).trim();
  const timeoutMs =
    input.timeoutMs ??
    Number(process.env["OR_RENDER_TIMEOUT_MS"] ?? 180_000);

  const payload = {
    model: EXPERIMENTAL_NANO_BANANA_PRO_MODEL,
    prompt,
    n: 1,
    aspect_ratio: aspectRatio,
    resolution,
    input_references: [
      toInputReference(input.garmentImageUrl),
      toInputReference(input.talentImageUrl),
      toInputReference(input.poseImageUrl),
    ],
  };

  logger.info(
    {
      experimental: true,
      model: EXPERIMENTAL_NANO_BANANA_PRO_MODEL,
      api: "images",
      resolution,
      aspectRatio,
      promptLength: prompt.length,
      referenceCount: 3,
      referenceOrder: ["GARMENT", "TALENT", "POSE_MASTER"],
    },
    "experimental-nano-banana-pro: starting OpenRouter Image API request",
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_RENDERING_CONFIG.baseUrl}/images`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://studiolayer.ai",
        "X-Title": "StudioLayer AI Experimental Nano Banana Pro",
      },
      body: JSON.stringify(payload),
    });
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
      `EXPERIMENTAL Nano Banana Pro OpenRouter error: HTTP ${response.status} — ${detail}`,
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
      "EXPERIMENTAL Nano Banana Pro: response OK but no image data found",
    );
  }

  const usage =
    parsed && typeof parsed === "object"
      ? (parsed as { usage?: unknown }).usage
      : undefined;

  const images: ExperimentalNanoBananaProResult["images"] = [];
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
    images,
    durationMs,
    provider: "openrouter-experimental-nano-banana-pro",
    model: EXPERIMENTAL_NANO_BANANA_PRO_MODEL,
    api: "POST /api/v1/images",
    promptUsed: prompt,
    referenceOrder: ["GARMENT", "TALENT", "POSE_MASTER"],
    aspectRatioRequested: aspectRatio,
    aspectRatioApplied: aspectRatio,
    resolutionRequested: resolution,
    resolutionApplied: resolution,
    outputDimensions,
    usage,
    costUsd: extractCostUsd(usage),
    openRouterRequestId,
    httpStatus: response.status,
  };
}
