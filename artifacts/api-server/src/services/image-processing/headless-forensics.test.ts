// ---------------------------------------------------------------------------
// TEMPORARY DIAGNOSTIC — Headless forensics instrumentation tests
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  HEADLESS_FORENSICS_ENV,
  HEADLESS_FORENSICS_STORAGE_PREFIX,
  assertHeadlessForensicsObjectKeySafe,
  buildHeadlessForensicsObjectKey,
  isHeadlessForensicsEnabled,
  maybePersistHeadlessMaskForensics,
  persistHeadlessMaskForensics,
  type HeadlessMaskForensicsBundle,
} from "../rendering/headless-forensics.js";
import {
  neutralizeHeadRegion,
  type FaceAnchorDetector,
  type HeadSegmentationProvider,
} from "./headless-head-mask.js";

const W = 80;
const H = 100;

async function solidPhoto(): Promise<Buffer> {
  return sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: { r: 90, g: 90, b: 90 },
    },
  })
    .png()
    .toBuffer();
}

function rectMaskPng(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
): Promise<Buffer> {
  const raw = Buffer.alloc(W * H, 0);
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        raw[y * W + x] = 255;
      }
    }
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
}

describe("headless-forensics — env flag", () => {
  it("is OFF unless HEADLESS_FORENSICS_ENABLED is exactly true", () => {
    assert.equal(isHeadlessForensicsEnabled({}), false);
    assert.equal(isHeadlessForensicsEnabled({ [HEADLESS_FORENSICS_ENV]: "false" }), false);
    assert.equal(isHeadlessForensicsEnabled({ [HEADLESS_FORENSICS_ENV]: "1" }), false);
    assert.equal(isHeadlessForensicsEnabled({ [HEADLESS_FORENSICS_ENV]: "true" }), true);
  });

  it("refuses production renders/ keys", () => {
    assert.throws(() => assertHeadlessForensicsObjectKeySafe("renders/171/x.png"));
    const key = buildHeadlessForensicsObjectKey({
      renderId: 171,
      filename: "metadata.json",
    });
    assert.ok(key.startsWith(HEADLESS_FORENSICS_STORAGE_PREFIX));
    assert.ok(!key.includes("renders/171"));
  });
});

describe("headless-forensics — neutralizeHeadRegion capture gates", () => {
  it("flag OFF → failure has no forensics bundle", async () => {
    const prev = process.env[HEADLESS_FORENSICS_ENV];
    delete process.env[HEADLESS_FORENSICS_ENV];
    try {
      const imageBuffer = await solidPhoto();
      const maskPng = await rectMaskPng([{ x: 20, y: 5, w: 40, h: 35 }]);
      const segment: HeadSegmentationProvider = async () => ({ maskPng });
      const faceMissing: FaceAnchorDetector = async () => ({
        ok: false,
        reason: "NO_FACE_DETECTED",
      });
      const result = await neutralizeHeadRegion({
        imageBuffer,
        segmentationProvider: segment,
        faceAnchorDetector: faceMissing,
      });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.forensics, undefined);
    } finally {
      if (prev === undefined) delete process.env[HEADLESS_FORENSICS_ENV];
      else process.env[HEADLESS_FORENSICS_ENV] = prev;
    }
  });

  it("flag ON + successful shot → no forensics bundle", async () => {
    const prev = process.env[HEADLESS_FORENSICS_ENV];
    process.env[HEADLESS_FORENSICS_ENV] = "true";
    try {
      const width = 400;
      const height = 500;
      const imageBuffer = await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 40, g: 40, b: 40 },
        },
      })
        .png()
        .toBuffer();
      const head = { x: 170, y: 30, w: 60, h: 85 };
      const raw = Buffer.alloc(width * height, 0);
      for (let y = head.y; y < head.y + head.h; y++) {
        for (let x = head.x; x < head.x + head.w; x++) {
          raw[y * width + x] = 255;
        }
      }
      const maskPng = await sharp(raw, {
        raw: { width, height, channels: 1 },
      })
        .png()
        .toBuffer();
      const segment: HeadSegmentationProvider = async () => ({ maskPng });
      const faceFound: FaceAnchorDetector = async () => ({
        ok: true,
        face: {
          x: 182,
          y: 55,
          width: 36,
          height: 48,
          score: 0.94,
          detectedAtViewFraction: 1,
        },
      });
      const result = await neutralizeHeadRegion({
        imageBuffer,
        segmentationProvider: segment,
        faceAnchorDetector: faceFound,
      });
      assert.equal(result.ok, true, result.ok ? "" : result.detail);
      if (!result.ok) return;
      assert.equal("forensics" in result, false);
    } finally {
      if (prev === undefined) delete process.env[HEADLESS_FORENSICS_ENV];
      else process.env[HEADLESS_FORENSICS_ENV] = prev;
    }
  });

  it("flag ON + mask/face failure → forensics capture attached (no extra EVF/YuNet)", async () => {
    const prev = process.env[HEADLESS_FORENSICS_ENV];
    process.env[HEADLESS_FORENSICS_ENV] = "true";
    try {
      const imageBuffer = await solidPhoto();
      let segmentCalls = 0;
      let faceCalls = 0;
      const maskPng = await rectMaskPng([{ x: 20, y: 5, w: 40, h: 35 }]);
      const segment: HeadSegmentationProvider = async () => {
        segmentCalls += 1;
        return {
          maskPng,
          timings: {
            falUploadMs: 11,
            falSubscribeMs: 22,
            falSubscribeSdkTimings: null,
            maskFetchMs: 3,
          },
        };
      };
      const faceMissing: FaceAnchorDetector = async () => {
        faceCalls += 1;
        return { ok: false, reason: "NO_FACE_DETECTED" };
      };
      const result = await neutralizeHeadRegion({
        imageBuffer,
        segmentationProvider: segment,
        faceAnchorDetector: faceMissing,
      });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.ok(result.forensics);
      assert.equal(result.forensics!.temporaryDiagnostic, true);
      assert.ok(result.forensics!.stage1ImageBuffer.length > 0);
      assert.ok(result.forensics!.rawEvfSamMaskPng);
      assert.ok(result.forensics!.rawMaskResizedPng);
      assert.ok(result.forensics!.cleanedMaskPng);
      assert.equal(result.forensics!.renderWidth, W);
      assert.equal(result.forensics!.renderHeight, H);
      assert.equal(result.forensics!.timings.falUploadMs, 11);
      assert.equal(result.forensics!.timings.falSubscribeMs, 22);
      assert.equal(segmentCalls, 1, "must not re-call EVF-SAM for forensics");
      assert.equal(faceCalls, 1, "must not re-call YuNet for forensics");
    } finally {
      if (prev === undefined) delete process.env[HEADLESS_FORENSICS_ENV];
      else process.env[HEADLESS_FORENSICS_ENV] = prev;
    }
  });
});

