// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — Nano Pro Identity-First / Pose-Second Trial
//
// STAGE 1: Studio Talent only → full-body identity anchor (Nano Pro)
// STAGE 2: Stage-1 + garment + face-neutral Pose Master → final (Nano Pro)
//
// Isolated from production Create / cascade / Flash / credits / Gallery.
// Does NOT modify nano-pro-standalone-trial (single-shot v2) behavior.
// Easy to delete after the experiment.
// ---------------------------------------------------------------------------

import { createHash, randomUUID } from "node:crypto";
import { logger } from "../../../lib/logger.js";
import {
  OPENROUTER_RENDERING_CONFIG,
  resolveNanoProImageResolution,
  type NativeOutputResolution,
} from "../rendering.config.js";
import {
  NativeResolutionValidationError,
  parseImageDimensionsFromBuffer,
  validateNativeResolutionFromDataUri,
} from "../native-resolution.js";
import {
  describeImageRefForForensics,
  sha256Short,
  type NanoProStandaloneTrialPackaging,
  resolveNanoProStandaloneTrialPackaging,
} from "./nano-pro-standalone-trial.js";

export const NANO_PRO_IDENTITY_FIRST_TRIAL_NAME =
  "nano-pro-identity-first-trial" as const;

export const NANO_PRO_IDENTITY_FIRST_TRIAL_ENV =
  "EXPERIMENTAL_NANO_PRO_IDENTITY_FIRST_TRIAL_ENABLED" as const;

export const NANO_PRO_IDENTITY_FIRST_TRIAL_API =
  "POST /api/v1/images" as const;

export const NANO_PRO_IDENTITY_FIRST_TRIAL_ENDPOINT_PATH = "/images" as const;

export const IDENTITY_FIRST_STAGE1_REFERENCE_ORDER = ["TALENT"] as const;

export const IDENTITY_FIRST_STAGE2_REFERENCE_ORDER = [
  "IDENTITY_ANCHOR",
  "GARMENT",
  "POSE_MASTER",
] as const;

/** Gate default OFF. Also accepts standalone-trial gate for shared local QA. */
export function isNanoProIdentityFirstTrialEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const dedicated = env[NANO_PRO_IDENTITY_FIRST_TRIAL_ENV] ?? "";
  if (
    dedicated === "1" ||
    dedicated.toLowerCase() === "true" ||
    dedicated.toLowerCase() === "yes"
  ) {
    return true;
  }
  // Shared local QA: allow when standalone trial gate is on.
  const shared = env["EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_ENABLED"] ?? "";
  return (
    shared === "1" ||
    shared.toLowerCase() === "true" ||
    shared.toLowerCase() === "yes"
  );
}

export function resolveNanoProIdentityFirstTrialModel(): string {
  return OPENROUTER_RENDERING_CONFIG.nanoBananaProModel;
}

export type NanoProIdentityFirstResolution = NativeOutputResolution;

export type NanoProIdentityFirstTrialInput = {
  talentImageUrl: string;
  garmentImageUrl: string;
  /** Face-neutral Pose Master data URI (caller must use Stage-1 loader). */
  poseImageUrl: string;
  poseId: string;
  modelIdentityId?: string | null;
  garmentId?: string | null;
  creativeShotPrompt?: string;
  /** Structured for later 4K; initial experiment uses 2K. */
  outputResolution?: NanoProIdentityFirstResolution;
  timeoutMs?: number;
  packaging?: NanoProStandaloneTrialPackaging;
};

