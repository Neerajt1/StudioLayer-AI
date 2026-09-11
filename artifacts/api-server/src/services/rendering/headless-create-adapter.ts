// ---------------------------------------------------------------------------
// Production Create — Headless Mannequin adapter
//
// Thin translation layer: production Create inputs → proven Headless trial
// Stage-1 generation contract (fidelity baseline):
//   Ref 1 = GARMENT (front only)
//   Ref 2 = face-neutral POSE_MASTER from poseId
//   Prompt = HEADLESS_STAGE1_PROMPT_BASE only (no Flash / authority stack)
//   No Furniture Ref 3, no Talent in Stage 1
// Mechanical Stage-2 identity path remains frozen and untouched.
//
// TEMPORARY CONTROLLED REGRESSION TEST: furniture URL is intentionally not
// forwarded (9bab189 parity). Revert after furniture Ref3 A/B is complete.
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
