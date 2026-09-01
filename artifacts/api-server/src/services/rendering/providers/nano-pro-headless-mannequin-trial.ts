// ---------------------------------------------------------------------------
// EXPERIMENTAL ONLY — Nano Pro Headless Mannequin Identity Trial
//
// STAGE 1: garment + face-neutral Pose Master → a complete, ordinary
//          photograph. The Studio Talent is NOT a reference: identity is
//          deliberately withheld until Stage 2.
// MASKING: a LOCAL MECHANICAL step (no generation) removes the head/hair
//          region and replaces it with a neutral grey plate. Head removal is
//          mechanical, never prompt-based.
// IDENTITY: a mechanically cropped head-envelope reference is derived from the
//          original Studio Talent (YuNet crop + uniform upscale, no generation).
// STAGE 2: masked headless bytes + identity reference → identity applied to the
//          neutral head region, everything below the neck locked.
//
// Exactly TWO Nano Pro generation calls. Segmentation and face detection are
// not generation stages.
//
// Deliberately self-contained. Does NOT reuse or alter the identity-first
// trial (nano-pro-identity-first-trial.ts), production Create, cascade,
// Flash, credits, or Gallery. Easy to delete after the experiment.
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
import {
  dataUriToBuffer,
  neutralizeHeadRegion,
  HEAD_PLATE_GRAY,
  HEAD_SEGMENTATION_MODEL,
  type HeadMaskFailureReason,
  type HeadMaskMetrics,
  type HeadSegmentationProvider,
} from "../../image-processing/headless-head-mask.js";
import {
  buildTalentIdentityReference,
  type IdentityReferenceFailureReason,
  type FaceAnchorDetector,
} from "../../image-processing/talent-identity-reference.js";
import type { FaceBox } from "../../image-processing/face-anchor-detector.js";

export const NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME =
  "nano-pro-headless-mannequin-trial" as const;

export const NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_ENV =
  "EXPERIMENTAL_NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_ENABLED" as const;

export const NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_API =
  "POST /api/v1/images" as const;

export const NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_ENDPOINT_PATH =
  "/images" as const;

/**
 * Stage 1 reference roles in binding order. When furniture is attached, all
 * three refs are sent; otherwise only GARMENT and POSE_MASTER are attached.
 */
export const HEADLESS_STAGE1_REFERENCE_ORDER = [
  "GARMENT",
  "POSE_MASTER",
  "FURNITURE",
] as const;

/** Stage-1 roles when no furniture reference is attached. */
export const HEADLESS_STAGE1_REFERENCE_ORDER_WITHOUT_FURNITURE = [
  "GARMENT",
  "POSE_MASTER",
] as const;

/**
 * Stage 2 sees the MASKED headless photograph, then a mechanically cropped
 * identity reference derived from the original Studio Talent. The full-body
 * Talent plate is never sent to Stage 2.
 */
export const HEADLESS_STAGE2_REFERENCE_ORDER = [
  "HEADLESS_BASE",
  "IDENTITY_REFERENCE",
] as const;

/** Exactly two provider calls. Asserted by tests; never derived at runtime. */
export const HEADLESS_TRIAL_TOTAL_GENERATION_CALLS = 2 as const;

export function isNanoProHeadlessMannequinTrialEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const dedicated = env[NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_ENV] ?? "";
  if (
    dedicated === "1" ||
    dedicated.toLowerCase() === "true" ||
    dedicated.toLowerCase() === "yes"
  ) {
    return true;
  }
  const shared = env["EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_ENABLED"] ?? "";
  return (
    shared === "1" ||
    shared.toLowerCase() === "true" ||
    shared.toLowerCase() === "yes"
  );
}

export function resolveNanoProHeadlessMannequinTrialModel(): string {
  return OPENROUTER_RENDERING_CONFIG.nanoBananaProModel;
}

export type HeadlessMannequinResolution = NativeOutputResolution;

