// ---------------------------------------------------------------------------
// StudioLayer AI — OpenRouter Rendering Service — OpenRouterProvider
//
// Responsibilities (spec §5):
//   • Authenticate with OpenRouter using OPENROUTER_API_KEY
//   • Accept garment image, model image, user prompt, and shot count
//   • Return generated image URLs
//   • Handle API errors gracefully
//   • Retry once on transient failure
//   • Log request duration
//
// The application NEVER calls OpenRouter directly — all calls go through
// RenderingEngine → OpenRouterProvider → OpenRouter API.
// ---------------------------------------------------------------------------

import { logger } from "../../../lib/logger.js";
import {
  logOpenRouterRequest,
  PipelineStage,
  type PipelineTraceContext,
} from "../../../lib/render-pipeline-observability.js";
import { traceRenderFailure } from "../../../lib/render-pipeline-trace.js";
import {
  OPENROUTER_RENDERING_CONFIG,
  resolveOpenRouterModelForResolution,
  buildSurfaceComponentEvidencePrinciple,
  isNanoBananaProEngine,
  isFluxMaxEngine,
  resolveNanoProImageResolution,
  resolveOpenRouterRenderEngine,
  type OpenRouterRenderEngine,
  type NativeOutputResolution,
  V1_CREATE_USE_NANO_PRO_CASCADE,
} from "../rendering.config.js";
import {
  assembleNanoProImagesApiPrompt,
  mapImagePartsToNanoProInputReferences,
} from "../nano-pro-authority-layers.js";
import {
  assembleFluxMaxImagesApiPrompt,
  buildFluxMaxImagesApiRequestBody,
  mapImagePartsToFluxMaxInputReferences,
} from "../flux-max-request.js";
import {
  assembleCreateStage2FaceIdentityInstruction,
  buildCreateStage2ImageParts,
} from "../create-cascade-stage2.js";
import { retargetGarmentInstructionTalentReferences } from "../../image-processing/garment-evidence-set.js";
import { describeOpenRouterAttemptFailure, shouldRetryOpenRouterAttempt } from "../../generation-lifecycle.js";
import { validateNativeResolutionFromDataUri } from "../native-resolution.js";
import {
  logIdentityForensics,
  type IdentityForensicsContext,
} from "../identity-forensics.js";
import { buildOpenRouterRequestEvidenceMetadata } from "../openrouter-request-evidence.js";
import {
  emptyOpenRouterResponseTelemetry,
  logOpenRouterShotTiming,
  mergeOpenRouterResponseTelemetry,
  tryParseOpenRouterJson,
  type OpenRouterResponseTelemetry,
  type OpenRouterShotFailurePhase,
} from "../openrouter-shot-telemetry.js";
import type {
  RenderingProvider,
  ProviderInput,
  GeneratedImage,
  ShotCount,
} from "../types.js";

/** Unchanged Campaign/Hero/Editorial fan-out stagger — do not alter. */
export const OPENROUTER_SHOT_STAGGER_MS = 150;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract image URL(s) from an OpenRouter chat-completion response.
 *
 * OpenRouter image-generation models (e.g. google/gemini-*-image) place
 * generated images in message.images — a non-standard field alongside the
 * standard message.content (which is null for pure image responses).
 *
 * Shape confirmed against live API:
 *   choices[0].message.images = [{ type: "image_url", image_url: { url: "data:..." } }]
 *
 * Falls back to scanning message.content parts for safety.
 */
