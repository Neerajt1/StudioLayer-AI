/**
 * Create evidence metadata — privacy-safe OpenRouter request snapshot.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildOpenRouterRequestEvidenceMetadata,
  resolveOpenRouterImagePartRoles,
} from "./openrouter-request-evidence.js";
import { buildFreshGenerationImageParts } from "./providers/OpenRouterProvider.js";
import {
  OPENROUTER_RENDERING_CONFIG,
  resolveOpenRouterModelForResolution,
  resolveOpenRouterRenderEngine,
} from "./rendering.config.js";

function withEngine<T>(engine: string | undefined, fn: () => T): T {
  const prev = process.env["OR_RENDER_ENGINE"];
  if (engine === undefined) delete process.env["OR_RENDER_ENGINE"];
  else process.env["OR_RENDER_ENGINE"] = engine;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env["OR_RENDER_ENGINE"];
    else process.env["OR_RENDER_ENGINE"] = prev;
  }
}

const FRONT = "https://example.invalid/front.png";
const SHEET = "data:image/png;base64,SHEET";
const TALENT = "https://example.invalid/talent.png";
const POSE = "https://example.invalid/pose.png";

describe("openrouter request evidence metadata", () => {
  it("A. Front only — GARMENT, TALENT, optional POSE_MASTER", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: FRONT,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
    });
    const roles = resolveOpenRouterImagePartRoles({
      hasFrontGarment: true,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
    });
    assert.deepEqual(roles, ["GARMENT", "TALENT", "POSE_MASTER"]);
    assert.equal(roles.length, parts.length);

    const meta = buildOpenRouterRequestEvidenceMetadata({
      renderId: 1,
      shotIndex: 0,
      resolvedModel: OPENROUTER_RENDERING_CONFIG.defaultModel,
      resolvedEngine: "flash",
      garmentEvidencePackaging: "sheet",
      evidenceMode: "sheet",
      garmentReferenceMode: "front_only",
      hasBackGarmentInput: false,
      hasDetailGarmentInput: false,
      garmentImageUrl: FRONT,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
      finalImagePartCount: parts.length,
    });

    assert.deepEqual(meta.finalImagePartRoles, ["GARMENT", "TALENT", "POSE_MASTER"]);
    assert.equal(meta.hasFrontGarment, true);
    assert.equal(meta.hasBackGarment, false);
    assert.equal(meta.hasDetailGarment, false);
    assert.equal(meta.hasGarmentSheet, false);
    assert.equal(meta.usedReferenceSheet, false);
    assert.equal(meta.hasTalent, true);
    assert.equal(meta.hasPoseMaster, true);
    assert.equal(meta.hasFurnitureImage, false);
    assert.equal(meta.hasEnvironmentImage, false);
    assert.equal(meta.finalImagePartCount, 3);
  });

  it("B. Front + Back sheet — GARMENT, GARMENT_SHEET, TALENT, POSE_MASTER", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: FRONT,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
      garmentEvidencePackaging: "sheet",
      garmentReferenceSheetImageUrl: SHEET,
    });
    const meta = buildOpenRouterRequestEvidenceMetadata({
      renderId: 2,
      shotIndex: 0,
      resolvedModel: OPENROUTER_RENDERING_CONFIG.defaultModel,
      resolvedEngine: "flash",
      garmentEvidencePackaging: "sheet",
      evidenceMode: "sheet",
      garmentReferenceMode: "front_back",
      hasBackGarmentInput: true,
      hasDetailGarmentInput: false,
      garmentImageUrl: FRONT,
      garmentReferenceSheetImageUrl: SHEET,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
      finalImagePartCount: parts.length,
    });

    assert.deepEqual(meta.finalImagePartRoles, [
      "GARMENT",
      "GARMENT_SHEET",
      "TALENT",
      "POSE_MASTER",
    ]);
    assert.equal(meta.finalImagePartRoles.length, parts.length);
    assert.equal(meta.hasBackGarment, true);
    assert.equal(meta.hasDetailGarment, false);
    assert.equal(meta.hasGarmentSheet, true);
    assert.equal(meta.usedReferenceSheet, true);
    assert.equal(meta.hasFurnitureImage, false);
    assert.equal(meta.hasEnvironmentImage, false);
  });

  it("C. Front + Detail sheet", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: FRONT,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
      garmentEvidencePackaging: "sheet",
      garmentReferenceSheetImageUrl: SHEET,
    });
    const meta = buildOpenRouterRequestEvidenceMetadata({
      renderId: 3,
      shotIndex: 0,
      resolvedModel: OPENROUTER_RENDERING_CONFIG.defaultModel,
      resolvedEngine: "flash",
      garmentEvidencePackaging: "sheet",
      garmentReferenceMode: "front_detail",
      hasBackGarmentInput: false,
      hasDetailGarmentInput: true,
      garmentImageUrl: FRONT,
      garmentReferenceSheetImageUrl: SHEET,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
      finalImagePartCount: parts.length,
    });

    assert.deepEqual(meta.finalImagePartRoles, [
      "GARMENT",
      "GARMENT_SHEET",
      "TALENT",
      "POSE_MASTER",
    ]);
    assert.equal(meta.hasBackGarment, false);
    assert.equal(meta.hasDetailGarment, true);
    assert.equal(meta.hasGarmentSheet, true);
  });

  it("D. Front + Back + Detail sheet", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: FRONT,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
      garmentEvidencePackaging: "sheet",
      garmentReferenceSheetImageUrl: SHEET,
    });
    const meta = buildOpenRouterRequestEvidenceMetadata({
      renderId: 4,
      shotIndex: 0,
      resolvedModel: OPENROUTER_RENDERING_CONFIG.defaultModel,
      resolvedEngine: "flash",
      garmentEvidencePackaging: "sheet",
      garmentReferenceMode: "front_back_detail",
      hasBackGarmentInput: true,
      hasDetailGarmentInput: true,
      garmentImageUrl: FRONT,
      garmentReferenceSheetImageUrl: SHEET,
      // Sheet path: Back/Detail URLs are NOT on the provider request.
      garmentBackImageUrl: undefined,
      garmentDetailImageUrl: undefined,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
      finalImagePartCount: parts.length,
    });

    assert.deepEqual(meta.finalImagePartRoles, [
      "GARMENT",
      "GARMENT_SHEET",
      "TALENT",
      "POSE_MASTER",
    ]);
    assert.equal(meta.hasBackGarment, true);
    assert.equal(meta.hasDetailGarment, true);
    assert.equal(meta.hasGarmentSheet, true);
    assert.equal(meta.garmentReferenceMode, "front_back_detail");
    // Roles must not invent separate Back/Detail parts on sheet path.
    assert.equal(meta.finalImagePartRoles.includes("GARMENT_BACK"), false);
    assert.equal(meta.finalImagePartRoles.includes("GARMENT_DETAIL"), false);
  });

  it("E/F. no furniture or environment image parts in roles", () => {
    const roles = resolveOpenRouterImagePartRoles({
      hasFrontGarment: true,
      garmentEvidencePackaging: "sheet",
      garmentReferenceSheetImageUrl: SHEET,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
    });
    assert.equal(roles.includes("FURNITURE"), false);
    assert.equal(roles.includes("ENVIRONMENT"), false);

    const meta = buildOpenRouterRequestEvidenceMetadata({
      renderId: 5,
      shotIndex: 0,
      resolvedModel: "google/gemini-3.1-flash-image",
      resolvedEngine: "flash",
      garmentEvidencePackaging: "sheet",
      garmentImageUrl: FRONT,
      garmentReferenceSheetImageUrl: SHEET,
      hasBackGarmentInput: true,
      hasDetailGarmentInput: true,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
      finalImagePartCount: roles.length,
    });
    assert.equal(meta.hasFurnitureImage, false);
    assert.equal(meta.hasEnvironmentImage, false);
  });

  it("G. default resolved model remains google/gemini-3.1-flash-image", () => {
    withEngine("flash", () => {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
      assert.equal(
        resolveOpenRouterModelForResolution("2K"),
        "google/gemini-3.1-flash-image",
      );
      assert.equal(
        OPENROUTER_RENDERING_CONFIG.defaultModel,
        "google/gemini-3.1-flash-image",
      );
    });
    withEngine(undefined, () => {
      assert.equal(
        resolveOpenRouterModelForResolution("2K"),
        "google/gemini-3.1-flash-image",
      );
    });
  });

  it("Front-only without pose omits POSE_MASTER", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: FRONT,
      modelImageUrl: TALENT,
    });
    const meta = buildOpenRouterRequestEvidenceMetadata({
      renderId: 6,
      shotIndex: 0,
      resolvedModel: OPENROUTER_RENDERING_CONFIG.defaultModel,
      resolvedEngine: "flash",
      garmentEvidencePackaging: "sheet",
      garmentImageUrl: FRONT,
      modelImageUrl: TALENT,
      finalImagePartCount: parts.length,
    });
    assert.deepEqual(meta.finalImagePartRoles, ["GARMENT", "TALENT"]);
    assert.equal(meta.hasPoseMaster, false);
  });
});