export type NanoProHeadlessMannequinTrialInput = {
  talentImageUrl: string;
  garmentImageUrl: string;
  /** Face-neutral Pose Master data URI (caller must use the Stage-1 loader). */
  poseImageUrl: string;
  /** Optional selected furniture product reference for Stage 1 (Ref 3). */
  furnitureReferenceImageUrl?: string | null;
  poseId: string;
  modelIdentityId?: string | null;
  garmentId?: string | null;
  creativeShotPrompt?: string;
  outputResolution?: HeadlessMannequinResolution;
  timeoutMs?: number;
  packaging?: NanoProStandaloneTrialPackaging;
  /** Injectable for tests; production uses the default EVF-SAM provider. */
  segmentationProvider?: HeadSegmentationProvider;
  /** Injectable for tests; production uses the shipped YuNet detector. */
  identityFaceAnchorDetector?: FaceAnchorDetector;
};

/** Forensic record of the mechanical masking step (not a generation stage). */
export type HeadlessMaskPayload = {
  applied: true;
  method: string;
  segmentationModel: typeof HEAD_SEGMENTATION_MODEL;
  plateGray: typeof HEAD_PLATE_GRAY;
  originalStage1Sha256_16: string;
  maskedStage1Sha256_16: string;
  width: number;
  height: number;
  metrics: HeadMaskMetrics;
  maskedImageDataUri: string;
};

/**
 * Forensic record of the mechanical identity crop (not a generation stage).
 * Derived from the ORIGINAL Studio Talent bytes by detect + crop + resample.
 */
export type HeadlessIdentityReferencePayload = {
  derived: true;
  method: string;
  faceDetector: "yunet";
  generative: false;
  sourceTalentSha256_16: string;
  identityReferenceSha256_16: string;
  sourceDimensions: { width: number; height: number };
  dimensions: { width: number; height: number };
  cropRegion: { left: number; top: number; width: number; height: number };
  scaleFactor: number;
  faceBox: FaceBox;
  faceCoverageOfSourcePct: number;
  faceCoverageOfReferencePct: number;
};

