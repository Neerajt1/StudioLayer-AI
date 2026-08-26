/**
 * Production Create engine gates — Nano Regular / Nano Pro only.
 * FLUX.2 Max must not be selectable on the active Create path.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  OPENROUTER_RENDERING_CONFIG,
  isFluxMaxEngine,
  isNanoBananaProEngine,
  resolveOpenRouterModelForResolution,
  resolveOpenRouterRenderEngine,
} from "./rendering.config.js";
import { buildFreshGenerationImageParts } from "./providers/OpenRouterProvider.js";
import { prepareGarmentReferenceForGeneration } from "../image-processing/garment-reference-sheet.js";

function withEngine<T>(engine: string | undefined, fn: () => T): T {
  const prev = process.env["OR_RENDER_ENGINE"];
  if (engine === undefined) delete process.env["OR_RENDER_ENGINE"];
  else process.env["OR_RENDER_ENGINE"] = engine;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env["OR_RENDER_ENGINE"];
    else process.env["OR_RENDER_ENGINE"] = prev;
  }
}

async function solidPng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .png()
    .toBuffer();
}

function toDataUri(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

describe("production Create engine selection", () => {
  it("A. default Create → Nano Regular (flash)", () => {
    withEngine(undefined, () => {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
      assert.equal(isNanoBananaProEngine(), false);
      assert.equal(isFluxMaxEngine(), false);
      assert.equal(
        resolveOpenRouterModelForResolution("2K"),
        OPENROUTER_RENDERING_CONFIG.defaultModel,
      );
      assert.match(resolveOpenRouterModelForResolution("2K"), /flash-image/);
      assert.doesNotMatch(
        resolveOpenRouterModelForResolution("2K"),
        /flux|black-forest/i,
      );
    });
    withEngine("flash", () => {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
      assert.equal(
        resolveOpenRouterModelForResolution("2K"),
        "google/gemini-3.1-flash-image",
      );
    });
  });

  it("B. Nano Pro when OR_RENDER_ENGINE=nano_pro", () => {
    withEngine("nano_pro", () => {
      assert.equal(resolveOpenRouterRenderEngine(), "nano_pro");
      assert.equal(isNanoBananaProEngine(), true);
      assert.equal(isFluxMaxEngine(), false);
      assert.equal(
        resolveOpenRouterModelForResolution("2K"),
        OPENROUTER_RENDERING_CONFIG.nanoBananaProModel,
      );
      assert.equal(
        resolveOpenRouterModelForResolution("4K"),
        "google/gemini-3-pro-image",
      );
    });
  });

  it("C. Flux Max cannot be selected by normal production Create path", () => {
    for (const alias of [
      "flux_max",
      "flux-max",
      "fluxmax",
      "flux.2-max",
      "flux2_max",
      "FLUX_MAX",
    ]) {
      withEngine(alias, () => {
        assert.equal(resolveOpenRouterRenderEngine(), "flash");
        assert.equal(isFluxMaxEngine(), false);
        assert.doesNotMatch(
          resolveOpenRouterModelForResolution("2K"),
          /flux|black-forest/i,
        );
        assert.equal(
          resolveOpenRouterModelForResolution("2K"),
          OPENROUTER_RENDERING_CONFIG.defaultModel,
        );
      });
    }
  });

  it("D. invalid/missing engine does not fall back to Flux", () => {
    withEngine(undefined, () => {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
      assert.equal(isFluxMaxEngine(), false);
    });
    withEngine("", () => {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
      assert.equal(isFluxMaxEngine(), false);
    });
    withEngine("unknown_engine_xyz", () => {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
      assert.equal(isFluxMaxEngine(), false);
      assert.doesNotMatch(
        resolveOpenRouterModelForResolution("2K"),
        /flux|black-forest/i,
      );
    });
  });

  it("E. Front-only generation image order unchanged (garment → talent → pose)", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: "https://example.invalid/front.png",
      modelImageUrl: "https://example.invalid/talent.png",
      poseReferenceImageUrl: "https://example.invalid/pose.png",
    });
    assert.equal(parts.length, 3);
    assert.equal(parts[0]?.image_url.url, "https://example.invalid/front.png");
    assert.equal(parts[1]?.image_url.url, "https://example.invalid/talent.png");
    assert.equal(parts[2]?.image_url.url, "https://example.invalid/pose.png");

    withEngine("flash", () => {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
      assert.match(resolveOpenRouterModelForResolution("2K"), /flash-image/);
    });
  });

  it("F. Front + Back + Detail uses sheet packaging and still resolves to Nano Regular", async () => {
    const front = await solidPng(120, 160, { r: 200, g: 170, b: 140 });
    const back = await solidPng(110, 150, { r: 90, g: 110, b: 150 });
    const detail = await solidPng(100, 40, { r: 160, g: 60, b: 60 });

    const resolved = await prepareGarmentReferenceForGeneration({
      frontImageUrl: toDataUri(front),
      backImageUrl: toDataUri(back),
      detailImageUrl: toDataUri(detail),
      renderId: 2601,
      evidenceMode: "sheet",
    });

    assert.equal(resolved.packaging, "sheet");
    assert.equal(resolved.usedReferenceSheet, true);
    assert.ok(resolved.garmentReferenceSheetImageUrl);

    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: resolved.garmentImageUrl,
      modelImageUrl: "https://example.invalid/talent.png",
      poseReferenceImageUrl: "https://example.invalid/pose.png",
      garmentEvidencePackaging: "sheet",
      garmentReferenceSheetImageUrl: resolved.garmentReferenceSheetImageUrl,
    });

    assert.equal(parts.length, 4);
    assert.equal(parts[0]?.image_url.url, resolved.garmentImageUrl);
    assert.equal(parts[1]?.image_url.url, resolved.garmentReferenceSheetImageUrl);
    assert.equal(parts[2]?.image_url.url, "https://example.invalid/talent.png");
    assert.equal(parts[3]?.image_url.url, "https://example.invalid/pose.png");

    withEngine("flux_max", () => {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
      assert.match(resolveOpenRouterModelForResolution("2K"), /flash-image/);
    });
    withEngine(undefined, () => {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
    });
  });
});