describe("headless-forensics — persist behaviour", () => {
  function sampleBundle(): HeadlessMaskForensicsBundle {
    return {
      temporaryDiagnostic: true,
      capturedAtIso: new Date().toISOString(),
      stage1ImageBuffer: Buffer.from("stage1"),
      rawEvfSamMaskPng: Buffer.from("raw"),
      rawMaskResizedPng: Buffer.from("resized"),
      cleanedMaskPng: Buffer.from("cleaned"),
      renderWidth: W,
      renderHeight: H,
      rawMaskNativeWidth: W,
      rawMaskNativeHeight: H,
      cleanedMaskWidth: W,
      cleanedMaskHeight: H,
      primaryYunet: { ok: false, reason: "NO_FACE_DETECTED" },
      secondaryYunetCropSpace: null,
      secondaryAttempted: false,
      secondaryCrop: null,
      remappedFaceAabb: null,
      headHairEnvelope: null,
      geometryMetrics: {},
      containmentMetrics: {},
      failureReasons: ["FACE_ANCHOR_INVALID"],
      failureDetail: "test",
      timings: {
        falUploadMs: 1,
        falSubscribeMs: 2,
        falSubscribeSdkTimings: null,
        maskFetchMs: 3,
        sharpResizeMs: 4,
        cleanHeadMaskMs: 5,
        geometryValidationMs: 6,
        primaryYunetMs: 7,
        secondaryYunetMs: null,
        cropExtractMs: null,
        containmentMs: null,
        totalMaskPipelineMs: 20,
      },
      usedMaskHint: false,
    };
  }

  it("flag OFF → maybePersist does not upload", async () => {
    const puts: string[] = [];
    const result = await maybePersistHeadlessMaskForensics({
      enabled: false,
      renderId: 171,
      trialRunId: "t1",
      stage1RunId: "s1",
      bundle: sampleBundle(),
      putObject: async ({ objectKey }) => {
        puts.push(objectKey);
      },
    });
    assert.deepEqual(result, { attempted: false });
    assert.equal(puts.length, 0);
  });

  it("flag ON + failure bundle → upload under headless-forensics/{renderId}/", async () => {
    const puts: string[] = [];
    const result = await maybePersistHeadlessMaskForensics({
      enabled: true,
      renderId: 171,
      trialRunId: "t1",
      stage1RunId: "s1",
      bundle: sampleBundle(),
      putObject: async ({ objectKey }) => {
        puts.push(objectKey);
      },
    });
    assert.equal(result.attempted, true);
    if (!result.attempted) return;
    assert.equal(result.ok, true);
    assert.ok(puts.every((k) => k.startsWith(`${HEADLESS_FORENSICS_STORAGE_PREFIX}171/`)));
    assert.ok(puts.some((k) => k.endsWith("metadata.json")));
    assert.ok(puts.some((k) => k.endsWith("stage1.png")));
    assert.ok(puts.some((k) => k.endsWith("raw-evf-sam-mask.png")));
    assert.ok(puts.some((k) => k.endsWith("cleaned-mask.png")));
    assert.ok(!puts.some((k) => k.startsWith("renders/")));
  });

  it("forensic upload failure does not throw and reports ok:false", async () => {
    const result = await persistHeadlessMaskForensics({
      renderId: 171,
      trialRunId: "t1",
      stage1RunId: "s1",
      bundle: sampleBundle(),
      putObject: async () => {
        throw new Error("r2 down");
      },
    });
    assert.equal(result.attempted, true);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /r2 down/);
  });
});
