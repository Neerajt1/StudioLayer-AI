// ---------------------------------------------------------------------------
// Face-anchor mask-hint helpers + Headless Create failure log classification.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  FACE_DETECTION_SCORE_THRESHOLD,
  MASK_HINT_LETTERBOX,
  MASK_HINT_PAD_FRACTION,
  MASK_HINT_PAD_FRACTION_ABOVE,
  MASK_HINT_PAD_FRACTION_BELOW,
  MASK_HINT_PAD_FRACTION_X,
  MASK_HINT_VIEW_HEIGHT_FRACTIONS,
  detectFaceAnchorWithMaskHint,
  maskForegroundBoundingBox,
  type DetectFaceAnchorFn,
} from "./face-anchor-detector.js";
import {
  checkFaceAnchorContainment,
} from "./headless-head-mask.js";
import {
  classifyHeadlessCreateFailure,
} from "../rendering/headless-create-failure-log.js";
import {
  HeadlessIdentityReferenceFailureError,
  HeadlessMaskFailureError,
  HeadlessStage2FailureError,
} from "../rendering/providers/nano-pro-headless-mannequin-trial.js";
import { HEAD_PLATE_GRAY, HEAD_SEGMENTATION_MODEL } from "./headless-head-mask.js";

describe("maskForegroundBoundingBox", () => {
  it("returns null for an empty mask", () => {
    const mask = Buffer.alloc(4 * 4, 0);
    assert.equal(maskForegroundBoundingBox(mask, 4, 4), null);
  });

  it("returns the tight axis-aligned bbox of foreground pixels", () => {
    const w = 10;
    const h = 10;
    const mask = Buffer.alloc(w * h, 0);
    for (let y = 3; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) {
        mask[y * w + x] = 255;
      }
    }
    assert.deepEqual(maskForegroundBoundingBox(mask, w, h), {
      x: 2,
      y: 3,
      width: 3,
      height: 2,
    });
  });

  it("exposes pad constants that expand context without torso-scale sprawl", () => {
    assert.ok(MASK_HINT_PAD_FRACTION > 0);
    assert.ok(MASK_HINT_PAD_FRACTION < 0.5);
    assert.ok(MASK_HINT_PAD_FRACTION_X > 0);
    assert.ok(MASK_HINT_PAD_FRACTION_ABOVE > 0);
    assert.ok(MASK_HINT_PAD_FRACTION_BELOW > MASK_HINT_PAD_FRACTION_ABOVE);
    assert.deepEqual([...MASK_HINT_VIEW_HEIGHT_FRACTIONS], [1]);
    assert.equal(FACE_DETECTION_SCORE_THRESHOLD, 0.6);
  });
});