export type HeadlessStageBuiltRequest = {
  stage: 1 | 2;
  stageRunId: string;
  model: string;
  api: typeof NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_API;
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

export function buildHeadlessStage1PromptBase(
  hasFurnitureReference = false,
): string {
  const furnitureClause = hasFurnitureReference
    ? [
        "Reference Image 3 = FURNITURE — selected StudioLayer furniture product. Sole authority for furniture identity, overall silhouette, geometry, proportions, construction, wood grain, wood tone, upholstery, material, finish, surface texture, and every visible product-specific detail.",
        "When Reference Image 3 is attached, do NOT copy furniture design, material, colour, grain, or styling drawn in Reference Image 2 (Pose Master).",
        "Reference Image 2 remains authoritative for body pose, limb placement, weight distribution, and the body-to-furniture contact/support relationship only — not furniture appearance.",
        "",
      ].join("\n")
    : "";

  return [
    "HEADLESS MANNEQUIN STAGE 1 — BUILD THE COMPLETE PHOTOGRAPH.",
    "",
    "REFERENCE IMAGE ROLES — BINDING AUTHORITY:",
    "Reference Image 1 = GARMENT — clothing construction, colour, texture, print, and product identity ONLY. Not a person.",
    "Reference Image 2 = POSE MASTER — body pose, limb placement, gesture, and pose-related framing ONLY. Faceless geometry. Not identity.",
    furnitureClause,
    "Build a premium photorealistic fashion photograph of a correctly proportioned human body wearing the garment from Reference Image 1, in the body position shown in Reference Image 2.",
    "Render the body, garment, hands, arms, legs, proportions, environment, composition, and lighting to full editorial quality.",
    "",
    "HEAD REGION:",
    "Render an ordinary, anatomically normal human head with a clearly visible, well-lit, forward-facing or naturally angled face.",
    "Keep the head fully visible, correctly sized, unobstructed, and naturally attached at the neck.",
    "Do not crop the head. Do not obscure the face with hands, hair, props, or heavy shadow.",
    "",
    "No Studio Talent reference has been provided. Do not attempt to depict any specific real person.",
    "Do not derive face, facial structure, hair, or identity from Reference Image 1 or Reference Image 2.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * STAGE 1 — an ordinary, complete photograph (default: GARMENT + POSE_MASTER).
 *
 * The head is NOT removed here. Head removal happens mechanically after this
 * call, which is why Stage 1 must render a real, correctly placed head: the
 * face-anchor cross-check needs a detectable face to validate the mask against.
 */
export const HEADLESS_STAGE1_PROMPT_BASE = buildHeadlessStage1PromptBase(false);

/**
 * STAGE 2 — apply identity into the mechanically neutralised head region.
 *
 * Reference 1 is the MASKED Stage-1 photograph: everything below the head is
 * authoritative and locked, and the head is a flat neutral grey plate.
 * Reference 2 is the Studio Talent and is the sole authority for identity.
 */
export const HEADLESS_STAGE2_PROMPT = [
  "HEADLESS MANNEQUIN STAGE 2 — RESTORE THE HEAD INTO A NEUTRALISED REGION.",
  "",
  "REFERENCE IMAGE ROLES — BINDING AUTHORITY:",
  "Reference Image 1 = THE PHOTOGRAPH TO EDIT. Sole authority for body, body proportions, pose, garment, hands, composition, framing, environment, lighting, and everything below the head.",
  "Reference Image 2 = IDENTITY REFERENCE — a mechanically cropped close-up derived from the original Studio Talent photograph. It contains that person's face, hair, and a limited amount of neck and shoulder context. Sole authority for facial identity and facial structure.",
  "",
  "This is a targeted edit of Reference Image 1, not a new photograph.",
  "The head region of the subject in Reference Image 1 has been mechanically removed and replaced with a flat neutral grey plate. That grey region is not part of the photograph and contains no information.",
  "Fill that neutral grey region with the head of the person in Reference Image 2, so the subject becomes that person.",
  "",
  "ONE PERSON — NOT A BLEND:",
  "There is exactly one person in the final photograph, and that person is the individual in Reference Image 2.",
  "Do not blend, average, merge, or combine the identity reference with another person.",
  "Do not invent or substitute a different person.",
  "",
  "IDENTITY — from Reference Image 2 only:",
  "Reference Image 2 is a high-resolution record of real facial features. Reproduce them; do not reconstruct them.",
  "Preserve face shape, eyes, eye spacing, eye colour, nose, nose width, nose bridge, nostril shape, lips, lip thickness, philtrum, jawline, chin, cheek structure, eyebrows, ears, facial skin tone, hairline, hairstyle, hair colour, hair texture, age appearance, ethnicity, and overall facial proportions exactly as they appear in Reference Image 2.",
  "The output must clearly and unmistakably depict the person in Reference Image 2.",
  "Do not reshape, beautify, stylise, smooth, symmetrise, idealise, substitute, or otherwise reinterpret the identity.",
  "",
  "REFERENCE IMAGE 2 IS NOT A SCENE:",
  "Do not derive body, body proportions, garment, clothing, pose, camera angle, crop, composition, background, or environment from Reference Image 2.",
  "Its framing, scale, and background are artefacts of the crop and carry no instruction. Ignore them.",
  "",
  "LOCKED — reproduce from Reference Image 1 without alteration:",
  "Body, body proportions, garment, garment construction, garment colour, print, pattern and texture, pose, hands, fingers, arms, legs, feet, footwear, furniture, props, environment, background, composition, framing, crop, camera angle, lighting direction, lighting quality, and image grain.",
  "Do not alter the pose. Do not alter the garment. Do not alter body proportions. Do not alter the composition.",
  "",
  "HEAD PLACEMENT:",
  "The neutral grey region marks WHERE the head belongs. Use it to locate the head and its approximate scale only.",
  "The outline of that grey region is not the shape of this person's head or hair. Do not conform the head, skull, jaw, or hairstyle to that outline, and do not trim or extend the hair to match it.",
  "Render the head with the true shape and proportions shown in Reference Image 2, even where that differs from the grey region.",
  "Adapt only illumination, shadow direction, and photographic grain so the head sits naturally in the photograph. Adapting light must never change facial structure, facial proportions, or facial features.",
  "Join the neck and hairline cleanly to the existing neck and shoulders of Reference Image 1. Leave no grey residue, seam, halo, or pasted-on appearance.",
  "",
  "If you cannot apply the identity without altering the body, garment, pose, furniture, or composition, prioritise leaving them unchanged.",
].join("\n");

export function assembleHeadlessStage1Prompt(params: {
  creativeShotPrompt?: string;
  hasFurnitureReference?: boolean;
}): string {
  const base = buildHeadlessStage1PromptBase(Boolean(params.hasFurnitureReference));
  const creative = params.creativeShotPrompt?.trim();
  return creative ? [base, "", creative].join("\n") : base;
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
  body: HeadlessStageBuiltRequest["body"],
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
  outputResolution?: HeadlessMannequinResolution,
): { requested: "2K" | "4K"; applied: "2K" | "4K" } {
  const requested: "2K" | "4K" = outputResolution === "4K" ? "4K" : "2K";
  return {
    requested,
    applied: resolveNanoProImageResolution(requested),
  };
}

function buildStageRequest(params: {
  stage: 1 | 2;
  prompt: string;
  referenceOrder: readonly string[];
  refUrls: string[];
  outputResolution?: HeadlessMannequinResolution;
  packaging: NanoProStandaloneTrialPackaging;
  stageRunId: string;
}): HeadlessStageBuiltRequest {
  const { requested, applied } = resolveTrialResolution(params.outputResolution);
  const model = resolveNanoProHeadlessMannequinTrialModel();

  const input_references = params.refUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url },
  }));

  const body: HeadlessStageBuiltRequest["body"] = {
    model,
    prompt: params.prompt,
    n: 1,
    aspect_ratio: "4:5",
    resolution: applied,
    input_references,
  };
  applyProviderPin(body, params.packaging);

  const refs = params.referenceOrder.map((role, i) => ({
    role,
    meta: describeImageRefForForensics(params.refUrls[i]!),
  }));

  const requestContentSha256_16 = sha256Short(
    JSON.stringify({
      stage: params.stage,
      model,
      resolution: applied,
      aspect_ratio: "4:5",
      n: 1,
      prompt: params.prompt,
      refs: params.refUrls,
      provider: body.provider ?? null,
    }),
  );

  return {
    stage: params.stage,
    stageRunId: params.stageRunId,
    model,
    api: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_API,
    referenceOrder: params.referenceOrder,
    resolutionRequested: requested,
    resolutionApplied: applied,
    aspectRatio: "4:5",
    packaging: params.packaging,
    promptUsed: params.prompt,
    forensics: {
      packaging: params.packaging,
      promptSha256_16: sha256Short(params.prompt),
      promptLength: params.prompt.length,
      requestContentSha256_16,
      referenceOrder: params.referenceOrder,
      refs,
      providerPinned: params.packaging === "v2",
      providerPreference: body.provider ?? null,
    },
    body,
  };
}

