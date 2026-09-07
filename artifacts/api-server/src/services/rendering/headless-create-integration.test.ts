import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHeadlessStage1Request,
  assembleHeadlessStage1Prompt,
  HEADLESS_STAGE1_PROMPT_BASE,
  HEADLESS_STAGE1_REFERENCE_ORDER,
  HEADLESS_STAGE1_REFERENCE_ORDER_WITHOUT_FURNITURE,
  HEADLESS_STAGE2_REFERENCE_ORDER,
  HEADLESS_STAGE2_PROMPT,
  HEADLESS_TRIAL_TOTAL_GENERATION_CALLS,
} from "./providers/nano-pro-headless-mannequin-trial.js";
import {
  isV1CreateHeadlessIdentityEnabled,
  V1_CREATE_USE_HEADLESS_IDENTITY_ENV,
  V1_CREATE_USE_NANO_PRO_CASCADE,
} from "./rendering.config.js";
import { resolveGenerationCreditCost } from "@workspace/studio-credit-engine";

const __dirname = dirname(fileURLToPath(import.meta.url));

const providerSrc = readFileSync(
  join(__dirname, "providers/OpenRouterProvider.ts"),
  "utf8",
);
const adapterSrc = readFileSync(
  join(__dirname, "headless-create-adapter.ts"),
  "utf8",
);
const aiPipelineSrc = readFileSync(
  join(__dirname, "../ai-pipeline.ts"),
  "utf8",
);

const FROZEN_HEADLESS_FILES = [
  "providers/nano-pro-headless-mannequin-trial.ts",
  "providers/nano-pro-headless-mannequin-trial.test.ts",
  "../image-processing/headless-head-mask.ts",
  "../image-processing/headless-head-mask.test.ts",
  "../image-processing/face-anchor-detector.ts",
  "../image-processing/talent-identity-reference.ts",
  "../image-processing/talent-identity-reference.test.ts",
];

const GARMENT = "data:image/png;base64,GARMENT_FRONT";
const POSE = "data:image/png;base64,POSE_MASTER_FACE_NEUTRAL";

