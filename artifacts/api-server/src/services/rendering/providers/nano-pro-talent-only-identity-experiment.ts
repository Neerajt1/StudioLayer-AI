// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — nano-pro-talent-only-identity-experiment
//
// Isolates: do garment / Pose Master visual refs compete with Talent for
// Nano Pro identity conditioning?
//
// CONTROL (production Nano Pro shape):
//   input_references: GARMENT → TALENT → POSE_MASTER
// EXPERIMENT (this module):
//   input_references: TALENT only
//
// SAME: model, Talent bytes, prompt semantics (production assembler),
//       resolution, aspect_ratio, n=1
// ONLY variable: number of visual references
//
// Does NOT modify production Create / Nano Pro serializer / Flash / Pose Master.
// Easy to delete: this file + routes/test-nano-pro-talent-only-identity.ts
//   (+ mount in routes/index) + *.test.ts + .env.example flag line.
// ---------------------------------------------------------------------------

import sharp from "sharp";
import { logger } from "../../../lib/logger.js";
import {
  OPENROUTER_RENDERING_CONFIG,
  resolveNanoProImageResolution,
} from "../rendering.config.js";
import {
  assembleNanoProImagesApiPrompt,
  mapImagePartsToNanoProInputReferences,
} from "../nano-pro-authority-layers.js";
import {
  assembleFreshGenerationPrimaryInstruction,
  buildFreshGenerationImageParts,
} from "./OpenRouterProvider.js";

export const NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME =
  "nano-pro-talent-only-identity-experiment" as const;

export const NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL =
  "google/gemini-3-pro-image" as const;

export const NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_API =
  "POST /api/v1/images" as const;

export const NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_ENDPOINT_PATH =
  "/images" as const;

export const NANO_PRO_PRODUCTION_REFERENCE_ORDER = [
  "GARMENT",
  "TALENT",
  "POSE_MASTER",
] as const;

export const NANO_PRO_TALENT_ONLY_REFERENCE_ORDER = ["TALENT"] as const;

export type NanoProTalentOnlyIdentityExperimentInput = {
  garmentImageUrl: string;
  talentImageUrl: string;
  poseImageUrl: string;
  /** Same trailing creative shot text production Nano Pro would receive. */
  creativeShotPrompt?: string;
  /** Defaults to production fresh-generation primary instruction. */
  primaryInstruction?: string;
  locationEnvironment?: string | null;
  outputResolution?: "2K" | "4K";
  timeoutMs?: number;
};

export type NanoProImagesApiBody = {
  model: typeof NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL;
  prompt: string;
  n: 1;
  aspect_ratio: "4:5";
  resolution: "2K" | "4K";
  input_references: Array<{
    type: "image_url";
    image_url: { url: string };
  }>;
};

export type NanoProTalentOnlyIdentityBuildResult = {
  experiment: typeof NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME;
  model: typeof NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL;
  hypothesis:
    "garment and/or Pose Master visual refs may compete with Talent for Nano Pro identity";
  onlyVariable: "input_references count / membership";
  promptSemantics: "identical — assembleNanoProImagesApiPrompt (production)";
  productionControl: {
    referenceOrder: typeof NANO_PRO_PRODUCTION_REFERENCE_ORDER;
    body: NanoProImagesApiBody;
  };
  talentOnlyExperiment: {
    referenceOrder: typeof NANO_PRO_TALENT_ONLY_REFERENCE_ORDER;
    body: NanoProImagesApiBody;
  };
};

export type NanoProTalentOnlyIdentityExperimentResult = {
  ok: true;
  experimental: true;
  experiment: typeof NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME;
  images: Array<{ url: string; index: number; width?: number; height?: number }>;
  durationMs: number;
  provider: "openrouter-nano-pro-talent-only-identity-experiment";
  model: typeof NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL;
  api: typeof NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_API;
  promptUsed: string;
  referenceOrder: typeof NANO_PRO_TALENT_ONLY_REFERENCE_ORDER;
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
  creditsDeducted: 0;
};

/**
 * Build CONTROL (3-ref production shape) and EXPERIMENT (Talent-only) bodies.
 * Prompt string is identical — only `input_references` differ.
 * Does not call OpenRouter.
 */
