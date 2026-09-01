import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  HEAD_PLATE_GRAY,
  MIN_FACE_COVERED_BY_MASK,
  MIN_MASK_INSIDE_ENVELOPE,
  HEAD_HAIR_ENVELOPE_HALF_WIDTHS_OF_FACE,
  HEAD_HAIR_ENVELOPE_ABOVE_FACE,
  HEAD_HAIR_ENVELOPE_BELOW_FACE,
  LEGACY_FACE_TIGHT_ENVELOPE,
  LEGACY_FACE_TIGHT_ENVELOPE_HALF_WIDTHS_OF_FACE,
  LEGACY_FACE_TIGHT_ENVELOPE_ABOVE_FACE,
  LEGACY_FACE_TIGHT_ENVELOPE_BELOW_FACE,
  HEAD_MASK_MAX_COVERAGE,
  HEAD_MASK_MAX_BOX_BOTTOM,
  HEAD_MASK_MAX_BOX_WIDTH,
  checkFaceAnchorContainment,
  checkHeadMaskGeometry,
  cleanHeadMask,
  neutralizeHeadRegion,
  type FaceAnchorDetector,
  type HeadSegmentationProvider,
} from "./headless-head-mask.js";
import type { FaceBox } from "./face-anchor-detector.js";

// A stand-in "photograph": deterministic gradient so any altered pixel is
// detectable, at a realistic 4:5 portrait aspect.
const W = 400;
const H = 500;

async function syntheticPhotograph(): Promise<Buffer> {
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      raw[o] = (x * 7) % 256;
      raw[o + 1] = (y * 5) % 256;
      raw[o + 2] = (x + y) % 256;
    }
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } })
    .png()
    .toBuffer();
}

/** Solid rectangle mask helper, in raw single-channel bytes. */
function rectMask(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
): Buffer {
  const mask = Buffer.alloc(W * H, 0);
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x >= 0 && x < W && y >= 0 && y < H) mask[y * W + x] = 255;
      }
    }
  }
  return mask;
}