describe("Headless Create production flag", () => {
  it("1. V1_CREATE_USE_HEADLESS_IDENTITY is OFF by default", () => {
    assert.equal(isV1CreateHeadlessIdentityEnabled({}), false);
    assert.equal(
      isV1CreateHeadlessIdentityEnabled({
        [V1_CREATE_USE_HEADLESS_IDENTITY_ENV]: "true",
      }),
      true,
    );
    assert.equal(
      isV1CreateHeadlessIdentityEnabled({
        [V1_CREATE_USE_HEADLESS_IDENTITY_ENV]: "1",
      }),
      true,
    );
    assert.equal(V1_CREATE_USE_NANO_PRO_CASCADE, false);
  });

  it("2. production Create remains single-pass Flash when Headless flag is OFF", () => {
    assert.match(
      providerSrc,
      /const useHeadlessCreate =\s*\n\s*!isRefinement &&\s*\n\s*isV1CreateHeadlessIdentityEnabled\(\) &&\s*\n\s*!V1_CREATE_USE_NANO_PRO_CASCADE/,
    );
    assert.match(providerSrc, /if \(useHeadlessCreate\)/);
    assert.match(providerSrc, /} else if \(useCreateCascade\)/);
    const elseBranch = providerSrc.slice(providerSrc.indexOf("} else {"));
    assert.match(elseBranch, /generateSingleShot\(/);
  });

  it("3. production Create enters Headless branch when flag is ON (source wiring)", () => {
    assert.match(providerSrc, /headless-create-adapter\.js/);
    assert.match(providerSrc, /runHeadlessCreateShot\(/);
    assert.match(providerSrc, /headlessCreate: useHeadlessCreate/);
    assert.doesNotMatch(
      providerSrc.slice(
        providerSrc.indexOf("if (useHeadlessCreate)"),
        providerSrc.indexOf("} else if (useCreateCascade)"),
      ),
      /generateSingleShot\(/,
    );
  });
});

describe("Headless Create — frozen two-call contract", () => {
  it("4. frozen orchestrator budget remains exactly two Nano Pro calls", () => {
    assert.equal(HEADLESS_TRIAL_TOTAL_GENERATION_CALLS, 2);
  });

  it("5. adapter delegates to frozen generateNanoProHeadlessMannequinTrial once per shot", () => {
    assert.match(adapterSrc, /generateNanoProHeadlessMannequinTrial\(/);
    assert.equal(
      (adapterSrc.match(/generateNanoProHeadlessMannequinTrial\(/g) ?? [])
        .length,
      1,
    );
  });

  it("6. Stage 1/2 reference order matches approved contract", () => {
    assert.deepEqual(HEADLESS_STAGE1_REFERENCE_ORDER, [
      "GARMENT",
      "POSE_MASTER",
      "FURNITURE",
    ]);
    assert.deepEqual(HEADLESS_STAGE1_REFERENCE_ORDER_WITHOUT_FURNITURE, [
      "GARMENT",
      "POSE_MASTER",
    ]);
    assert.deepEqual(HEADLESS_STAGE2_REFERENCE_ORDER, [
      "HEADLESS_BASE",
      "IDENTITY_REFERENCE",
    ]);
  });
});

describe("Headless Create — proven Stage-1 trial parity", () => {
  it("7. production adapter does not assemble or forward Flash/authority creative stack", () => {
    assert.doesNotMatch(adapterSrc, /assembleHeadlessCreateStage1CreativePrompt/);
    assert.doesNotMatch(adapterSrc, /headless-create-stage1-authority/);
    assert.doesNotMatch(adapterSrc, /STUDIO_BACKGROUND_AUTHORITY/);
    assert.doesNotMatch(adapterSrc, /GARMENT_AUTHORITY_SOT/);
    const orchestratorCall = adapterSrc.slice(
      adapterSrc.indexOf("generateNanoProHeadlessMannequinTrial("),
    );
    assert.doesNotMatch(orchestratorCall, /creativeShotPrompt/);
    assert.doesNotMatch(orchestratorCall, /furnitureReferenceImageUrl/);
  });

  it("8. production Stage-1 runtime payload is exactly GARMENT + POSE_MASTER", () => {
    const built = buildHeadlessStage1Request({
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
    });
    assert.equal(built.body.input_references.length, 2);
    assert.deepEqual(
      [...built.referenceOrder],
      [...HEADLESS_STAGE1_REFERENCE_ORDER_WITHOUT_FURNITURE],
    );
    assert.equal(built.body.input_references[0]!.image_url.url, GARMENT);
    assert.equal(built.body.input_references[1]!.image_url.url, POSE);
    assert.equal(built.promptUsed, HEADLESS_STAGE1_PROMPT_BASE);
    assert.equal(assembleHeadlessStage1Prompt({}), HEADLESS_STAGE1_PROMPT_BASE);
  });

  it("8b. Stage-1 prompt excludes Flash garmentInstruction conflict language", () => {
    const p = HEADLESS_STAGE1_PROMPT_BASE;
    assert.doesNotMatch(p, /WHAT MAY VARY NATURALLY/);
    assert.doesNotMatch(p, /complementary clothing items/i);
    assert.doesNotMatch(p, /COMPLETE GARMENT REPLACEMENT/);
    assert.doesNotMatch(p, /BACKGROUND AUTHORITY — PURE WHITE/);
    assert.doesNotMatch(p, /BACKGROUND PIXEL PRECISION/);
    assert.doesNotMatch(p, /SUPPLEMENTAL GARMENT EVIDENCE/);
    assert.doesNotMatch(p, /HUMAN POSE GEOMETRY AUTHORITY/);
    assert.doesNotMatch(p, /FURNITURE REFERENCE AUTHORITY/);
    assert.match(p, /Neutral pure white studio background/);
    assert.match(p, /Do not use grey, cream, beige, or tinted backgrounds/);
    assert.ok(p.length < 2500, `expected short Stage-1 base, got ${p.length}`);
  });

  it("8c. orchestrator still capable of furniture when explicitly requested (not used by adapter)", () => {
    const furnitureUrl = "data:image/png;base64,FURNITURE_REF";
    const built = buildHeadlessStage1Request({
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      furnitureReferenceImageUrl: furnitureUrl,
    });
    assert.equal(built.body.input_references.length, 3);
    assert.equal(built.body.input_references[2]!.image_url.url, furnitureUrl);
  });
});

describe("Headless Create — billing and fail-closed", () => {
  it("9. no separate credit path — Create lifecycle unchanged in ai-pipeline", () => {
    assert.match(aiPipelineSrc, /onComplete/);
    assert.match(aiPipelineSrc, /perShotFurnitureAssetIds/);
    assert.doesNotMatch(adapterSrc, /studio_credit|deduct|finalizeGeneration/);
    assert.doesNotMatch(
      providerSrc.slice(providerSrc.indexOf("if (useHeadlessCreate)")),
      /resolveGenerationCreditCost/,
    );
    assert.equal(
      resolveGenerationCreditCost({ imageCount: 1, outputResolution: "2K" }),
      1.5,
    );
  });

  it("10. Headless failure does not fall back to single-pass generation", () => {
    const headlessBlock = providerSrc.slice(
      providerSrc.indexOf("if (useHeadlessCreate)"),
      providerSrc.indexOf("} else if (useCreateCascade)"),
    );
    assert.match(
      headlessBlock,
      /Headless Create shot failed — no single-pass fallback/,
    );
    assert.doesNotMatch(headlessBlock, /generateSingleShot\(/);
    assert.match(adapterSrc, /Throws on any Headless contract failure/);
  });
});

describe("Headless Create — multi-shot isolation", () => {
  it("11. each shot receives its own pose reference and calls runHeadlessCreateShot independently", () => {
    const headlessBlock = providerSrc.slice(
      providerSrc.indexOf("if (useHeadlessCreate)"),
      providerSrc.indexOf("} else if (useCreateCascade)"),
    );
    assert.match(headlessBlock, /perShotPoseReferenceUrls\?\.\[i\]/);
    assert.match(headlessBlock, /identityForensics\?\.perShotPoseIds\?\.\[i\]/);
    assert.match(headlessBlock, /shotIndex: i/);
    assert.match(headlessBlock, /talentImageUrl: modelImageUrl/);
    assert.doesNotMatch(headlessBlock, /identityCrop.*\[i - 1\]/i);
  });

  it("12. adapter passes original talent URL for identity crop (not stage output)", () => {
    assert.match(adapterSrc, /talentImageUrl: input\.talentImageUrl/);
    assert.doesNotMatch(adapterSrc, /headlessBaseImageUrl|HEADLESS_BASE/);
    assert.doesNotMatch(adapterSrc, /maskedDataUri/);
  });

  it("13. adapter ignores Flash creative / furniture inputs for Stage-1 generation", () => {
    assert.match(adapterSrc, /Ignored for trial parity/);
    const orchestratorCall = adapterSrc.slice(
      adapterSrc.indexOf("generateNanoProHeadlessMannequinTrial("),
    );
    assert.doesNotMatch(orchestratorCall, /creativeShotPrompt/);
    assert.doesNotMatch(orchestratorCall, /furnitureReferenceImageUrl/);
  });

  it("13b. adapter resolves face-neutral Pose Master from poseId", () => {
    assert.match(adapterSrc, /loadStage1PoseReferenceImageAsDataUri\(input\.poseId\)/);
    const orchestratorCall = adapterSrc.slice(
      adapterSrc.indexOf("generateNanoProHeadlessMannequinTrial("),
    );
    assert.doesNotMatch(orchestratorCall, /poseImageUrl: input\.poseImageUrl/);
  });

  it("13c. Stage 2 prompt and reference order unchanged", () => {
    assert.deepEqual(HEADLESS_STAGE2_REFERENCE_ORDER, [
      "HEADLESS_BASE",
      "IDENTITY_REFERENCE",
    ]);
    assert.match(HEADLESS_STAGE2_PROMPT, /HEADLESS MANNEQUIN STAGE 2/);
    assert.match(HEADLESS_STAGE2_PROMPT, /LOCKED — reproduce from Reference Image 1/);
  });
});

describe("Headless Create — frozen baseline untouched by adapter", () => {
  it("14. integration imports frozen module without modifying it", () => {
    for (const rel of FROZEN_HEADLESS_FILES) {
      const abs = join(__dirname, rel);
      const src = readFileSync(abs, "utf8");
      assert.doesNotMatch(src, /headless-create-adapter/);
      assert.doesNotMatch(src, /headless-create-stage1-authority/);
      assert.doesNotMatch(src, /V1_CREATE_USE_HEADLESS_IDENTITY/);
    }
    assert.doesNotMatch(
      readFileSync(
        join(__dirname, "providers/nano-pro-headless-mannequin-trial.ts"),
        "utf8",
      ),
      /runHeadlessCreateShot/,
    );
  });
});