/** STAGE 1 — GARMENT → POSE_MASTER [→ FURNITURE]. The Studio Talent is never sent. */
export function buildHeadlessStage1Request(
  input: {
    garmentImageUrl: string;
    poseImageUrl: string;
    furnitureReferenceImageUrl?: string | null;
    creativeShotPrompt?: string;
    outputResolution?: HeadlessMannequinResolution;
    packaging?: NanoProStandaloneTrialPackaging;
  },
  stageRunId: string = newRunId(),
): HeadlessStageBuiltRequest {
  const furnitureUrl =
    typeof input.furnitureReferenceImageUrl === "string" &&
    input.furnitureReferenceImageUrl.trim().length > 0
      ? input.furnitureReferenceImageUrl.trim()
      : null;
  const hasFurniture = Boolean(furnitureUrl);
  const referenceOrder = hasFurniture
    ? HEADLESS_STAGE1_REFERENCE_ORDER
    : HEADLESS_STAGE1_REFERENCE_ORDER_WITHOUT_FURNITURE;
  const refUrls = hasFurniture
    ? [input.garmentImageUrl, input.poseImageUrl, furnitureUrl!]
    : [input.garmentImageUrl, input.poseImageUrl];

  return buildStageRequest({
    stage: 1,
    prompt: assembleHeadlessStage1Prompt({
      creativeShotPrompt: input.creativeShotPrompt,
      hasFurnitureReference: hasFurniture,
    }),
    referenceOrder,
    refUrls,
    outputResolution: input.outputResolution,
    packaging: input.packaging ?? resolveNanoProStandaloneTrialPackaging(),
    stageRunId,
  });
}

