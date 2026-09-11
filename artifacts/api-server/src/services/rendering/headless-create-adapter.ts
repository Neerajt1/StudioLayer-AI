// ---------------------------------------------------------------------------
// Production Create — Headless Mannequin adapter
//
// Thin translation layer: production Create inputs → frozen Headless orchestrator.
// Stage-1 visual contract (production only):
//   Ref 1 = GARMENT, Ref 2 = face-neutral POSE_MASTER,
//   Ref 3 = FURNITURE when an approved product PNG is available.
// Stage-1 creative brief is assembled by headless-create-stage1-authority.ts
// (white background, garment fidelity, pose geometry, furniture isolation).
// Mechanical Stage-2 identity path remains frozen and untouched.
// ---------------------------------------------------------------------------

import { getFurnitureAsset } from "../../intelligence/furniture-catalog.js";
import { logger } from "../../lib/logger.js";
import { loadStage1PoseReferenceImageAsDataUri } from "../../rendering/pose-face-neutral-backend.js";
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
  /** Ignored — pose resolved from poseId via face-neutral Stage-1 loader. */
  poseImageUrl: string;
  poseId: string;
  modelIdentityId?: string | null;
  /**
   * Upstream per-shot creative brief (pose structured definition / photography).
   * Adapted into Headless Ref layout — not forwarded wholesale as Flash Create.
   */
  creativeShotPrompt?: string;
  garmentReferenceCorrespondenceInstruction?: string;
  garmentEvidenceSetMappingInstruction?: string;
  garmentEvidenceHasBack?: boolean;
  garmentEvidenceHasDetail?: boolean;
  garmentReferenceMode?: string;
  /** Selected furniture product reference PNG (Stage 1 Ref 3 when present). */
  furnitureReferenceImageUrl?: string | null;
  /** Selected furniture asset id — catalogue context / fallback observability. */
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
  const poseImageUrl = loadStage1PoseReferenceImageAsDataUri(input.poseId);

  const furnitureReferenceImageUrl =
    typeof input.furnitureReferenceImageUrl === "string" &&
    input.furnitureReferenceImageUrl.trim().length > 0
      ? input.furnitureReferenceImageUrl.trim()
      : null;

  const furnitureAsset = input.furnitureAssetId
    ? getFurnitureAsset(input.furnitureAssetId) ?? null
    : null;

  if (input.furnitureAssetId && !furnitureReferenceImageUrl) {
    logger.warn(
      {
        shotIndex: input.shotIndex,
        poseId: input.poseId,
        furnitureAssetId: input.furnitureAssetId,
        furnitureAssetFound: Boolean(furnitureAsset),
      },
      "headless-create-adapter: furniture asset selected but no reference image URL — Stage 1 uses GARMENT + POSE_MASTER only (no invented furniture Ref 3)",
    );
  }

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
    poseImageUrl,
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
