import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleNanoProImagesApiPrompt,
  buildFurnitureAuthorityLayer,
  composeNanoProAuthorityLayers,
  resolveV1CreateLocationEnvironment,
  V1_CREATE_LOCATION_ENVIRONMENT,
} from "./nano-pro-authority-layers.js";
import { assembleCreateStage2FaceIdentityInstruction } from "./create-cascade-stage2.js";
import { assembleFreshGenerationPrimaryInstruction } from "./providers/OpenRouterProvider.js";
import { isFluxMaxEngine, resolveOpenRouterRenderEngine } from "./rendering.config.js";
import { resolveGenerationCreditCost } from "@workspace/studio-credit-engine";

const __dirname = dirname(fileURLToPath(import.meta.url));
const studioPageSource = readFileSync(
  join(__dirname, "../../../../studiolayer-ai/src/pages/studio.tsx"),
  "utf8",
);

describe("V1 white-background-only Create", () => {
  it("1. Environment selector is not exposed in V1 Create UI", () => {
    assert.equal(studioPageSource.includes("EnvironmentSelector"), false);
    assert.equal(studioPageSource.includes('label="Environment"'), false);
    assert.equal(studioPageSource.includes("environment-urban_street"), false);
  });

  it("2. Environment is not exposed on desktop workspace UI", () => {
    for (const label of [
      "White Studio",
      "Grey Gradient",
      "Interior",
      "Street",
      "Nature",
    ]) {
      assert.equal(
        studioPageSource.includes(`'${label}'`),
        false,
        `studio.tsx must not expose "${label}"`,
      );
    }
  });

  it("3. Environment is not exposed on mobile workspace UI", () => {
    assert.equal(studioPageSource.includes("environment-white_studio"), false);
    assert.equal(studioPageSource.includes("environment-grey_gradient_studio"), false);
  });

  it("4. V1 Create always uses white-background configuration", () => {
    assert.equal(V1_CREATE_LOCATION_ENVIRONMENT, "white_studio");
    assert.equal(resolveV1CreateLocationEnvironment("urban_street"), "white_studio");
    assert.equal(resolveV1CreateLocationEnvironment("nature"), "white_studio");
    assert.equal(resolveV1CreateLocationEnvironment(null), "white_studio");
  });

  it("5. stale Environment values cannot override V1 white background in Nano Pro prompt", () => {
    const base = {
      talentIdentityImageCount: 1,
      hasPoseReference: true,
      primaryInstruction: assembleFreshGenerationPrimaryInstruction(),
      creativeShotPrompt: "POSE:\nEditorial walk.\nFURNITURE:\nA chair must be present.",
      furnitureRequired: true,
    };
    const street = assembleNanoProImagesApiPrompt({
      ...base,
      locationEnvironment: "urban_street",
    });
    const forest = assembleNanoProImagesApiPrompt({
      ...base,
      locationEnvironment: "nature",
    });
    const grey = assembleNanoProImagesApiPrompt({
      ...base,
      locationEnvironment: "grey_gradient_studio",
    });
    const white = assembleNanoProImagesApiPrompt({
      ...base,
      locationEnvironment: "white_studio",
    });

    assert.equal(street, forest);
    assert.equal(street, grey);
    assert.equal(street, white);
    assert.match(street, /ENVIRONMENT AUTHORITY/);
    assert.match(street, /seamless white/i);
    assert.doesNotMatch(street, /urban street/i);
    assert.doesNotMatch(street, /grey gradient/i);
    assert.doesNotMatch(street, /nature/i);
  });

  it("6. resolveV1CreateLocationEnvironment ignores caller Environment", () => {
    assert.equal(resolveV1CreateLocationEnvironment("luxury_interior"), "white_studio");
    assert.equal(resolveV1CreateLocationEnvironment("photo_studio"), "white_studio");
  });

  it("7. Environment is not forwarded as a user-selected generation factor in ai-pipeline", () => {
    const src = readFileSync(join(__dirname, "../ai-pipeline.ts"), "utf8");
    assert.match(src, /resolveV1CreateLocationEnvironment/);
    assert.doesNotMatch(src, /locationEnvironment:\s*undefined,/);
  });

  it("8. Nano Pro receives the V1 white-background condition", () => {
    const text = composeNanoProAuthorityLayers({
      hasPoseReference: true,
      talentIdentityImageCount: 1,
      locationEnvironment: "urban_street",
    });
    assert.match(text, /ENVIRONMENT AUTHORITY/);
    assert.match(text, /seamless white/i);
    assert.match(text, /controlled studio background only/i);
  });

  it("9. Stage 2 preserves the white background from Stage 1", () => {
    const stage2 = assembleCreateStage2FaceIdentityInstruction();
    assert.match(stage2, /background\/scene/);
    assert.match(stage2, /Do NOT change composition or environment/);
    assert.doesNotMatch(stage2, /urban_street|grey_gradient|locationEnvironment/i);
  });

  it("10. Furniture-required poses still allow furniture on the white background", () => {
    const text = composeNanoProAuthorityLayers({
      hasPoseReference: true,
      talentIdentityImageCount: 1,
      locationEnvironment: "urban_street",
      furnitureRequired: true,
    });
    assert.match(text, /pose requires a support furniture/i);
    assert.match(text, /seamless white/i);
    assert.doesNotMatch(text, /urban street/i);
  });

  it("11. Non-furniture poses do not gain furniture from Environment logic", () => {
    const text = composeNanoProAuthorityLayers({
      hasPoseReference: true,
      talentIdentityImageCount: 1,
      locationEnvironment: "luxury_interior",
      furnitureRequired: false,
    });
    assert.match(text, /Do not invent chairs, stools/i);
    assert.doesNotMatch(text, /pose requires a support furniture/i);
    assert.equal(buildFurnitureAuthorityLayer(false).includes("selected environment"), false);
    assert.match(text, /seamless white/i);
    assert.doesNotMatch(text, /luxury/i);
  });

  it("12. 2K costs 1.5 Studio Credits", () => {
    assert.equal(
      resolveGenerationCreditCost({ imageCount: 1, outputResolution: "2K" }),
      1.5,
    );
  });

  it("13. 4K costs 3 Studio Credits", () => {
    assert.equal(
      resolveGenerationCreditCost({ imageCount: 1, outputResolution: "4K" }),
      3,
    );
  });

  it("18. Flux remains unreachable", () => {
    assert.equal(isFluxMaxEngine(), false);
    const prev = process.env["OR_RENDER_ENGINE"];
    process.env["OR_RENDER_ENGINE"] = "flux_max";
    try {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
    } finally {
      if (prev === undefined) delete process.env["OR_RENDER_ENGINE"];
      else process.env["OR_RENDER_ENGINE"] = prev;
    }
  });
});
