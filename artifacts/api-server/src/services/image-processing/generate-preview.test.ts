import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  generatePreviewBuffer,
  PREVIEW_LONG_EDGE_PX,
  previewObjectKey,
} from "./generate-preview.js";
import { verifyPngHasTransparency } from "./verify-png-alpha.js";
import {
  NATIVE_2K_HEIGHT,
  NATIVE_2K_WIDTH,
  NATIVE_4K_HEIGHT,
  NATIVE_4K_WIDTH,
} from "../rendering/native-resolution.js";

async function createOpaqueJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 210, g: 180, b: 160 },
    },
  })
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function createTransparentPng(width: number, height: number): Promise<Buffer> {
  const fg = await sharp({
    create: {
      width: Math.floor(width * 0.6),
      height: Math.floor(height * 0.8),
      channels: 4,
      background: { r: 120, g: 90, b: 70, alpha: 0.4 },
    },
  })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: fg, gravity: "center" }])
    .png()
    .toBuffer();
}

function assertLongEdgeAtMost(width: number, height: number, max: number): void {
  assert.ok(Math.max(width, height) <= max);
}

describe("generatePreviewBuffer", () => {
  it("A. 2K opaque source → WebP preview", async () => {
    const source = await createOpaqueJpeg(NATIVE_2K_WIDTH, NATIVE_2K_HEIGHT);
    const preview = await generatePreviewBuffer(source);

    assert.equal(preview.format, "webp");
    assert.equal(preview.hasAlpha, false);
    assertLongEdgeAtMost(preview.width, preview.height, PREVIEW_LONG_EDGE_PX);
  });

  it("B. 4K opaque source → WebP preview", async () => {
    const source = await createOpaqueJpeg(NATIVE_4K_WIDTH, NATIVE_4K_HEIGHT);
    const preview = await generatePreviewBuffer(source);

    assert.equal(preview.format, "webp");
    assert.equal(preview.hasAlpha, false);
    assertLongEdgeAtMost(preview.width, preview.height, PREVIEW_LONG_EDGE_PX);
  });

  it("C. 2K transparent source → PNG preview with alpha", async () => {
    const source = await createTransparentPng(NATIVE_2K_WIDTH, NATIVE_2K_HEIGHT);
    const preview = await generatePreviewBuffer(source, { preserveAlpha: true });

    assert.equal(preview.format, "png");
    assert.equal(preview.hasAlpha, true);
    assertLongEdgeAtMost(preview.width, preview.height, PREVIEW_LONG_EDGE_PX);

    const verification = verifyPngHasTransparency(preview.buffer);
    assert.equal(verification.hasTransparentPixels, true);
  });

  it("D. 4K transparent source → PNG preview with alpha", async () => {
    const source = await createTransparentPng(NATIVE_4K_WIDTH, NATIVE_4K_HEIGHT);
    const preview = await generatePreviewBuffer(source, { preserveAlpha: true });

    assert.equal(preview.format, "png");
    assert.equal(preview.hasAlpha, true);
    assertLongEdgeAtMost(preview.width, preview.height, PREVIEW_LONG_EDGE_PX);

    const verification = verifyPngHasTransparency(preview.buffer);
    assert.equal(verification.hasTransparentPixels, true);
  });

  it("E. preserves aspect ratio", async () => {
    const source = await createOpaqueJpeg(1600, 900);
    const preview = await generatePreviewBuffer(source);
    const ratio = preview.width / preview.height;
    assert.ok(Math.abs(ratio - 1600 / 900) < 0.02);
  });

  it("F. does not enlarge images smaller than target", async () => {
    const source = await createOpaqueJpeg(320, 400);
    const preview = await generatePreviewBuffer(source);

    assert.equal(preview.width, 320);
    assert.equal(preview.height, 400);
  });

  it("G. uses deterministic preview object keys", () => {
    assert.equal(previewObjectKey(42, "webp"), "renders/42/preview.webp");
    assert.equal(previewObjectKey(42, "png"), "renders/42/preview.png");
  });
});
