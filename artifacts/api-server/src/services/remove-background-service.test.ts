import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  produceResolutionPreservingTransparentPng,
  RemoveBackgroundFailedError,
} from "./remove-background-service.js";
import {
  NATIVE_2K_HEIGHT,
  NATIVE_2K_WIDTH,
  NATIVE_4K_HEIGHT,
  NATIVE_4K_WIDTH,
} from "./rendering/native-resolution.js";

const SOURCE_URL = "https://fixture.test/original.png";
const MASK_URL = "https://fixture.test/mask.png";

async function createRgbOriginal(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 210, g: 190, b: 170 },
    },
  })
    .png()
    .toBuffer();
}

async function createGrayscaleMask(width: number, height: number): Promise<Buffer> {
  const fg = await sharp({
    create: {
      width: Math.floor(width * 0.55),
      height: Math.floor(height * 0.75),
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

function buildDeps(original: Buffer, mask: Buffer) {
  return {
    fetchImageBuffer: async (url: string) => {
      if (url === SOURCE_URL) {
        return { buffer: original, contentType: "image/png" };
      }
      if (url === MASK_URL) {
        return { buffer: mask, contentType: "image/png" };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    },
    processBackgroundRemoval: async () => ({
      kind: "mask_url" as const,
      maskUrl: MASK_URL,
    }),
  };
}

describe("produceResolutionPreservingTransparentPng", () => {
  it("TEST A — 2K pipeline preserves exact dimensions", async () => {
    const original = await createRgbOriginal(NATIVE_2K_WIDTH, NATIVE_2K_HEIGHT);
    const mask = await createGrayscaleMask(640, 800);

    const result = await produceResolutionPreservingTransparentPng(
      {
        sourceImageUrl: SOURCE_URL,
        renderId: 1,
        purpose: "test-2k",
      },
      buildDeps(original, mask),
    );

    assert.equal(result.sourceWidth, NATIVE_2K_WIDTH);
    assert.equal(result.sourceHeight, NATIVE_2K_HEIGHT);
    assert.equal(result.alphaVerification.width, NATIVE_2K_WIDTH);
    assert.equal(result.alphaVerification.height, NATIVE_2K_HEIGHT);
    assert.equal(result.alphaVerification.hasTransparentPixels, true);
  });

  it("TEST B — 4K pipeline preserves exact dimensions", async () => {
    const original = await createRgbOriginal(NATIVE_4K_WIDTH, NATIVE_4K_HEIGHT);
    const mask = await createGrayscaleMask(1024, 1280);

    const result = await produceResolutionPreservingTransparentPng(
      {
        sourceImageUrl: SOURCE_URL,
        renderId: 2,
        purpose: "test-4k",
      },
      buildDeps(original, mask),
    );

    assert.equal(result.sourceWidth, NATIVE_4K_WIDTH);
    assert.equal(result.sourceHeight, NATIVE_4K_HEIGHT);
    assert.equal(result.alphaVerification.width, NATIVE_4K_WIDTH);
    assert.equal(result.alphaVerification.height, NATIVE_4K_HEIGHT);
    assert.equal(result.alphaVerification.hasTransparentPixels, true);
  });

  it("fails when original cannot be fetched", async () => {
    await assert.rejects(
      () =>
        produceResolutionPreservingTransparentPng(
          { sourceImageUrl: SOURCE_URL, renderId: 3, purpose: "test-fetch-fail" },
          {
            fetchImageBuffer: async () => {
              throw new Error("network error");
            },
            processBackgroundRemoval: async () => ({
              kind: "mask_url",
              maskUrl: MASK_URL,
            }),
          },
        ),
      RemoveBackgroundFailedError,
    );
  });

  it("fails when FAL mask request fails", async () => {
    const original = await createRgbOriginal(640, 800);
    await assert.rejects(
      () =>
        produceResolutionPreservingTransparentPng(
          { sourceImageUrl: SOURCE_URL, renderId: 4, purpose: "test-fal-fail" },
          {
            fetchImageBuffer: async () => ({
              buffer: original,
              contentType: "image/png",
            }),
            processBackgroundRemoval: async () => {
              throw new Error("FAL unavailable");
            },
          },
        ),
      RemoveBackgroundFailedError,
    );
  });

  it("fails when mask cannot be fetched", async () => {
    const original = await createRgbOriginal(640, 800);
    await assert.rejects(
      () =>
        produceResolutionPreservingTransparentPng(
          { sourceImageUrl: SOURCE_URL, renderId: 5, purpose: "test-mask-fetch-fail" },
          {
            fetchImageBuffer: async (url: string) => {
              if (url === SOURCE_URL) {
                return { buffer: original, contentType: "image/png" };
              }
              throw new Error("mask fetch failed");
            },
            processBackgroundRemoval: async () => ({
              kind: "mask_url",
              maskUrl: MASK_URL,
            }),
          },
        ),
      RemoveBackgroundFailedError,
    );
  });

  it("fails when mask buffer is empty", async () => {
    const original = await createRgbOriginal(640, 800);
    await assert.rejects(
      () =>
        produceResolutionPreservingTransparentPng(
          { sourceImageUrl: SOURCE_URL, renderId: 6, purpose: "test-empty-mask" },
          buildDeps(original, Buffer.alloc(0)),
        ),
      RemoveBackgroundFailedError,
    );
  });

  it("fails when provider returns unsupported buffer result", async () => {
    const original = await createRgbOriginal(640, 800);
    await assert.rejects(
      () =>
        produceResolutionPreservingTransparentPng(
          { sourceImageUrl: SOURCE_URL, renderId: 7, purpose: "test-bad-kind" },
          {
            fetchImageBuffer: async () => ({
              buffer: original,
              contentType: "image/png",
            }),
            processBackgroundRemoval: async () => ({
              kind: "buffer",
              buffer: Buffer.from("x"),
              mimeType: "image/png",
            }),
          },
        ),
      RemoveBackgroundFailedError,
    );
  });
});
