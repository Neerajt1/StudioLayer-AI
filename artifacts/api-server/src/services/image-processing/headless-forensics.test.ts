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
  logHeadlessForensicsStartupConfig,
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
    assert.equal(isHeadlessForensicsEnabled({ [HEADLESS_FORENSICS_ENV]: "TRUE" }), false);
    assert.equal(isHeadlessForensicsEnabled({ [HEADLESS_FORENSICS_ENV]: "true " }), false);
    assert.equal(isHeadlessForensicsEnabled({ [HEADLESS_FORENSICS_ENV]: "true" }), true);
  });

  it("startup config log reports enabled=true when flag is exactly true", () => {
    const messages: string[] = [];
    const enabled = logHeadlessForensicsStartupConfig(
      { [HEADLESS_FORENSICS_ENV]: "true" },
      (_obj, msg) => {
        messages.push(msg);
      },
    );
    assert.equal(enabled, true);
    assert.deepEqual(messages, ["headless-forensics: enabled=true"]);
  });

  it("startup config log reports enabled=false when unset or not exact true", () => {
    const messages: string[] = [];
    assert.equal(
      logHeadlessForensicsStartupConfig({}, (_obj, msg) => {
        messages.push(msg);
      }),
      false,
    );
    assert.equal(
      logHeadlessForensicsStartupConfig(
        { [HEADLESS_FORENSICS_ENV]: "1" },
        (_obj, msg) => {
          messages.push(msg);
        },
      ),
      false,
    );
    assert.deepEqual(messages, [
      "headless-forensics: enabled=false",
      "headless-forensics: enabled=false",
    ]);
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
      assert.ok(result.forensics!.pipelineDiagnostics);
      assert.equal(result.forensics!.pipelineDiagnostics!.stage1.width, W);
      assert.equal(result.forensics!.pipelineDiagnostics!.stage1.height, H);
      assert.ok(result.forensics!.diagnosticOverlays);
    } finally {
      if (prev === undefined) delete process.env[HEADLESS_FORENSICS_ENV];
      else process.env[HEADLESS_FORENSICS_ENV] = prev;
    }
  });

  it("flag ON + FACE_NOT_CONTAINED → diagnostics distinguish resize/clean/containment", async () => {
    const prev = process.env[HEADLESS_FORENSICS_ENV];
    process.env[HEADLESS_FORENSICS_ENV] = "true";
    try {
      const imageBuffer = await solidPhoto();
      // Small mask that will not cover the injected face AABB (≥95%).
      const maskPng = await rectMaskPng([{ x: 22, y: 6, w: 12, h: 10 }]);
      const segment: HeadSegmentationProvider = async () => ({ maskPng });
      const facePartial: FaceAnchorDetector = async () => ({
        ok: true,
        face: {
          x: 20,
          y: 5,
          width: 40,
          height: 35,
          score: 0.925,
          detectedAtViewFraction: 1,
        },
      });
      const result = await neutralizeHeadRegion({
        imageBuffer,
        segmentationProvider: segment,
        faceAnchorDetector: facePartial,
      });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.ok(result.reasons.includes("FACE_NOT_CONTAINED"));
      assert.ok(result.forensics);
      const diag = result.forensics!.pipelineDiagnostics;
      assert.ok(diag);
      assert.equal(diag!.stage1.width, W);
      assert.equal(diag!.stage1.height, H);
      assert.equal(diag!.stage1.format, "png");
      assert.equal(diag!.resizedMask.operation.fit, "fill");
      assert.equal(diag!.resizedMask.spatialAlignmentPreserved, true);
      assert.ok(diag!.cleanHeadMask.maskedPixelsBefore != null);
      assert.ok(diag!.cleanHeadMask.maskedPixelsAfter != null);
      assert.ok(diag!.cleanHeadMask.connectedComponentCount != null);
      assert.equal(diag!.yunet.faceScore, 0.925);
      assert.equal(diag!.yunet.coordinateSpace, "stage1_full_frame");
      assert.ok((diag!.containment.faceCoveredPct ?? 100) < 95);
      assert.ok(diag!.containment.failureReasons.includes("FACE_NOT_CONTAINED"));
      assert.ok(result.forensics!.diagnosticOverlays?.overlayCleanedMaskPng);
      assert.ok(result.forensics!.diagnosticOverlays?.overlayYunetFacePng);
      assert.ok(result.forensics!.diagnosticOverlays?.overlayFaceEnvelopePng);
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
      pipelineDiagnostics: null,
      diagnosticOverlays: null,
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

  it("flag ON + null bundle → explicit diagnostic log and no upload", async () => {
    const puts: string[] = [];
    const warns: Array<{ obj: Record<string, unknown>; msg: string }> = [];
    const result = await maybePersistHeadlessMaskForensics({
      enabled: true,
      renderId: 172,
      trialRunId: "t172",
      stage1RunId: "s172",
      bundle: null,
      putObject: async ({ objectKey }) => {
        puts.push(objectKey);
      },
      logWarn: (obj, msg) => {
        warns.push({ obj, msg });
      },
    });
    assert.deepEqual(result, { attempted: false });
    assert.equal(puts.length, 0);
    assert.equal(warns.length, 1);
    assert.equal(warns[0]!.msg, "headless-forensics: skipped — no forensic bundle");
    assert.equal(warns[0]!.obj["reason"], "no_forensic_bundle");
    assert.equal(warns[0]!.obj["renderId"], 172);
    assert.equal(warns[0]!.obj["temporaryDiagnostic"], true);
    assert.equal("stage1ImageBuffer" in warns[0]!.obj, false);
    assert.equal("rawEvfSamMaskPng" in warns[0]!.obj, false);
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

  it("flag ON + overlays present → uploads diagnostic overlay PNGs under forensics prefix", async () => {
    const puts: string[] = [];
    const bundle = sampleBundle();
    bundle.diagnosticOverlays = {
      overlayRawMaskPng: Buffer.from("ov-raw"),
      overlayCleanedMaskPng: Buffer.from("ov-clean"),
      overlayYunetFacePng: Buffer.from("ov-face"),
      overlayFaceEnvelopePng: Buffer.from("ov-env"),
    };
    bundle.pipelineDiagnostics = {
      stage1: { width: W, height: H, format: "png", channels: 3, space: "srgb" },
      rawEvfSamMask: {
        nativeWidth: W,
        nativeHeight: H,
        format: "png",
        coveragePct: 2.2,
        maskedPixels: 100,
      },
      resizedMask: {
        sourceWidth: W,
        sourceHeight: H,
        destinationWidth: W,
        destinationHeight: H,
        operation: { fit: "fill", kernel: "lanczos3" },
        coveragePct: 2.2,
        maskedPixels: 100,
        sourceAspect: W / H,
        destinationAspect: W / H,
        aspectDeltaPct: 0,
        spatialAlignmentPreserved: true,
      },
      cleanHeadMask: {
        coveragePctBefore: 2.2,
        coveragePctAfter: 2.3,
        maskedPixelsBefore: 100,
        maskedPixelsAfter: 105,
        connectedComponentCount: 1,
        largestComponentPixels: 100,
        pixelsRemovedByClean: 0,
        pixelsAddedByClean: 5,
        dilationPx: 1,
      },
      yunet: {
        faceBox: {
          x: 1,
          y: 2,
          width: 3,
          height: 4,
          score: 0.9,
          detectedAtViewFraction: 1,
        },
        faceScore: 0.9,
        coordinateSpace: "stage1_full_frame",
      },
      containment: {
        faceCoveredPct: 56.1,
        maskInsideEnvelopePct: 100,
        faceEnvelope: null,
        failureReasons: ["FACE_NOT_CONTAINED"],
      },
    };
    const result = await maybePersistHeadlessMaskForensics({
      enabled: true,
      renderId: 174,
      trialRunId: "t174",
      stage1RunId: "s174",
      bundle,
      putObject: async ({ objectKey }) => {
        puts.push(objectKey);
      },
    });
    assert.equal(result.attempted, true);
    if (!result.attempted) return;
    assert.equal(result.ok, true);
    assert.ok(puts.some((k) => k.endsWith("overlay-stage1-raw-mask.png")));
    assert.ok(puts.some((k) => k.endsWith("overlay-stage1-cleaned-mask.png")));
    assert.ok(puts.some((k) => k.endsWith("overlay-stage1-yunet-face.png")));
    assert.ok(puts.some((k) => k.endsWith("overlay-stage1-face-envelope.png")));
    assert.ok(puts.every((k) => k.startsWith(`${HEADLESS_FORENSICS_STORAGE_PREFIX}174/`)));
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
