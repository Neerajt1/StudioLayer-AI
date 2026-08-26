import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FLASH_IMAGES_API_PACKAGING_EXPERIMENT_API,
  FLASH_IMAGES_API_PACKAGING_EXPERIMENT_ENDPOINT_PATH,
  FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
  FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
  FLASH_IMAGES_API_PACKAGING_REFERENCE_ORDER,
  assembleFlashImagesApiPromptFromFlashTextParts,
  buildFlashImagesApiPackagingExperimentRequest,
} from "./flash-images-api-packaging-experiment.js";
import {
  assembleFreshGenerationPrimaryInstruction,
  buildFreshGenerationImageParts,
} from "./OpenRouterProvider.js";
import { OPENROUTER_RENDERING_CONFIG } from "../rendering.config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiServerSrc = join(__dirname, "../../..");

const GARMENT = "data:image/png;base64,GARMENT_BYTES_FIXTURE";
const TALENT = "data:image/jpeg;base64,TALENT_BYTES_FIXTURE";
const POSE = "data:image/png;base64,POSE_MASTER_BYTES_FIXTURE";
const CREATIVE = "Editorial three-quarter framing. Soft natural light.";

describe("flash-images-api-packaging-experiment", () => {
  it("1. uses model google/gemini-3.1-flash-image", () => {
    assert.equal(
      FLASH_IMAGES_API_PACKAGING_EXPERIMENT_MODEL,
      "google/gemini-3.1-flash-image",
    );
    const built = buildFlashImagesApiPackagingExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
    });
    assert.equal(built.model, "google/gemini-3.1-flash-image");
    assert.equal(
      built.flashImagesExperiment.body.model,
      "google/gemini-3.1-flash-image",
    );
    assert.equal(
      built.flashChatControl.body.model,
      "google/gemini-3.1-flash-image",
    );
  });

  it("2. uses Images API endpoint (/images)", () => {
    assert.equal(FLASH_IMAGES_API_PACKAGING_EXPERIMENT_ENDPOINT_PATH, "/images");
    assert.equal(
      FLASH_IMAGES_API_PACKAGING_EXPERIMENT_API,
      "POST /api/v1/images",
    );
    const built = buildFlashImagesApiPackagingExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
    });
    assert.equal(built.flashImagesExperiment.api, "POST /api/v1/images");
    assert.notEqual(
      built.flashImagesExperiment.api,
      built.flashChatControl.api,
    );
  });

  it("3. references are exactly GARMENT → TALENT → POSE_MASTER", () => {
    assert.deepEqual(
      [...FLASH_IMAGES_API_PACKAGING_REFERENCE_ORDER],
      ["GARMENT", "TALENT", "POSE_MASTER"],
    );
    const built = buildFlashImagesApiPackagingExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
    });
    const refs = built.flashImagesExperiment.body.input_references;
    assert.equal(refs.length, 3);
    assert.equal(refs[0]!.image_url.url, GARMENT);
    assert.equal(refs[1]!.image_url.url, TALENT);
    assert.equal(refs[2]!.image_url.url, POSE);
    assert.deepEqual(
      [...built.referenceOrder],
      ["GARMENT", "TALENT", "POSE_MASTER"],
    );
  });

  it("4–6. Talent / garment / pose assets match Flash part builder URLs", () => {
    const flashParts = buildFreshGenerationImageParts({
      garmentImageUrl: GARMENT,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
    });
    const built = buildFlashImagesApiPackagingExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
    });

    assert.equal(flashParts[0]!.image_url.url, GARMENT);
    assert.equal(flashParts[1]!.image_url.url, TALENT);
    assert.equal(flashParts[2]!.image_url.url, POSE);

    const refs = built.flashImagesExperiment.body.input_references;
    assert.equal(refs[0]!.image_url.url, flashParts[0]!.image_url.url);
    assert.equal(refs[1]!.image_url.url, flashParts[1]!.image_url.url);
    assert.equal(refs[2]!.image_url.url, flashParts[2]!.image_url.url);

    const chatImages = built.flashChatControl.body.messages[0].content.filter(
      (p) => p.type === "image_url",
    );
    assert.equal(chatImages.length, 3);
    assert.equal(chatImages[0]!.image_url.url, refs[0]!.image_url.url);
    assert.equal(chatImages[1]!.image_url.url, refs[1]!.image_url.url);
    assert.equal(chatImages[2]!.image_url.url, refs[2]!.image_url.url);
  });

  it("7. Images API body contains no detail", () => {
    const built = buildFlashImagesApiPackagingExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
      creativeShotPrompt: CREATIVE,
    });
    const serialized = JSON.stringify(built.flashImagesExperiment.body);
    assert.equal(serialized.includes('"detail"'), false);
    for (const ref of built.flashImagesExperiment.body.input_references) {
      assert.equal("detail" in ref.image_url, false);
      assert.deepEqual(Object.keys(ref.image_url).sort(), ["url"]);
    }
    // Flash Chat control still documents detail:high (production packaging)
    const chatImages = built.flashChatControl.body.messages[0].content.filter(
      (p) => p.type === "image_url",
    );
    for (const img of chatImages) {
      assert.equal(img.image_url.detail, "high");
    }
  });

  it("prompt is Flash primary + optional creative joined (no identity rewrite)", () => {
    const primary = assembleFreshGenerationPrimaryInstruction();
    const built = buildFlashImagesApiPackagingExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
      creativeShotPrompt: CREATIVE,
    });
    assert.equal(built.primaryInstruction, primary);
    assert.equal(
      built.flashImagesExperiment.body.prompt,
      `${primary}\n\n${CREATIVE}`,
    );
    assert.equal(
      assembleFlashImagesApiPromptFromFlashTextParts({
        primaryInstruction: primary,
        creativeShotPrompt: CREATIVE,
      }),
      built.flashImagesExperiment.body.prompt,
    );
    // Must not inject Nano Pro authority / role-map layers
    assert.equal(
      built.flashImagesExperiment.body.prompt.includes(
        "TALENT IDENTITY AUTHORITY",
      ),
      false,
    );
    assert.equal(
      built.flashImagesExperiment.body.prompt.includes("REFERENCE IMAGE ROLES"),
      false,
    );
  });

  it("8. production Nano Regular (Flash) request construction markers unchanged", () => {
    const providerSrc = readFileSync(
      join(__dirname, "OpenRouterProvider.ts"),
      "utf8",
    );
    // Flash path still uses chat/completions with interleaved text + detail:high
    assert.match(providerSrc, /chat\/completions/);
    assert.match(providerSrc, /detail:\s*"high"/);
    assert.match(providerSrc, /modalities:\s*\["image",\s*"text"\]/);
    assert.match(providerSrc, /assembleFreshGenerationPrimaryInstruction/);
    // Experiment must not be wired into production provider
    assert.equal(
      providerSrc.includes("flash-images-api-packaging-experiment"),
      false,
    );
    assert.equal(
      providerSrc.includes("FLASH_IMAGES_API_PACKAGING"),
      false,
    );
  });

  it("9. production Nano Pro request construction markers unchanged", () => {
    const providerSrc = readFileSync(
      join(__dirname, "OpenRouterProvider.ts"),
      "utf8",
    );
    assert.match(providerSrc, /assembleNanoProImagesApiPrompt/);
    assert.match(providerSrc, /mapImagePartsToNanoProInputReferences/);
    assert.match(providerSrc, /useNanoProImagesApi/);
    assert.match(providerSrc, /isNanoBananaProEngine/);
    // Experiment is Flash-only — must not alter Pro model slug wiring
    assert.match(providerSrc, /resolveNanoProImageResolution/);
  });

  it("10. experiment cannot be reached through normal Studio Create", () => {
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

    // Mounted only as isolated test router
    assert.match(indexSrc, /test-flash-images-api-packaging/);
    assert.match(indexSrc, /testFlashImagesApiPackagingRouter/);

    // Create / pipeline must not import or invoke the experiment
    assert.equal(
      rendersSrc.includes("flash-images-api-packaging"),
      false,
    );
    assert.equal(
      pipelineSrc.includes("flash-images-api-packaging"),
      false,
    );
    assert.equal(
      rendersSrc.includes("FLASH_IMAGES_API_PACKAGING"),
      false,
    );
    assert.equal(
      pipelineSrc.includes("generateFlashImagesApiPackagingExperiment"),
      false,
    );

    // Default production model remains Flash Chat slug (config)
    assert.equal(
      OPENROUTER_RENDERING_CONFIG.defaultModel,
      process.env["OR_RENDER_MODEL"] ?? "google/gemini-3.1-flash-image",
    );

    assert.equal(
      FLASH_IMAGES_API_PACKAGING_EXPERIMENT_NAME,
      "flash-images-api-packaging-experiment",
    );
  });

  it("aspect ratio and resolution match Flash production defaults", () => {
    const built = buildFlashImagesApiPackagingExperimentRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
    });
    assert.equal(built.flashImagesExperiment.body.aspect_ratio, "4:5");
    assert.equal(built.flashImagesExperiment.body.resolution, "2K");
    assert.equal(built.flashImagesExperiment.body.n, 1);
    assert.equal(
      built.flashChatControl.body.image_config.aspect_ratio,
      "4:5",
    );
    assert.equal(built.flashChatControl.body.image_config.image_size, "2K");
  });
});
