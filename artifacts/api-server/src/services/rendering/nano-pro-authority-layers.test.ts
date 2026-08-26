import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  composeNanoProAuthorityLayers,
  buildPoseAuthorityLayer,
  buildTalentIdentityAuthorityLayer,
  buildEnvironmentAuthorityLayer,
  buildFurnitureAuthorityLayer,
} from "./nano-pro-authority-layers.js";
import {
  isNanoBananaProEngine,
  resolveNanoProImageResolution,
  resolveOpenRouterModelForResolution,
  resolveOpenRouterRenderEngine,
} from "./rendering.config.js";

describe("nano-pro-authority-layers", () => {
  it("composes modular authority layers with pose isolation", () => {
    const text = composeNanoProAuthorityLayers({
      hasPoseReference: true,
      talentIdentityImageCount: 1,
      locationEnvironment: "photo_studio",
    });
    assert.match(text, /TALENT IDENTITY AUTHORITY/);
    assert.match(text, /GARMENT TEXTURE AUTHORITY/);
    assert.match(text, /POSE AUTHORITY/);
    // V1: fixed white-studio ENVIRONMENT AUTHORITY — not user-selectable.
    assert.match(text, /ENVIRONMENT AUTHORITY/);
    assert.match(text, /seamless white/i);
    assert.match(text, /FURNITURE AUTHORITY/);
    assert.match(text, /LOWER WARDROBE AUTHORITY/);
    assert.match(text, /NOT the identity reference/i);
    assert.match(text, /Do not derive face, facial structure, hair, skin tone/i);
    assert.match(text, /do not mechanically repeat the same denim/i);
  });

  it("states multi-talent identity authority when count > 1", () => {
    assert.match(
      buildTalentIdentityAuthorityLayer(3),
      /All 3 Studio Talent reference images represent the SAME person/,
    );
  });

  it("pose layer without reference does not invent pose master", () => {
    assert.match(buildPoseAuthorityLayer(false), /No Pose Master image/);
  });

  it("V1 furniture authority ignores Environment; required vs not", () => {
    const none = buildFurnitureAuthorityLayer(false);
    assert.match(none, /Do not invent chairs, stools/i);
    assert.doesNotMatch(none, /selected environment/i);
    assert.doesNotMatch(none, /controlled studio background/i);

    const required = buildFurnitureAuthorityLayer(true);
    assert.match(required, /pose requires a support furniture/i);
    assert.match(required, /creative FURNITURE instruction/i);
    assert.doesNotMatch(required, /No furniture, props, or environmental objects/i);
  });

  it("V3 helper buildEnvironmentAuthorityLayer remains available for future Environment product", () => {
    for (const env of ["white_studio", "grey_gradient_studio"] as const) {
      const envLayer = buildEnvironmentAuthorityLayer(env);
      assert.match(envLayer, /ENVIRONMENT AUTHORITY/);
      assert.match(envLayer, /controlled studio background only/i);
    }
    assert.match(
      buildEnvironmentAuthorityLayer("white_studio"),
      /seamless white/i,
    );
    assert.match(
      buildEnvironmentAuthorityLayer("photo_studio"),
      /Controlled professional fashion studio/i,
    );
  });
});

describe("nano_pro engine resolution mapping", () => {
  it("maps 2K and 4K without silent downgrade when nano_pro is active", () => {
    const prev = process.env["OR_RENDER_ENGINE"];
    process.env["OR_RENDER_ENGINE"] = "nano_pro";
    try {
      assert.equal(resolveOpenRouterRenderEngine(), "nano_pro");
      assert.equal(isNanoBananaProEngine(), true);
      assert.equal(resolveNanoProImageResolution("2K"), "2K");
      assert.equal(resolveNanoProImageResolution("4K"), "4K");
      assert.equal(
        resolveOpenRouterModelForResolution("2K"),
        "google/gemini-3-pro-image",
      );
      assert.equal(
        resolveOpenRouterModelForResolution("4K"),
        "google/gemini-3-pro-image",
      );
    } finally {
      if (prev === undefined) delete process.env["OR_RENDER_ENGINE"];
      else process.env["OR_RENDER_ENGINE"] = prev;
    }
  });

  it("keeps flash 2K/4K model split when engine is flash", () => {
    const prev = process.env["OR_RENDER_ENGINE"];
    process.env["OR_RENDER_ENGINE"] = "flash";
    try {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
      assert.equal(isNanoBananaProEngine(), false);
      assert.match(resolveOpenRouterModelForResolution("2K"), /flash-image/);
      assert.match(resolveOpenRouterModelForResolution("4K"), /preview/);
    } finally {
      if (prev === undefined) delete process.env["OR_RENDER_ENGINE"];
      else process.env["OR_RENDER_ENGINE"] = prev;
    }
  });
});
