import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildNanoBanana2AuthorityPrompt,
  buildNanoBanana2SinglePassRequest,
  isNano2SinglePassEnabled,
  NANO_BANANA_2_PROVIDER_PIN,
  NANO_BANANA_2_REFERENCE_ORDER_WITH_FURNITURE,
  NANO_BANANA_2_REFERENCE_ORDER_WITHOUT_FURNITURE,
  NANO_BANANA_2_SINGLE_PASS_API,
  NANO_BANANA_2_SINGLE_PASS_MODEL,
  NANO_BANANA_2_SINGLE_PASS_NAME,
  STUDIOLAYER_NANO2_SINGLE_PASS_ENV,
} from "./nano-banana-2-single-pass.js";
import {
  isV1CreateHeadlessIdentityEnabled,
  STUDIOLAYER_NANO2_SINGLE_PASS_ENV as CONFIG_ENV,
} from "../rendering.config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const providerSrc = readFileSync(
  join(__dirname, "OpenRouterProvider.ts"),
  "utf8",
);
const headlessAdapterSrc = readFileSync(
  join(__dirname, "../headless-create-adapter.ts"),
  "utf8",
);
const headlessTrialSrc = readFileSync(
  join(__dirname, "nano-pro-headless-mannequin-trial.ts"),
  "utf8",
);
const thisSrc = readFileSync(
  join(__dirname, "nano-banana-2-single-pass.ts"),
  "utf8",
);

const TALENT = "data:image/jpeg;base64,TALENT";
const GARMENT = "data:image/jpeg;base64,GARMENT";
const POSE = "data:image/png;base64,POSE";
const FURNITURE = "data:image/png;base64,FURNITURE";

describe("Nano Banana 2 single-pass — flag and model", () => {
  it("1. flag is OFF by default and opts in explicitly", () => {
    assert.equal(CONFIG_ENV, "STUDIOLAYER_NANO2_SINGLE_PASS_ENABLED");
    assert.equal(STUDIOLAYER_NANO2_SINGLE_PASS_ENV, CONFIG_ENV);
    assert.equal(isNano2SinglePassEnabled({}), false);
    assert.equal(
      isNano2SinglePassEnabled({ [CONFIG_ENV]: "false" }),
      false,
    );
    assert.equal(isNano2SinglePassEnabled({ [CONFIG_ENV]: "true" }), true);
    assert.equal(isNano2SinglePassEnabled({ [CONFIG_ENV]: "1" }), true);
    assert.equal(isNano2SinglePassEnabled({ [CONFIG_ENV]: "yes" }), true);
  });

  it("2. model is Flash Image Preview — never Nano Pro", () => {
    assert.equal(
      NANO_BANANA_2_SINGLE_PASS_MODEL,
      "google/gemini-3.1-flash-image-preview",
    );
    assert.equal(NANO_BANANA_2_SINGLE_PASS_API, "POST /api/v1/chat/completions");
    assert.doesNotMatch(NANO_BANANA_2_SINGLE_PASS_MODEL, /gemini-3-pro-image/);
    assert.doesNotMatch(thisSrc, /google\/gemini-3-pro-image/);
  });

  it("3. uses OpenRouter chat completions — not direct Google", () => {
    assert.match(thisSrc, /OPENROUTER_RENDERING_CONFIG\.baseUrl/);
    assert.match(thisSrc, /NANO_BANANA_2_SINGLE_PASS_ENDPOINT_PATH/);
    assert.match(thisSrc, /\/chat\/completions/);
    assert.doesNotMatch(thisSrc, /generativelanguage\.googleapis\.com/);
    assert.doesNotMatch(thisSrc, /aiplatform\.googleapis\.com/);
  });
});