export function buildNanoProTalentOnlyIdentityExperimentRequest(
  input: NanoProTalentOnlyIdentityExperimentInput,
): NanoProTalentOnlyIdentityBuildResult {
  const outputResolution: "2K" | "4K" =
    input.outputResolution === "4K" ? "4K" : "2K";
  const resolution = resolveNanoProImageResolution(outputResolution);
  const primaryInstruction = (
    input.primaryInstruction ?? assembleFreshGenerationPrimaryInstruction()
  ).trim();
  const creativeShotPrompt = input.creativeShotPrompt?.trim()
    ? input.creativeShotPrompt.trim()
    : undefined;

  // Production Nano Pro fresh path: G → T → P, then map (strips detail).
  const productionParts = buildFreshGenerationImageParts({
    garmentImageUrl: input.garmentImageUrl,
    modelImageUrl: input.talentImageUrl,
    poseReferenceImageUrl: input.poseImageUrl,
  });

  if (productionParts.length !== 3) {
    throw new Error(
      `${NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME}: expected 3 production parts (G→T→P), got ${productionParts.length}`,
    );
  }

  // Same assembler + params as production with pose attached (Talent = Ref 2).
  const prompt = assembleNanoProImagesApiPrompt({
    hasPoseReference: true,
    talentIdentityImageCount: 1,
    locationEnvironment: input.locationEnvironment ?? null,
    primaryInstruction,
    creativeShotPrompt,
    talentReferenceImageNumber: 2,
  });

  const productionRefs = mapImagePartsToNanoProInputReferences(productionParts);
  const talentOnlyRefs = mapImagePartsToNanoProInputReferences([
    {
      type: "image_url",
      image_url: {
        url: input.talentImageUrl,
        detail: "high",
      },
    },
  ]);

  if (talentOnlyRefs.length !== 1) {
    throw new Error(
      `${NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME}: expected exactly 1 Talent reference`,
    );
  }

  if (talentOnlyRefs[0]!.image_url.url !== input.talentImageUrl) {
    throw new Error(
      `${NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME}: Talent URL mismatch`,
    );
  }

  if (talentOnlyRefs[0]!.image_url.url !== productionRefs[1]!.image_url.url) {
    throw new Error(
      `${NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME}: Talent must match production Ref 2 (Studio Talent)`,
    );
  }

  const shared = {
    model: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL,
    prompt,
    n: 1 as const,
    aspect_ratio: OPENROUTER_RENDERING_CONFIG.outputAspectRatio,
    resolution,
  };

  return {
    experiment: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
    model: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL,
    hypothesis:
      "garment and/or Pose Master visual refs may compete with Talent for Nano Pro identity",
    onlyVariable: "input_references count / membership",
    promptSemantics: "identical — assembleNanoProImagesApiPrompt (production)",
    productionControl: {
      referenceOrder: NANO_PRO_PRODUCTION_REFERENCE_ORDER,
      body: {
        ...shared,
        input_references: productionRefs,
      },
    },
    talentOnlyExperiment: {
      referenceOrder: NANO_PRO_TALENT_ONLY_REFERENCE_ORDER,
      body: {
        ...shared,
        input_references: talentOnlyRefs,
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
 * Manual experiment runner only — Talent-only Images API call.
 * Does not touch production Create. Does not auto-run on import.
 */
export async function generateNanoProTalentOnlyIdentityExperiment(
  input: NanoProTalentOnlyIdentityExperimentInput,
): Promise<NanoProTalentOnlyIdentityExperimentResult> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    throw new Error(
      `${NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME}: OPENROUTER_API_KEY is not set`,
    );
  }

  const built = buildNanoProTalentOnlyIdentityExperimentRequest(input);
  const payload = built.talentOnlyExperiment.body;
  const timeoutMs =
    input.timeoutMs ??
    Number(process.env["OR_RENDER_TIMEOUT_MS"] ?? 180_000);

  logger.info(
    {
      experimental: true,
      experiment: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
      model: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL,
      api: "images",
      resolution: payload.resolution,
      aspectRatio: payload.aspect_ratio,
      promptLength: payload.prompt.length,
      referenceCount: payload.input_references.length,
      referenceOrder: NANO_PRO_TALENT_ONLY_REFERENCE_ORDER,
      productionCreateUntouched: true,
      creditsDeducted: 0,
    },
    "nano-pro-talent-only-identity-experiment: starting OpenRouter Images API request",
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  let response: Response;
  try {
    response = await fetch(
      `${OPENROUTER_RENDERING_CONFIG.baseUrl}${NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_ENDPOINT_PATH}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://studiolayer.ai",
          "X-Title":
            "StudioLayer AI Nano Pro Talent-Only Identity Experiment",
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
      `${NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME} OpenRouter error: HTTP ${response.status} — ${detail}`,
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
      `${NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME}: response OK but no image data found`,
    );
  }

  const usage =
    parsed && typeof parsed === "object"
      ? (parsed as { usage?: unknown }).usage
      : undefined;

  const images: NanoProTalentOnlyIdentityExperimentResult["images"] = [];
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
    experiment: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
    images,
    durationMs,
    provider: "openrouter-nano-pro-talent-only-identity-experiment",
    model: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL,
    api: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_API,
    promptUsed: payload.prompt,
    referenceOrder: NANO_PRO_TALENT_ONLY_REFERENCE_ORDER,
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
    creditsDeducted: 0,
  };
}

/** Redact long data URIs for dry-run inspection (no secrets). */
export function redactNanoProTalentOnlyRequestForInspection(
  built: NanoProTalentOnlyIdentityBuildResult,
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

  const redactBody = (
    body: NanoProImagesApiBody,
    roles: readonly string[],
  ) => ({
    model: body.model,
    n: body.n,
    aspect_ratio: body.aspect_ratio,
    resolution: body.resolution,
    promptLength: body.prompt.length,
    promptPreview: body.prompt.slice(0, 240),
    promptEqualsControl:
      body.prompt === built.productionControl.body.prompt,
    input_references: body.input_references.map((ref, index) => ({
      index,
      role: roles[index] ?? "(unknown)",
      type: ref.type,
      image_url: { url: redactUrl(ref.image_url.url) },
      hasDetail: "detail" in ref.image_url,
    })),
  });

  return {
    experiment: built.experiment,
    model: built.model,
    hypothesis: built.hypothesis,
    onlyVariable: built.onlyVariable,
    promptSemantics: built.promptSemantics,
    promptsIdentical:
      built.productionControl.body.prompt ===
      built.talentOnlyExperiment.body.prompt,
    productionControl: {
      api: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_API,
      referenceOrder: built.productionControl.referenceOrder,
      body: redactBody(
        built.productionControl.body,
        built.productionControl.referenceOrder,
      ),
    },
    talentOnlyExperiment: {
      api: NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_API,
      referenceOrder: built.talentOnlyExperiment.referenceOrder,
      body: redactBody(
        built.talentOnlyExperiment.body,
        built.talentOnlyExperiment.referenceOrder,
      ),
    },
  };
}
