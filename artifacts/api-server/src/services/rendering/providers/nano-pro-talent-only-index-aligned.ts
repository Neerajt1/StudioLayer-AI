// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — nano-pro-talent-only-index-aligned
//
// Corrected Talent-only Nano Pro identity experiment.
// Prior experiment (nano-pro-talent-only-identity-experiment) was INVALID:
//   input_references[0] = TALENT but production role map said Ref1=GARMENT, Ref2=TALENT.
//
// This experiment:
//   input_references: [TALENT]  (index 0 = Reference Image 1)
//   prompt role map: Reference Image 1 = STUDIO TALENT
//
// Does NOT call assembleNanoProImagesApiPrompt / buildNanoProReferenceRoleMapping.
// Does NOT modify production Create / Nano Pro / Flash / Pose Master.
// Easy to delete: this file + routes/test-nano-pro-talent-only-index-aligned.ts
//   (+ mount in routes/index) + *.test.ts + .env.example flag line.
// ---------------------------------------------------------------------------

import sharp from "sharp";
import { logger } from "../../../lib/logger.js";
import {
  OPENROUTER_RENDERING_CONFIG,
  resolveNanoProImageResolution,
} from "../rendering.config.js";
import { buildTalentIdentityAuthorityLayer } from "../nano-pro-authority-layers.js";

export const NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME =
  "nano-pro-talent-only-index-aligned" as const;

export const NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL =
  "google/gemini-3-pro-image" as const;

export const NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_API =
  "POST /api/v1/images" as const;

export const NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_ENDPOINT_PATH =
  "/images" as const;

export const NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_REFERENCE_ORDER = [
  "TALENT",
] as const;

/**
 * Experiment-local role map — NOT production buildNanoProReferenceRoleMapping.
 * Structurally valid for exactly one Talent reference at index 0 / Ref 1.
 */
export function buildTalentOnlyIndexAlignedRoleMapping(): string {
  return `REFERENCE IMAGE ROLES:
Reference Image 1 = STUDIO TALENT / SUBJECT IDENTITY.

The Studio Talent in Reference Image 1 is the person whose identity must be preserved.`;
}

/**
 * Identity-focused generation brief for Talent-only Images API.
 * Semantically mirrors production Talent identity authority; does not claim
 * garment or Pose Master images are attached. Does not invent those refs.
 */
export function assembleTalentOnlyIndexAlignedPrompt(): string {
  const roleMap = buildTalentOnlyIndexAlignedRoleMapping();
  // Reuse production identity wording only (feature list / sole-authority rule).
  // Does not claim a Pose Master image is attached.
  const identityAuthority = buildTalentIdentityAuthorityLayer(1);
  const generationIntent = `GENERATION INTENT:
Create a single premium, photorealistic fashion photograph of the Studio Talent shown in Reference Image 1.
Preserve the Talent's facial identity, facial structure, eyes, nose, lips, jawline, hair, skin tone, and recognizable physical appearance from Reference Image 1 only.
Do not create a generic look-alike. Do not beautify or reshape the face. Prefer natural skin texture over artificial perfection.
No garment reference image is attached. Independently style appropriate editorial clothing; garment fidelity is out of scope for this experiment.
No Pose Master image is attached. Use natural editorial posing; pose fidelity is out of scope for this experiment.`;

  return [roleMap, identityAuthority, generationIntent].join("\n\n");
}

export type NanoProTalentOnlyIndexAlignedInput = {
  talentImageUrl: string;
  outputResolution?: "2K" | "4K";
  timeoutMs?: number;
};

export type NanoProTalentOnlyIndexAlignedBody = {
  model: typeof NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL;
  prompt: string;
  n: 1;
  aspect_ratio: "4:5";
  resolution: "2K" | "4K";
  input_references: Array<{
    type: "image_url";
    image_url: { url: string };
  }>;
};

export type NanoProTalentOnlyIndexAlignedBuildResult = {
  experiment: typeof NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME;
  model: typeof NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL;
  referenceOrder: typeof NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_REFERENCE_ORDER;
  promptReferenceAlignment: {
    promptRef1: "STUDIO TALENT";
    actualRef1Index0: "TALENT";
    aligned: true;
  };
  body: NanoProTalentOnlyIndexAlignedBody;
};

