// ---------------------------------------------------------------------------
// Production Create — Headless Mannequin adapter
//
// Thin translation layer: production Create inputs → frozen trial contract.
// Delegates to generateNanoProHeadlessMannequinTrial with the same Stage-1
// inputs as POST /api/test/nano-pro-headless-mannequin-trial:
//   GARMENT + POSE_MASTER (no Furniture Ref 3), frozen Stage-1 prompt only.
// ---------------------------------------------------------------------------

import { loadStage1PoseReferenceImageAsDataUri } from "../../rendering/pose-face-neutral-backend.js";
import {
  generateNanoProHeadlessMannequinTrial,
} from "./providers/nano-pro-headless-mannequin-trial.js";
import type { NativeOutputResolution } from "./rendering.config.js";

export type HeadlessCreateShotInput = {
  shotIndex: number;
  talentImageUrl: string;
  garmentImageUrl: string;
  /** Ignored for trial parity — pose resolved from poseId via face-neutral loader. */
  poseImageUrl: string;
  poseId: string;
  modelIdentityId?: string | null;
  /** Ignored for trial parity — production Flash shot prompts are not forwarded. */
  creativeShotPrompt?: string;
  /** Ignored for trial parity — not passed to frozen orchestrator. */
  garmentReferenceCorrespondenceInstruction?: string;
  garmentEvidenceSetMappingInstruction?: string;
  garmentEvidenceHasBack?: boolean;
  garmentEvidenceHasDetail?: boolean;
  garmentReferenceMode?: string;
  /** Ignored for trial parity — Stage 1 uses GARMENT + POSE_MASTER only. */
  furnitureReferenceImageUrl?: string | null;
  /** Ignored for trial parity — observability only at provider layer. */
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
  // Trial parity: always load face-neutral Stage-1 Pose Master from poseId.
  const poseImageUrl = loadStage1PoseReferenceImageAsDataUri(input.poseId);

  const result = await generateNanoProHeadlessMannequinTrial({
    talentImageUrl: input.talentImageUrl,
    garmentImageUrl: input.garmentImageUrl,
    poseImageUrl,
    poseId: input.poseId,
    modelIdentityId: input.modelIdentityId ?? null,
    outputResolution: input.outputResolution,
  });

  if (!result.imageDataUri) {
    throw new Error(
      "headless-create-adapter: Headless Stage 2 produced no image",
    );
  }

  return result.imageDataUri;
}
