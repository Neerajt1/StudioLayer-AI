import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPoseMasterReferenceAuthorityLayer,
} from "../../intelligence/pose-selection-engine.js";
import { buildGarmentFidelityCloser } from "../../intelligence/furniture-selector.js";
import { getFurnitureAsset } from "../../intelligence/furniture-catalog.js";
import {
  HEADLESS_STAGE1_FURNITURE_REF,
  HEADLESS_STAGE1_GARMENT_REF,
  HEADLESS_STAGE1_POSE_REF,
  adaptFlashShotPromptForHeadlessStage1,
  assembleHeadlessCreateStage1CreativePrompt,
  buildHeadlessStage1ReferenceContract,
  headlessPromptAvoidsPhantomImageRefs,
  headlessPromptClaimsUnattachedReference,
  headlessPromptUsesPoseRef2,
} from "./headless-create-stage1-authority.js";
import {
  buildHeadlessStage1Request,
  HEADLESS_STAGE1_REFERENCE_ORDER,
  HEADLESS_STAGE1_REFERENCE_ORDER_WITHOUT_FURNITURE,
  HEADLESS_STAGE2_REFERENCE_ORDER,
} from "./providers/nano-pro-headless-mannequin-trial.js";
import { GARMENT_AUTHORITY_SOT } from "./rendering.config.js";
import { STUDIO_BACKGROUND_AUTHORITY_SOT } from "./rendering-studio-background-authority.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const adapterSrc = readFileSync(
  join(__dirname, "headless-create-adapter.ts"),
  "utf8",
);
const providerSrc = readFileSync(
  join(__dirname, "providers/OpenRouterProvider.ts"),
  "utf8",
);
const frozenSrc = readFileSync(
  join(__dirname, "providers/nano-pro-headless-mannequin-trial.ts"),
  "utf8",
);

const GARMENT = "data:image/png;base64,GARMENT";
const POSE = "data:image/png;base64,POSE";
const FURNITURE = "data:image/png;base64,FURNITURE";

const SAMPLE_POSE_PROMPT = buildPoseMasterReferenceAuthorityLayer(
  "Pose68",
  "Lean on Stool",
  "POSE DESCRIPTION:\nLean supported on a tall stool.",
  true,
);

const SAMPLE_FLASH_SHOT = `${SAMPLE_POSE_PROMPT}

SHOT DIRECTION — Editorial (photography only):
Full-length frame.

${buildGarmentFidelityCloser()}`;

