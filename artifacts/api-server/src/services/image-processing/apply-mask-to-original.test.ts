import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  applyMaskToOriginal,
  readImageDimensions,
} from "./apply-mask-to-original.js";
import {
  assertPngDimensionsMatch,
  verifyPngHasTransparency,
} from "./verify-png-alpha.js";
import {
  NATIVE_2K_HEIGHT,
  NATIVE_2K_WIDTH,
  NATIVE_4K_HEIGHT,
  NATIVE_4K_WIDTH,
} from "../rendering/native-resolution.js";

async function createRgbOriginal(width: number, height: number): Promise<Buffer> {
  const row = Buffer.alloc(width * 3);
  for (let x = 0; x < width; x++) {
    row[x * 3] = 180 + (x % 40);
    row[x * 3 + 1] = 140 + (x % 30);
    row[x * 3 + 2] = 120 + (x % 20);
  }
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    row.copy(pixels, y * width * 3);
  }

  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

async function createGrayscaleMask(width: number, height: number): Promise<Buffer> {
  const centerW = Math.floor(width * 0.5);
  const centerH = Math.floor(height * 0.7);
  const fg = await sharp({
    create: {
      width: centerW,
      height: centerH,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite([{ input: fg, gravity: "center" }])
    .greyscale()
    .png()
    .toBuffer();
}

describe("applyMaskToOriginal", () => {
  it("TEST A — 2K source retains exact 2K dimensions with alpha", async () => {
    const original = await createRgbOriginal(NATIVE_2K_WIDTH, NATIVE_2K_HEIGHT);
    const mask = await createGrayscaleMask(512, 640);

    const sourceDims = await readImageDimensions(original);
    assert.equal(sourceDims.width, NATIVE_2K_WIDTH);
    assert.equal(sourceDims.height, NATIVE_2K_HEIGHT);

    const output = await applyMaskToOriginal(original, mask);
    const verification = assertPngDimensionsMatch(output, sourceDims);

    assert.equal(verification.width, NATIVE_2K_WIDTH);
    assert.equal(verification.height, NATIVE_2K_HEIGHT);
    assert.equal(verification.hasTransparentPixels, true);
    assert.ok(verification.transparentPixelCount > 0);
  });

  it("TEST B — 4K source retains exact 4K dimensions with alpha", async () => {
    const original = await createRgbOriginal(NATIVE_4K_WIDTH, NATIVE_4K_HEIGHT);
    const mask = await createGrayscaleMask(1024, 1280);

    const sourceDims = await readImageDimensions(original);
    assert.equal(sourceDims.width, NATIVE_4K_WIDTH);
    assert.equal(sourceDims.height, NATIVE_4K_HEIGHT);

    const output = await applyMaskToOriginal(original, mask);
    const verification = assertPngDimensionsMatch(output, sourceDims);

    assert.equal(verification.width, NATIVE_4K_WIDTH);
    assert.equal(verification.height, NATIVE_4K_HEIGHT);
    assert.equal(verification.hasTransparentPixels, true);
    assert.ok(verification.transparentPixelCount > 0);
  });

  it("rejects empty mask buffer via compositor failure", async () => {
    const original = await createRgbOriginal(640, 800);
    await assert.rejects(
      () => applyMaskToOriginal(original, Buffer.alloc(0)),
    );
  });
});

describe("assertPngDimensionsMatch", () => {
  it("fails when expected dimensions do not match output", async () => {
    const png = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    assert.throws(
      () => assertPngDimensionsMatch(png, { width: 200, height: 200 }),
      (err: unknown) =>
        err instanceof Error && err.name === "PngDimensionMismatchError",
    );
  });
});

describe("verifyPngHasTransparency", () => {
  it("detects alpha on composited fixture output", async () => {
    const original = await createRgbOriginal(800, 1000);
    const mask = await createGrayscaleMask(400, 500);
    const output = await applyMaskToOriginal(original, mask);
    const result = verifyPngHasTransparency(output);
    assert.equal(result.hasTransparentPixels, true);
  });
});
