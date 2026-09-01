// ---------------------------------------------------------------------------
// Production Create — Headless Mannequin adapter
//
// Maps the existing Create pipeline inputs to the frozen Headless orchestrator
// without modifying nano-pro-headless-mannequin-trial.ts or image-processing.
//
// Stage 1 image refs remain GARMENT + POSE_MASTER (frozen). Furniture appearance
// authority is appended to the Stage 1 creative brief when a furniture reference
// URL is present for the shot — matching production furniture semantics in prose.
// ---------------------------------------------------------------------------

import {
  buildFurnitureReferenceAuthorityLayer,
  buildFurnitureReferencePrimaryPointer,
} from "../../rendering/furniture-reference-appearance-authority.js";
import { STUDIO_BACKGROUND_AUTHORITY_SOT } from "./rendering-studio-background-authority.js";
import {
  generateNanoProHeadlessMannequinTrial,
} from "./providers/nano-pro-headless-mannequin-trial.js";
import type { NativeOutputResolution } from "./rendering.config.js";

/** Logical furniture reference index for Headless Stage 1 creative brief. */
export const HEADLESS_CREATE_FURNITURE_REFERENCE_IMAGE_NUMBER = 3 as const;

export type HeadlessCreateShotInput = {
  shotIndex: number;
  talentImageUrl: string;
  garmentImageUrl: string;
  poseImageUrl: string;
  poseId: string;
  modelIdentityId?: string | null;
  creativeShotPrompt?: string;
  garmentReferenceCorrespondenceInstruction?: string;
  furnitureReferenceImageUrl?: string | null;
  outputResolution?: NativeOutputResolution;
};

/**
 * Assemble the Stage 1 creative brief for production Create.
 * Does not alter frozen Headless reference order or prompts.
 */
export function assembleHeadlessCreateStage1CreativePrompt(params: {
  shotPrompt: string;
  garmentReferenceCorrespondenceInstruction?: string;
  furnitureReferenceImageUrl?: string | null;
}): string {
  const parts: string[] = [STUDIO_BACKGROUND_AUTHORITY_SOT];

  const shotPrompt = params.shotPrompt.trim();
  if (shotPrompt) parts.push(shotPrompt);

  const correspondence = params.garmentReferenceCorrespondenceInstruction?.trim();
  if (correspondence) parts.push(correspondence);

  if (params.furnitureReferenceImageUrl) {
    parts.push(
      buildFurnitureReferencePrimaryPointer(
        HEADLESS_CREATE_FURNITURE_REFERENCE_IMAGE_NUMBER,
      ),
    );
    parts.push(
      buildFurnitureReferenceAuthorityLayer(
        HEADLESS_CREATE_FURNITURE_REFERENCE_IMAGE_NUMBER,
      ),
    );
  }

  return parts.join("\n\n");
}

/**
 * Run the frozen two-stage Headless flow for one production Create shot.
 * Throws on any Headless contract failure — callers must not fall back to
 * single-pass generation when the production Headless flag is enabled.
 */
export async function runHeadlessCreateShot(
  input: HeadlessCreateShotInput,
): Promise<string> {
  const creativeShotPrompt = assembleHeadlessCreateStage1CreativePrompt({
    shotPrompt: input.creativeShotPrompt ?? "",
    garmentReferenceCorrespondenceInstruction:
      input.garmentReferenceCorrespondenceInstruction,
    furnitureReferenceImageUrl: input.furnitureReferenceImageUrl,
  });

  const result = await generateNanoProHeadlessMannequinTrial({
    talentImageUrl: input.talentImageUrl,
    garmentImageUrl: input.garmentImageUrl,
    poseImageUrl: input.poseImageUrl,
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
