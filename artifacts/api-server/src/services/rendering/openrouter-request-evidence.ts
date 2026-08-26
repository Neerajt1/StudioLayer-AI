// ---------------------------------------------------------------------------
// OpenRouter request evidence — OBSERVABILITY ONLY
//
// Builds privacy-safe semantic metadata for the final Create OpenRouter request.
// Must never change generation behaviour or log image bytes / URLs / prompts.
// ---------------------------------------------------------------------------

import type { IdentityImageRole } from "./identity-forensics.js";
import type { OpenRouterRenderEngine } from "./rendering.config.js";

export type OpenRouterEvidenceImageRole =
  | IdentityImageRole
  | "TALENT_EXTRA"
  | "PREVIOUS_OUTPUT"
  | "STAGE1_OUTPUT"
  | "FURNITURE"
  | "ENVIRONMENT";

export type OpenRouterRequestEvidenceMetadata = {
  renderId: number | null;
  shotIndex: number;
  resolvedModel: string;
  resolvedEngine: OpenRouterRenderEngine;
  /** Production Create cascade stage (1 = Nano Pro, 2 = Nano Regular). */
  createStage: 1 | 2 | null;
  /** Stage-2 only — Stage-1 image was attached (boolean; never URLs). */
  hasStage1Image: boolean;
  garmentPackagingMode: "sheet" | "separate" | null;
  evidenceMode: "sheet" | "separate" | null;
  garmentReferenceMode: string | null;
  usedReferenceSheet: boolean;
  hasFrontGarment: boolean;
  hasBackGarment: boolean;
  hasDetailGarment: boolean;
  hasGarmentSheet: boolean;
  hasTalent: boolean;
  hasPoseMaster: boolean;
  hasFurnitureImage: boolean;
  hasEnvironmentImage: boolean;
  finalImagePartCount: number;
  imagePartCount: number;
  referenceCountBeforeTextPrompt: number;
  finalImagePartRoles: OpenRouterEvidenceImageRole[];
};

/**
 * Role order matching buildFreshGenerationImageParts exactly
 * (including optional extra Talent refs and previous-output).
 */
export function resolveOpenRouterImagePartRoles(params: {
  garmentEvidencePackaging?: "sheet" | "separate";
  garmentReferenceSheetImageUrl?: string | null;
  garmentBackImageUrl?: string | null;
  garmentDetailImageUrl?: string | null;
  poseReferenceImageUrl?: string | null;
  previousOutputUrl?: string | null;
  additionalTalentImageUrls?: string[] | null;
  modelImageUrl?: string | null;
  /** Primary garment is always present for fresh generation. */
  hasFrontGarment?: boolean;
  /** Create cascade Stage-2 packaging (Stage-1 + Talent + garment…). */
  createStage?: 1 | 2 | null;
  hasStage1Image?: boolean;
}): OpenRouterEvidenceImageRole[] {
  if (params.createStage === 2) {
    const roles: OpenRouterEvidenceImageRole[] = [];
    if (params.hasStage1Image) roles.push("STAGE1_OUTPUT");
    roles.push("TALENT");
    return roles;
  }

  const hasFront = params.hasFrontGarment !== false;
  const useSeparateEvidence =
    params.garmentEvidencePackaging === "separate"
    && Boolean(params.garmentBackImageUrl || params.garmentDetailImageUrl);

  const useSupplementalSheet =
    params.garmentEvidencePackaging === "sheet"
    && Boolean(params.garmentReferenceSheetImageUrl);

  const garmentRoles: OpenRouterEvidenceImageRole[] = !hasFront
    ? []
    : useSeparateEvidence
      ? [
          "GARMENT",
          ...(params.garmentBackImageUrl ? (["GARMENT_BACK"] as const) : []),
          ...(params.garmentDetailImageUrl ? (["GARMENT_DETAIL"] as const) : []),
        ]
      : useSupplementalSheet
        ? ["GARMENT", "GARMENT_SHEET"]
        : ["GARMENT"];

  const primaryTalent = params.modelImageUrl ?? "";
  const talentExtras = (params.additionalTalentImageUrls ?? []).filter(
    (url) =>
      typeof url === "string"
      && url.trim().length > 0
      && url !== primaryTalent,
  );

  return [
    ...garmentRoles,
    "TALENT",
    ...talentExtras.map(() => "TALENT_EXTRA" as const),
    ...(params.poseReferenceImageUrl ? (["POSE_MASTER"] as const) : []),
    ...(params.previousOutputUrl ? (["PREVIOUS_OUTPUT"] as const) : []),
  ];
}

