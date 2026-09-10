// ---------------------------------------------------------------------------
// Production Create — Headless Mannequin adapter
//
// Thin translation layer: production Create inputs → Headless trial orchestrator.
//
// Stage 1 generation contract:
//   Ref 1 = GARMENT (front only)
//   Ref 2 = face-neutral POSE_MASTER from poseId
//   Ref 3 = selected StudioLayer furniture product PNG when the selector
//           provides one (optional — standing / no-support poses stay 2-ref)
//   Prompt = HEADLESS_STAGE1_PROMPT_BASE (+ built-in furniture clause when Ref 3)
//   No Flash / creative authority stack, no Talent in Stage 1
//
// Mechanical Stage-2 identity path remains frozen and untouched:
//   exactly two Nano Pro generation calls; identity applied only in Stage 2.
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
  /** Ignored — pose resolved from poseId via face-neutral loader. */
  poseImageUrl: string;
  poseId: string;
  modelIdentityId?: string | null;
  /** Ignored — production Flash shot prompts are not forwarded. */
  creativeShotPrompt?: string;
  /** Ignored — not passed to frozen orchestrator. */
  garmentReferenceCorrespondenceInstruction?: string;
  garmentEvidenceSetMappingInstruction?: string;
  garmentEvidenceHasBack?: boolean;
  garmentEvidenceHasDetail?: boolean;
  garmentReferenceMode?: string;
  /**
   * Selected StudioLayer furniture product reference (catalogue/selector PNG).
   * When present, forwarded as Stage-1 Ref 3 — sole furniture appearance authority.
   * When absent/null, Stage 1 remains GARMENT + POSE_MASTER only.
   */
  furnitureReferenceImageUrl?: string | null;
  /** Observability / usage accounting at the provider layer. */
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
  // Always load face-neutral Stage-1 Pose Master from poseId.
  const poseImageUrl = loadStage1PoseReferenceImageAsDataUri(input.poseId);

  const furnitureReferenceImageUrl =
    typeof input.furnitureReferenceImageUrl === "string" &&
    input.furnitureReferenceImageUrl.trim().length > 0
      ? input.furnitureReferenceImageUrl.trim()
      : null;

  const result = await generateNanoProHeadlessMannequinTrial({
    talentImageUrl: input.talentImageUrl,
    garmentImageUrl: input.garmentImageUrl,
    poseImageUrl,
    poseId: input.poseId,
    modelIdentityId: input.modelIdentityId ?? null,
    furnitureReferenceImageUrl,
    outputResolution: input.outputResolution,
  });

  if (!result.imageDataUri) {
    throw new Error(
      "headless-create-adapter: Headless Stage 2 produced no image",
    );
  }

  return result.imageDataUri;
}