/**
 * STAGE 2 — HEADLESS_BASE → IDENTITY_REFERENCE. Head region only; below-neck
 * locked. The identity reference is the mechanically cropped Talent head
 * envelope, never the full-body Talent plate.
 */
export function buildHeadlessStage2Request(
  input: {
    headlessBaseImageUrl: string;
    identityReferenceImageUrl: string;
    outputResolution?: HeadlessMannequinResolution;
    packaging?: NanoProStandaloneTrialPackaging;
  },
  stageRunId: string = newRunId(),
): HeadlessStageBuiltRequest {
  return buildStageRequest({
    stage: 2,
    prompt: HEADLESS_STAGE2_PROMPT,
    referenceOrder: HEADLESS_STAGE2_REFERENCE_ORDER,
    refUrls: [input.headlessBaseImageUrl, input.identityReferenceImageUrl],
    outputResolution: input.outputResolution,
    packaging: input.packaging ?? resolveNanoProStandaloneTrialPackaging(),
    stageRunId,
  });
}

export function redactHeadlessStageRequestForInspection(
  built: HeadlessStageBuiltRequest,
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
      `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: failed to fetch output image HTTP ${upstream.status}`,
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
  forensics: HeadlessStageBuiltRequest["forensics"];
  promptUsed: string;
  referenceOrder: readonly string[];
  httpStatus: number;
  imageDataUri: string;
  imageSha256_16: string;
};

