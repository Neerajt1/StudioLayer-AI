import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NANO_PRO_PRODUCTION_REFERENCE_ORDER,
  NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL,
  NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
  NANO_PRO_TALENT_ONLY_REFERENCE_ORDER,
  buildNanoProTalentOnlyIdentityExperimentRequest,
} from "./nano-pro-talent-only-identity-experiment.js";
import {
  assembleFreshGenerationPrimaryInstruction,
  buildFreshGenerationImageParts,
} from "./OpenRouterProvider.js";
import { assembleNanoProImagesApiPrompt } from "../nano-pro-authority-layers.js";
import { OPENROUTER_RENDERING_CONFIG } from "../rendering.config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiServerSrc = join(__dirname, "../../..");

const GARMENT = "data:image/png;base64,GARMENT_BYTES_FIXTURE";
const TALENT = "data:image/jpeg;base64,TALENT_BYTES_FIXTURE";
const POSE = "data:image/png;base64,POSE_MASTER_BYTES_FIXTURE";
const CREATIVE = "Editorial three-quarter framing. Soft natural light.";

describe("nano-pro-talent-only-identity-experiment", () => {
  it("1. production Nano Pro request construction remains unchanged", () => {
    const providerSrc = readFileSync(
      join(__dirname, "OpenRouterProvider.ts"),
      "utf8",
    );
    assert.match(providerSrc, /assembleNanoProImagesApiPrompt/);
    assert.match(providerSrc, /mapImagePartsToNanoProInputReferences/);
    assert.match(providerSrc, /useNanoProImagesApi/);
    assert.match(providerSrc, /buildFreshGenerationImageParts/);
    assert.equal(
      providerSrc.includes("nano-pro-talent-only-identity-experiment"),
      false,
    );
    assert.equal(
      providerSrc.includes("NANO_PRO_TALENT_ONLY_IDENTITY"),
      false,
    );
    assert.equal(
      providerSrc.includes("generateNanoProTalentOnlyIdentityExperiment"),
      false,
    );

    // Experiment CONTROL still mirrors production G→T→P via shared builders
    const built = buildNanoProTalentOnlyIdentityExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
    });
    const productionParts = buildFreshGenerationImageParts({
      garmentImageUrl: GARMENT,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
    });
    assert.equal(built.productionControl.body.input_references.length, 3);
    assert.equal(
      built.productionControl.body.input_references[0]!.image_url.url,
      productionParts[0]!.image_url.url,
    );
    assert.equal(
      built.productionControl.body.input_references[1]!.image_url.url,
      productionParts[1]!.image_url.url,
    );
    assert.equal(
      built.productionControl.body.input_references[2]!.image_url.url,
      productionParts[2]!.image_url.url,
    );
  });

  it("2. experimental request uses google/gemini-3-pro-image", () => {
    assert.equal(
      NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_MODEL,
      "google/gemini-3-pro-image",
    );
    const built = buildNanoProTalentOnlyIdentityExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
    });
    assert.equal(
      built.talentOnlyExperiment.body.model,
      "google/gemini-3-pro-image",
    );
    assert.equal(
      built.productionControl.body.model,
      "google/gemini-3-pro-image",
    );
  });

  it("3. experimental request uses exactly one input_reference", () => {
    const built = buildNanoProTalentOnlyIdentityExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
    });
    assert.equal(built.talentOnlyExperiment.body.input_references.length, 1);
    assert.deepEqual(
      [...built.talentOnlyExperiment.referenceOrder],
      ["TALENT"],
    );
    assert.deepEqual([...NANO_PRO_TALENT_ONLY_REFERENCE_ORDER], ["TALENT"]);
  });

  it("4. that reference is the existing Studio Talent asset", () => {
    const built = buildNanoProTalentOnlyIdentityExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
    });
    assert.equal(
      built.talentOnlyExperiment.body.input_references[0]!.image_url.url,
      TALENT,
    );
    // Same bytes/URL as production control Ref 2 (Talent)
    assert.equal(
      built.talentOnlyExperiment.body.input_references[0]!.image_url.url,
      built.productionControl.body.input_references[1]!.image_url.url,
    );
  });

  it("5. no garment reference is present in experiment", () => {
    const built = buildNanoProTalentOnlyIdentityExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
    });
    const urls = built.talentOnlyExperiment.body.input_references.map(
      (r) => r.image_url.url,
    );
    assert.equal(urls.includes(GARMENT), false);
  });

  it("6. no Pose Master reference is present in experiment", () => {
    const built = buildNanoProTalentOnlyIdentityExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
    });
    const urls = built.talentOnlyExperiment.body.input_references.map(
      (r) => r.image_url.url,
    );
    assert.equal(urls.includes(POSE), false);
  });

  it("7. prompt semantics are unchanged (identical to production control)", () => {
    const primary = assembleFreshGenerationPrimaryInstruction();
    const expected = assembleNanoProImagesApiPrompt({
      hasPoseReference: true,
      talentIdentityImageCount: 1,
      locationEnvironment: null,
      primaryInstruction: primary,
      creativeShotPrompt: CREATIVE,
      talentReferenceImageNumber: 2,
    });
    const built = buildNanoProTalentOnlyIdentityExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
      creativeShotPrompt: CREATIVE,
    });
    assert.equal(built.productionControl.body.prompt, expected);
    assert.equal(built.talentOnlyExperiment.body.prompt, expected);
    assert.equal(
      built.talentOnlyExperiment.body.prompt,
      built.productionControl.body.prompt,
    );
  });

  it("8. resolution and aspect ratio are unchanged", () => {
    const built = buildNanoProTalentOnlyIdentityExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
    });
    assert.equal(built.talentOnlyExperiment.body.aspect_ratio, "4:5");
    assert.equal(built.productionControl.body.aspect_ratio, "4:5");
    assert.equal(built.talentOnlyExperiment.body.resolution, "2K");
    assert.equal(built.productionControl.body.resolution, "2K");
    assert.equal(built.talentOnlyExperiment.body.n, 1);
    assert.equal(
      built.talentOnlyExperiment.body.aspect_ratio,
      OPENROUTER_RENDERING_CONFIG.outputAspectRatio,
    );
    assert.deepEqual(
      [...NANO_PRO_PRODUCTION_REFERENCE_ORDER],
      ["GARMENT", "TALENT", "POSE_MASTER"],
    );
  });

  it("9. no production credit flow is invoked by experiment modules", () => {
    const experimentSrc = readFileSync(
      join(__dirname, "nano-pro-talent-only-identity-experiment.ts"),
      "utf8",
    );
    const routeSrc = readFileSync(
      join(apiServerSrc, "routes/test-nano-pro-talent-only-identity.ts"),
      "utf8",
    );
    assert.equal(experimentSrc.includes("studio_credit"), false);
    assert.equal(experimentSrc.includes("studioCredit"), false);
    assert.equal(experimentSrc.includes("deductCredit"), false);
    assert.equal(experimentSrc.includes("allocateCredit"), false);
    assert.equal(routeSrc.includes("studio_credit"), false);
    assert.equal(routeSrc.includes("deductCredit"), false);
    assert.match(routeSrc, /creditsDeducted: 0/);
    assert.match(routeSrc, /does not deduct Studio Credits/);
  });

  it("10. normal Studio Create cannot accidentally invoke this experiment", () => {
    const indexSrc = readFileSync(
      join(apiServerSrc, "routes/index.ts"),
      "utf8",
    );
    const rendersSrc = readFileSync(
      join(apiServerSrc, "routes/renders.ts"),
      "utf8",
    );
    const pipelineSrc = readFileSync(
      join(apiServerSrc, "services/ai-pipeline.ts"),
      "utf8",
    );

    assert.match(indexSrc, /test-nano-pro-talent-only-identity/);
    assert.match(indexSrc, /testNanoProTalentOnlyIdentityRouter/);

    assert.equal(rendersSrc.includes("talent-only-identity"), false);
    assert.equal(pipelineSrc.includes("talent-only-identity"), false);
    assert.equal(
      rendersSrc.includes("generateNanoProTalentOnlyIdentityExperiment"),
      false,
    );
    assert.equal(
      pipelineSrc.includes("generateNanoProTalentOnlyIdentityExperiment"),
      false,
    );
    assert.equal(
      NANO_PRO_TALENT_ONLY_IDENTITY_EXPERIMENT_NAME,
      "nano-pro-talent-only-identity-experiment",
    );
  });

  it("Images API bodies contain no detail field", () => {
    const built = buildNanoProTalentOnlyIdentityExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
    });
    assert.equal(
      JSON.stringify(built.talentOnlyExperiment.body).includes('"detail"'),
      false,
    );
    assert.equal(
      JSON.stringify(built.productionControl.body).includes('"detail"'),
      false,
    );
  });
});
