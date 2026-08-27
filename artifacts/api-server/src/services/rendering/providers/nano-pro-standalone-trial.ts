// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — Nano Pro Standalone Trial
//
// Isolated Nano Pro–only generation for identity-fidelity QA against
// face-neutral Pose Masters. Easy to delete after the experiment:
//   this file
//   + trial-nano-pro-storage.ts
//   + routes/test-nano-pro-standalone-trial.ts
//   + mount in routes/index.ts
//   + *.test.ts
//   + optional frontend experimental page
//
// Does NOT:
//   - touch POST /renders / V1 Create / OpenRouterProvider.generate
//   - flip V1_CREATE_USE_NANO_PRO_CASCADE
//   - change OR_RENDER_ENGINE defaults
//   - deduct Studio Credits
//   - write renders/{id}/… or Gallery / Creative Ledger rows
// ---------------------------------------------------------------------------

import { createHash, randomUUID } from "node:crypto";
import { logger } from "../../../lib/logger.js";
import {
  OPENROUTER_RENDERING_CONFIG,
  resolveNanoProImageResolution,
  type NativeOutputResolution,
} from "../rendering.config.js";
import {
  assembleNanoProImagesApiPrompt,
  mapImagePartsToNanoProInputReferences,
} from "../nano-pro-authority-layers.js";
import {
  NativeResolutionValidationError,
  parseImageDimensionsFromBuffer,
  validateNativeResolutionFromDataUri,
} from "../native-resolution.js";
import {
  assembleFreshGenerationPrimaryInstruction,
  buildFreshGenerationImageParts,
} from "./OpenRouterProvider.js";

export const NANO_PRO_STANDALONE_TRIAL_NAME =
  "nano-pro-standalone-trial" as const;

export const NANO_PRO_STANDALONE_TRIAL_ENV =
  "EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_ENABLED" as const;

/** Trial packaging A/B — local QA only. Does not affect production Create. */
export const NANO_PRO_STANDALONE_TRIAL_PACKAGING_ENV =
  "EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_PACKAGING" as const;

export const NANO_PRO_STANDALONE_TRIAL_API =
  "POST /api/v1/images" as const;

export const NANO_PRO_STANDALONE_TRIAL_ENDPOINT_PATH = "/images" as const;

export const NANO_PRO_STANDALONE_TRIAL_REFERENCE_ORDER = [
  "GARMENT",
  "TALENT",
  "POSE_MASTER",
] as const;

/**
 * Packaging variants (trial-only):
 * - legacy: production Pro assembler as-is (Ref1/Ref2 labeled; Ref3 unlabeled)
 * - v2 (default): explicit Ref1/2/3 roles + identity hierarchy + pin Google AI Studio
 */
export type NanoProStandaloneTrialPackaging = "legacy" | "v2";

export function resolveNanoProStandaloneTrialPackaging(
  env: NodeJS.ProcessEnv = process.env,
): NanoProStandaloneTrialPackaging {
  const raw = (env[NANO_PRO_STANDALONE_TRIAL_PACKAGING_ENV] ?? "v2")
    .trim()
    .toLowerCase();
  return raw === "legacy" ? "legacy" : "v2";
}

/** Explicit Ref3 + hierarchy — trial-only; does not mutate production layers. */
export const TRIAL_V2_REFERENCE_ROLE_MAPPING = `REFERENCE IMAGE ROLES — BINDING AUTHORITY:
Reference Image 1 = GARMENT — garment construction, colour, texture, and product identity ONLY. Not a person.
Reference Image 2 = STUDIO TALENT — sole facial and subject identity authority. This is the person who must appear.
Reference Image 3 = POSE MASTER — body pose, limb placement, gesture, and pose-related framing ONLY. Faceless geometry. Not identity.

AUTHORITY HIERARCHY (do not invert):
1) Identity / face / hair / skin tone → Reference Image 2 only.
2) Garment / product → Reference Image 1 only.
3) Pose / body position / framing → Reference Image 3 only.
Do not invent or substitute a different person.
Do not derive face, facial structure, hair, or identity from Reference Image 3.
Do not treat Reference Image 1 as a person.`;

