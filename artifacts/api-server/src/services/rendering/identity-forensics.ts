// ---------------------------------------------------------------------------
// Identity forensics — OBSERVABILITY ONLY
//
// Logs compact, privacy-safe diagnostics for fresh OpenRouter/Gemini requests.
// Must never change generation behaviour or log image bytes / full prompts.
// ---------------------------------------------------------------------------

import { logger } from "../../lib/logger.js";
import { parseImageDimensionsFromBuffer } from "./native-resolution.js";
import type { NativeOutputResolution } from "./rendering.config.js";

/** Role labels for image_url parts (fresh generation). */
export type IdentityImageRole =
  | "GARMENT"
  | "GARMENT_BACK"
  | "GARMENT_DETAIL"
  | "GARMENT_SHEET"
  | "TALENT"
  | "POSE_MASTER";

export type IdentityGenerationMode = "Hero" | "Editorial" | "Campaign";

/** Diagnostics-only context threaded to the final provider request. */
export interface IdentityForensicsContext {
  generationMode: IdentityGenerationMode;
  modelIdentityId?: string | null;
  /** Relative identity path (e.g. /identities/M-IN-02.png) — never a data URI. */
  talentAssetPath?: string | null;
  /** Per-shot Pose IDs aligned with shot index. */
  perShotPoseIds?: Array<string | null | undefined>;
  /** Per-shot Pose Master relative paths (e.g. /pose-references/Pose7.png). */
  perShotPoseAssetPaths?: Array<string | null | undefined>;
}

export interface BuildFreshGenerationImageRolesParams {
  poseReferenceImageUrl?: string | null;
  garmentEvidencePackaging?: "sheet" | "separate";
  garmentReferenceSheetImageUrl?: string | null;
  garmentBackImageUrl?: string | null;
  garmentDetailImageUrl?: string | null;
}

/**
 * Role order matching buildFreshGenerationImageParts (fresh generation only).
 * Keep in sync with OpenRouterProvider.buildFreshGenerationImageParts.
 */
export function buildFreshGenerationImageRoles(
  params: BuildFreshGenerationImageRolesParams,
): IdentityImageRole[] {
  const {
    poseReferenceImageUrl,
    garmentEvidencePackaging,
    garmentReferenceSheetImageUrl,
    garmentBackImageUrl,
    garmentDetailImageUrl,
  } = params;

  const useSeparateEvidence =
    garmentEvidencePackaging === "separate"
    && Boolean(garmentBackImageUrl || garmentDetailImageUrl);

  const useSupplementalSheet =
    garmentEvidencePackaging === "sheet"
    && Boolean(garmentReferenceSheetImageUrl);

  const garmentRoles: IdentityImageRole[] = useSeparateEvidence
    ? [
        "GARMENT",
        ...(garmentBackImageUrl ? (["GARMENT_BACK"] as const) : []),
        ...(garmentDetailImageUrl ? (["GARMENT_DETAIL"] as const) : []),
      ]
    : useSupplementalSheet
      ? ["GARMENT", "GARMENT_SHEET"]
      : ["GARMENT"];

  return [
    ...garmentRoles,
    "TALENT",
    ...(poseReferenceImageUrl ? (["POSE_MASTER"] as const) : []),
  ];
}

/** Strip query strings / host; never return data-URI payloads. */
export function sanitizeAssetRef(
  urlOrPath: string | null | undefined,
  fallbackWhenDataUri?: string | null,
): string | null {
  if (!urlOrPath) return null;
  if (urlOrPath.startsWith("data:")) {
    return fallbackWhenDataUri?.trim() || "data-uri";
  }
  const withoutQuery = urlOrPath.split("?")[0] ?? urlOrPath;
  try {
    if (/^https?:\/\//i.test(withoutQuery)) {
      const pathname = new URL(withoutQuery).pathname;
      const base = pathname.split("/").filter(Boolean).pop();
      return base ?? pathname;
    }
  } catch {
    /* fall through */
  }
  return withoutQuery;
}

export function mimeFromDataUri(dataUri: string): string | null {
  const match = /^data:([^;,]+)/i.exec(dataUri);
  return match?.[1] ?? null;
}

export function inspectTalentImageMeta(modelImageUrl: string): {
  mimeType: string | null;
  width: number | null;
  height: number | null;
  included: boolean;
} {
  if (!modelImageUrl) {
    return { mimeType: null, width: null, height: null, included: false };
  }

  if (modelImageUrl.startsWith("data:")) {
    const mimeType = mimeFromDataUri(modelImageUrl);
    const comma = modelImageUrl.indexOf(",");
    if (comma < 0) {
      return { mimeType, width: null, height: null, included: true };
    }
    try {
      // Decode only enough for format headers (PNG IHDR / JPEG SOF).
      const b64 = modelImageUrl.slice(comma + 1);
      const headerB64 = b64.slice(0, 8192);
      const buffer = Buffer.from(headerB64, "base64");
      const dims = parseImageDimensionsFromBuffer(buffer);
      return {
        mimeType,
        width: dims.width,
        height: dims.height,
        included: true,
      };
    } catch {
      return { mimeType, width: null, height: null, included: true };
    }
  }

  // Remote / relative URL — included as image_url; dimensions unknown here.
  return {
    mimeType: null,
    width: null,
    height: null,
    included: true,
  };
}