describe("detectFaceAnchorWithMaskHint control flow", () => {
  const width = 80;
  const height = 120;

  async function solidPng(): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 40, g: 40, b: 40 },
      },
    })
      .png()
      .toBuffer();
  }

  /** Hair-inclusive head mask: tall bbox in upper frame (face sits lower in bbox). */
  function headMask(): Buffer {
    const mask = Buffer.alloc(width * height, 0);
    for (let y = 8; y <= 48; y++) {
      for (let x = 28; x <= 52; x++) {
        mask[y * width + x] = 255;
      }
    }
    return mask;
  }

  it("primary NO_FACE_DETECTED → secondary mask-guided detectFn runs and remaps coords", async () => {
    const imageBuffer = await solidPng();
    const mask = headMask();
    const calls: Array<{
      bufferLength: number;
      options: Parameters<DetectFaceAnchorFn>[1];
    }> = [];

    const detectFn: DetectFaceAnchorFn = async (buf, options) => {
      calls.push({ bufferLength: buf.length, options });
      // First call = full-frame primary
      if (calls.length === 1) {
        assert.equal(options?.viewHeightFractions, undefined);
        return { ok: false, reason: "NO_FACE_DETECTED" };
      }
      // Second call = mask crop secondary
      assert.deepEqual([...(options?.viewHeightFractions ?? [])], [1]);
      assert.deepEqual(options?.letterboxBackground, MASK_HINT_LETTERBOX);
      assert.equal(
        options?.scoreThreshold ?? FACE_DETECTION_SCORE_THRESHOLD,
        FACE_DETECTION_SCORE_THRESHOLD,
      );
      return {
        ok: true,
        face: {
          x: 10,
          y: 20,
          width: 12,
          height: 14,
          score: 0.72,
          detectedAtViewFraction: 1,
        },
      };
    };

    const result = await detectFaceAnchorWithMaskHint({
      imageBuffer,
      mask,
      width,
      height,
      detectFn,
    });

    assert.equal(calls.length, 2, "secondary detectFn must run after primary NO_FACE");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.usedMaskHint, true);
    assert.equal(result.secondaryAttempted, true);
    assert.ok(result.secondaryCrop);
    assert.ok(result.secondaryCrop!.width >= 16);
    assert.ok(result.secondaryCrop!.height >= 16);
    // Face remapped into source frame
    assert.equal(result.face.x, result.secondaryCrop!.left + 10);
    assert.equal(result.face.y, result.secondaryCrop!.top + 20);
    assert.equal(result.face.score, 0.72);
  });

  it("secondary detection is accepted only after existing containment checks", async () => {
    const imageBuffer = await solidPng();
    const mask = headMask();
    // Mask bbox is (28,8)-(52,48). Crop pads asymmetrically; face in crop coords
    // remaps to a box fully inside the mask with an envelope that covers hair.
    const detectFn: DetectFaceAnchorFn = async (_buf, options) => {
      if (!options?.viewHeightFractions) {
        return { ok: false, reason: "NO_FACE_DETECTED" };
      }
      return {
        ok: true,
        face: {
          x: 14, // → source x 32 once remapped (crop left ≈ 18)
          y: 24, // → source y 24
          width: 12,
          height: 14,
          score: 0.81,
          detectedAtViewFraction: 1,
        },
      };
    };

    const hinted = await detectFaceAnchorWithMaskHint({
      imageBuffer,
      mask,
      width,
      height,
      detectFn,
    });
    assert.equal(hinted.ok, true);
    if (!hinted.ok) return;
    assert.equal(hinted.usedMaskHint, true);
    assert.equal(hinted.secondaryAttempted, true);

    const contained = checkFaceAnchorContainment(mask, width, height, hinted.face);
    assert.equal(
      contained.reasons.length,
      0,
      `in-mask secondary face must pass containment; got ${contained.reasons.join(",")}`,
    );

    // Same secondary path outcome, but face far outside the head mask → reject
    const rejected = checkFaceAnchorContainment(mask, width, height, {
      x: 2,
      y: 100,
      width: 10,
      height: 10,
      score: 0.9,
      detectedAtViewFraction: 1,
    });
    assert.ok(rejected.reasons.length > 0, "out-of-mask face must still fail containment");
  });

  it("does not invoke secondary when primary already finds a face", async () => {
    const imageBuffer = await solidPng();
    const mask = headMask();
    let calls = 0;
    const detectFn: DetectFaceAnchorFn = async () => {
      calls += 1;
      return {
        ok: true,
        face: {
          x: 30,
          y: 20,
          width: 10,
          height: 12,
          score: 0.9,
          detectedAtViewFraction: 0.55,
        },
      };
    };

    const result = await detectFaceAnchorWithMaskHint({
      imageBuffer,
      mask,
      width,
      height,
      detectFn,
    });
    assert.equal(calls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.usedMaskHint, undefined);
    assert.equal(result.secondaryAttempted, undefined);
  });

  it("records secondaryAttempted when secondary still returns NO_FACE_DETECTED", async () => {
    const imageBuffer = await solidPng();
    const mask = headMask();
    const detectFn: DetectFaceAnchorFn = async () => ({
      ok: false,
      reason: "NO_FACE_DETECTED",
    });

    const result = await detectFaceAnchorWithMaskHint({
      imageBuffer,
      mask,
      width,
      height,
      detectFn,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "NO_FACE_DETECTED");
    assert.equal(result.secondaryAttempted, true);
    assert.ok(result.secondaryCrop);
  });

  it("uses primaryResult to avoid a redundant primary sweep", async () => {
    const imageBuffer = await solidPng();
    const mask = headMask();
    let calls = 0;
    const detectFn: DetectFaceAnchorFn = async (_buf, options) => {
      calls += 1;
      assert.ok(options?.viewHeightFractions, "only secondary should call detectFn");
      return {
        ok: true,
        face: {
          x: 5,
          y: 5,
          width: 8,
          height: 8,
          score: 0.7,
          detectedAtViewFraction: 1,
        },
      };
    };

    const result = await detectFaceAnchorWithMaskHint({
      imageBuffer,
      mask,
      width,
      height,
      primaryResult: { ok: false, reason: "NO_FACE_DETECTED" },
      detectFn,
    });
    assert.equal(calls, 1);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.usedMaskHint, true);
  });
});

