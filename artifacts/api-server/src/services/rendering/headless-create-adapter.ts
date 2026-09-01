// ---------------------------------------------------------------------------
// Production Create — Headless Mannequin adapter
//
// Maps the existing Create pipeline inputs to the Headless orchestrator.
// Stage 1 image refs: GARMENT + POSE_MASTER [+ FURNITURE when selected].
// Stage-1 authority is assembled by headless-create-stage1-authority.ts.
// ---------------------------------------------------------------------------

import { getFurnitureAsset } from "../../intelligence/furniture-catalog.js";
import {
  assembleHeadlessCreateStage1CreativePrompt,
} from "./headless-create-stage1-authority.js";
import {
  generateNanoProHeadlessMannequinTrial,
} from "./providers/nano-pro-headless-mannequin-trial.js";
import type { NativeOutputResolution } from "./rendering.config.js";

export {
  HEADLESS_STAGE1_FURNITURE_REF,
  HEADLESS_STAGE1_GARMENT_REF,
  HEADLESS_STAGE1_POSE_REF,
  assembleHeadlessCreateStage1CreativePrompt,
} from "./headless-create-stage1-authority.js";

export type HeadlessCreateShotInput = {
  shotIndex: number;
  talentImageUrl: string;
  garmentImageUrl: string;
  poseImageUrl: string;
  poseId: string;
  modelIdentityId?: string | null;
  creativeShotPrompt?: string;
  garmentReferenceCorrespondenceInstruction?: string;
  garmentEvidenceSetMappingInstruction?: string;
  garmentEvidenceHasBack?: boolean;
  garmentEvidenceHasDetail?: boolean;
  garmentReferenceMode?: string;
  /** Selected furniture product reference PNG (Stage 1 Ref 3 when present). */
  furnitureReferenceImageUrl?: string | null;
  /** Selected furniture asset id — observability / catalogue context. */
  furnitureAssetId?: string | null;
  outputResolution?: NativeOutputResolution;
};

/**
 * Run the frozen two-stage Headless flow for one production Create shot.
 * Throws on any Headless contract failure — callers must not fall back to
 * single-pass generation when the production Headless flag is enabled.
 */
export async function runHeadlessCreateShot(
  input: HeadlessCreateShotInput,
): Promise<string> {
  const furnitureReferenceImageUrl =
    typeof input.furnitureReferenceImageUrl === "string" &&
    input.furnitureReferenceImageUrl.trim().length > 0
      ? input.furnitureReferenceImageUrl.trim()
      : null;

  const furnitureAsset = input.furnitureAssetId
    ? getFurnitureAsset(input.furnitureAssetId) ?? null
    : null;

  const creativeShotPrompt = assembleHeadlessCreateStage1CreativePrompt({
    shotPrompt: input.creativeShotPrompt ?? "",
    garmentReferenceCorrespondenceInstruction:
      input.garmentReferenceCorrespondenceInstruction,
    garmentEvidenceSetMappingInstruction:
      input.garmentEvidenceSetMappingInstruction,
    garmentEvidenceHasBack: input.garmentEvidenceHasBack,
    garmentEvidenceHasDetail: input.garmentEvidenceHasDetail,
    garmentReferenceMode: input.garmentReferenceMode,
    furnitureReferenceImageUrl,
    furnitureAsset,
  });

  const result = await generateNanoProHeadlessMannequinTrial({
    talentImageUrl: input.talentImageUrl,
    garmentImageUrl: input.garmentImageUrl,
    poseImageUrl: input.poseImageUrl,
    furnitureReferenceImageUrl,
    poseId: input.poseId,
    modelIdentityId: input.modelIdentityId ?? null,
    creativeShotPrompt: creativeShotPrompt || undefined,
    outputResolution: input.outputResolution,
  });

  if (!result.imageDataUri) {
    throw new Error(
      "headless-create-adapter: Headless Stage 2 produced no image",
    );
  }

  return result.imageDataUri;
}