export function sha256Short(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function describeImageRefForForensics(url: string): {
  kind: "data_uri" | "http_url" | "other";
  mime: string | null;
  byteLengthApprox: number;
  sha256_16: string;
} {
  const sha256_16 = sha256Short(url);
  if (url.startsWith("data:")) {
    const mime = url.match(/^data:([^;,]+)/)?.[1] ?? null;
    const comma = url.indexOf(",");
    const b64 = comma >= 0 ? url.slice(comma + 1) : "";
    return {
      kind: "data_uri",
      mime,
      byteLengthApprox: Math.floor((b64.length * 3) / 4),
      sha256_16,
    };
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return {
      kind: "http_url",
      mime: null,
      byteLengthApprox: url.length,
      sha256_16,
    };
  }
  return {
    kind: "other",
    mime: null,
    byteLengthApprox: url.length,
    sha256_16,
  };
}

/** Gate default OFF — absent / false / anything else → disabled. */
export function isNanoProStandaloneTrialEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env[NANO_PRO_STANDALONE_TRIAL_ENV] ?? "";
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

export function resolveNanoProStandaloneTrialModel(): string {
  return OPENROUTER_RENDERING_CONFIG.nanoBananaProModel;
}

export type NanoProStandaloneTrialResolution = NativeOutputResolution;

export type NanoProStandaloneTrialInput = {
  garmentImageUrl: string;
  talentImageUrl: string;
  /** Face-neutral Pose Master data URI (caller must use Stage-1 loader). */
  poseImageUrl: string;
  poseId: string;
  modelIdentityId?: string | null;
  garmentId?: string | null;
  creativeShotPrompt?: string;
  primaryInstruction?: string;
  outputResolution?: NanoProStandaloneTrialResolution;
  timeoutMs?: number;
  /** Override packaging; defaults to env / v2. */
  packaging?: NanoProStandaloneTrialPackaging;
};

export type NanoProStandaloneTrialForensics = {
  packaging: NanoProStandaloneTrialPackaging;
  promptSha256_16: string;
  promptLength: number;
  requestContentSha256_16: string;
  referenceOrder: typeof NANO_PRO_STANDALONE_TRIAL_REFERENCE_ORDER;
  garment: ReturnType<typeof describeImageRefForForensics>;
  talent: ReturnType<typeof describeImageRefForForensics>;
  pose: ReturnType<typeof describeImageRefForForensics>;
  labeledRef3PoseMaster: boolean;
  providerPinned: boolean;
  providerPreference: Record<string, unknown> | null;
};

export type NanoProStandaloneTrialImagesApiBody = {
  model: string;
  prompt: string;
  n: 1;
  aspect_ratio: "4:5";
  resolution: "2K" | "4K";
  input_references: Array<{
    type: "image_url";
    image_url: { url: string };
  }>;
  provider?: {
    order: string[];
    allow_fallbacks: boolean;
  };
};

export type NanoProStandaloneTrialBuiltRequest = {
  trialRunId: string;
  experimental: true;
  experiment: typeof NANO_PRO_STANDALONE_TRIAL_NAME;
  engine: "nano_pro";
  cascade: false;
  nanoRegularInvoked: false;
  model: string;
  api: typeof NANO_PRO_STANDALONE_TRIAL_API;
  referenceOrder: typeof NANO_PRO_STANDALONE_TRIAL_REFERENCE_ORDER;
  poseId: string;
  modelIdentityId: string | null;
  garmentId: string | null;
  resolutionRequested: "2K" | "4K";
  resolutionApplied: "2K" | "4K";
  aspectRatio: "4:5";
  packaging: NanoProStandaloneTrialPackaging;
  forensics: NanoProStandaloneTrialForensics;
  body: NanoProStandaloneTrialImagesApiBody;
  promptUsed: string;
  credits: "none";
  gallery: false;
  createsRenderRow: false;
};

export type NanoProStandaloneTrialResult = {
  ok: boolean;
  experimental: true;
  experiment: typeof NANO_PRO_STANDALONE_TRIAL_NAME;
  trialRunId: string;
  timestamp: string;
  engine: "nano_pro";
  cascade: false;
  nanoRegularInvoked: false;
  model: string;
  api: typeof NANO_PRO_STANDALONE_TRIAL_API;
  referenceOrder: typeof NANO_PRO_STANDALONE_TRIAL_REFERENCE_ORDER;
  poseId: string;
  modelIdentityId: string | null;
  garmentId: string | null;
  resolutionRequested: "2K" | "4K";
  resolutionApplied: "2K" | "4K";
  resolutionValid: boolean;
  resolutionMismatch: boolean;
  resolutionValidationError: string | null;
  outputDimensions: { width: number; height: number } | null;
  durationMs: number;
  openRouterRequestId: string | null;
  openRouterProvider: string | null;
  packaging: NanoProStandaloneTrialPackaging;
  forensics: NanoProStandaloneTrialForensics;
  httpStatus: number;
  promptUsed: string;
  imageDataUri: string | null;
  images: Array<{
    url: string;
    index: number;
    width?: number;
    height?: number;
  }>;
  creditsDeducted: 0;
  gallery: false;
  createsRenderRow: false;
  storagePrefix: "trial/nano-pro/";
};

function newTrialRunId(): string {
  return randomUUID();
}

/** Apply trial-only Ref role mapping without mutating production assemblers. */
export function applyTrialV2ReferenceRoleMapping(prompt: string): string {
  const replaced = prompt.replace(
    /REFERENCE IMAGE ROLES:[\s\S]*?(?=\n\nTALENT IDENTITY AUTHORITY:)/,
    TRIAL_V2_REFERENCE_ROLE_MAPPING,
  );
  if (replaced !== prompt) return replaced;
  return `${TRIAL_V2_REFERENCE_ROLE_MAPPING}\n\n${prompt}`;
}

/**
 * Build the OpenRouter Images API payload for the standalone trial.
 * Always GARMENT → TALENT → POSE_MASTER. Never cascade / Flash.
 */
export function buildNanoProStandaloneTrialRequest(
  input: NanoProStandaloneTrialInput,
  trialRunId: string = newTrialRunId(),
): NanoProStandaloneTrialBuiltRequest {
  const packaging =
    input.packaging ?? resolveNanoProStandaloneTrialPackaging();
  const resolutionRequested: "2K" | "4K" =
    input.outputResolution === "4K" ? "4K" : "2K";
  const resolutionApplied = resolveNanoProImageResolution(resolutionRequested);
  const model = resolveNanoProStandaloneTrialModel();

  const imageParts = buildFreshGenerationImageParts({
    garmentImageUrl: input.garmentImageUrl,
    modelImageUrl: input.talentImageUrl,
    poseReferenceImageUrl: input.poseImageUrl,
  });

  if (imageParts.length < 3) {
    throw new Error(
      `${NANO_PRO_STANDALONE_TRIAL_NAME}: expected GARMENT→TALENT→POSE_MASTER image parts`,
    );
  }

  const primaryInstruction =
    input.primaryInstruction?.trim() ||
    assembleFreshGenerationPrimaryInstruction();

  const creativeShotPrompt =
    input.creativeShotPrompt?.trim() ||
    [
      "Create a premium photorealistic fashion photograph.",
      "PRIMARY: preserve Studio Talent facial identity exactly (Reference Image 2).",
      "SECONDARY: follow the face-neutral Pose Master for body pose, limb placement, and framing (Reference Image 3).",
      "SECONDARY: preserve garment fidelity from the garment reference (Reference Image 1).",
      "Do not derive identity from the Pose Master.",
    ].join(" ");

  let prompt = assembleNanoProImagesApiPrompt({
    talentIdentityImageCount: 1,
    hasPoseReference: true,
    primaryInstruction,
    creativeShotPrompt,
    talentReferenceImageNumber: 2,
    furnitureRequired: false,
  });

  if (packaging === "v2") {
    prompt = applyTrialV2ReferenceRoleMapping(prompt);
  }

  const input_references = mapImagePartsToNanoProInputReferences(imageParts);

  const body: NanoProStandaloneTrialImagesApiBody = {
    model,
    prompt,
    n: 1,
    aspect_ratio: "4:5",
    resolution: resolutionApplied,
    input_references,
  };

  // Pin AI Studio for 2K/4K parity + reduce Vertex/Studio load-balance drift.
  // Supported OpenRouter Images routing field; trial-only.
  if (packaging === "v2") {
    body.provider = {
      order: ["google-ai-studio"],
      allow_fallbacks: false,
    };
  }

  const garment = describeImageRefForForensics(input_references[0]!.image_url.url);
  const talent = describeImageRefForForensics(input_references[1]!.image_url.url);
  const pose = describeImageRefForForensics(input_references[2]!.image_url.url);
  const promptSha256_16 = sha256Short(prompt);
  const requestContentSha256_16 = sha256Short(
    JSON.stringify({
      model,
      resolution: resolutionApplied,
      aspect_ratio: "4:5",
      n: 1,
      prompt,
      refs: [
        input_references[0]!.image_url.url,
        input_references[1]!.image_url.url,
        input_references[2]!.image_url.url,
      ],
      provider: body.provider ?? null,
    }),
  );

  const forensics: NanoProStandaloneTrialForensics = {
    packaging,
    promptSha256_16,
    promptLength: prompt.length,
    requestContentSha256_16,
    referenceOrder: NANO_PRO_STANDALONE_TRIAL_REFERENCE_ORDER,
    garment,
    talent,
    pose,
    labeledRef3PoseMaster:
      packaging === "v2" && /Reference Image 3 = POSE MASTER/i.test(prompt),
    providerPinned: packaging === "v2",
    providerPreference: body.provider ?? null,
  };

  return {
    trialRunId,
    experimental: true,
    experiment: NANO_PRO_STANDALONE_TRIAL_NAME,
    engine: "nano_pro",
    cascade: false,
    nanoRegularInvoked: false,
    model,
    api: NANO_PRO_STANDALONE_TRIAL_API,
    referenceOrder: NANO_PRO_STANDALONE_TRIAL_REFERENCE_ORDER,
    poseId: input.poseId,
    modelIdentityId: input.modelIdentityId ?? null,
    garmentId: input.garmentId ?? null,
    resolutionRequested,
    resolutionApplied,
    aspectRatio: "4:5",
    packaging,
    forensics,
    body,
    promptUsed: prompt,
    credits: "none",
    gallery: false,
    createsRenderRow: false,
  };
}

/** Redact image bytes for dry-run inspection responses. */
export function redactNanoProStandaloneTrialRequestForInspection(
  built: NanoProStandaloneTrialBuiltRequest,
): Record<string, unknown> {
  return {
    ...built,
    body: {
      ...built.body,
      prompt: `[prompt length ${built.body.prompt.length}]`,
      input_references: built.body.input_references.map((ref, i) => ({
        index: i,
        role: NANO_PRO_STANDALONE_TRIAL_REFERENCE_ORDER[i] ?? `REF_${i + 1}`,
        urlKind: ref.image_url.url.startsWith("data:")
          ? "data_uri"
          : ref.image_url.url.startsWith("http")
            ? "http_url"
            : "other",
        urlLength: ref.image_url.url.length,
      })),
    },
    promptUsed: `[prompt length ${built.promptUsed.length}]`,
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

function extractOpenRouterProvider(
  response: Response,
  body: unknown,
): string | null {
  const header =
    response.headers.get("x-openrouter-provider") ??
    response.headers.get("x-provider") ??
    response.headers.get("openrouter-provider");
  if (header?.trim()) return header.trim();

  if (body && typeof body === "object") {
    const provider = (body as { provider?: unknown }).provider;
    if (typeof provider === "string" && provider.trim()) return provider.trim();
    if (provider && typeof provider === "object") {
      const name = (provider as { name?: unknown }).name;
      if (typeof name === "string" && name.trim()) return name.trim();
    }
  }
  return null;
}

async function ensureDataUri(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("data:")) return imageUrl;
  const upstream = await fetch(imageUrl, { redirect: "follow" });
  if (!upstream.ok) {
    throw new Error(
      `${NANO_PRO_STANDALONE_TRIAL_NAME}: failed to fetch output image HTTP ${upstream.status}`,
    );
  }
  const contentType = upstream.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await upstream.arrayBuffer());
  const mime = contentType.split(";")[0]?.trim() || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/**
 * Call OpenRouter Nano Pro Images API once. Never invokes Flash / cascade.
 */
export async function generateNanoProStandaloneTrial(
  input: NanoProStandaloneTrialInput,
): Promise<NanoProStandaloneTrialResult> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    throw new Error(
      `${NANO_PRO_STANDALONE_TRIAL_NAME}: OPENROUTER_API_KEY is not set`,
    );
  }

  const built = buildNanoProStandaloneTrialRequest(input);
  const timeoutMs =
    input.timeoutMs ??
    Number(process.env["OR_RENDER_TIMEOUT_MS"] ?? 180_000);

  logger.info(
    {
      experimental: true,
      experiment: NANO_PRO_STANDALONE_TRIAL_NAME,
      trialRunId: built.trialRunId,
      model: built.model,
      api: "images",
      resolution: built.resolutionApplied,
      referenceOrder: built.referenceOrder,
      poseId: built.poseId,
      modelIdentityId: built.modelIdentityId,
      packaging: built.packaging,
      forensics: built.forensics,
      cascade: false,
      nanoRegularInvoked: false,
      credits: "none",
    },
    "nano-pro-standalone-trial: starting OpenRouter Images API request",
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  let response: Response;
  try {
    response = await fetch(
      `${OPENROUTER_RENDERING_CONFIG.baseUrl}${NANO_PRO_STANDALONE_TRIAL_ENDPOINT_PATH}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://studiolayer.ai",
          "X-Title": "StudioLayer AI Nano Pro Standalone Trial",
        },
        body: JSON.stringify(built.body),
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
  const openRouterProvider = extractOpenRouterProvider(response, parsed);
  const timestamp = new Date().toISOString();

  if (!response.ok) {
    const detail =
      parsed && typeof parsed === "object"
        ? JSON.stringify(parsed).slice(0, 1200)
        : bodyText.slice(0, 1200);
    const err = new Error(
      `${NANO_PRO_STANDALONE_TRIAL_NAME} OpenRouter error: HTTP ${response.status} — ${detail}`,
    ) as Error & {
      httpStatus?: number;
      openRouterRequestId?: string | null;
      trialRunId?: string;
      responseBody?: string;
    };
    err.httpStatus = response.status;
    err.openRouterRequestId = openRouterRequestId;
    err.trialRunId = built.trialRunId;
    err.responseBody = detail;
    throw err;
  }

  const urls = extractImageDataUris(parsed);
  if (urls.length === 0) {
    throw new Error(
      `${NANO_PRO_STANDALONE_TRIAL_NAME}: response OK but no image data found`,
    );
  }

  const rawUrl = urls[0]!;
  const imageDataUri = await ensureDataUri(rawUrl);

  let outputDimensions: { width: number; height: number } | null = null;
  let resolutionValid = false;
  let resolutionMismatch = false;
  let resolutionValidationError: string | null = null;

  try {
    outputDimensions = validateNativeResolutionFromDataUri(
      imageDataUri,
      built.resolutionRequested,
    );
    resolutionValid = true;
  } catch (error) {
    resolutionMismatch = true;
    resolutionValidationError =
      error instanceof NativeResolutionValidationError || error instanceof Error
        ? error.message
        : String(error);
    try {
      const comma = imageDataUri.indexOf(",");
      if (comma !== -1) {
        outputDimensions = parseImageDimensionsFromBuffer(
          Buffer.from(imageDataUri.slice(comma + 1), "base64"),
        );
      }
    } catch {
      // dimensions optional when parse also fails
    }
  }

  return {
    ok: resolutionValid,
    experimental: true,
    experiment: NANO_PRO_STANDALONE_TRIAL_NAME,
    trialRunId: built.trialRunId,
    timestamp,
    engine: "nano_pro",
    cascade: false,
    nanoRegularInvoked: false,
    model: built.model,
    api: NANO_PRO_STANDALONE_TRIAL_API,
    referenceOrder: NANO_PRO_STANDALONE_TRIAL_REFERENCE_ORDER,
    poseId: built.poseId,
    modelIdentityId: built.modelIdentityId,
    garmentId: built.garmentId,
    resolutionRequested: built.resolutionRequested,
    resolutionApplied: built.resolutionApplied,
    resolutionValid,
    resolutionMismatch,
    resolutionValidationError,
    outputDimensions,
    durationMs,
    openRouterRequestId,
    openRouterProvider,
    packaging: built.packaging,
    forensics: built.forensics,
    httpStatus: response.status,
    promptUsed: built.promptUsed,
    imageDataUri,
    images: [
      {
        url: imageDataUri,
        index: 0,
        width: outputDimensions?.width,
        height: outputDimensions?.height,
      },
    ],
    creditsDeducted: 0,
    gallery: false,
    createsRenderRow: false,
    storagePrefix: "trial/nano-pro/",
  };
}