export interface IdentityForensicsLogInput {
  renderId?: number | null;
  generationSessionId?: string | null;
  generationMode: IdentityGenerationMode;
  shotIndex: number;
  modelIdentityId?: string | null;
  talentAssetPath?: string | null;
  modelImageUrl: string;
  poseId?: string | null;
  poseAssetPath?: string | null;
  poseReferenceImageUrl?: string | null;
  garmentEvidencePackaging?: "sheet" | "separate";
  garmentReferenceSheetImageUrl?: string | null;
  garmentBackImageUrl?: string | null;
  garmentDetailImageUrl?: string | null;
  openRouterModel: string;
  outputResolution: NativeOutputResolution;
  aspectRatio: string;
}

/** Build the privacy-safe payload (also used by tests). */
export function buildIdentityForensicsPayload(
  input: IdentityForensicsLogInput,
): Record<string, unknown> {
  const roles = buildFreshGenerationImageRoles({
    poseReferenceImageUrl: input.poseReferenceImageUrl,
    garmentEvidencePackaging: input.garmentEvidencePackaging,
    garmentReferenceSheetImageUrl: input.garmentReferenceSheetImageUrl,
    garmentBackImageUrl: input.garmentBackImageUrl,
    garmentDetailImageUrl: input.garmentDetailImageUrl,
  });

  const talentMeta = inspectTalentImageMeta(input.modelImageUrl);
  const poseMasterIncluded = Boolean(input.poseReferenceImageUrl);
  const talentIncluded = roles.includes("TALENT") && talentMeta.included;

  return {
    marker: "[IDENTITY FORENSICS]",
    renderId: input.renderId ?? null,
    generationSessionId: input.generationSessionId ?? null,
    generationMode: input.generationMode,
    shotIndex: input.shotIndex,
    modelIdentityId: input.modelIdentityId ?? null,
    talentAssetPath:
      sanitizeAssetRef(input.talentAssetPath)
      ?? sanitizeAssetRef(input.modelImageUrl, input.talentAssetPath ?? "talent-data-uri"),
    talentMimeType: talentMeta.mimeType,
    talentWidth: talentMeta.width,
    talentHeight: talentMeta.height,
    talentIncluded,
    poseId: input.poseId ?? null,
    poseMasterIncluded,
    poseMasterAssetPath: sanitizeAssetRef(
      input.poseAssetPath,
      input.poseAssetPath,
    ),
    imageInputCount: roles.length,
    imageInputOrder: roles,
    openRouterModel: input.openRouterModel,
    outputResolution: input.outputResolution,
    aspectRatio: input.aspectRatio,
  };
}

/** True if a string looks like embedded image payload (must never appear in logs). */
export function containsForbiddenImagePayload(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.startsWith("data:image")) return true;
  if (/;base64,/i.test(value)) return true;
  // Long base64-looking blobs
  if (value.length > 500 && /^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 200))) {
    return true;
  }
  return false;
}

export function assertIdentityForensicsPayloadIsSafe(
  payload: Record<string, unknown>,
): void {
  const walk = (node: unknown): void => {
    if (typeof node === "string" && containsForbiddenImagePayload(node)) {
      throw new Error("Identity forensics payload must not contain image bytes/base64");
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const value of Object.values(node as Record<string, unknown>)) {
        walk(value);
      }
    }
  };
  walk(payload);
}

/**
 * Log identity forensics at final fresh-generation request assembly.
 * No-op for refinements (caller should skip).
 */
export function logIdentityForensics(input: IdentityForensicsLogInput): void {
  const payload = buildIdentityForensicsPayload(input);
  assertIdentityForensicsPayloadIsSafe(payload);
  logger.info(payload, "[IDENTITY FORENSICS] fresh OpenRouter image request");
}

export function resolveIdentityGenerationMode(input: {
  generationType?: string | null;
  shots?: number;
  customCampaign?: boolean;
}): IdentityGenerationMode {
  if (input.customCampaign) return "Campaign";
  if (input.generationType === "editorial") return "Editorial";
  if (input.generationType === "campaign") return "Campaign";
  if (input.shots === 2) return "Editorial";
  if (input.shots != null && input.shots >= 4) return "Campaign";
  return "Hero";
}