describe("Headless Stage-1 authority contract", () => {
  it("A. without furniture — Ref 1 GARMENT, Ref 2 POSE_MASTER only", () => {
    const built = buildHeadlessStage1Request({
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
    });
    assert.deepEqual(
      [...built.referenceOrder],
      [...HEADLESS_STAGE1_REFERENCE_ORDER_WITHOUT_FURNITURE],
    );
    assert.equal(built.body.input_references.length, 2);
  });

  it("B. with furniture — Ref 1 GARMENT, Ref 2 POSE_MASTER, Ref 3 FURNITURE", () => {
    const built = buildHeadlessStage1Request({
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      furnitureReferenceImageUrl: FURNITURE,
    });
    assert.deepEqual([...built.referenceOrder], [...HEADLESS_STAGE1_REFERENCE_ORDER]);
    assert.equal(built.body.input_references.length, 3);
    assert.equal(built.body.input_references[2]!.image_url.url, FURNITURE);
  });

  it("C. Ref 3 is the actual selected furniture reference URL", () => {
    const built = buildHeadlessStage1Request({
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      furnitureReferenceImageUrl: FURNITURE,
    });
    assert.equal(built.body.input_references[2]!.image_url.url, FURNITURE);
    assert.equal(built.referenceOrder[2], "FURNITURE");
  });

  it("D. pose authority points to Ref 2", () => {
    const prompt = assembleHeadlessCreateStage1CreativePrompt({
      shotPrompt: SAMPLE_FLASH_SHOT,
      furnitureReferenceImageUrl: FURNITURE,
    });
    assert.equal(headlessPromptUsesPoseRef2(prompt), true);
    assert.match(
      prompt,
      new RegExp(
        `Reference Image ${HEADLESS_STAGE1_POSE_REF} is the Pose Master visual geometry`,
      ),
    );
  });

  it("E. furniture authority points to Ref 3 only when Ref 3 exists", () => {
    const withFurniture = assembleHeadlessCreateStage1CreativePrompt({
      shotPrompt: SAMPLE_FLASH_SHOT,
      furnitureReferenceImageUrl: FURNITURE,
    });
    assert.match(
      withFurniture,
      new RegExp(
        `FURNITURE REFERENCE AUTHORITY — REFERENCE IMAGE ${HEADLESS_STAGE1_FURNITURE_REF}`,
      ),
    );
    assert.match(
      withFurniture,
      new RegExp(
        `REFERENCE IMAGE ${HEADLESS_STAGE1_FURNITURE_REF}`,
      ),
    );
  });

  it("F. no phantom furniture Ref 3 when furniture is absent", () => {
    const withoutFurniture = assembleHeadlessCreateStage1CreativePrompt({
      shotPrompt: SAMPLE_FLASH_SHOT,
    });
    assert.doesNotMatch(
      withoutFurniture,
      /FURNITURE REFERENCE AUTHORITY — REFERENCE IMAGE 3/,
    );
    assert.match(withoutFurniture, /Exactly two reference images are attached/);
    assert.equal(
      headlessPromptAvoidsPhantomImageRefs(withoutFurniture, false),
      true,
    );
  });

  it("G. Pose Master furniture non-authoritative when Ref 3 exists", () => {
    const prompt = assembleHeadlessCreateStage1CreativePrompt({
      shotPrompt: SAMPLE_FLASH_SHOT,
      furnitureReferenceImageUrl: FURNITURE,
    });
    assert.match(
      prompt,
      /Reference Image 2 is NOT authoritative for furniture design or material when Reference Image 3 is attached/,
    );
    assert.match(
      prompt,
      /Replace the furniture drawn in the Pose Master with the piece shown in Reference Image 3/,
    );
  });

  it("H. garment authority points to Ref 1", () => {
    const prompt = assembleHeadlessCreateStage1CreativePrompt({
      shotPrompt: SAMPLE_FLASH_SHOT,
      furnitureReferenceImageUrl: FURNITURE,
    });
    assert.match(prompt, new RegExp(GARMENT_AUTHORITY_SOT.slice(0, 40)));
    assert.match(
      prompt,
      new RegExp(`Reference Image ${HEADLESS_STAGE1_GARMENT_REF} = GARMENT`),
    );
    assert.doesNotMatch(prompt, /from the primary instruction/i);
  });

  it("I. white-background authority remains present", () => {
    const prompt = assembleHeadlessCreateStage1CreativePrompt({
      shotPrompt: "Editorial walk.",
      furnitureReferenceImageUrl: FURNITURE,
    });
    assert.match(prompt, /BACKGROUND AUTHORITY/);
    assert.match(prompt, /#FFFFFF/);
    assert.equal(prompt.startsWith(STUDIO_BACKGROUND_AUTHORITY_SOT), true);
  });
});

describe("Headless Stage-1 — frozen reference order", () => {
  it("J. Stage 2 remains HEADLESS_BASE → IDENTITY_REFERENCE", () => {
    assert.deepEqual(HEADLESS_STAGE2_REFERENCE_ORDER, [
      "HEADLESS_BASE",
      "IDENTITY_REFERENCE",
    ]);
    const stage2Block = frozenSrc.slice(
      frozenSrc.indexOf("export const HEADLESS_STAGE2_REFERENCE_ORDER"),
      frozenSrc.indexOf("export const HEADLESS_TRIAL_TOTAL_GENERATION_CALLS"),
    );
    assert.doesNotMatch(stage2Block, /FURNITURE/);
  });

  it("K. exactly two Nano Pro generation calls remain", () => {
    assert.equal(
      (frozenSrc.match(/await callNanoProImagesOnce\(/g) ?? []).length,
      2,
    );
  });

  it("L. adapter passes original talent URL; furniture and Flash prompt not forwarded (trial parity)", () => {
    assert.match(adapterSrc, /talentImageUrl: input\.talentImageUrl/);
    assert.match(adapterSrc, /loadStage1PoseReferenceImageAsDataUri\(input\.poseId\)/);
    const orchestratorCall = adapterSrc.slice(
      adapterSrc.indexOf("generateNanoProHeadlessMannequinTrial("),
    );
    assert.doesNotMatch(orchestratorCall, /furnitureReferenceImageUrl/);
    assert.doesNotMatch(orchestratorCall, /creativeShotPrompt/);
  });
});

describe("Headless Create — provider wiring", () => {
  it("M. Headless branch passes furniture PNG URL and asset id", () => {
    const headlessBlock = providerSrc.slice(
      providerSrc.indexOf("if (useHeadlessCreate)"),
      providerSrc.indexOf("} else if (useCreateCascade)"),
    );
    assert.match(headlessBlock, /furnitureReferenceImageUrl/);
    assert.match(headlessBlock, /perShotFurnitureReferenceUrls\?\.\[i\]/);
    assert.match(headlessBlock, /furnitureAssetId/);
  });

  it("N. Flash path unchanged — still uses furnitureReferenceImageUrl in generateSingleShot", () => {
    const flashBlock = providerSrc.slice(providerSrc.indexOf("} else {"));
    assert.match(flashBlock, /furnitureReferenceImageUrl/);
    assert.match(flashBlock, /generateSingleShot\(/);
  });
});

describe("Headless Stage-1 reference contract text", () => {
  it("contract reflects two vs three attached images", () => {
    assert.match(
      buildHeadlessStage1ReferenceContract(false),
      /Exactly two reference images are attached/,
    );
    assert.match(
      buildHeadlessStage1ReferenceContract(true),
      /Exactly three reference images are attached/,
    );
  });

  it("guardrails reject unattached furniture claims", () => {
    const bad = assembleHeadlessCreateStage1CreativePrompt({
      shotPrompt: SAMPLE_FLASH_SHOT,
    });
    assert.equal(headlessPromptClaimsUnattachedReference(bad, false), false);

    const good = assembleHeadlessCreateStage1CreativePrompt({
      shotPrompt: SAMPLE_FLASH_SHOT,
      furnitureReferenceImageUrl: FURNITURE,
    });
    assert.equal(headlessPromptClaimsUnattachedReference(good, true), false);
  });
});
