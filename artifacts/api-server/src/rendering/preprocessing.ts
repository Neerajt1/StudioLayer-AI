// ---------------------------------------------------------------------------
// StudioLayer AI — Shared Rendering Preprocessing Utilities
//
// Extracted from RenderOrchestrator (SL-017) so that any pipeline entry
// point — the Render Orchestrator *and* the OpenRouter pipeline — can reuse
// the same garment passthrough and model image resolution logic without
// duplicating it.
//
// Public surface:
//   prepareGarmentImage(sourceImageUrl, renderId)   → garment image URL
//   resolveModelImage(request, category, styleTemplate, renderId)
//                                                   → { modelImageContext, modelImageUrl }
//
// Nothing here is FASHN-specific.  The `category` parameter accepted by
// resolveModelImage is the same FashnCategory used by the base-model
// selector — it happens to share the vocabulary but is not sent to FASHN
// by callers in the OpenRouter path.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync }     from "node:fs";
import path                            from "node:path";
import { fileURLToPath }               from "node:url";
import { logger }                    from "../lib/logger";
import { traceRenderFailure } from "../lib/render-pipeline-trace.js";
import { findIdentityById }          from "../data/identity-library";
import {
  selectBaseModel,
  mapStyleModeToTemplate,
}                                    from "../data/base-model-library";
import type {
  FashnCategory,
  ModelImageContext,
  ModelImageSource,
  RenderingRequest,
} from "./types";

export type { FashnCategory, ModelImageContext };

// ---------------------------------------------------------------------------
// Re-export mapStyleModeToTemplate for pipeline callers
// ---------------------------------------------------------------------------
export { mapStyleModeToTemplate };

function resolveIdentitiesPublicDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "../studiolayer-ai/public/identities"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../studiolayer-ai/public/identities"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../studiolayer-ai/public/identities"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0]!;
}

function resolvePoseReferencesPublicDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "../studiolayer-ai/public/pose-references"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../studiolayer-ai/public/pose-references"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../studiolayer-ai/public/pose-references"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0]!;
}