function extractImageUrls(responseBody: unknown): string[] {
  const body = responseBody as Record<string, unknown>;
  const choices = body?.["choices"] as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(choices) || choices.length === 0) return [];

  const urls: string[] = [];

  /** Pull image URLs out of an array of image_url parts (used by both images and content). */
  function extractFromParts(parts: Array<Record<string, unknown>>): void {
    for (const part of parts) {
      if (part["type"] === "image_url") {
        const imageUrl = part["image_url"] as Record<string, string> | undefined;
        if (imageUrl?.["url"]) urls.push(imageUrl["url"]);
      } else if (part["type"] === "text") {
        const text = part["text"] as string | undefined;
        if (text && (text.startsWith("http") || text.startsWith("data:"))) {
          urls.push(text.trim());
        }
      }
    }
  }

  for (const choice of choices) {
    const message = choice?.["message"] as Record<string, unknown> | undefined;
    if (!message) continue;

    // ── Primary: message.images (OpenRouter image-gen models) ───────────────
    const images = message["images"];
    if (Array.isArray(images) && images.length > 0) {
      extractFromParts(images as Array<Record<string, unknown>>);
      continue; // images field is authoritative — skip content scan
    }

    // ── Fallback: message.content (standard chat completions shape) ──────────
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

/** Extract image data-URIs from OpenRouter Images API (`POST /api/v1/images`) response. */
function extractImageUrlsFromImagesApi(responseBody: unknown): string[] {
  if (!responseBody || typeof responseBody !== "object") return [];
  const data = (responseBody as { data?: unknown }).data;
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

/**
 * Execute a single image-generation request against OpenRouter.
 * Returns the extracted image URLs from the response.
 */
function emitShotTiming(params: {
  pipelineTrace: PipelineTraceContext | undefined;
  shotIndex: number;
  attempt: number;
  model: string;
  imageSize: NativeOutputResolution;
  httpStatus: number | null;
  success: boolean;
  failurePhase: OpenRouterShotFailurePhase | null;
  error: unknown;
  telemetry: OpenRouterResponseTelemetry;
  fetchStartMs: number;
  headersAtMs: number | null;
  bodyCompleteAtMs: number | null;
  parseCompleteAtMs: number | null;
}): void {
  logOpenRouterShotTiming(params.pipelineTrace, {
    shotIndex: params.shotIndex,
    attempt: params.attempt,
    model: params.model,
    imageSize: params.imageSize,
    httpStatus: params.httpStatus,
    success: params.success,
    failurePhase: params.failurePhase,
    errorMessage: params.error
      ? describeOpenRouterAttemptFailure(params.error)
      : null,
    openrouterRequestId: params.telemetry.openrouterRequestId,
    headerRequestId: params.telemetry.headerRequestId,
    provider: params.telemetry.provider,
    finishReason: params.telemetry.finishReason,
    promptTokens: params.telemetry.usage.promptTokens,
    completionTokens: params.telemetry.usage.completionTokens,
    totalTokens: params.telemetry.usage.totalTokens,
    fetchStartMs: params.fetchStartMs,
    headersAtMs: params.headersAtMs,
    bodyCompleteAtMs: params.bodyCompleteAtMs,
    parseCompleteAtMs: params.parseCompleteAtMs,
    shotCompleteMs: Date.now(),
  });
}

/**
 * Fresh-generation OpenRouter image parts.
 * Ref 1 = original Front garment (primary construction authority).
 * Optional supplemental sheet / Back / Detail follow Front.
 * Then talent, then optional pose.
 */
export function buildFreshGenerationImageParts(params: {
  garmentImageUrl: string;
  modelImageUrl: string;
  poseReferenceImageUrl?: string;
  previousOutputUrl?: string;
  garmentEvidencePackaging?: "sheet" | "separate";
  garmentReferenceSheetImageUrl?: string;
  garmentBackImageUrl?: string;
  garmentDetailImageUrl?: string;
  /** Extra Talent identity images (same person), after primary modelImageUrl. */
  additionalTalentImageUrls?: string[];
}): Array<{
  type: "image_url";
  image_url: { url: string; detail: "high" };
}> {
  const {
    garmentImageUrl,
    modelImageUrl,
    poseReferenceImageUrl,
    previousOutputUrl,
    garmentEvidencePackaging,
    garmentReferenceSheetImageUrl,
    garmentBackImageUrl,
    garmentDetailImageUrl,
    additionalTalentImageUrls,
  } = params;

  const toPart = (url: string) => ({
    type: "image_url" as const,
    image_url: {
      url,
      detail: "high" as const,
    },
  });

  const useSeparateEvidence =
    garmentEvidencePackaging === "separate"
    && Boolean(garmentBackImageUrl || garmentDetailImageUrl);

  const useSupplementalSheet =
    garmentEvidencePackaging === "sheet"
    && Boolean(garmentReferenceSheetImageUrl);

  const garmentParts = useSeparateEvidence
    ? [
        toPart(garmentImageUrl),
        ...(garmentBackImageUrl ? [toPart(garmentBackImageUrl)] : []),
        ...(garmentDetailImageUrl ? [toPart(garmentDetailImageUrl)] : []),
      ]
    : useSupplementalSheet
      ? [
          toPart(garmentImageUrl),
          toPart(garmentReferenceSheetImageUrl!),
        ]
      : [toPart(garmentImageUrl)];

  const talentExtras = (additionalTalentImageUrls ?? [])
    .filter((url) => typeof url === "string" && url.trim().length > 0 && url !== modelImageUrl)
    .map(toPart);

  return [
    ...garmentParts,
    toPart(modelImageUrl),
    ...talentExtras,
    ...(poseReferenceImageUrl ? [toPart(poseReferenceImageUrl)] : []),
    ...(previousOutputUrl ? [toPart(previousOutputUrl)] : []),
  ];
}

export type AssembleFreshGenerationPrimaryInstructionParams = {
  /** Sheet-mode panel correspondence — omitted in separate mode. */
  sheetCorrespondenceInstruction?: string;
  /** Separate-mode evidence-set mapping with dynamic Ref numbers. */
  evidenceSetMappingInstruction?: string;
  /** Talent Reference Image index (default 2). */
  talentReferenceImageNumber?: number;
};

/**
 * Fresh-generation primary text:
 * optional evidence-set mapping + garment fidelity + surface principle
 * + optional sheet correspondence.
 */
export function assembleFreshGenerationPrimaryInstruction(
  sheetOrParams?: string | AssembleFreshGenerationPrimaryInstructionParams,
): string {
  // Backward-compatible: string arg = sheet correspondence only (Talent = Ref 2).
  const params: AssembleFreshGenerationPrimaryInstructionParams =
    typeof sheetOrParams === "string"
      ? { sheetCorrespondenceInstruction: sheetOrParams }
      : (sheetOrParams ?? {});

  const talentRef = params.talentReferenceImageNumber ?? 2;
  const garmentInstruction = retargetGarmentInstructionTalentReferences(
    OPENROUTER_RENDERING_CONFIG.garmentInstruction,
    talentRef,
  );
  const principle = buildSurfaceComponentEvidencePrinciple(talentRef);

  const parts: string[] = [];
  if (params.evidenceSetMappingInstruction?.trim()) {
    parts.push(params.evidenceSetMappingInstruction.trim());
  }
  parts.push(garmentInstruction);
  parts.push(principle);
  if (params.sheetCorrespondenceInstruction?.trim()) {
    parts.push(params.sheetCorrespondenceInstruction.trim());
  }
  return parts.join("\n\n");
}

async function callOpenRouter(
  prompt: string,
  garmentImageUrl: string,
  modelImageUrl: string,
  apiKey: string,
  timeoutMs: number,
  shotIndex: number,
  attempt: number,
  pipelineTrace: PipelineTraceContext | undefined,
  previousOutputUrl?: string,
  refinementInstruction?: string,
  outputResolution: NativeOutputResolution = "2K",
  poseReferenceImageUrl?: string,
  garmentReferenceCorrespondenceInstruction?: string,
  garmentEvidencePackaging?: "sheet" | "separate",
  garmentReferenceSheetImageUrl?: string,
  garmentBackImageUrl?: string,
  garmentDetailImageUrl?: string,
  garmentEvidenceSetMappingInstruction?: string,
  garmentEvidenceTalentReferenceImageNumber?: number,
  identityForensics?: IdentityForensicsContext,
  locationEnvironment?: string | null,
  additionalTalentImageUrls?: string[],
  /** Observability only — Back/Detail supplied to garment preparation. */
  garmentEvidenceHasBack?: boolean,
  garmentEvidenceHasDetail?: boolean,
  garmentReferenceMode?: string,
  /** Per-call Create cascade engine (wins over OR_RENDER_ENGINE). */
  engineOverride?: OpenRouterRenderEngine,
  /** Create cascade stage for evidence / packaging. */
  createStage?: 1 | 2,
  /** Stage-2 only — Stage-1 output image URL. */
  stage1ImageUrl?: string,
  /** Stage-1 Nano Pro — pose requires support furniture. */
  furnitureRequired?: boolean,
): Promise<{ urls: string[]; httpStatus: number; fetchDurationMs: number; parseDurationMs: number }> {
  const routingProvider = OPENROUTER_RENDERING_CONFIG.provider;
  const isRefinementEdit =
    Boolean(refinementInstruction) && Boolean(previousOutputUrl);
  const isCreateStage2 =
    createStage === 2 && Boolean(stage1ImageUrl) && !isRefinementEdit;
  // Engine gates are mutually exclusive for fresh Create. Refinement always
  // stays on the Flash chat path (defaultModel) — unchanged for all engines.
  // isFluxMaxEngine() is permanently false — FLUX.2 Max is not an active
  // production Create engine (dormant branch retained for historical code).
  const useFluxMaxImagesApi = isFluxMaxEngine() && !isRefinementEdit;
  const useNanoProImagesApi =
    isNanoBananaProEngine(engineOverride) && !isRefinementEdit && !isCreateStage2;
  const resolvedEngine = resolveOpenRouterRenderEngine(engineOverride);
  const model = isRefinementEdit
    ? OPENROUTER_RENDERING_CONFIG.defaultModel
    : resolveOpenRouterModelForResolution(outputResolution, engineOverride);
  const fetchStartMs = Date.now();
  let headersAtMs: number | null = null;
  let bodyCompleteAtMs: number | null = null;
  let parseCompleteAtMs: number | null = null;
  let telemetry = emptyOpenRouterResponseTelemetry();

  if (pipelineTrace) {
    logOpenRouterRequest(pipelineTrace, "started", {
      shotIndex,
      attempt,
      model,
      provider: routingProvider,
      durationMs: 0,
      timeoutMs,
      success: true,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const primaryInstruction = isCreateStage2
    ? assembleCreateStage2FaceIdentityInstruction()
    : isRefinementEdit
      ? `${OPENROUTER_RENDERING_CONFIG.refinementEditInstruction}\n\n${refinementInstruction}`
      : assembleFreshGenerationPrimaryInstruction({
          sheetCorrespondenceInstruction: garmentReferenceCorrespondenceInstruction,
          evidenceSetMappingInstruction: garmentEvidenceSetMappingInstruction,
          talentReferenceImageNumber: garmentEvidenceTalentReferenceImageNumber,
        });

  const poseIdForShot =
    identityForensics?.perShotPoseIds?.[shotIndex] ?? null;

  // Stage-2: never attach Pose Master; Stage-1 image is primary visual authority.
  const effectivePoseReferenceUrl = isCreateStage2
    ? undefined
    : poseReferenceImageUrl;

  const imageContent = isCreateStage2
    ? buildCreateStage2ImageParts({
        stage1ImageUrl: stage1ImageUrl!,
        talentImageUrl: modelImageUrl,
      })
    : isRefinementEdit
      ? [
          {
            type: "image_url" as const,
            image_url: {
              url: garmentImageUrl,
              detail: "high" as const,
            },
          },
          {
            type: "image_url" as const,
            image_url: {
              url: previousOutputUrl!,
              detail: "high" as const,
            },
          },
        ]
      : buildFreshGenerationImageParts({
          garmentImageUrl,
          modelImageUrl,
          poseReferenceImageUrl: effectivePoseReferenceUrl,
          previousOutputUrl,
          garmentEvidencePackaging,
          garmentReferenceSheetImageUrl,
          garmentBackImageUrl,
          garmentDetailImageUrl,
          additionalTalentImageUrls,
        });

  if (!isRefinementEdit) {
    logIdentityForensics({
      renderId: pipelineTrace?.primaryRenderId,
      generationSessionId: pipelineTrace?.generationSessionId,
      generationMode: identityForensics?.generationMode ?? "Hero",
      shotIndex,
      modelIdentityId: identityForensics?.modelIdentityId,
      talentAssetPath: identityForensics?.talentAssetPath,
      modelImageUrl,
      poseId: poseIdForShot,
      poseAssetPath: identityForensics?.perShotPoseAssetPaths?.[shotIndex],
      poseReferenceImageUrl: effectivePoseReferenceUrl,
      garmentEvidencePackaging,
      garmentReferenceSheetImageUrl,
      garmentBackImageUrl,
      garmentDetailImageUrl,
      openRouterModel: model,
      outputResolution,
      aspectRatio: OPENROUTER_RENDERING_CONFIG.outputAspectRatio,
    });
  }

  // Temporary Create evidence log — semantic metadata only (no URLs / bytes / prompts).
  if (!isRefinementEdit) {
    const evidence = buildOpenRouterRequestEvidenceMetadata({
      renderId: pipelineTrace?.primaryRenderId,
      shotIndex,
      resolvedModel: model,
      resolvedEngine,
      createStage: createStage ?? null,
      hasStage1Image: isCreateStage2,
      garmentEvidencePackaging,
      evidenceMode: garmentEvidencePackaging ?? null,
      garmentReferenceMode: garmentReferenceMode ?? null,
      hasBackGarmentInput: garmentEvidenceHasBack,
      hasDetailGarmentInput: garmentEvidenceHasDetail,
      garmentImageUrl,
      garmentReferenceSheetImageUrl,
      garmentBackImageUrl,
      garmentDetailImageUrl,
      modelImageUrl,
      poseReferenceImageUrl: effectivePoseReferenceUrl,
      previousOutputUrl: isCreateStage2 ? undefined : previousOutputUrl,
      additionalTalentImageUrls,
      finalImagePartCount: imageContent.length,
    });
    logger.info(evidence, "[CREATE EVIDENCE] final OpenRouter image request");
  }

  let response: Response;
  try {
    const useImagesApi = useFluxMaxImagesApi || useNanoProImagesApi;
    const requestUrl = useImagesApi
      ? `${OPENROUTER_RENDERING_CONFIG.baseUrl}/images`
      : `${OPENROUTER_RENDERING_CONFIG.baseUrl}/chat/completions`;

    // ── FLUX.2 Max (Images API) — separate prompt + schema; does not reuse
    // Nano Pro assembler or Flash chat body. ────────────────────────────────
    let requestBody: Record<string, unknown>;
    if (useFluxMaxImagesApi) {
      const talentImageCount =
        1 + (additionalTalentImageUrls?.filter(Boolean).length ?? 0);
      const garmentImageCount = Math.max(
        1,
        imageContent.length
          - talentImageCount
          - (effectivePoseReferenceUrl ? 1 : 0)
          - (previousOutputUrl ? 1 : 0),
      );
      const fluxPrompt = assembleFluxMaxImagesApiPrompt({
        garmentImageCount,
        talentImageCount,
        hasPoseReference: Boolean(effectivePoseReferenceUrl),
        locationEnvironment,
        creativeShotPrompt: prompt?.trim() ? prompt.trim() : undefined,
      });
      const fluxBuilt = buildFluxMaxImagesApiRequestBody({
        model,
        prompt: fluxPrompt,
        input_references: mapImagePartsToFluxMaxInputReferences(imageContent),
        studioUiResolution: outputResolution,
      });
      requestBody = fluxBuilt.body as unknown as Record<string, unknown>;
    } else if (useNanoProImagesApi) {
      // V1 Create — fixed white studio; ignore caller locationEnvironment.
      const nanoProPrompt = assembleNanoProImagesApiPrompt({
        hasPoseReference: Boolean(effectivePoseReferenceUrl),
        talentIdentityImageCount:
          1 + (additionalTalentImageUrls?.filter(Boolean).length ?? 0),
        locationEnvironment: null,
        primaryInstruction,
        creativeShotPrompt: prompt?.trim() ? prompt.trim() : undefined,
        talentReferenceImageNumber:
          garmentEvidenceTalentReferenceImageNumber ?? 2,
        furnitureRequired: Boolean(furnitureRequired),
      });
      requestBody = {
        model,
        prompt: nanoProPrompt,
        n: 1,
        aspect_ratio: OPENROUTER_RENDERING_CONFIG.outputAspectRatio,
        resolution: resolveNanoProImageResolution(outputResolution),
        input_references: mapImagePartsToNanoProInputReferences(imageContent),
      };
    } else {
      // Flash chat path.
      // Refinement + Stage-2 use the in-place edit contract (no generative modalities).
      // Fresh Create Stage-1 (non-cascade flash) keeps modalities + image_config.
      requestBody = {
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: primaryInstruction,
              },
              ...imageContent,
              ...(prompt && !isRefinementEdit && !isCreateStage2
                ? [{ type: "text" as const, text: prompt }]
                : []),
            ],
          },
        ],
        ...(!isRefinementEdit && !isCreateStage2
          ? {
              modalities: ["image", "text"],
              image_config: {
                aspect_ratio: OPENROUTER_RENDERING_CONFIG.outputAspectRatio,
                image_size: outputResolution,
              },
            }
          : {}),
      };
    }

    response = await fetch(requestUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://studiolayer.ai",
        "X-Title": "StudioLayer AI",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    emitShotTiming({
      pipelineTrace,
      shotIndex,
      attempt,
      model,
      imageSize: outputResolution,
      httpStatus: null,
      success: false,
      failurePhase: "fetch",
      error,
      telemetry,
      fetchStartMs,
      headersAtMs,
      bodyCompleteAtMs,
      parseCompleteAtMs,
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }

  headersAtMs = Date.now();
  const fetchDurationMs = headersAtMs - fetchStartMs;
  telemetry = emptyOpenRouterResponseTelemetry(response.headers);

  if (pipelineTrace) {
    logOpenRouterRequest(pipelineTrace, "response_received", {
      shotIndex,
      attempt,
      model,
      provider: routingProvider,
      durationMs: fetchDurationMs,
      timeoutMs,
      httpStatus: response.status,
      success: response.ok,
    });
  }

  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (error) {
    emitShotTiming({
      pipelineTrace,
      shotIndex,
      attempt,
      model,
      imageSize: outputResolution,
      httpStatus: response.status,
      success: false,
      failurePhase: "body",
      error,
      telemetry,
      fetchStartMs,
      headersAtMs,
      bodyCompleteAtMs,
      parseCompleteAtMs,
    });
    throw error;
  }
  bodyCompleteAtMs = Date.now();

  const parsedBody = tryParseOpenRouterJson(bodyText);
  if (parsedBody != null) {
    telemetry = mergeOpenRouterResponseTelemetry(response.headers, parsedBody);
  }
  parseCompleteAtMs = Date.now();
  const parseDurationMs = parseCompleteAtMs - bodyCompleteAtMs;

  if (!response.ok) {
    const err = new Error(
      `OpenRouter API error: HTTP ${response.status}`,
    );
    emitShotTiming({
      pipelineTrace,
      shotIndex,
      attempt,
      model,
      imageSize: outputResolution,
      httpStatus: response.status,
      success: false,
      failurePhase: "http",
      error: err,
      telemetry,
      fetchStartMs,
      headersAtMs,
      bodyCompleteAtMs,
      parseCompleteAtMs,
    });
    if (pipelineTrace) {
      logOpenRouterRequest(pipelineTrace, "attempt_failed", {
        shotIndex,
        attempt,
        model,
        provider: routingProvider,
        durationMs: fetchDurationMs,
        timeoutMs,
        httpStatus: response.status,
        success: false,
        errorMessage: err.message,
      });
    }
    traceRenderFailure(PipelineStage.OPENROUTER_RESPONSE_RECEIVED, err, {
      pipelineTrace,
      shotIndex,
      attempt,
      httpStatus: response.status,
      providerErrorLength: bodyText.length,
    });
    throw err;
  }

  if (parsedBody == null) {
    const err = new Error("OpenRouter response was not valid JSON");
    emitShotTiming({
      pipelineTrace,
      shotIndex,
      attempt,
      model,
      imageSize: outputResolution,
      httpStatus: response.status,
      success: false,
      failurePhase: "parse",
      error: err,
      telemetry,
      fetchStartMs,
      headersAtMs,
      bodyCompleteAtMs,
      parseCompleteAtMs,
    });
    throw err;
  }

  const urls =
    useFluxMaxImagesApi || useNanoProImagesApi
      ? extractImageUrlsFromImagesApi(parsedBody)
      : extractImageUrls(parsedBody);

  // Gemini native 2K/4K pixel gates do not apply to FLUX.2 Max (no resolution
  // field; provider-native megapixel output). Flash + Nano Pro unchanged.
  if (!isRefinementEdit && !isCreateStage2 && !useFluxMaxImagesApi) {
    for (const url of urls) {
      if (url.startsWith("data:")) {
        validateNativeResolutionFromDataUri(url, outputResolution);
      }
    }
  }

  emitShotTiming({
    pipelineTrace,
    shotIndex,
    attempt,
    model,
    imageSize: outputResolution,
    httpStatus: response.status,
    success: urls.length > 0,
    failurePhase: null,
    error: null,
    telemetry,
    fetchStartMs,
    headersAtMs,
    bodyCompleteAtMs,
    parseCompleteAtMs,
  });

  if (pipelineTrace) {
    logOpenRouterRequest(pipelineTrace, "image_download_completed", {
      shotIndex,
      attempt,
      model,
      provider: routingProvider,
      durationMs: parseDurationMs,
      timeoutMs,
      httpStatus: response.status,
      success: urls.length > 0,
    });
  }

  return {
    urls,
    httpStatus: response.status,
    fetchDurationMs,
    parseDurationMs,
  };
}

/**
 * Single-shot generation with one automatic retry on transient failure (spec §5).
 */
async function generateSingleShot(
  prompt: string,
  garmentImageUrl: string,
  modelImageUrl: string,
  apiKey: string,
  shotIndex: number,
  pipelineTrace: PipelineTraceContext | undefined,
  previousOutputUrl?: string,
  refinementInstruction?: string,
  outputResolution: NativeOutputResolution = "2K",
  poseReferenceImageUrl?: string,
  garmentReferenceCorrespondenceInstruction?: string,
  garmentEvidencePackaging?: "sheet" | "separate",
  garmentReferenceSheetImageUrl?: string,
  garmentBackImageUrl?: string,
  garmentDetailImageUrl?: string,
  garmentEvidenceSetMappingInstruction?: string,
  garmentEvidenceTalentReferenceImageNumber?: number,
  identityForensics?: IdentityForensicsContext,
  locationEnvironment?: string | null,
  additionalTalentImageUrls?: string[],
  garmentEvidenceHasBack?: boolean,
  garmentEvidenceHasDetail?: boolean,
  garmentReferenceMode?: string,
  engineOverride?: OpenRouterRenderEngine,
  createStage?: 1 | 2,
  stage1ImageUrl?: string,
  furnitureRequired?: boolean,
): Promise<string | null> {
  const { timeoutMs, retryCount } = OPENROUTER_RENDERING_CONFIG;
  const provider = OPENROUTER_RENDERING_CONFIG.provider;
  const isRefinementEdit =
    Boolean(refinementInstruction) && Boolean(previousOutputUrl);
  const model = isRefinementEdit
    ? OPENROUTER_RENDERING_CONFIG.defaultModel
    : resolveOpenRouterModelForResolution(outputResolution, engineOverride);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const t0 = Date.now();

    try {
      const result = await callOpenRouter(
        prompt,
        garmentImageUrl,
        modelImageUrl,
        apiKey,
        timeoutMs,
        shotIndex,
        attempt,
        pipelineTrace,
        previousOutputUrl,
        refinementInstruction,
        outputResolution,
        poseReferenceImageUrl,
        garmentReferenceCorrespondenceInstruction,
        garmentEvidencePackaging,
        garmentReferenceSheetImageUrl,
        garmentBackImageUrl,
        garmentDetailImageUrl,
        garmentEvidenceSetMappingInstruction,
        garmentEvidenceTalentReferenceImageNumber,
        identityForensics,
        locationEnvironment,
        additionalTalentImageUrls,
        garmentEvidenceHasBack,
        garmentEvidenceHasDetail,
        garmentReferenceMode,
        engineOverride,
        createStage,
        stage1ImageUrl,
        furnitureRequired,
      );
      const durationMs = Date.now() - t0;

      logger.info(
        {
          provider,
          model,
          shotIndex,
          attempt,
          durationMs,
          urlsReturned: result.urls.length,
          createStage: createStage ?? null,
          engineOverride: engineOverride ?? null,
          ...(pipelineTrace
            ? {
                generationSessionId: pipelineTrace.generationSessionId,
                renderId: pipelineTrace.primaryRenderId,
              }
            : {}),
        },
        "OpenRouterProvider: shot generated",
      );

      if (result.urls.length > 0) return result.urls[0]!;

      lastError = new Error("No image URLs in OpenRouter response");
      if (pipelineTrace) {
        logOpenRouterRequest(pipelineTrace, "attempt_failed", {
          shotIndex,
          attempt,
          model,
          provider,
          durationMs,
          timeoutMs,
          httpStatus: result.httpStatus,
          success: false,
          errorMessage: describeOpenRouterAttemptFailure(lastError),
        });
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const durationMs = Date.now() - t0;
      if (pipelineTrace) {
        logOpenRouterRequest(pipelineTrace, "attempt_failed", {
          shotIndex,
          attempt,
          model,
          provider,
          durationMs,
          timeoutMs,
          success: false,
          errorMessage: describeOpenRouterAttemptFailure(lastError),
        });
      }
      traceRenderFailure(PipelineStage.OPENROUTER_REQUEST_STARTED, lastError, {
        pipelineTrace,
        shotIndex,
        attempt,
      });
      logger.warn(
        {
          provider,
          model,
          shotIndex,
          attempt,
          error: describeOpenRouterAttemptFailure(lastError),
          willRetry: shouldRetryOpenRouterAttempt(lastError, attempt, retryCount),
        },
        "OpenRouterProvider: attempt failed",
      );
      if (!shouldRetryOpenRouterAttempt(lastError, attempt, retryCount)) {
        break;
      }
    }
  }

  logger.error(
    {
      provider,
      model,
      shotIndex,
      error: lastError ? describeOpenRouterAttemptFailure(lastError) : undefined,
      ...(pipelineTrace
        ? {
            generationSessionId: pipelineTrace.generationSessionId,
            renderId: pipelineTrace.primaryRenderId,
            retryCount: pipelineTrace.openRouterRetryCount,
          }
        : {}),
    },
    "OpenRouterProvider: all attempts exhausted for shot",
  );
  return null;
}

// ---------------------------------------------------------------------------
// OpenRouterProvider — concrete implementation of RenderingProvider
// ---------------------------------------------------------------------------

export class OpenRouterProvider implements RenderingProvider {
  readonly name = "openrouter";
  readonly model = OPENROUTER_RENDERING_CONFIG.defaultModel;

  private readonly apiKey: string;

  constructor() {
    const key = process.env["OPENROUTER_API_KEY"];
    if (!key) {
      throw new Error(
        "OpenRouterProvider: OPENROUTER_API_KEY environment variable is not set"
      );
    }
    this.apiKey = key;
  }

  /**
   * Generate the requested number of shots.
   *
   * Strategy (spec §7):
   * The model supports one image per request.  For multi-shot requests we
   * fan out N parallel calls and merge the results into one ordered array.
   * If any individual shot fails after retries it is omitted — the array
   * may be shorter than requested.
   */
  async generate(input: ProviderInput): Promise<GeneratedImage[]> {
    const {
      garmentImageUrl,
      modelImageUrl,
      prompt,
      shots,
      perShotPrompts,
      perShotPoseReferenceUrls,
      previousOutputUrl,
      refinementInstruction,
      garmentReferenceCorrespondenceInstruction,
      garmentEvidencePackaging,
      garmentReferenceSheetImageUrl,
      garmentBackImageUrl,
      garmentDetailImageUrl,
      garmentEvidenceSetMappingInstruction,
      garmentEvidenceTalentReferenceImageNumber,
      pipelineTrace,
      outputResolution = "2K",
      identityForensics,
      locationEnvironment,
      additionalTalentImageUrls,
      perShotFurnitureRequired,
    } = input;

    const hasPerShotPrompts =
      Array.isArray(perShotPrompts) && perShotPrompts.length === shots;
    const isRefinement =
      Boolean(refinementInstruction) && Boolean(previousOutputUrl);
    // V1 Create: single Nano Regular when cascade flag is off. Cascade code retained for V3.
    // Refinement / Enhance Face keep the single-shot Flash path unchanged.
    const useCreateCascade = !isRefinement && V1_CREATE_USE_NANO_PRO_CASCADE;
    const stage1Model = resolveOpenRouterModelForResolution(
      outputResolution,
      "nano_pro",
    );
    const stage2Model = resolveOpenRouterModelForResolution(
      outputResolution,
      "flash",
    );

    logger.info(
      {
        provider: this.name,
        model: useCreateCascade ? stage2Model : stage1Model,
        stage1Model: useCreateCascade ? stage1Model : null,
        stage2Model: useCreateCascade ? stage2Model : null,
        outputResolution,
        engine: useCreateCascade
          ? "nano_pro→flash"
          : resolveOpenRouterRenderEngine(),
        createCascade: useCreateCascade,
        shots,
        isRefinement,
        editorialDiversity: hasPerShotPrompts,
        poseReferenceShots: Array.isArray(perShotPoseReferenceUrls)
          ? perShotPoseReferenceUrls.filter(Boolean).length
          : 0,
        additionalTalentRefs: additionalTalentImageUrls?.length ?? 0,
        locationEnvironment: "white_studio",
      },
      "OpenRouterProvider: starting generation"
    );

    const t0 = Date.now();

    const runStaggeredShot = (
      shotIndex: number,
      run: () => Promise<string | null>,
    ): Promise<string | null> =>
      new Promise<string | null>((resolve) => {
        setTimeout(
          () => run().then(resolve).catch(() => resolve(null)),
          shotIndex * OPENROUTER_SHOT_STAGGER_MS,
        );
      });

    let results: Array<string | null>;

    if (useCreateCascade) {
      // ── STAGE 1 — Nano Pro (pose / furniture / scene / garment / body) ──
      const stage1Results = await Promise.all(
        Array.from({ length: shots }, (_, i) => {
          const shotPrompt = hasPerShotPrompts
            ? (perShotPrompts[i] ?? prompt)
            : prompt;
          const poseReferenceImageUrl =
            perShotPoseReferenceUrls?.[i] ?? undefined;
          const furnitureRequired = Boolean(perShotFurnitureRequired?.[i]);

          return runStaggeredShot(i, () =>
            generateSingleShot(
              shotPrompt,
              garmentImageUrl,
              modelImageUrl,
              this.apiKey,
              i,
              pipelineTrace,
              undefined,
              undefined,
              outputResolution,
              poseReferenceImageUrl || undefined,
              garmentReferenceCorrespondenceInstruction,
              garmentEvidencePackaging,
              garmentReferenceSheetImageUrl,
              garmentBackImageUrl,
              garmentDetailImageUrl,
              garmentEvidenceSetMappingInstruction,
              garmentEvidenceTalentReferenceImageNumber,
              identityForensics,
              locationEnvironment,
              additionalTalentImageUrls,
              input.garmentEvidenceHasBack,
              input.garmentEvidenceHasDetail,
              input.garmentReferenceMode,
              "nano_pro",
              1,
              undefined,
              furnitureRequired,
            ),
          );
        }),
      );

      // ── STAGE 2 — Nano Regular (face identity; preserve Stage-1) ────────
      results = await Promise.all(
        Array.from({ length: shots }, (_, i) => {
          const stage1Url = stage1Results[i];
          if (!stage1Url) return Promise.resolve(null);

          return runStaggeredShot(i, () =>
            generateSingleShot(
              "",
              garmentImageUrl,
              modelImageUrl,
              this.apiKey,
              i,
              pipelineTrace,
              undefined,
              undefined,
              outputResolution,
              undefined, // never Pose Master on Stage-2
              undefined, // no sheet correspondence creative append
              garmentEvidencePackaging,
              garmentReferenceSheetImageUrl,
              garmentBackImageUrl,
              garmentDetailImageUrl,
              undefined,
              undefined,
              identityForensics,
              locationEnvironment,
              undefined, // no extra talent extras on Stage-2
              input.garmentEvidenceHasBack,
              input.garmentEvidenceHasDetail,
              input.garmentReferenceMode,
              "flash",
              2,
              stage1Url,
              false,
            ),
          );
        }),
      );
    } else {
      // Fan out N parallel shot requests with a small stagger (150 ms apart)
      // — refinement / Enhance Face path unchanged.
      results = await Promise.all(
        Array.from({ length: shots }, (_, i) => {
          const shotPrompt = hasPerShotPrompts
            ? (perShotPrompts[i] ?? prompt)
            : prompt;
          const poseReferenceImageUrl =
            perShotPoseReferenceUrls?.[i] ?? undefined;

          return runStaggeredShot(i, () =>
            generateSingleShot(
              shotPrompt,
              garmentImageUrl,
              modelImageUrl,
              this.apiKey,
              i,
              pipelineTrace,
              previousOutputUrl,
              refinementInstruction,
              outputResolution,
              poseReferenceImageUrl || undefined,
              garmentReferenceCorrespondenceInstruction,
              garmentEvidencePackaging,
              garmentReferenceSheetImageUrl,
              garmentBackImageUrl,
              garmentDetailImageUrl,
              garmentEvidenceSetMappingInstruction,
              garmentEvidenceTalentReferenceImageNumber,
              identityForensics,
              locationEnvironment,
              additionalTalentImageUrls,
              input.garmentEvidenceHasBack,
              input.garmentEvidenceHasDetail,
              input.garmentReferenceMode,
            ),
          );
        }),
      );
    }

    const durationMs = Date.now() - t0;
    const images: GeneratedImage[] = results
      .map((url, i) => (url ? { url, index: i } : null))
      .filter((img): img is GeneratedImage => img !== null);

    logger.info(
      {
        provider: this.name,
        model: useCreateCascade ? stage2Model : this.model,
        shotsRequested: shots,
        shotsGenerated: images.length,
        durationMs,
        createCascade: useCreateCascade,
      },
      "OpenRouterProvider: generation complete"
    );

    return images;
  }
}
