import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleHeadlessCreateStage1CreativePrompt,
  HEADLESS_CREATE_FURNITURE_REFERENCE_IMAGE_NUMBER,
} from "./headless-create-adapter.js";
import {
  HEADLESS_STAGE1_REFERENCE_ORDER,
  HEADLESS_STAGE2_REFERENCE_ORDER,
} from "./providers/nano-pro-headless-mannequin-trial.js";
import {
  isV1CreateHeadlessIdentityEnabled,
  V1_CREATE_USE_HEADLESS_IDENTITY_ENV,
  V1_CREATE_USE_NANO_PRO_CASCADE,
} from "./rendering.config.js";
import { HEADLESS_TRIAL_TOTAL_GENERATION_CALLS } from "./providers/nano-pro-headless-mannequin-trial.js";
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

  it("6. Stage 1/2 reference order re-exported unchanged from frozen module", () => {
    assert.deepEqual(HEADLESS_STAGE1_REFERENCE_ORDER, [
      "GARMENT",
      "POSE_MASTER",
    ]);
    assert.deepEqual(HEADLESS_STAGE2_REFERENCE_ORDER, [
      "HEADLESS_BASE",
      "IDENTITY_REFERENCE",
    ]);
  });
});

describe("Headless Create — furniture compatibility", () => {
  it("7. furniture authority is carried in Stage 1 creative brief when URL present", () => {
    const withFurniture = assembleHeadlessCreateStage1CreativePrompt({
      shotPrompt: "Editorial hero frame.",
      furnitureReferenceImageUrl: "https://cdn.example/furniture.png",
    });
    assert.match(
      withFurniture,
      new RegExp(
        `REFERENCE IMAGE ${HEADLESS_CREATE_FURNITURE_REFERENCE_IMAGE_NUMBER}`,
      ),
    );
    assert.match(withFurniture, /FURNITURE REFERENCE AUTHORITY/);

    const withoutFurniture = assembleHeadlessCreateStage1CreativePrompt({
      shotPrompt: "Editorial hero frame.",
    });
    assert.doesNotMatch(withoutFurniture, /FURNITURE REFERENCE AUTHORITY/);
  });

  it("8. adapter does not add furniture as a Stage 1 image reference", () => {
    assert.doesNotMatch(adapterSrc, /input_references/);
    assert.doesNotMatch(adapterSrc, /FURNITURE.*image_url/);
  });
});

describe("Headless Create — billing and fail-closed", () => {
  it("9. no separate credit path — Create lifecycle unchanged in ai-pipeline", () => {
    assert.match(aiPipelineSrc, /onComplete/);
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
    assert.match(headlessBlock, /shotIndex: i/);
    assert.match(headlessBlock, /talentImageUrl: modelImageUrl/);
    assert.doesNotMatch(headlessBlock, /identityCrop.*\[i - 1\]/i);
  });

  it("12. adapter passes original talent URL for identity crop (not stage output)", () => {
    assert.match(adapterSrc, /talentImageUrl: input\.talentImageUrl/);
    assert.doesNotMatch(adapterSrc, /stage1|HEADLESS_BASE/);
  });
});

describe("Headless Create — frozen baseline untouched", () => {
  it("13. integration imports frozen module without modifying it", () => {
    for (const rel of FROZEN_HEADLESS_FILES) {
      const abs = join(__dirname, rel);
      const src = readFileSync(abs, "utf8");
      assert.doesNotMatch(src, /headless-create-adapter/);
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