function mimeTypeForIdentityFile(filename: string): string {
  switch (path.extname(filename).slice(1).toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

/** True when the URL is a local Studio Talent asset served from the frontend public folder. */
export function isLocalIdentityImageUrl(imageUrl: string): boolean {
  return imageUrl.startsWith("/identities/");
}

/**
 * Loads a Studio Talent image from the local public assets folder and returns
 * a base64 data URI suitable for OpenRouter (no localhost / public URL needed).
 */
export function loadStudioTalentImageAsDataUri(
  relativePath: string,
  renderId?: number,
): string {
  const filename = path.basename(relativePath);
  const filePath = path.join(resolveIdentitiesPublicDir(), filename);

  let buffer: Buffer;
  try {
    buffer = readFileSync(filePath);
  } catch (error) {
    const err = new Error(
      `preprocessing: Studio Talent image not found on disk — ${relativePath}`,
      { cause: error },
    );
    traceRenderFailure("Studio Talent image load", err, { renderId, relativePath, filePath });
    throw err;
  }

  const mimeType = mimeTypeForIdentityFile(filename);
  const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;

  logger.info(
    { renderId, relativePath, sizeBytes: buffer.length, mimeType },
    "preprocessing: loaded Studio Talent image as base64 data URI",
  );

  return dataUri;
}

/**
 * Loads a Pose Master reference PNG from the frontend public pose-references
 * folder and returns a base64 data URI for OpenRouter (body-pose reference only).
 */
export function loadPoseReferenceImageAsDataUri(
  relativePath: string,
  renderId?: number,
): string {
  const filename = path.basename(relativePath);
  const filePath = path.join(resolvePoseReferencesPublicDir(), filename);

  let buffer: Buffer;
  try {
    buffer = readFileSync(filePath);
  } catch (error) {
    const err = new Error(
      `preprocessing: Pose Master reference image not found on disk — ${relativePath}`,
      { cause: error },
    );
    traceRenderFailure("Pose Master reference image load", err, {
      renderId,
      relativePath,
      filePath,
    });
    throw err;
  }

  const mimeType = mimeTypeForIdentityFile(filename);
  const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;

  logger.info(
    { renderId, relativePath, sizeBytes: buffer.length, mimeType },
    "preprocessing: loaded Pose Master reference as base64 data URI",
  );

  return dataUri;
}

// ---------------------------------------------------------------------------
// Garment passthrough (V1 — no Fal dependency for normal generation)
// ---------------------------------------------------------------------------

/**
 * Returns the uploaded garment URL unchanged.
 *
 * V1 architecture: Fal/BirefNet is reserved for Remove Background refinement
 * only. Normal OpenRouter generation must not invoke Fal.
 */
export async function prepareGarmentImage(
  sourceImageUrl: string,
  renderId: number,
): Promise<string> {
  logger.info(
    { renderId },
    "preprocessing: garment passthrough (no Fal preprocessing in V1)",
  );
  return sourceImageUrl;
}

// ---------------------------------------------------------------------------
// Model image resolution (SL-016 4-branch priority chain)
// ---------------------------------------------------------------------------

/**
 * Result of resolveModelImage — the resolved URL (absolute) plus full
 * selection context for logging and telemetry.
 */
export interface ModelResolutionResult {
  modelImageContext: ModelImageContext;
  /**
   * Resolved model reference for the active provider.
   * Identity Library entries remain root-relative paths (/identities/...).
   * Base-model / fallback entries remain public HTTPS URLs.
   */
  modelImageUrl: string;
}

/**
 * Resolves the model image reference using the SL-016 4-branch priority chain.
 * Identity Library paths stay root-relative; the OpenRouter pipeline loads them
 * from disk as base64 before calling the provider.
 *
 * Branch A: modelIdentityId supplied + found in Identity Library (user override)
 * Branch B: modelIdentityId supplied but not found → Base Model Selector
 * Branch C: No modelIdentityId → Base Model Selector
 * Branch D: Base Model Selector returns null → attribute-routing fallback
 */
export function resolveModelImage(
  request: RenderingRequest,
  category: FashnCategory,
  styleTemplate: ReturnType<typeof mapStyleModeToTemplate>,
  renderId: number,
): ModelResolutionResult {
  const selectionStart = Date.now();
  const { modelIdentityId, modelGender, modelAgeRange, modelPose } = request;

  let imageUrl: string;
  let source: ModelImageSource;
  let baseModelId: string | null      = null;
  let identityId: string | null       = null;
  let identityOverride                = false;
  let fallbackReason: string | null   = null;

  if (modelIdentityId) {
    // ── Branch A: User-selected identity ──────────────────────────────────
    const identity = findIdentityById(modelIdentityId);
    if (identity) {
      imageUrl         = identity.imageUrl;
      source           = "identity_override";
      identityId       = modelIdentityId;
      identityOverride = true;

      logger.info(
        { renderId, modelIdentityId, identityName: identity.displayName },
        "preprocessing: model image from Identity Library (identity override)",
      );
    } else {
      // ── Branch B: Identity not found → Base Model Selector ──────────────
      logger.warn(
        { renderId, modelIdentityId },
        "preprocessing: modelIdentityId not found — falling back to Base Model Selector",
      );

      const baseModel = selectBaseModel(modelGender, category, styleTemplate);
      if (baseModel) {
        imageUrl       = baseModel.imageUrl;
        source         = "base_model_selector";
        baseModelId    = baseModel.id;
        fallbackReason = "identity_not_found";
      } else {
        imageUrl       = selectAttributeRoutedModel(modelGender, modelAgeRange, modelPose);
        source         = "attribute_routing_fallback";
        fallbackReason = "identity_not_found_and_base_model_null";
      }
    }
  } else {
    // ── Branch C: No identity selected → Base Model Selector ──────────────
    const baseModel = selectBaseModel(modelGender, category, styleTemplate);
    if (baseModel) {
      imageUrl    = baseModel.imageUrl;
      source      = "base_model_selector";
      baseModelId = baseModel.id;
    } else {
      // ── Branch D: Base Model Selector null → emergency attribute routing ──
      imageUrl       = selectAttributeRoutedModel(modelGender, modelAgeRange, modelPose);
      source         = "attribute_routing_fallback";
      fallbackReason = "base_model_selector_null";
    }
  }

  const selectionDurationMs = Date.now() - selectionStart;

  logger.info(
    {
      renderId,
      modelSelection: {
        source, baseModelId, identityId, identityOverride,
        fallbackReason, category, styleTemplate,
        resolvedImageUrl: imageUrl, durationMs: selectionDurationMs,
      },
    },
    "preprocessing: model image selected",
  );

  const modelImageContext: ModelImageContext = {
    imageUrl,
    source,
    baseModelId,
    identityId,
    identityOverride,
    fallbackReason,
    selectionDurationMs,
  };

  return { modelImageContext, modelImageUrl: imageUrl };
}

// ---------------------------------------------------------------------------
// Emergency attribute-routing fallback (internal)
// ---------------------------------------------------------------------------

function selectAttributeRoutedModel(
  modelGender:   string | null | undefined,
  modelAgeRange: string | null | undefined,
  modelPose:     string | null | undefined,
): string {
  const pose = modelPose ?? "standing_frontal";

  if (modelGender === "kids") {
    if (pose === "walking_dynamic")     return "https://images.unsplash.com/photo-1555009393-f20bdb245c4d?w=768&q=85&fit=crop&crop=top";
    if (pose === "sideways_posing")     return "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "teen_youth") return "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=768&q=85&fit=crop&crop=top";
    return "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=768&q=85&fit=crop&crop=top";
  }

  if (modelGender === "mens") {
    if (pose === "walking_dynamic")           return "https://images.unsplash.com/photo-1488161628813-04466f872be2?w=768&q=85&fit=crop&crop=top";
    if (pose === "sideways_posing")           return "https://images.unsplash.com/photo-1490367532201-b9bc1dc483f6?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "mature_executive") return "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "classic_mid_age")  return "https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=768&q=85&fit=crop&crop=top";
    if (modelAgeRange === "teen_youth")       return "https://images.unsplash.com/photo-1534367610401-9f5ed68180aa?w=768&q=85&fit=crop&crop=top";
    return "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=768&q=85&fit=crop&crop=top";
  }

  // Women's (default)
  if (pose === "walking_dynamic")           return "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=768&q=85&fit=crop&crop=top";
  if (pose === "sideways_posing")           return "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=768&q=85&fit=crop&crop=top";
  if (modelAgeRange === "mature_executive") return "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=768&q=85&fit=crop&crop=top";
  if (modelAgeRange === "classic_mid_age")  return "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=768&q=85&fit=crop&crop=top";
  if (modelAgeRange === "teen_youth")       return "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=768&q=85&fit=crop&crop=top";
  return "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=768&q=85&fit=crop&crop=top";
}