describe("Nano Banana 2 single-pass — request contract", () => {
  it("4. with furniture — exactly four refs in TALENT→GARMENT→POSE→FURNITURE order", () => {
    const built = buildNanoBanana2SinglePassRequest({
      shotIndex: 0,
      talentImageUrl: TALENT,
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      poseId: "Pose7",
      furnitureReferenceImageUrl: FURNITURE,
      creativeShotPrompt: "Maintain exact garment length: knee length.",
      outputResolution: "2K",
    });
    assert.deepEqual(
      [...built.referenceOrder],
      [...NANO_BANANA_2_REFERENCE_ORDER_WITH_FURNITURE],
    );
    assert.equal(built.hasFurniture, true);
    const content = (
      built.body as {
        messages: Array<{ content: Array<Record<string, unknown>> }>;
      }
    ).messages[0]!.content;
    const images = content.filter((p) => p["type"] === "image_url");
    assert.equal(images.length, 4);
    assert.equal(
      (images[0]!["image_url"] as { url: string }).url,
      TALENT,
    );
    assert.equal(
      (images[1]!["image_url"] as { url: string }).url,
      GARMENT,
    );
    assert.equal((images[2]!["image_url"] as { url: string }).url, POSE);
    assert.equal(
      (images[3]!["image_url"] as { url: string }).url,
      FURNITURE,
    );
  });

  it("5. without furniture — three refs; no invented Ref 4", () => {
    const built = buildNanoBanana2SinglePassRequest({
      shotIndex: 0,
      talentImageUrl: TALENT,
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      poseId: "Pose2",
      outputResolution: "2K",
    });
    assert.deepEqual(
      [...built.referenceOrder],
      [...NANO_BANANA_2_REFERENCE_ORDER_WITHOUT_FURNITURE],
    );
    assert.equal(built.hasFurniture, false);
    const content = (
      built.body as {
        messages: Array<{ content: Array<Record<string, unknown>> }>;
      }
    ).messages[0]!.content;
    assert.equal(content.filter((p) => p["type"] === "image_url").length, 3);
    assert.match(built.promptUsed, /Exactly three reference images/);
    assert.doesNotMatch(built.promptUsed, /Exactly four reference images/);
  });

  it("6. provider pinned to Google AI Studio with fallbacks disabled", () => {
    const built = buildNanoBanana2SinglePassRequest({
      shotIndex: 0,
      talentImageUrl: TALENT,
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      poseId: "Pose7",
      furnitureReferenceImageUrl: FURNITURE,
    });
    assert.deepEqual(built.provider, NANO_BANANA_2_PROVIDER_PIN);
    assert.equal(built.provider.allow_fallbacks, false);
    assert.deepEqual([...built.provider.order], ["google-ai-studio"]);
    const bodyProvider = (
      built.body as { provider: { order: string[]; allow_fallbacks: boolean } }
    ).provider;
    assert.deepEqual(bodyProvider.order, ["google-ai-studio"]);
    assert.equal(bodyProvider.allow_fallbacks, false);
  });

  it("7. authority prompt preserves garment-length intelligence", () => {
    const lengthLine = "Maintain exact garment length: knee length.";
    const prompt = buildNanoBanana2AuthorityPrompt({
      hasFurniture: true,
      creativeShotPrompt: `GARMENT INTELLIGENCE — profile locks: ${lengthLine}`,
    });
    assert.match(prompt, /Maintain exact garment length: knee length/);
    assert.match(prompt, /Talent reference controls the person and identity/);
    assert.match(prompt, /Garment reference controls the exact garment/);
    assert.match(prompt, /Pose Master controls pose and framing only/);
    assert.match(prompt, /Furniture reference controls the exact furniture/);
    assert.match(prompt, /Do not transfer unrelated visual attributes/);
  });

  it("8. 2K maps to image_size 2K; 4K maps to 4K; aspect 4:5", () => {
    const twoK = buildNanoBanana2SinglePassRequest({
      shotIndex: 0,
      talentImageUrl: TALENT,
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      poseId: "Pose7",
      outputResolution: "2K",
    });
    const fourK = buildNanoBanana2SinglePassRequest({
      shotIndex: 0,
      talentImageUrl: TALENT,
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      poseId: "Pose7",
      outputResolution: "4K",
    });
    assert.equal(twoK.resolution, "2K");
    assert.equal(fourK.resolution, "4K");
    assert.equal(twoK.aspectRatio, "4:5");
    assert.equal(fourK.aspectRatio, "4:5");
    const cfg2 = (
      twoK.body as { image_config: { image_size: string; aspect_ratio: string } }
    ).image_config;
    const cfg4 = (
      fourK.body as { image_config: { image_size: string; aspect_ratio: string } }
    ).image_config;
    assert.equal(cfg2.image_size, "2K");
    assert.equal(cfg4.image_size, "4K");
    assert.equal(cfg2.aspect_ratio, "4:5");
    assert.equal(cfg4.aspect_ratio, "4:5");
    assert.equal(twoK.model, NANO_BANANA_2_SINGLE_PASS_MODEL);
    assert.equal(fourK.model, NANO_BANANA_2_SINGLE_PASS_MODEL);
  });

  it("9. experiment name and single-call contract are documented in source", () => {
    assert.equal(NANO_BANANA_2_SINGLE_PASS_NAME, "nano-banana-2-single-pass");
    assert.match(thisSrc, /Exactly ONE OpenRouter image-generation call/);
    assert.equal(
      (thisSrc.match(/await fetch\(/g) ?? []).length,
      1,
    );
  });
});

describe("Nano Banana 2 single-pass — provider routing", () => {
  it("10. OpenRouterProvider routes Nano2 before Headless when flag is on", () => {
    assert.match(providerSrc, /isNano2SinglePassEnabled/);
    assert.match(providerSrc, /useNano2SinglePass/);
    assert.match(providerSrc, /generateNanoBanana2SinglePass/);
    assert.match(
      providerSrc,
      /!useNano2SinglePass &&\s*\n\s*isV1CreateHeadlessIdentityEnabled/,
    );
  });

  it("11. Nano2 path does not call Headless Stage 1/2 or mask helpers", () => {
    const nano2Block = providerSrc.slice(
      providerSrc.indexOf("if (useNano2SinglePass)"),
      providerSrc.indexOf("} else if (useHeadlessCreate)"),
    );
    assert.match(nano2Block, /generateNanoBanana2SinglePass/);
    assert.doesNotMatch(nano2Block, /runHeadlessCreateShot/);
    assert.doesNotMatch(nano2Block, /neutralizeHeadRegion/);
    assert.doesNotMatch(nano2Block, /generateNanoProHeadlessMannequinTrial/);
    assert.doesNotMatch(nano2Block, /generateSingleShot/);
  });

  it("12. Headless adapter and trial remain untouched by Nano2 module", () => {
    assert.doesNotMatch(headlessAdapterSrc, /nano-banana-2/);
    assert.doesNotMatch(headlessAdapterSrc, /NANO_BANANA_2/);
    assert.doesNotMatch(headlessTrialSrc, /nano-banana-2/);
    assert.doesNotMatch(thisSrc, /neutralizeHeadRegion/);
    assert.doesNotMatch(thisSrc, /callNanoProImagesOnce/);
    assert.doesNotMatch(thisSrc, /buildHeadlessStage2Request/);
  });

  it("13. disabling Nano2 leaves Headless gate independent", () => {
    assert.equal(
      isNano2SinglePassEnabled({ [CONFIG_ENV]: "false" }),
      false,
    );
    assert.equal(
      isV1CreateHeadlessIdentityEnabled({
        V1_CREATE_USE_HEADLESS_IDENTITY: "true",
      }),
      true,
    );
  });

  it("14. Nano2 failure has no Flash/Headless fallback in provider wiring", () => {
    const nano2Block = providerSrc.slice(
      providerSrc.indexOf("if (useNano2SinglePass)"),
      providerSrc.indexOf("} else if (useHeadlessCreate)"),
    );
    assert.match(nano2Block, /no Headless\/Flash fallback/);
    assert.match(nano2Block, /return null/);
  });
});
