import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleHeadlessCreateStage1CreativePrompt,
  HEADLESS_STAGE1_FURNITURE_REF,
  HEADLESS_STAGE1_GARMENT_REF,
  HEADLESS_STAGE1_POSE_REF,
} from "./headless-create-stage1-authority.js";
import {
  buildHeadlessStage1Request,
  HEADLESS_STAGE1_REFERENCE_ORDER,
  HEADLESS_STAGE1_REFERENCE_ORDER_WITHOUT_FURNITURE,
  HEADLESS_STAGE2_REFERENCE_ORDER,
} from "./providers/nano-pro-headless-mannequin-trial.js";
import {
  isV1CreateHeadlessIdentityEnabled,
  V1_CREATE_USE_HEADLESS_IDENTITY_ENV,
  V1_CREATE_USE_NANO_PRO_CASCADE,
} from "./rendering.config.js";
import { HEADLESS_TRIAL_TOTAL_GENERATION_CALLS } from "./providers/nano-pro-headless-mannequin-trial.js";
import { resolveGenerationCreditCost } from "@workspace/studio-credit-engine";
import { getFurnitureAsset } from "../../intelligence/furniture-catalog.js";

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

describe("Headless Create — furniture contract", () => {
  const FURNITURE_URL = "data:image/png;base64,FURNITURE_REF";

  it("7. furniture Ref 3 authority only when PNG URL is present", () => {
    const asset = getFurnitureAsset("furn_chair_solid_walnut_editorial");
    assert.ok(asset);
    const withFurniture = assembleHeadlessCreateStage1CreativePrompt({
      shotPrompt: "Editorial hero frame.",
      furnitureReferenceImageUrl: FURNITURE_URL,
      furnitureAsset: asset,
    });
    assert.match(
      withFurniture,
      new RegExp(
        `FURNITURE REFERENCE AUTHORITY — REFERENCE IMAGE ${HEADLESS_STAGE1_FURNITURE_REF}`,
      ),
    );
    assert.match(withFurniture, /Exactly three reference images are attached/);

    const withoutFurniture = assembleHeadlessCreateStage1CreativePrompt({
      shotPrompt: "Editorial hero frame.",
    });
    assert.doesNotMatch(withoutFurniture, /FURNITURE REFERENCE AUTHORITY/);
    assert.match(withoutFurniture, /Exactly two reference images are attached/);
  });

  it("8. adapter forwards furniture PNG to frozen orchestrator", () => {
    assert.match(adapterSrc, /furnitureReferenceImageUrl/);
    assert.match(adapterSrc, /generateNanoProHeadlessMannequinTrial\(/);
  });

  it("8b. frozen builder attaches furniture as third image reference", () => {
    const built = buildHeadlessStage1Request({
      garmentImageUrl: "data:image/png;base64,G",
      poseImageUrl: "data:image/png;base64,P",
      furnitureReferenceImageUrl: FURNITURE_URL,
    });
    assert.equal(built.body.input_references.length, 3);
    assert.equal(built.body.input_references[2]!.image_url.url, FURNITURE_URL);
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
    assert.match(headlessBlock, /perShotFurnitureReferenceUrls\?\.\[i\]/);
    assert.match(headlessBlock, /perShotFurnitureAssetIds\?\.\[i\]/);
    assert.match(headlessBlock, /shotIndex: i/);
    assert.match(headlessBlock, /talentImageUrl: modelImageUrl/);
    assert.doesNotMatch(headlessBlock, /identityCrop.*\[i - 1\]/i);
  });

  it("12. adapter passes original talent URL for identity crop (not stage output)", () => {
    assert.match(adapterSrc, /talentImageUrl: input\.talentImageUrl/);
    assert.doesNotMatch(adapterSrc, /headlessBaseImageUrl|HEADLESS_BASE/);
    assert.doesNotMatch(adapterSrc, /maskedDataUri/);
  });

  it("13. Stage-1 prompt contract uses Ref 1 garment and Ref 2 pose", () => {
    const prompt = assembleHeadlessCreateStage1CreativePrompt({
      shotPrompt: "POSE:\nWalk.",
    });
    assert.match(
      prompt,
      new RegExp(`Reference Image ${HEADLESS_STAGE1_GARMENT_REF} = GARMENT`),
    );
    assert.match(
      prompt,
      new RegExp(`Reference Image ${HEADLESS_STAGE1_POSE_REF} = POSE MASTER`),
    );
  });
});

describe("Headless Create — frozen baseline untouched", () => {
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
