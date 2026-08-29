import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  V1_CREATE_USE_NANO_PRO_CASCADE,
  resolveOpenRouterModelForResolution,
  resolveOpenRouterRenderEngine,
} from "./rendering.config.js";
import { resolveGenerationCreditCost } from "@workspace/studio-credit-engine";
import { resolveV1CreateLocationEnvironment } from "./nano-pro-authority-layers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const providerSrc = readFileSync(
  join(__dirname, "providers/OpenRouterProvider.ts"),
  "utf8",
);
const directShootDialogSrc = readFileSync(
  join(__dirname, "../../../../studiolayer-ai/src/components/studio/direct-shoot-dialog.tsx"),
  "utf8",
);

describe("V1 Create — Nano Regular only", () => {
  it("1. V1 Create cascade flag is disabled", () => {
    assert.equal(V1_CREATE_USE_NANO_PRO_CASCADE, false);
    assert.match(providerSrc, /V1_CREATE_USE_NANO_PRO_CASCADE/);
    assert.match(
      providerSrc,
      /const useCreateCascade = !isRefinement && V1_CREATE_USE_NANO_PRO_CASCADE/,
    );
  });

  it("2. V1 Create selects Nano Regular (flash) for fresh generation", () => {
    assert.equal(resolveOpenRouterRenderEngine(), "flash");
    assert.match(resolveOpenRouterModelForResolution("2K", "flash"), /flash-image/);
    assert.match(resolveOpenRouterModelForResolution("4K", "flash"), /preview|flash/);
  });

  it("3. Nano Pro is not invoked on the active V1 Create path", () => {
    assert.match(providerSrc, /if \(useCreateCascade\)/);
    assert.equal(V1_CREATE_USE_NANO_PRO_CASCADE, false);
  });

  it("4. exactly one image-generation call per V1 Create shot (non-cascade branch)", () => {
    assert.match(providerSrc, /Refinement \/ Enhance Face keep the single-shot Flash path/);
    assert.match(providerSrc, /generateSingleShot\(/);
    assert.doesNotMatch(
      providerSrc.slice(providerSrc.indexOf("} else {")),
      /createStage === 2/,
    );
  });

  it("5. no Stage-2 generation on active V1 Create path", () => {
    assert.match(providerSrc, /const useCreateCascade = !isRefinement && V1_CREATE_USE_NANO_PRO_CASCADE/);
    assert.equal(V1_CREATE_USE_NANO_PRO_CASCADE, false);
  });

  it("6. no fallback second generation pass wired to V1 Create", () => {
    assert.equal(V1_CREATE_USE_NANO_PRO_CASCADE, false);
    assert.match(providerSrc, /if \(!stage1Url\) return Promise\.resolve\(null\)/);
  });

  it("7. 2K request resolves to Nano Regular 2K model", () => {
    const model = resolveOpenRouterModelForResolution("2K");
    assert.match(model, /flash-image/);
    assert.match(providerSrc, /outputResolution/);
    assert.match(providerSrc, /image_size: outputResolution/);
  });

  it("8. 4K request resolves to Nano Regular 4K model", () => {
    const model = resolveOpenRouterModelForResolution("4K");
    assert.match(model, /preview|flash/);
  });

  it("9. billing is 2K=1.5 and 4K=3 Studio Credits", () => {
    assert.equal(
      resolveGenerationCreditCost({ imageCount: 1, outputResolution: "2K" }),
      1.5,
    );
    assert.equal(
      resolveGenerationCreditCost({ imageCount: 1, outputResolution: "4K" }),
      3,
    );
  });

  it("10. V1 white-background contract remains intact", () => {
    assert.equal(resolveV1CreateLocationEnvironment("urban_street"), "white_studio");
  });

  it("11. pose persistence wiring remains intact", () => {
    assert.match(directShootDialogSrc, /initialSelectedPoseIds/);
    assert.match(directShootDialogSrc, /seedDirectShootSelection/);
    assert.match(directShootDialogSrc, /onSelectionChange/);
  });
});
