import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveBirefNetOperatingResolution } from "./resolve-birefnet-operating-resolution.js";
import {
  NATIVE_2K_HEIGHT,
  NATIVE_2K_WIDTH,
  NATIVE_4K_HEIGHT,
  NATIVE_4K_WIDTH,
} from "../rendering/native-resolution.js";

describe("resolveBirefNetOperatingResolution", () => {
  it("selects 1024 for small sources", () => {
    assert.equal(resolveBirefNetOperatingResolution(800, 1000), "1024x1024");
  });

  it("selects 2048 for native 2K sources", () => {
    assert.equal(
      resolveBirefNetOperatingResolution(NATIVE_2K_WIDTH, NATIVE_2K_HEIGHT),
      "2048x2048",
    );
  });

  it("selects 2048 for native 4K sources", () => {
    assert.equal(
      resolveBirefNetOperatingResolution(NATIVE_4K_WIDTH, NATIVE_4K_HEIGHT),
      "2048x2048",
    );
  });
});
