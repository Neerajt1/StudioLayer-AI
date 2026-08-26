import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME,
  NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL,
  assembleTalentOnlyIndexAlignedPrompt,
  buildNanoProTalentOnlyIndexAlignedRequest,
  buildTalentOnlyIndexAlignedRoleMapping,
} from "./nano-pro-talent-only-index-aligned.js";
import { findIdentityById } from "../../../data/identity-library.js";
import { loadStudioTalentImageAsDataUri } from "../../../rendering/preprocessing.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiServerSrc = join(__dirname, "../../..");

const TALENT_FIXTURE = "data:image/png;base64,TALENT_M_IN_02_FIXTURE";

describe("nano-pro-talent-only-index-aligned", () => {
  it("1. model = google/gemini-3-pro-image", () => {
    assert.equal(
      NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_MODEL,
      "google/gemini-3-pro-image",
    );
    const built = buildNanoProTalentOnlyIndexAlignedRequest({
      talentImageUrl: TALENT_FIXTURE,
    });
    assert.equal(built.body.model, "google/gemini-3-pro-image");
  });

  it("2. exactly one input_reference", () => {
    const built = buildNanoProTalentOnlyIndexAlignedRequest({
      talentImageUrl: TALENT_FIXTURE,
    });
    assert.equal(built.body.input_references.length, 1);
  });

  it("3. reference index 0 = Talent", () => {
    const built = buildNanoProTalentOnlyIndexAlignedRequest({
      talentImageUrl: TALENT_FIXTURE,
    });
    assert.equal(built.body.input_references[0]!.image_url.url, TALENT_FIXTURE);
    assert.deepEqual([...built.referenceOrder], ["TALENT"]);
  });

  it("4. Talent bytes are identical to production M-IN-02", () => {
    const identity = findIdentityById("M-IN-02");
    assert.ok(identity, "M-IN-02 must exist in identity library");
    const productionTalentUri = loadStudioTalentImageAsDataUri(identity.imageUrl);
    const built = buildNanoProTalentOnlyIndexAlignedRequest({
      talentImageUrl: productionTalentUri,
    });
    assert.equal(
      built.body.input_references[0]!.image_url.url,
      productionTalentUri,
    );
    assert.match(productionTalentUri, /^data:image\/png;base64,/);
    assert.ok(productionTalentUri.length > 1000);
  });

  it("5. prompt says Reference Image 1 = Studio Talent", () => {
    const roleMap = buildTalentOnlyIndexAlignedRoleMapping();
    assert.match(
      roleMap,
      /Reference Image 1 = STUDIO TALENT \/ SUBJECT IDENTITY\./,
    );
    const prompt = assembleTalentOnlyIndexAlignedPrompt();
    assert.match(prompt, /Reference Image 1 = STUDIO TALENT/);
    assert.match(
      prompt,
      /Studio Talent in Reference Image 1 is the person whose identity must be preserved/,
    );
  });

  it("6. prompt does NOT say Reference Image 1 = Garment", () => {
    const prompt = assembleTalentOnlyIndexAlignedPrompt();
    assert.equal(/Reference Image 1\s*=\s*GARMENT/i.test(prompt), false);
    assert.equal(/Reference Image 1 is the garment/i.test(prompt), false);
    assert.equal(/GARMENT SOURCE/i.test(prompt), false);
  });

  it("7. prompt does NOT refer to Talent as Reference Image 2", () => {
    const prompt = assembleTalentOnlyIndexAlignedPrompt();
    assert.equal(/Reference Image 2/i.test(prompt), false);
  });

  it("8. prompt does NOT claim Pose Master is attached", () => {
    const prompt = assembleTalentOnlyIndexAlignedPrompt();
    // Must not claim an attached Pose Master image (negation is OK).
    assert.equal(
      /\bPose Master\b[\s\S]{0,80}\bis (a visual reference|attached)\b/i.test(
        prompt,
      ) && !/No Pose Master image is attached/i.test(prompt),
      false,
    );
    assert.equal(/hasPoseReference:\s*true/i.test(prompt), false);
    assert.equal(
      /The Pose Master is a visual reference for body geometry/i.test(prompt),
      false,
    );
    assert.match(prompt, /No Pose Master image is attached/);
  });

  it("9. prompt does NOT claim a garment reference is attached", () => {
    const prompt = assembleTalentOnlyIndexAlignedPrompt();
    assert.equal(
      /Reference Image 1 is the garment reference/i.test(prompt),
      false,
    );
    assert.equal(/GARMENT SOURCE/i.test(prompt), false);
    assert.equal(
      /\bgarment reference image is attached\b/i.test(prompt) &&
        !/No garment reference image is attached/i.test(prompt),
      false,
    );
    assert.match(prompt, /No garment reference image is attached/);
  });

  it("10–12. resolution 2K, aspect_ratio 4:5, n = 1", () => {
    const built = buildNanoProTalentOnlyIndexAlignedRequest({
      talentImageUrl: TALENT_FIXTURE,
    });
    assert.equal(built.body.resolution, "2K");
    assert.equal(built.body.aspect_ratio, "4:5");
    assert.equal(built.body.n, 1);
  });

  it("13. production Nano Pro request construction remains unchanged", () => {
    const providerSrc = readFileSync(
      join(__dirname, "OpenRouterProvider.ts"),
      "utf8",
    );
    const authoritySrc = readFileSync(
      join(__dirname, "../nano-pro-authority-layers.ts"),
      "utf8",
    );
    assert.match(providerSrc, /assembleNanoProImagesApiPrompt/);
    assert.match(providerSrc, /mapImagePartsToNanoProInputReferences/);
    assert.match(authoritySrc, /buildNanoProReferenceRoleMapping/);
    assert.match(
      authoritySrc,
      /Reference Image 1 = GARMENT SOURCE/,
    );
    assert.equal(
      providerSrc.includes("nano-pro-talent-only-index-aligned"),
      false,
    );
    assert.equal(
      providerSrc.includes("NANO_PRO_TALENT_ONLY_INDEX_ALIGNED"),
      false,
    );
    assert.equal(
      authoritySrc.includes("nano-pro-talent-only-index-aligned"),
      false,
    );
    // Experiment must not import production prompt assemblers
    const experimentSrc = readFileSync(
      join(__dirname, "nano-pro-talent-only-index-aligned.ts"),
      "utf8",
    );
    assert.equal(
      /import\s*\{[^}]*assembleNanoProImagesApiPrompt/s.test(experimentSrc),
      false,
    );
    assert.equal(
      /import\s*\{[^}]*buildNanoProReferenceRoleMapping/s.test(experimentSrc),
      false,
    );
  });

  it("14. normal Studio Create cannot invoke the experiment", () => {
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
    assert.match(indexSrc, /test-nano-pro-talent-only-index-aligned/);
    assert.equal(rendersSrc.includes("talent-only-index-aligned"), false);
    assert.equal(pipelineSrc.includes("talent-only-index-aligned"), false);
    assert.equal(
      rendersSrc.includes("generateNanoProTalentOnlyIndexAligned"),
      false,
    );
    assert.equal(
      NANO_PRO_TALENT_ONLY_INDEX_ALIGNED_EXPERIMENT_NAME,
      "nano-pro-talent-only-index-aligned",
    );
  });

  it("prompt/reference alignment metadata is aligned", () => {
    const built = buildNanoProTalentOnlyIndexAlignedRequest({
      talentImageUrl: TALENT_FIXTURE,
    });
    assert.equal(built.promptReferenceAlignment.aligned, true);
    assert.equal(built.promptReferenceAlignment.promptRef1, "STUDIO TALENT");
    assert.equal(built.promptReferenceAlignment.actualRef1Index0, "TALENT");
    assert.equal(
      JSON.stringify(built.body).includes('"detail"'),
      false,
    );
  });
});