export type NanoProTalentOnlyIndexAlignedResult = {
  ok: true;
  experimental: true;
  experiment: typeof NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME;
  images: Array<{ url: string; index: number; width?: number; height?: number }>;
  durationMs: number;
  provider: "openrouter-nano-pro-talent-only-index-aligned";
  model: typeof NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL;
  api: typeof NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_API;
  promptUsed: string;
  referenceOrder: typeof NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_REFERENCE_ORDER;
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

/** Build Images API body — does not call OpenRouter. */
export function buildNanoProTalentOnlyIndexAlignedRequest(
  input: NanoProTalentOnlyIndexAlignedInput,
): NanoProTalentOnlyIndexAlignedBuildResult {
  const outputResolution: "2K" | "4K" =
    input.outputResolution === "4K" ? "4K" : "2K";
  const resolution = resolveNanoProImageResolution(outputResolution);
  const talentUrl = input.talentImageUrl;
  if (!talentUrl?.trim()) {
    throw new Error(
      `${NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME}: talentImageUrl is required`,
    );
  }

  const prompt = assembleTalentOnlyIndexAlignedPrompt();
  const input_references: NanoProTalentOnlyIndexAlignedBody["input_references"] =
    [
      {
        type: "image_url",
        image_url: { url: talentUrl },
      },
    ];

  return {
    experiment: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME,
    model: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL,
    referenceOrder: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_REFERENCE_ORDER,
    promptReferenceAlignment: {
      promptRef1: "STUDIO TALENT",
      actualRef1Index0: "TALENT",
      aligned: true,
    },
    body: {
      model: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL,
      prompt,
      n: 1,
      aspect_ratio: OPENROUTER_RENDERING_CONFIG.outputAspectRatio,
      resolution,
      input_references,
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
 * Manual live runner only — call from gated test route.
 * Does not touch production Create. Does not auto-run on import.
 */
export async function generateNanoProTalentOnlyIndexAligned(
  input: NanoProTalentOnlyIndexAlignedInput,
): Promise<NanoProTalentOnlyIndexAlignedResult> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    throw new Error(
      `${NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME}: OPENROUTER_API_KEY is not set`,
    );
  }

  const built = buildNanoProTalentOnlyIndexAlignedRequest(input);
  const payload = built.body;
  const timeoutMs =
    input.timeoutMs ??
    Number(process.env["OR_RENDER_TIMEOUT_MS"] ?? 180_000);

  logger.info(
    {
      experimental: true,
      experiment: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME,
      model: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL,
      api: "images",
      resolution: payload.resolution,
      aspectRatio: payload.aspect_ratio,
      promptLength: payload.prompt.length,
      referenceCount: payload.input_references.length,
      referenceOrder: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_REFERENCE_ORDER,
      promptReferenceAlignment: built.promptReferenceAlignment,
      productionCreateUntouched: true,
      creditsDeducted: 0,
    },
    "nano-pro-talent-only-index-aligned: starting OpenRouter Images API request",
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  let response: Response;
  try {
    response = await fetch(
      `${OPENROUTER_RENDERING_CONFIG.baseUrl}${NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_ENDPOINT_PATH}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://studiolayer.ai",
          "X-Title":
            "StudioLayer AI Nano Pro Talent-Only Index-Aligned Experiment",
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
      `${NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME} OpenRouter error: HTTP ${response.status} — ${detail}`,
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
      `${NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME}: response OK but no image data found`,
    );
  }

  const usage =
    parsed && typeof parsed === "object"
      ? (parsed as { usage?: unknown }).usage
      : undefined;

  const images: NanoProTalentOnlyIndexAlignedResult["images"] = [];
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
    experiment: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME,
    images,
    durationMs,
    provider: "openrouter-nano-pro-talent-only-index-aligned",
    model: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL,
    api: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_API,
    promptUsed: payload.prompt,
    referenceOrder: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_REFERENCE_ORDER,
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

export function redactTalentOnlyIndexAlignedRequestForInspection(
  built: NanoProTalentOnlyIndexAlignedBuildResult,
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

  const roleMapMatch = built.body.prompt.match(
    /REFERENCE IMAGE ROLES:[\s\S]*?(?=\n\n|$)/,
  );

  return {
    experiment: built.experiment,
    model: built.model,
    referenceOrder: built.referenceOrder,
    promptReferenceAlignment: built.promptReferenceAlignment,
    body: {
      model: built.body.model,
      n: built.body.n,
      aspect_ratio: built.body.aspect_ratio,
      resolution: built.body.resolution,
      promptLength: built.body.prompt.length,
      roleMappingPreview: roleMapMatch?.[0] ?? null,
      promptPreview: built.body.prompt.slice(0, 400),
      input_references: built.body.input_references.map((ref, index) => ({
        index,
        role: NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_REFERENCE_ORDER[index],
        type: ref.type,
        image_url: { url: redactUrl(ref.image_url.url) },
        hasDetail: "detail" in ref.image_url,
      })),
    },
  };
}
