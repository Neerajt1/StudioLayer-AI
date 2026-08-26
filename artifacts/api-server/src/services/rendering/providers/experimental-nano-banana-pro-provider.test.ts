import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EXPERIMENTAL_NANO_BANANA_PRO_MODEL,
  EXPERIMENTAL_NANO_BANANA_PRO_PROMPT,
  NANO_BANANA_PRO_SUPPORTED_ASPECT_RATIOS,
  NANO_BANANA_PRO_SUPPORTED_RESOLUTIONS,
} from "./experimental-nano-banana-pro-provider.js";

describe("experimental-nano-banana-pro-provider (schema constants)", () => {
  it("targets google/gemini-3-pro-image", () => {
    assert.equal(EXPERIMENTAL_NANO_BANANA_PRO_MODEL, "google/gemini-3-pro-image");
  });

  it("uses Pose50 QA prompt with separated reference authority rules", () => {
    assert.match(EXPERIMENTAL_NANO_BANANA_PRO_PROMPT, /Reference 1/);
    assert.match(EXPERIMENTAL_NANO_BANANA_PRO_PROMPT, /Reference 2/);
    assert.match(EXPERIMENTAL_NANO_BANANA_PRO_PROMPT, /Reference 3/);
    assert.match(EXPERIMENTAL_NANO_BANANA_PRO_PROMPT, /POSE 50/);
    assert.match(EXPERIMENTAL_NANO_BANANA_PRO_PROMPT, /GARMENT/);
    assert.match(EXPERIMENTAL_NANO_BANANA_PRO_PROMPT, /TALENT/);
    assert.match(EXPERIMENTAL_NANO_BANANA_PRO_PROMPT, /lower-body wardrobe/i);
    assert.match(EXPERIMENTAL_NANO_BANANA_PRO_PROMPT, /Furniture and props/i);
    assert.match(EXPERIMENTAL_NANO_BANANA_PRO_PROMPT, /waxy or synthetic/i);
  });

  it("lists 2K and 4:5 as supported OpenRouter Image API params", () => {
    assert.ok(
      (NANO_BANANA_PRO_SUPPORTED_RESOLUTIONS as readonly string[]).includes("2K"),
    );
    assert.ok(
      (NANO_BANANA_PRO_SUPPORTED_ASPECT_RATIOS as readonly string[]).includes("4:5"),
    );
  });
});