export type BuildOpenRouterRequestEvidenceMetadataInput = {
  renderId?: number | null;
  shotIndex: number;
  resolvedModel: string;
  resolvedEngine: OpenRouterRenderEngine;
  createStage?: 1 | 2 | null;
  hasStage1Image?: boolean;
  garmentEvidencePackaging?: "sheet" | "separate";
  /** Env / pipeline evidence mode (defaults to packaging when omitted). */
  evidenceMode?: "sheet" | "separate" | null;
  garmentReferenceMode?: string | null;
  /**
   * Whether Back/Detail were supplied into prepareGarmentReferenceForGeneration.
   * Required on sheet path (Back/Detail URLs are not forwarded to the provider).
   */
  hasBackGarmentInput?: boolean;
  hasDetailGarmentInput?: boolean;
  garmentImageUrl?: string | null;
  garmentReferenceSheetImageUrl?: string | null;
  garmentBackImageUrl?: string | null;
  garmentDetailImageUrl?: string | null;
  modelImageUrl?: string | null;
  poseReferenceImageUrl?: string | null;
  previousOutputUrl?: string | null;
  additionalTalentImageUrls?: string[] | null;
  /** Actual image_url part count in the OpenRouter request body. */
  finalImagePartCount: number;
};

/**
 * Privacy-safe Create evidence snapshot for one OpenRouter shot request.
 */
export function buildOpenRouterRequestEvidenceMetadata(
  input: BuildOpenRouterRequestEvidenceMetadataInput,
): OpenRouterRequestEvidenceMetadata {
  const packaging = input.garmentEvidencePackaging ?? null;
  const evidenceMode = input.evidenceMode ?? packaging;

  const finalImagePartRoles = resolveOpenRouterImagePartRoles({
    garmentEvidencePackaging: input.garmentEvidencePackaging,
    garmentReferenceSheetImageUrl: input.garmentReferenceSheetImageUrl,
    garmentBackImageUrl: input.garmentBackImageUrl,
    garmentDetailImageUrl: input.garmentDetailImageUrl,
    poseReferenceImageUrl: input.poseReferenceImageUrl,
    previousOutputUrl: input.previousOutputUrl,
    additionalTalentImageUrls: input.additionalTalentImageUrls,
    modelImageUrl: input.modelImageUrl,
    hasFrontGarment: Boolean(input.garmentImageUrl),
    createStage: input.createStage ?? null,
    hasStage1Image: input.hasStage1Image,
  });

  const hasGarmentSheet =
    finalImagePartRoles.includes("GARMENT_SHEET")
    && Boolean(input.garmentReferenceSheetImageUrl);

  // Sheet path: Back/Detail are not provider image URLs — use preparation inputs.
  // Separate path: also true when those URLs are present on the request.
  const hasBackGarment = Boolean(
    input.hasBackGarmentInput
      ?? input.garmentBackImageUrl,
  );
  const hasDetailGarment = Boolean(
    input.hasDetailGarmentInput
      ?? input.garmentDetailImageUrl,
  );

  return {
    renderId: input.renderId ?? null,
    shotIndex: input.shotIndex,
    resolvedModel: input.resolvedModel,
    resolvedEngine: input.resolvedEngine,
    createStage: input.createStage ?? null,
    hasStage1Image: Boolean(
      input.hasStage1Image ?? finalImagePartRoles.includes("STAGE1_OUTPUT"),
    ),
    garmentPackagingMode: packaging,
    evidenceMode,
    garmentReferenceMode: input.garmentReferenceMode ?? null,
    usedReferenceSheet: hasGarmentSheet,
    hasFrontGarment: finalImagePartRoles.includes("GARMENT"),
    hasBackGarment,
    hasDetailGarment,
    hasGarmentSheet,
    hasTalent: finalImagePartRoles.includes("TALENT"),
    hasPoseMaster: finalImagePartRoles.includes("POSE_MASTER"),
    // Derived from actual roles — never hard-coded.
    hasFurnitureImage: finalImagePartRoles.includes("FURNITURE"),
    hasEnvironmentImage: finalImagePartRoles.includes("ENVIRONMENT"),
    finalImagePartCount: input.finalImagePartCount,
    imagePartCount: input.finalImagePartCount,
    referenceCountBeforeTextPrompt: input.finalImagePartCount,
    finalImagePartRoles,
  };
}
