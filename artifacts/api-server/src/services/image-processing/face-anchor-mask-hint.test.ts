// ---------------------------------------------------------------------------
// Face-anchor mask-hint helpers + Headless Create failure log classification.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MASK_HINT_PAD_FRACTION,
  maskForegroundBoundingBox,
} from "./face-anchor-detector.js";
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

  it("exposes a stable pad fraction below 0.5 (does not expand into torso)", () => {
    assert.ok(MASK_HINT_PAD_FRACTION > 0);
    assert.ok(MASK_HINT_PAD_FRACTION < 0.5);
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