export type IdentityFirstStageBuiltRequest = {
  stage: 1 | 2;
  stageRunId: string;
  model: string;
  api: typeof NANO_PRO_IDENTITY_FIRST_TRIAL_API;
  referenceOrder: readonly string[];
  resolutionRequested: "2K" | "4K";
  resolutionApplied: "2K" | "4K";
  aspectRatio: "4:5";
  packaging: NanoProStandaloneTrialPackaging;
  promptUsed: string;
  forensics: {
    packaging: NanoProStandaloneTrialPackaging;
    promptSha256_16: string;
    promptLength: number;
    requestContentSha256_16: string;
    referenceOrder: readonly string[];
    refs: Array<{
      role: string;
      meta: ReturnType<typeof describeImageRefForForensics>;
    }>;
    providerPinned: boolean;
    providerPreference: Record<string, unknown> | null;
  };
  body: {
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
};

export const IDENTITY_FIRST_STAGE1_PROMPT = `Create a premium photorealistic full-body fashion portrait of ONE specific person.

REFERENCE IMAGE 1 = STUDIO TALENT — the sole human identity authority.
Establish this person as a complete face-to-toe individual.
Preserve facial identity, facial geometry, skin tone, hair, and recognizable identity characteristics exactly.
Show the full body from head to feet in a natural standing stance.
Simple neutral studio background. Soft even lighting. Editorial fashion photography quality.
Do not invent a different person.
Do not beautify or redesign the face.
No garment product reference is provided — use simple neutral clothing only if clothing is needed to complete the full-body person.
No pose master is provided — do not invent a dramatic editorial pose.`;

export function assembleIdentityFirstStage2Prompt(params: {
  creativeShotPrompt?: string;
}): string {
  const creative =
    params.creativeShotPrompt?.trim() ||
    "Create a premium photorealistic fashion photograph on a clean white studio background.";

  return [
    "IDENTITY-FIRST STAGE 2 — APPLY POSE TO ESTABLISHED PERSON.",
    "",
    "REFERENCE IMAGE ROLES — BINDING AUTHORITY:",
    "Reference Image 1 = IDENTITY ANCHOR — the established person from Stage 1. Sole authority for face, facial identity, hair, skin tone, body identity, and who this person is.",
    "Reference Image 2 = GARMENT — clothing construction, colour, texture, and product identity ONLY. Not a person.",
    "Reference Image 3 = POSE MASTER — body pose, limb placement, gesture, and pose-related framing ONLY. Faceless geometry. Not identity.",
    "",
    "AUTHORITY HIERARCHY (do not invert):",
    "1) Person / face / identity / body identity → Reference Image 1 only.",
    "2) Garment / product → Reference Image 2 only.",
    "3) Pose / body position / framing → Reference Image 3 only.",
    "4) Environment / creative direction → text instructions only.",
    "",
    "Preserve the same person from Reference Image 1 while changing body position to match Reference Image 3.",
    "Dress the person in the garment from Reference Image 2.",
    "Do not derive face, facial structure, hair, or identity from Reference Image 3.",
    "Do not invent or substitute a different person.",
    "",
    creative,
  ].join("\n");
}

function newRunId(): string {
  return randomUUID();
}

function sha256BytesShort(dataUri: string): string {
  if (!dataUri.startsWith("data:")) {
    return sha256Short(dataUri);
  }
  const comma = dataUri.indexOf(",");
  if (comma < 0) return sha256Short(dataUri);
  const b64 = dataUri.slice(comma + 1);
  return createHash("sha256")
    .update(Buffer.from(b64, "base64"))
    .digest("hex")
    .slice(0, 16);
}

function applyProviderPin(
  body: IdentityFirstStageBuiltRequest["body"],
  packaging: NanoProStandaloneTrialPackaging,
): void {
  if (packaging === "v2") {
    body.provider = {
      order: ["google-ai-studio"],
      allow_fallbacks: false,
    };
  }
}

function resolveTrialResolution(
  outputResolution?: NanoProIdentityFirstResolution,
): { requested: "2K" | "4K"; applied: "2K" | "4K" } {
  // Structured for later 4K; initial experiment defaults to 2K.
  const requested: "2K" | "4K" =
    outputResolution === "4K" ? "4K" : "2K";
  return {
    requested,
    applied: resolveNanoProImageResolution(requested),
  };
}

/**
 * STAGE 1 — Talent only. No garment. No Pose Master. No second human.
 */
export function buildIdentityFirstStage1Request(
  input: {
    talentImageUrl: string;
    modelIdentityId?: string | null;
    outputResolution?: NanoProIdentityFirstResolution;
    packaging?: NanoProStandaloneTrialPackaging;
  },
  stageRunId: string = newRunId(),
): IdentityFirstStageBuiltRequest {
  const packaging =
    input.packaging ?? resolveNanoProStandaloneTrialPackaging();
  const { requested, applied } = resolveTrialResolution(input.outputResolution);
  const model = resolveNanoProIdentityFirstTrialModel();
  const prompt = IDENTITY_FIRST_STAGE1_PROMPT;
  const input_references = [
    {
      type: "image_url" as const,
      image_url: { url: input.talentImageUrl },
    },
  ];

  const body: IdentityFirstStageBuiltRequest["body"] = {
    model,
    prompt,
    n: 1,
    aspect_ratio: "4:5",
    resolution: applied,
    input_references,
  };
  applyProviderPin(body, packaging);

  const refs = [
    {
      role: "TALENT",
      meta: describeImageRefForForensics(input.talentImageUrl),
    },
  ];

  const requestContentSha256_16 = sha256Short(
    JSON.stringify({
      stage: 1,
      model,
      resolution: applied,
      aspect_ratio: "4:5",
      n: 1,
      prompt,
      refs: [input.talentImageUrl],
      provider: body.provider ?? null,
    }),
  );

  return {
    stage: 1,
    stageRunId,
    model,
    api: NANO_PRO_IDENTITY_FIRST_TRIAL_API,
    referenceOrder: IDENTITY_FIRST_STAGE1_REFERENCE_ORDER,
    resolutionRequested: requested,
    resolutionApplied: applied,
    aspectRatio: "4:5",
    packaging,
    promptUsed: prompt,
    forensics: {
      packaging,
      promptSha256_16: sha256Short(prompt),
      promptLength: prompt.length,
      requestContentSha256_16,
      referenceOrder: IDENTITY_FIRST_STAGE1_REFERENCE_ORDER,
      refs,
      providerPinned: packaging === "v2",
      providerPreference: body.provider ?? null,
    },
    body,
  };
}

/**
 * STAGE 2 — Identity anchor + garment + face-neutral Pose Master.
 * Does NOT include original Studio Talent as a second human reference.
 */
export function buildIdentityFirstStage2Request(
  input: {
    identityAnchorImageUrl: string;
    garmentImageUrl: string;
    poseImageUrl: string;
    poseId: string;
    creativeShotPrompt?: string;
    outputResolution?: NanoProIdentityFirstResolution;
    packaging?: NanoProStandaloneTrialPackaging;
  },
  stageRunId: string = newRunId(),
): IdentityFirstStageBuiltRequest {
  const packaging =
    input.packaging ?? resolveNanoProStandaloneTrialPackaging();
  const { requested, applied } = resolveTrialResolution(input.outputResolution);
  const model = resolveNanoProIdentityFirstTrialModel();
  const prompt = assembleIdentityFirstStage2Prompt({
    creativeShotPrompt: input.creativeShotPrompt,
  });

  const input_references = [
    {
      type: "image_url" as const,
      image_url: { url: input.identityAnchorImageUrl },
    },
    {
      type: "image_url" as const,
      image_url: { url: input.garmentImageUrl },
    },
    {
      type: "image_url" as const,
      image_url: { url: input.poseImageUrl },
    },
  ];

  const body: IdentityFirstStageBuiltRequest["body"] = {
    model,
    prompt,
    n: 1,
    aspect_ratio: "4:5",
    resolution: applied,
    input_references,
  };
  applyProviderPin(body, packaging);

  const refs = [
    {
      role: "IDENTITY_ANCHOR",
      meta: describeImageRefForForensics(input.identityAnchorImageUrl),
    },
    {
      role: "GARMENT",
      meta: describeImageRefForForensics(input.garmentImageUrl),
    },
    {
      role: "POSE_MASTER",
      meta: describeImageRefForForensics(input.poseImageUrl),
    },
  ];

  const requestContentSha256_16 = sha256Short(
    JSON.stringify({
      stage: 2,
      model,
      resolution: applied,
      aspect_ratio: "4:5",
      n: 1,
      prompt,
      refs: [
        input.identityAnchorImageUrl,
        input.garmentImageUrl,
        input.poseImageUrl,
      ],
      provider: body.provider ?? null,
    }),
  );

  return {
    stage: 2,
    stageRunId,
    model,
    api: NANO_PRO_IDENTITY_FIRST_TRIAL_API,
    referenceOrder: IDENTITY_FIRST_STAGE2_REFERENCE_ORDER,
    resolutionRequested: requested,
    resolutionApplied: applied,
    aspectRatio: "4:5",
    packaging,
    promptUsed: prompt,
    forensics: {
      packaging,
      promptSha256_16: sha256Short(prompt),
      promptLength: prompt.length,
      requestContentSha256_16,
      referenceOrder: IDENTITY_FIRST_STAGE2_REFERENCE_ORDER,
      refs,
      providerPinned: packaging === "v2",
      providerPreference: body.provider ?? null,
    },
    body,
  };
}

export function redactIdentityFirstStageRequestForInspection(
  built: IdentityFirstStageBuiltRequest,
): Record<string, unknown> {
  return {
    stage: built.stage,
    stageRunId: built.stageRunId,
    model: built.model,
    api: built.api,
    referenceOrder: built.referenceOrder,
    resolutionRequested: built.resolutionRequested,
    resolutionApplied: built.resolutionApplied,
    aspectRatio: built.aspectRatio,
    packaging: built.packaging,
    forensics: built.forensics,
    body: {
      ...built.body,
      prompt: `[prompt length ${built.body.prompt.length}]`,
      input_references: built.body.input_references.map((ref, i) => ({
        index: i,
        role: built.referenceOrder[i] ?? `REF_${i + 1}`,
        urlKind: ref.image_url.url.startsWith("data:")
          ? "data_uri"
          : ref.image_url.url.startsWith("http")
            ? "http_url"
            : "other",
        urlLength: ref.image_url.url.length,
        sha256_16: sha256Short(ref.image_url.url),
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
      `${NANO_PRO_IDENTITY_FIRST_TRIAL_NAME}: failed to fetch output image HTTP ${upstream.status}`,
    );
  }
  const contentType = upstream.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await upstream.arrayBuffer());
  const mime = contentType.split(";")[0]?.trim() || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

type StageCallResult = {
  stageRunId: string;
  model: string;
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
  forensics: IdentityFirstStageBuiltRequest["forensics"];
  promptUsed: string;
  referenceOrder: readonly string[];
  httpStatus: number;
  /** Exact bytes as data URI — never resized/recompressed before Stage 2. */
  imageDataUri: string;
  imageSha256_16: string;
};

async function callNanoProImagesOnce(
  built: IdentityFirstStageBuiltRequest,
  timeoutMs: number,
  trialRunId: string,
): Promise<StageCallResult> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    throw new Error(
      `${NANO_PRO_IDENTITY_FIRST_TRIAL_NAME}: OPENROUTER_API_KEY is not set`,
    );
  }

  logger.info(
    {
      experimental: true,
      experiment: NANO_PRO_IDENTITY_FIRST_TRIAL_NAME,
      trialRunId,
      stage: built.stage,
      stageRunId: built.stageRunId,
      model: built.model,
      resolution: built.resolutionApplied,
      referenceOrder: built.referenceOrder,
      packaging: built.packaging,
      cascade: false,
      nanoRegularInvoked: false,
      credits: "none",
    },
    "nano-pro-identity-first-trial: starting OpenRouter Images API request",
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  let response: Response;
  try {
    response = await fetch(
      `${OPENROUTER_RENDERING_CONFIG.baseUrl}${NANO_PRO_IDENTITY_FIRST_TRIAL_ENDPOINT_PATH}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://studiolayer.ai",
          "X-Title": "StudioLayer AI Nano Pro Identity-First Trial",
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

  if (!response.ok) {
    const detail =
      parsed && typeof parsed === "object"
        ? JSON.stringify(parsed).slice(0, 1200)
        : bodyText.slice(0, 1200);
    const err = new Error(
      `${NANO_PRO_IDENTITY_FIRST_TRIAL_NAME} Stage ${built.stage} OpenRouter error: HTTP ${response.status} — ${detail}`,
    ) as Error & {
      httpStatus?: number;
      openRouterRequestId?: string | null;
      trialRunId?: string;
      stage?: number;
      stageRunId?: string;
    };
    err.httpStatus = response.status;
    err.openRouterRequestId = openRouterRequestId;
    err.trialRunId = trialRunId;
    err.stage = built.stage;
    err.stageRunId = built.stageRunId;
    throw err;
  }

  const urls = extractImageDataUris(parsed);
  if (urls.length === 0) {
    const err = new Error(
      `${NANO_PRO_IDENTITY_FIRST_TRIAL_NAME}: Stage ${built.stage} response OK but no image data found`,
    ) as Error & { trialRunId?: string; stage?: number; stageRunId?: string };
    err.trialRunId = trialRunId;
    err.stage = built.stage;
    err.stageRunId = built.stageRunId;
    throw err;
  }

  const imageDataUri = await ensureDataUri(urls[0]!);
  const imageSha256_16 = sha256BytesShort(imageDataUri);

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
      // dimensions optional
    }
  }

  return {
    stageRunId: built.stageRunId,
    model: built.model,
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
    promptUsed: built.promptUsed,
    referenceOrder: built.referenceOrder,
    httpStatus: response.status,
    imageDataUri,
    imageSha256_16,
  };
}

export type NanoProIdentityFirstTrialResult = {
  ok: boolean;
  experimental: true;
  experiment: typeof NANO_PRO_IDENTITY_FIRST_TRIAL_NAME;
  architecture: "identity-first-pose-second";
  trialRunId: string;
  stage1RunId: string;
  stage2RunId: string;
  timestamp: string;
  engine: "nano_pro";
  cascade: false;
  nanoRegularInvoked: false;
  model: string;
  api: typeof NANO_PRO_IDENTITY_FIRST_TRIAL_API;
  poseId: string;
  modelIdentityId: string | null;
  garmentId: string | null;
  resolutionRequested: "2K" | "4K";
  resolutionApplied: "2K" | "4K";
  packaging: NanoProStandaloneTrialPackaging;
  creditsDeducted: 0;
  gallery: false;
  createsRenderRow: false;
  storagePrefix: "trial/nano-pro/";
  durationMs: number;
  stage1: {
    stageRunId: string;
    model: string;
    openRouterProvider: string | null;
    openRouterRequestId: string | null;
    resolution: "2K" | "4K";
    resolutionValid: boolean;
    resolutionMismatch: boolean;
    resolutionValidationError: string | null;
    outputDimensions: { width: number; height: number } | null;
    durationMs: number;
    referenceOrder: typeof IDENTITY_FIRST_STAGE1_REFERENCE_ORDER;
    imageSha256_16: string;
    forensics: IdentityFirstStageBuiltRequest["forensics"];
    imageDataUri: string;
    images: Array<{ url: string; index: number; width?: number; height?: number }>;
  };
  stage2: {
    stageRunId: string;
    model: string;
    openRouterProvider: string | null;
    openRouterRequestId: string | null;
    resolution: "2K" | "4K";
    resolutionValid: boolean;
    resolutionMismatch: boolean;
    resolutionValidationError: string | null;
    outputDimensions: { width: number; height: number } | null;
    durationMs: number;
    referenceOrder: typeof IDENTITY_FIRST_STAGE2_REFERENCE_ORDER;
    imageSha256_16: string;
    requestContentSha256_16: string;
    identityAnchorSha256_16: string;
    garmentSha256_16: string;
    poseSha256_16: string;
    forensics: IdentityFirstStageBuiltRequest["forensics"];
    imageDataUri: string;
    images: Array<{ url: string; index: number; width?: number; height?: number }>;
  };
  /** Final pose result (Stage 2) for convenience. */
  imageDataUri: string;
  images: Array<{ url: string; index: number; width?: number; height?: number }>;
};

export class IdentityFirstStage2FailureError extends Error {
  readonly trialRunId: string;
  readonly stage1: NanoProIdentityFirstTrialResult["stage1"];
  readonly stage2RunId: string | null;
  readonly httpStatus: number;

  constructor(params: {
    message: string;
    trialRunId: string;
    stage1: NanoProIdentityFirstTrialResult["stage1"];
    stage2RunId?: string | null;
    httpStatus?: number;
  }) {
    super(params.message);
    this.name = "IdentityFirstStage2FailureError";
    this.trialRunId = params.trialRunId;
    this.stage1 = params.stage1;
    this.stage2RunId = params.stage2RunId ?? null;
    this.httpStatus = params.httpStatus ?? 500;
  }
}

/**
 * Run Stage 1 then Stage 2. Never invokes Flash / cascade / production Create.
 * If Stage 1 fails → Stage 2 is not executed.
 * If Stage 2 fails → throws IdentityFirstStage2FailureError with Stage 1 payload.
 */
export async function generateNanoProIdentityFirstTrial(
  input: NanoProIdentityFirstTrialInput,
): Promise<NanoProIdentityFirstTrialResult> {
  const trialRunId = newRunId();
  const timeoutMs =
    input.timeoutMs ??
    Number(process.env["OR_RENDER_TIMEOUT_MS"] ?? 180_000);
  const packaging =
    input.packaging ?? resolveNanoProStandaloneTrialPackaging();

  const stage1Built = buildIdentityFirstStage1Request(
    {
      talentImageUrl: input.talentImageUrl,
      modelIdentityId: input.modelIdentityId,
      outputResolution: input.outputResolution,
      packaging,
    },
    newRunId(),
  );

  // Fail-safe: Stage 1 must succeed with a valid image before Stage 2.
  const stage1Call = await callNanoProImagesOnce(
    stage1Built,
    timeoutMs,
    trialRunId,
  );

  if (!stage1Call.imageDataUri) {
    throw new Error(
      `${NANO_PRO_IDENTITY_FIRST_TRIAL_NAME}: Stage 1 produced no valid image — Stage 2 will not run`,
    );
  }

  const stage1Payload: NanoProIdentityFirstTrialResult["stage1"] = {
    stageRunId: stage1Call.stageRunId,
    model: stage1Call.model,
    openRouterProvider: stage1Call.openRouterProvider,
    openRouterRequestId: stage1Call.openRouterRequestId,
    resolution: stage1Call.resolutionApplied,
    resolutionValid: stage1Call.resolutionValid,
    resolutionMismatch: stage1Call.resolutionMismatch,
    resolutionValidationError: stage1Call.resolutionValidationError,
    outputDimensions: stage1Call.outputDimensions,
    durationMs: stage1Call.durationMs,
    referenceOrder: IDENTITY_FIRST_STAGE1_REFERENCE_ORDER,
    imageSha256_16: stage1Call.imageSha256_16,
    forensics: stage1Call.forensics,
    imageDataUri: stage1Call.imageDataUri,
    images: [
      {
        url: stage1Call.imageDataUri,
        index: 0,
        width: stage1Call.outputDimensions?.width,
        height: stage1Call.outputDimensions?.height,
      },
    ],
  };

  // Exact Stage-1 bytes into Stage 2 — no resize / recompress.
  const identityAnchorImageUrl = stage1Call.imageDataUri;

  const stage2Built = buildIdentityFirstStage2Request(
    {
      identityAnchorImageUrl,
      garmentImageUrl: input.garmentImageUrl,
      poseImageUrl: input.poseImageUrl,
      poseId: input.poseId,
      creativeShotPrompt: input.creativeShotPrompt,
      outputResolution: input.outputResolution,
      packaging,
    },
    newRunId(),
  );

  // Prove Stage-2 Ref1 is exact Stage-1 bytes.
  const stage2Ref1 = stage2Built.body.input_references[0]!.image_url.url;
  if (stage2Ref1 !== identityAnchorImageUrl) {
    throw new Error(
      `${NANO_PRO_IDENTITY_FIRST_TRIAL_NAME}: Stage-1 bytes were altered before Stage 2`,
    );
  }

  let stage2Call: StageCallResult;
  try {
    stage2Call = await callNanoProImagesOnce(
      stage2Built,
      timeoutMs,
      trialRunId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const httpStatus =
      typeof (error as { httpStatus?: number }).httpStatus === "number"
        ? (error as { httpStatus: number }).httpStatus
        : 500;
    throw new IdentityFirstStage2FailureError({
      message,
      trialRunId,
      stage1: stage1Payload,
      stage2RunId: stage2Built.stageRunId,
      httpStatus,
    });
  }

  const garmentMeta = describeImageRefForForensics(input.garmentImageUrl);
  const poseMeta = describeImageRefForForensics(input.poseImageUrl);

  const stage2Payload: NanoProIdentityFirstTrialResult["stage2"] = {
    stageRunId: stage2Call.stageRunId,
    model: stage2Call.model,
    openRouterProvider: stage2Call.openRouterProvider,
    openRouterRequestId: stage2Call.openRouterRequestId,
    resolution: stage2Call.resolutionApplied,
    resolutionValid: stage2Call.resolutionValid,
    resolutionMismatch: stage2Call.resolutionMismatch,
    resolutionValidationError: stage2Call.resolutionValidationError,
    outputDimensions: stage2Call.outputDimensions,
    durationMs: stage2Call.durationMs,
    referenceOrder: IDENTITY_FIRST_STAGE2_REFERENCE_ORDER,
    imageSha256_16: stage2Call.imageSha256_16,
    requestContentSha256_16: stage2Call.forensics.requestContentSha256_16,
    identityAnchorSha256_16: stage1Call.imageSha256_16,
    garmentSha256_16: garmentMeta.sha256_16,
    poseSha256_16: poseMeta.sha256_16,
    forensics: stage2Call.forensics,
    imageDataUri: stage2Call.imageDataUri,
    images: [
      {
        url: stage2Call.imageDataUri,
        index: 0,
        width: stage2Call.outputDimensions?.width,
        height: stage2Call.outputDimensions?.height,
      },
    ],
  };

  const ok =
    stage1Call.resolutionValid &&
    stage2Call.resolutionValid &&
    !stage1Call.resolutionMismatch &&
    !stage2Call.resolutionMismatch;

  return {
    ok,
    experimental: true,
    experiment: NANO_PRO_IDENTITY_FIRST_TRIAL_NAME,
    architecture: "identity-first-pose-second",
    trialRunId,
    stage1RunId: stage1Call.stageRunId,
    stage2RunId: stage2Call.stageRunId,
    timestamp: new Date().toISOString(),
    engine: "nano_pro",
    cascade: false,
    nanoRegularInvoked: false,
    model: stage2Call.model,
    api: NANO_PRO_IDENTITY_FIRST_TRIAL_API,
    poseId: input.poseId,
    modelIdentityId: input.modelIdentityId ?? null,
    garmentId: input.garmentId ?? null,
    resolutionRequested: stage2Call.resolutionRequested,
    resolutionApplied: stage2Call.resolutionApplied,
    packaging,
    creditsDeducted: 0,
    gallery: false,
    createsRenderRow: false,
    storagePrefix: "trial/nano-pro/",
    durationMs: stage1Call.durationMs + stage2Call.durationMs,
    stage1: stage1Payload,
    stage2: stage2Payload,
    imageDataUri: stage2Call.imageDataUri,
    images: stage2Payload.images,
  };
}