describe("classifyHeadlessCreateFailure", () => {
  const stage1 = {
    stageRunId: "s1",
    imageDataUri: "data:image/png;base64,aaa",
  } as never;

  it("classifies YuNet NO_FACE as face_anchor with Stage1 spent / Stage2 not attempted", () => {
    const err = new HeadlessMaskFailureError({
      message: "mask failed",
      trialRunId: "t1",
      stage1,
      reasons: ["FACE_ANCHOR_INVALID"],
      detail: "face anchor unavailable: NO_FACE_DETECTED",
      metrics: {
        width: 100,
        height: 100,
        coveragePct: 1,
        boxTopPct: 1,
        boxBottomPct: 10,
        centreYPct: 5,
        boxWidthPct: 10,
        aspect: 1.2,
        bboxFill: 0.9,
        maskedPixels: 100,
        faceScore: null,
        faceCoveredPct: null,
        maskInsideEnvelopePct: null,
      },
      elapsedMs: { stage1Ms: 1000, maskMs: 200, totalMs: 1200 },
    });
    const classified = classifyHeadlessCreateFailure(err);
    assert.equal(classified.failureStage, "face_anchor");
    assert.equal(classified.stage1NanoProAttempted, true);
    assert.equal(classified.stage1ReturnedImage, true);
    assert.equal(classified.stage2Attempted, false);
    assert.equal(classified.trialRunId, "t1");
    assert.equal(classified.stage1RunId, "s1");
    assert.equal(classified.elapsedMs?.stage1, 1000);
  });

  it("classifies identity failures separately", () => {
    const headMask = {
      applied: true,
      method: "m",
      segmentationModel: HEAD_SEGMENTATION_MODEL,
      plateGray: HEAD_PLATE_GRAY,
      originalStage1Sha256_16: "a",
      maskedStage1Sha256_16: "b",
      width: 1,
      height: 1,
      metrics: {
        width: 1,
        height: 1,
        coveragePct: 1,
        boxTopPct: 1,
        boxBottomPct: 2,
        centreYPct: 1.5,
        boxWidthPct: 10,
        aspect: 1,
        bboxFill: 1,
        maskedPixels: 1,
        faceScore: 0.9,
        faceCoveredPct: 100,
        maskInsideEnvelopePct: 100,
      },
      maskedImageDataUri: "data:image/png;base64,bb",
    } as never;

    const err = new HeadlessIdentityReferenceFailureError({
      message: "identity failed",
      trialRunId: "t2",
      stage1,
      headMask,
      reason: "FACE_ANCHOR_INVALID",
      detail: "face anchor unavailable: NO_FACE_DETECTED",
      elapsedMs: {
        stage1Ms: 1,
        maskMs: 2,
        identityMs: 3,
        totalMs: 6,
      },
    });
    const classified = classifyHeadlessCreateFailure(err);
    assert.equal(classified.failureStage, "identity");
    assert.equal(classified.stage2Attempted, false);
  });

  it("classifies Stage2 failures and timeouts", () => {
    const fail = classifyHeadlessCreateFailure(
      new HeadlessStage2FailureError({
        message: "Stage 2 OpenRouter error: HTTP 500",
        trialRunId: "t3",
        stage1,
        stage2RunId: "s2",
        elapsedMs: {
          stage1Ms: 1,
          maskMs: 2,
          identityMs: 3,
          stage2Ms: 4,
          totalMs: 10,
        },
      }),
    );
    assert.equal(fail.failureStage, "stage2");
    assert.equal(fail.stage2Attempted, true);
    assert.equal(fail.stage2RunId, "s2");

    const timeout = classifyHeadlessCreateFailure(
      new HeadlessStage2FailureError({
        message: "This operation was aborted due to timeout",
        trialRunId: "t4",
        stage1,
        stage2RunId: "s2b",
      }),
    );
    assert.equal(timeout.failureStage, "timeout");
  });
});