async function callNanoProImagesOnce(
  built: HeadlessStageBuiltRequest,
  timeoutMs: number,
  trialRunId: string,
): Promise<StageCallResult> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    throw new Error(
      `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: OPENROUTER_API_KEY is not set`,
    );
  }

  logger.info(
    {
      experimental: true,
      experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
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
    "nano-pro-headless-mannequin-trial: starting OpenRouter Images API request",
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  let response: Response;
  try {
    response = await fetch(
      `${OPENROUTER_RENDERING_CONFIG.baseUrl}${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_ENDPOINT_PATH}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://studiolayer.ai",
          "X-Title": "StudioLayer AI Nano Pro Headless Mannequin Trial",
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
      `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME} Stage ${built.stage} OpenRouter error: HTTP ${response.status} — ${detail}`,
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
      `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: Stage ${built.stage} response OK but no image data found`,
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

type HeadlessStagePayload = {
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
  referenceOrder: readonly string[];
  imageSha256_16: string;
  promptUsed: string;
  forensics: HeadlessStageBuiltRequest["forensics"];
  imageDataUri: string;
  images: Array<{ url: string; index: number; width?: number; height?: number }>;
};

export type NanoProHeadlessMannequinTrialResult = {
  ok: boolean;
  experimental: true;
  experiment: typeof NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME;
  architecture: "headless-mannequin-identity-second";
  trialRunId: string;
  stage1RunId: string;
  stage2RunId: string;
  timestamp: string;
  engine: "nano_pro";
  cascade: false;
  nanoRegularInvoked: false;
  model: string;
  api: typeof NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_API;
  poseId: string;
  modelIdentityId: string | null;
  garmentId: string | null;
  resolutionRequested: "2K" | "4K";
  resolutionApplied: "2K" | "4K";
  packaging: NanoProStandaloneTrialPackaging;
  generationCalls: typeof HEADLESS_TRIAL_TOTAL_GENERATION_CALLS;
  creditsDeducted: 0;
  gallery: false;
  createsRenderRow: false;
  storagePrefix: "trial/nano-pro/";
  durationMs: number;
  stage1: HeadlessStagePayload;
  /** Mechanical masking performed between the two generation calls. */
  headMask: HeadlessMaskPayload;
  /** Mechanical identity crop performed between the two generation calls. */
  identityReference: HeadlessIdentityReferencePayload;
  stage2: HeadlessStagePayload & {
    headlessBaseSha256_16: string;
    unmaskedStage1Sha256_16: string;
    /** Hash of the ORIGINAL full-body Talent plate (not sent to Stage 2). */
    talentSha256_16: string;
    /** Hash of the cropped identity reference actually sent as Ref 2. */
    identityReferenceSha256_16: string;
    /** Hashes of the exact bytes sent as Stage-2 Ref 1 and Ref 2. */
    inputReferenceSha256_16: [string, string];
    requestContentSha256_16: string;
  };
  /** Final identity-applied result (Stage 2). */
  imageDataUri: string;
  images: Array<{ url: string; index: number; width?: number; height?: number }>;
};

/** Raised when masking cannot be trusted. Stage 2 is never attempted. */
export class HeadlessMaskFailureError extends Error {
  readonly trialRunId: string;
  readonly stage1: HeadlessStagePayload;
  readonly reasons: HeadMaskFailureReason[];
  readonly detail: string;
  readonly metrics: Partial<HeadMaskMetrics>;
  readonly httpStatus = 422;
  readonly generationCalls = 1 as const;

  constructor(params: {
    message: string;
    trialRunId: string;
    stage1: HeadlessStagePayload;
    reasons: HeadMaskFailureReason[];
    detail: string;
    metrics: Partial<HeadMaskMetrics>;
  }) {
    super(params.message);
    this.name = "HeadlessMaskFailureError";
    this.trialRunId = params.trialRunId;
    this.stage1 = params.stage1;
    this.reasons = params.reasons;
    this.detail = params.detail;
    this.metrics = params.metrics;
  }
}

/** Raised when the identity crop cannot be trusted. Stage 2 never runs. */
export class HeadlessIdentityReferenceFailureError extends Error {
  readonly trialRunId: string;
  readonly stage1: HeadlessStagePayload;
  readonly headMask: HeadlessMaskPayload;
  readonly reason: IdentityReferenceFailureReason;
  readonly detail: string;
  readonly httpStatus = 422;
  readonly generationCalls = 1 as const;

  constructor(params: {
    message: string;
    trialRunId: string;
    stage1: HeadlessStagePayload;
    headMask: HeadlessMaskPayload;
    reason: IdentityReferenceFailureReason;
    detail: string;
  }) {
    super(params.message);
    this.name = "HeadlessIdentityReferenceFailureError";
    this.trialRunId = params.trialRunId;
    this.stage1 = params.stage1;
    this.headMask = params.headMask;
    this.reason = params.reason;
    this.detail = params.detail;
  }
}

export class HeadlessStage2FailureError extends Error {
  readonly trialRunId: string;
  readonly stage1: HeadlessStagePayload;
  readonly stage2RunId: string | null;
  readonly httpStatus: number;

  constructor(params: {
    message: string;
    trialRunId: string;
    stage1: HeadlessStagePayload;
    stage2RunId?: string | null;
    httpStatus?: number;
  }) {
    super(params.message);
    this.name = "HeadlessStage2FailureError";
    this.trialRunId = params.trialRunId;
    this.stage1 = params.stage1;
    this.stage2RunId = params.stage2RunId ?? null;
    this.httpStatus = params.httpStatus ?? 500;
  }
}

/**
 * Read reference bytes for local mechanical processing. Data URIs are decoded
 * in place; remote references are fetched read-only. No transformation.
 */
async function loadImageBuffer(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith("data:")) {
    return dataUriToBuffer(imageUrl);
  }
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(
      `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: could not read Studio Talent reference (${response.status})`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

function toStagePayload(call: StageCallResult): HeadlessStagePayload {
  return {
    stageRunId: call.stageRunId,
    model: call.model,
    openRouterProvider: call.openRouterProvider,
    openRouterRequestId: call.openRouterRequestId,
    resolution: call.resolutionApplied,
    resolutionValid: call.resolutionValid,
    resolutionMismatch: call.resolutionMismatch,
    resolutionValidationError: call.resolutionValidationError,
    outputDimensions: call.outputDimensions,
    durationMs: call.durationMs,
    referenceOrder: call.referenceOrder,
    imageSha256_16: call.imageSha256_16,
    promptUsed: call.promptUsed,
    forensics: call.forensics,
    imageDataUri: call.imageDataUri,
    images: [
      {
        url: call.imageDataUri,
        index: 0,
        width: call.outputDimensions?.width,
        height: call.outputDimensions?.height,
      },
    ],
  };
}

/**
 * Exactly TWO provider calls. Stage 1 headless, then Stage 2 identity.
 * If Stage 1 fails, Stage 2 never runs.
 */
export async function generateNanoProHeadlessMannequinTrial(
  input: NanoProHeadlessMannequinTrialInput,
): Promise<NanoProHeadlessMannequinTrialResult> {
  const trialRunId = newRunId();
  const timeoutMs =
    input.timeoutMs ?? Number(process.env["OR_RENDER_TIMEOUT_MS"] ?? 180_000);
  const packaging =
    input.packaging ?? resolveNanoProStandaloneTrialPackaging();

  const stage1Built = buildHeadlessStage1Request(
    {
      garmentImageUrl: input.garmentImageUrl,
      poseImageUrl: input.poseImageUrl,
      furnitureReferenceImageUrl: input.furnitureReferenceImageUrl,
      creativeShotPrompt: input.creativeShotPrompt,
      outputResolution: input.outputResolution,
      packaging,
    },
    newRunId(),
  );

  const stage1Call = await callNanoProImagesOnce(
    stage1Built,
    timeoutMs,
    trialRunId,
  );

  if (!stage1Call.imageDataUri) {
    throw new Error(
      `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: Stage 1 produced no valid image — Stage 2 will not run`,
    );
  }

  const stage1Payload = toStagePayload(stage1Call);

  // ── LOCAL MECHANICAL HEAD MASK — between the two generation calls ────────
  // This is segmentation + compositing, not generation. If it cannot produce a
  // confidently correct headless image, Stage 2 must never run.
  const stage1Buffer = dataUriToBuffer(stage1Call.imageDataUri);
  const maskResult = await neutralizeHeadRegion({
    imageBuffer: stage1Buffer,
    segmentationProvider: input.segmentationProvider,
    trialRunId,
  });

  if (!maskResult.ok) {
    throw new HeadlessMaskFailureError({
      message: `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: head masking failed — Stage 2 aborted (${maskResult.reasons.join(", ")})`,
      trialRunId,
      stage1: stage1Payload,
      reasons: maskResult.reasons,
      detail: maskResult.detail,
      metrics: maskResult.metrics,
    });
  }

  const headMask: HeadlessMaskPayload = {
    applied: true,
    method: "evf-sam + deterministic cleanup + yunet face anchor",
    segmentationModel: HEAD_SEGMENTATION_MODEL,
    plateGray: HEAD_PLATE_GRAY,
    originalStage1Sha256_16: maskResult.originalSha256_16,
    maskedStage1Sha256_16: maskResult.maskedSha256_16,
    width: maskResult.width,
    height: maskResult.height,
    metrics: maskResult.metrics,
    maskedImageDataUri: maskResult.maskedDataUri,
  };

  // ── LOCAL MECHANICAL IDENTITY CROP — between the two generation calls ────
  // Detect + crop + resample of the ORIGINAL Talent bytes. No generation.
  // The full-body Talent plate is never sent to Stage 2.
  const talentBuffer = await loadImageBuffer(input.talentImageUrl);
  const identityResult = await buildTalentIdentityReference({
    talentImageBuffer: talentBuffer,
    faceAnchorDetector: input.identityFaceAnchorDetector,
    trialRunId,
  });

  if (!identityResult.ok) {
    throw new HeadlessIdentityReferenceFailureError({
      message: `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: identity reference could not be derived — Stage 2 aborted (${identityResult.reason})`,
      trialRunId,
      stage1: stage1Payload,
      headMask,
      reason: identityResult.reason,
      detail: identityResult.detail,
    });
  }

  const identityReference: HeadlessIdentityReferencePayload = {
    derived: true,
    method: "yunet face anchor + deterministic head-envelope crop + uniform upscale",
    faceDetector: "yunet",
    generative: false,
    sourceTalentSha256_16: identityResult.sourceSha256_16,
    identityReferenceSha256_16: identityResult.identitySha256_16,
    sourceDimensions: {
      width: identityResult.sourceWidth,
      height: identityResult.sourceHeight,
    },
    dimensions: { width: identityResult.width, height: identityResult.height },
    cropRegion: identityResult.cropRegion,
    scaleFactor: identityResult.scaleFactor,
    faceBox: identityResult.face,
    faceCoverageOfSourcePct: identityResult.faceCoverageOfSourcePct,
    faceCoverageOfReferencePct: identityResult.faceCoverageOfReferencePct,
  };

  // Stage 2 receives the MASKED bytes — never the original Stage-1 bytes.
  const headlessBaseImageUrl = maskResult.maskedDataUri;
  const identityReferenceImageUrl = identityResult.dataUri;

  const stage2Built = buildHeadlessStage2Request(
    {
      headlessBaseImageUrl,
      identityReferenceImageUrl,
      outputResolution: input.outputResolution,
      packaging,
    },
    newRunId(),
  );

  const stage2Ref1 = stage2Built.body.input_references[0]!.image_url.url;
  if (stage2Ref1 !== headlessBaseImageUrl) {
    throw new Error(
      `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: masked Stage-1 bytes were altered before Stage 2`,
    );
  }
  if (stage2Ref1 === stage1Call.imageDataUri) {
    throw new Error(
      `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: Stage 2 received the UNMASKED Stage-1 image`,
    );
  }

  const stage2Ref2 = stage2Built.body.input_references[1]!.image_url.url;
  if (stage2Ref2 !== identityReferenceImageUrl) {
    throw new Error(
      `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: identity reference bytes were altered before Stage 2`,
    );
  }
  if (stage2Ref2 === input.talentImageUrl) {
    throw new Error(
      `${NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME}: Stage 2 received the FULL-BODY Talent image instead of the identity reference`,
    );
  }

  let stage2Call: StageCallResult;
  try {
    stage2Call = await callNanoProImagesOnce(stage2Built, timeoutMs, trialRunId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const httpStatus =
      typeof (error as { httpStatus?: number }).httpStatus === "number"
        ? (error as { httpStatus: number }).httpStatus
        : 500;
    throw new HeadlessStage2FailureError({
      message,
      trialRunId,
      stage1: stage1Payload,
      stage2RunId: stage2Built.stageRunId,
      httpStatus,
    });
  }

  const talentMeta = describeImageRefForForensics(input.talentImageUrl);

  const stage2Payload: NanoProHeadlessMannequinTrialResult["stage2"] = {
    ...toStagePayload(stage2Call),
    headlessBaseSha256_16: maskResult.maskedSha256_16,
    unmaskedStage1Sha256_16: stage1Call.imageSha256_16,
    talentSha256_16: talentMeta.sha256_16,
    identityReferenceSha256_16: identityResult.identitySha256_16,
    inputReferenceSha256_16: [
      stage2Built.forensics.refs[0]!.meta.sha256_16,
      stage2Built.forensics.refs[1]!.meta.sha256_16,
    ],
    requestContentSha256_16: stage2Call.forensics.requestContentSha256_16,
  };

  const ok =
    stage1Call.resolutionValid &&
    stage2Call.resolutionValid &&
    !stage1Call.resolutionMismatch &&
    !stage2Call.resolutionMismatch;

  return {
    ok,
    experimental: true,
    experiment: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
    architecture: "headless-mannequin-identity-second",
    trialRunId,
    stage1RunId: stage1Call.stageRunId,
    stage2RunId: stage2Call.stageRunId,
    timestamp: new Date().toISOString(),
    engine: "nano_pro",
    cascade: false,
    nanoRegularInvoked: false,
    model: stage2Call.model,
    api: NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_API,
    poseId: input.poseId,
    modelIdentityId: input.modelIdentityId ?? null,
    garmentId: input.garmentId ?? null,
    resolutionRequested: stage2Call.resolutionRequested,
    resolutionApplied: stage2Call.resolutionApplied,
    packaging,
    generationCalls: HEADLESS_TRIAL_TOTAL_GENERATION_CALLS,
    creditsDeducted: 0,
    gallery: false,
    createsRenderRow: false,
    storagePrefix: "trial/nano-pro/",
    durationMs: stage1Call.durationMs + stage2Call.durationMs,
    stage1: stage1Payload,
    headMask,
    identityReference,
    stage2: stage2Payload,
    imageDataUri: stage2Call.imageDataUri,
    images: stage2Payload.images,
  };
}