async function maskPng(mask: Buffer): Promise<Buffer> {
  return sharp(mask, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
}

/** A plausible head: upper-centre, ~14% frame width, head-like aspect. */
const HEAD_RECT = { x: 170, y: 30, w: 60, h: 85 };

/** Face box sitting inside that head, YuNet-style (eyebrows→chin). */
const FACE: FaceBox = {
  x: 182,
  y: 55,
  width: 36,
  height: 48,
  score: 0.94,
  detectedAtViewFraction: 1,
};

const faceFound: FaceAnchorDetector = async () => ({ ok: true, face: FACE });
const faceMissing: FaceAnchorDetector = async () => ({
  ok: false,
  reason: "NO_FACE_DETECTED",
});

function segmenting(mask: Buffer): HeadSegmentationProvider {
  return async () => ({ maskPng: await maskPng(mask) });
}

describe("headless-head-mask — deterministic cleanup", () => {
  it("1. keeps only the largest connected component", () => {
    const mask = rectMask([HEAD_RECT, { x: 20, y: 400, w: 6, h: 6 }]);
    const cleaned = cleanHeadMask(mask, W, H, 0);
    // The stray speck near the garment is gone.
    assert.equal(cleaned[405 * W + 22], 0);
    // The head survives.
    assert.equal(cleaned[60 * W + 200], 255);
  });

  it("2. fills interior holes so facial features cannot survive", () => {
    const mask = rectMask([HEAD_RECT]);
    // Punch an "eye" hole out of the head.
    for (let y = 60; y < 70; y++) {
      for (let x = 185; x < 195; x++) mask[y * W + x] = 0;
    }
    assert.equal(mask[65 * W + 190], 0);
    const cleaned = cleanHeadMask(mask, W, H, 0);
    assert.equal(cleaned[65 * W + 190], 255, "interior hole must be filled");
  });

  it("3. dilation grows the boundary by the requested radius", () => {
    const mask = rectMask([HEAD_RECT]);
    const cleaned = cleanHeadMask(mask, W, H, 3);
    // Three pixels above the head top is now covered; six is not.
    assert.equal(cleaned[27 * W + 200], 255);
    assert.equal(cleaned[23 * W + 200], 0);
  });

  it("4. an empty mask stays empty", () => {
    const cleaned = cleanHeadMask(Buffer.alloc(W * H, 0), W, H, 2);
    assert.equal(cleaned.every((v) => v === 0), true);
  });
});

describe("headless-head-mask — geometric plausibility gate", () => {
  it("5. accepts a plausible head region", () => {
    const result = checkHeadMaskGeometry(rectMask([HEAD_RECT]), W, H);
    assert.deepEqual(result.reasons, []);
  });

  it("6. rejects an empty mask as a missed head", () => {
    const result = checkHeadMaskGeometry(Buffer.alloc(W * H, 0), W, H);
    assert.deepEqual(result.reasons, ["MISSED_HEAD"]);
  });

  it("7. rejects a mask covering the body or garment", () => {
    const result = checkHeadMaskGeometry(
      rectMask([{ x: 60, y: 30, w: 280, h: 420 }]),
      W,
      H,
    );
    assert.equal(result.reasons.includes("IMPLAUSIBLE_SIZE"), true);
    assert.equal(result.reasons.includes("EXTENDS_INTO_SHOULDERS"), true);
    assert.equal(result.reasons.includes("EXTENDS_INTO_NECK_OR_TORSO"), true);
  });

  it("8. rejects a mask sitting low in the frame", () => {
    const result = checkHeadMaskGeometry(
      rectMask([{ x: 170, y: 300, w: 60, h: 85 }]),
      W,
      H,
    );
    assert.equal(result.reasons.includes("IMPLAUSIBLE_LOCATION"), true);
  });

  it("9. rejects a scattered multi-region mask", () => {
    const scattered = Buffer.alloc(W * H, 0);
    for (let y = 30; y < 120; y += 6) {
      for (let x = 160; x < 240; x += 6) scattered[y * W + x] = 255;
    }
    const result = checkHeadMaskGeometry(scattered, W, H);
    assert.equal(result.reasons.includes("SCATTERED_MASK"), true);
  });

  it("10. thresholds are the validated ones", () => {
    assert.equal(HEAD_MASK_MAX_COVERAGE, 0.12);
    assert.equal(HEAD_MASK_MAX_BOX_BOTTOM, 0.6);
    assert.equal(HEAD_MASK_MAX_BOX_WIDTH, 0.45);
    assert.equal(MIN_FACE_COVERED_BY_MASK, 0.95);
    assert.equal(MIN_MASK_INSIDE_ENVELOPE, 0.97);
    assert.equal(HEAD_HAIR_ENVELOPE_HALF_WIDTHS_OF_FACE, 2.0);
    assert.equal(HEAD_HAIR_ENVELOPE_ABOVE_FACE, 2.25);
    assert.equal(HEAD_HAIR_ENVELOPE_BELOW_FACE, 2.0);
    assert.equal(LEGACY_FACE_TIGHT_ENVELOPE_HALF_WIDTHS_OF_FACE, 1.5);
    assert.equal(LEGACY_FACE_TIGHT_ENVELOPE_ABOVE_FACE, 1.6);
    assert.equal(LEGACY_FACE_TIGHT_ENVELOPE_BELOW_FACE, 2.0);
    assert.equal(HEAD_PLATE_GRAY, 165);
  });
});

describe("headless-head-mask — face anchor cross-check", () => {
  it("11. accepts a mask that contains the face and stays in the envelope", () => {
    const result = checkFaceAnchorContainment(rectMask([HEAD_RECT]), W, H, FACE);
    assert.deepEqual(result.reasons, []);
    assert.equal(result.faceCoveredPct, 100);
    assert.equal(result.maskInsideEnvelopePct, 100);
  });

  it("12. rejects a mask that does not contain the detected face", () => {
    // Wrong region entirely — the render-89 skirt failure.
    const result = checkFaceAnchorContainment(
      rectMask([{ x: 120, y: 250, w: 160, h: 150 }]),
      W,
      H,
      FACE,
    );
    assert.equal(result.reasons.includes("FACE_NOT_CONTAINED"), true);
    assert.equal(result.faceCoveredPct, 0);
  });

  it("13. rejects a head mask that swallows a raised hand or forearm", () => {
    // The render-17 failure: correct head PLUS an attached limb.
    const result = checkFaceAnchorContainment(
      rectMask([HEAD_RECT, { x: 230, y: 60, w: 90, h: 90 }]),
      W,
      H,
      FACE,
    );
    assert.equal(result.faceCoveredPct, 100, "the face is still covered");
    assert.equal(
      result.reasons.includes("HEAD_MASK_EXTENDS_BEYOND_FACE_ENVELOPE"),
      true,
      "but the limb pushes the mask outside the head envelope",
    );
  });

  it("14. tolerates long hair within the bounded envelope", () => {
    const result = checkFaceAnchorContainment(
      rectMask([{ x: 175, y: 30, w: 50, h: 165 }]),
      W,
      H,
      FACE,
    );
    assert.deepEqual(result.reasons, []);
  });

  it("14b. accepts asymmetric hair bulk rejected by the legacy face-tight envelope (Run 1 regression)", () => {
    // Mirrors production Run 1: face fully covered, ~84% inside legacy envelope.
    const hairInclusiveHeadMask = rectMask([
      HEAD_RECT,
      { x: 130, y: 25, w: 40, h: 95 },
      { x: 165, y: 15, w: 55, h: 18 },
    ]);

    const legacy = checkFaceAnchorContainment(
      hairInclusiveHeadMask,
      W,
      H,
      FACE,
      LEGACY_FACE_TIGHT_ENVELOPE,
    );
    assert.equal(legacy.faceCoveredPct, 100);
    assert.equal(legacy.maskInsideEnvelopePct >= 82, true);
    assert.equal(legacy.maskInsideEnvelopePct < MIN_MASK_INSIDE_ENVELOPE * 100, true);
    assert.equal(
      legacy.reasons.includes("HEAD_MASK_EXTENDS_BEYOND_FACE_ENVELOPE"),
      true,
    );

    const current = checkFaceAnchorContainment(hairInclusiveHeadMask, W, H, FACE);
    assert.deepEqual(current.reasons, []);
    assert.equal(current.faceCoveredPct, 100);
    assert.equal(current.maskInsideEnvelopePct >= MIN_MASK_INSIDE_ENVELOPE * 100, true);
  });
});

describe("headless-head-mask — neutralizeHeadRegion end to end", () => {
  it("15. succeeds on a plausible mask and neutralises only the head", async () => {
    const image = await syntheticPhotograph();
    const result = await neutralizeHeadRegion({
      imageBuffer: image,
      segmentationProvider: segmenting(rectMask([HEAD_RECT])),
      faceAnchorDetector: faceFound,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    // Resolution preserved exactly.
    assert.equal(result.width, W);
    assert.equal(result.height, H);
    const meta = await sharp(result.maskedImage).metadata();
    assert.equal(meta.width, W);
    assert.equal(meta.height, H);

    const before = await sharp(image).removeAlpha().raw().toBuffer();
    const after = await sharp(result.maskedImage).removeAlpha().raw().toBuffer();

    // The head centre is now the neutral plate.
    const centre = ((HEAD_RECT.y + 40) * W + HEAD_RECT.x + 30) * 3;
    assert.equal(after[centre], HEAD_PLATE_GRAY);
    assert.equal(after[centre + 1], HEAD_PLATE_GRAY);
    assert.equal(after[centre + 2], HEAD_PLATE_GRAY);

    // Every pixel far from the head is byte-identical.
    let changedOutside = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const inHeadArea =
          x >= HEAD_RECT.x - 12 &&
          x <= HEAD_RECT.x + HEAD_RECT.w + 12 &&
          y >= HEAD_RECT.y - 12 &&
          y <= HEAD_RECT.y + HEAD_RECT.h + 12;
        if (inHeadArea) continue;
        const o = (y * W + x) * 3;
        if (
          before[o] !== after[o] ||
          before[o + 1] !== after[o + 1] ||
          before[o + 2] !== after[o + 2]
        ) {
          changedOutside++;
        }
      }
    }
    assert.equal(changedOutside, 0, "no pixel outside the head region may change");

    // Forensic hashes differ and are recorded.
    assert.equal(result.originalSha256_16.length, 16);
    assert.equal(result.maskedSha256_16.length, 16);
    assert.notEqual(result.originalSha256_16, result.maskedSha256_16);
  });

  it("16. fails closed when segmentation throws", async () => {
    const result = await neutralizeHeadRegion({
      imageBuffer: await syntheticPhotograph(),
      segmentationProvider: async () => {
        throw new Error("EVF-SAM unavailable");
      },
      faceAnchorDetector: faceFound,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.reasons, ["SEGMENTATION_FAILED"]);
    assert.match(result.detail, /EVF-SAM unavailable/);
  });

  it("17. fails closed when no face can be detected", async () => {
    const result = await neutralizeHeadRegion({
      imageBuffer: await syntheticPhotograph(),
      segmentationProvider: segmenting(rectMask([HEAD_RECT])),
      faceAnchorDetector: faceMissing,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reasons.includes("FACE_ANCHOR_INVALID"), true);
  });

  it("18. fails closed when the mask misses the face", async () => {
    const result = await neutralizeHeadRegion({
      imageBuffer: await syntheticPhotograph(),
      segmentationProvider: segmenting(rectMask([{ x: 150, y: 200, w: 100, h: 90 }])),
      faceAnchorDetector: faceFound,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reasons.includes("FACE_NOT_CONTAINED"), true);
  });

  it("19. fails closed when the mask escapes the head envelope", async () => {
    const result = await neutralizeHeadRegion({
      imageBuffer: await syntheticPhotograph(),
      segmentationProvider: segmenting(
        // Head plus an attached forearm, joined so cleanup keeps them as one.
        rectMask([HEAD_RECT, { x: 228, y: 60, w: 95, h: 95 }]),
      ),
      faceAnchorDetector: faceFound,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(
      result.reasons.includes("HEAD_MASK_EXTENDS_BEYOND_FACE_ENVELOPE"),
      true,
    );
  });

  it("20. fails closed on an implausible whole-body mask", async () => {
    const result = await neutralizeHeadRegion({
      imageBuffer: await syntheticPhotograph(),
      segmentationProvider: segmenting(rectMask([{ x: 40, y: 20, w: 320, h: 450 }])),
      faceAnchorDetector: faceFound,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reasons.includes("IMPLAUSIBLE_SIZE"), true);
  });

  it("21. fails closed on an empty segmentation", async () => {
    const result = await neutralizeHeadRegion({
      imageBuffer: await syntheticPhotograph(),
      segmentationProvider: segmenting(Buffer.alloc(W * H, 0)),
      faceAnchorDetector: faceFound,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reasons.includes("MISSED_HEAD"), true);
  });

  it("22. a rejection never returns a masked image to composite from", async () => {
    const result = await neutralizeHeadRegion({
      imageBuffer: await syntheticPhotograph(),
      segmentationProvider: segmenting(rectMask([{ x: 150, y: 200, w: 100, h: 90 }])),
      faceAnchorDetector: faceFound,
    });
    assert.equal(result.ok, false);
    assert.equal("maskedDataUri" in result, false);
    assert.equal("maskedImage" in result, false);
  });
});
