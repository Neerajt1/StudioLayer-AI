import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  IDENTITY_CROP_ABOVE_FACE,
  IDENTITY_CROP_BELOW_FACE,
  IDENTITY_CROP_HALF_WIDTHS_OF_FACE,
  IDENTITY_REFERENCE_TARGET_LONG_EDGE,
  buildTalentIdentityReference,
  type FaceAnchorDetector,
} from "./talent-identity-reference.js";
import type { FaceBox } from "./face-anchor-detector.js";

// A stand-in full-body Talent plate: 2:3, with a deliberately distinct
// coloured patch where the "face" sits so we can prove the crop carries the
// ORIGINAL pixels rather than anything regenerated.
const SOURCE_WIDTH = 1000;
const SOURCE_HEIGHT = 1500;
const FACE: FaceBox = {
  x: 460,
  y: 200,
  width: 80,
  height: 100,
  score: 0.99,
  detectedAtViewFraction: 1,
};

async function makeTalentPlate(): Promise<Buffer> {
  const faceMarker = await sharp({
    create: {
      width: FACE.width,
      height: FACE.height,
      channels: 3,
      background: { r: 200, g: 40, b: 90 },
    },
  })
    .png()
    .toBuffer();

  // Hair marker directly above the face, inside the intended envelope.
  const hairMarker = await sharp({
    create: {
      width: 120,
      height: 60,
      channels: 3,
      background: { r: 20, g: 220, b: 60 },
    },
  })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: SOURCE_WIDTH,
      height: SOURCE_HEIGHT,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .composite([
      { input: faceMarker, left: FACE.x, top: FACE.y },
      { input: hairMarker, left: FACE.x - 20, top: FACE.y - 80 },
    ])
    .png()
    .toBuffer();
}

const detectorOk: FaceAnchorDetector = async () => ({ ok: true, face: FACE });
const detectorFails: FaceAnchorDetector = async () => ({
  ok: false,
  reason: "NO_FACE_DETECTED",
});

async function pixelAt(
  image: Buffer,
  x: number,
  y: number,
): Promise<[number, number, number]> {
  const { data, info } = await sharp(image)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return [data[idx]!, data[idx + 1]!, data[idx + 2]!];
}

describe("talent-identity-reference — mechanical derivation", () => {
  it("1. the crop is derived from the original Talent bytes", async () => {
    const talent = await makeTalentPlate();
    const result = await buildTalentIdentityReference({
      talentImageBuffer: talent,
      faceAnchorDetector: detectorOk,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(
      result.sourceSha256_16,
      createHash("sha256").update(talent).digest("hex").slice(0, 16),
    );
    assert.equal(result.sourceWidth, SOURCE_WIDTH);
    assert.equal(result.sourceHeight, SOURCE_HEIGHT);

    // The distinctive face pixels survive the crop and upscale unchanged.
    const centreX = Math.round(
      ((FACE.x + FACE.width / 2 - result.cropRegion.left) /
        result.cropRegion.width) *
        result.width,
    );
    const centreY = Math.round(
      ((FACE.y + FACE.height / 2 - result.cropRegion.top) /
        result.cropRegion.height) *
        result.height,
    );
    const [r, g, b] = await pixelAt(result.image, centreX, centreY);
    assert.equal(r, 200);
    assert.equal(g, 40);
    assert.equal(b, 90);
  });

  it("2. a face-detection failure fails closed", async () => {
    const result = await buildTalentIdentityReference({
      talentImageBuffer: await makeTalentPlate(),
      faceAnchorDetector: detectorFails,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "FACE_ANCHOR_INVALID");
    assert.match(result.detail, /NO_FACE_DETECTED/);
    assert.equal("image" in result, false);
  });

  it("3. the crop fully contains the detected face", async () => {
    const result = await buildTalentIdentityReference({
      talentImageBuffer: await makeTalentPlate(),
      faceAnchorDetector: detectorOk,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const { left, top, width, height } = result.cropRegion;
    assert.equal(left <= FACE.x, true);
    assert.equal(top <= FACE.y, true);
    assert.equal(left + width >= FACE.x + FACE.width, true);
    assert.equal(top + height >= FACE.y + FACE.height, true);
  });

  it("4. the crop spans the intended head/hair/neck envelope", async () => {
    const result = await buildTalentIdentityReference({
      talentImageBuffer: await makeTalentPlate(),
      faceAnchorDetector: detectorOk,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const centreX = FACE.x + FACE.width / 2;
    assert.equal(
      result.cropRegion.left,
      Math.floor(centreX - IDENTITY_CROP_HALF_WIDTHS_OF_FACE * FACE.width),
    );
    assert.equal(
      result.cropRegion.top,
      Math.floor(FACE.y - IDENTITY_CROP_ABOVE_FACE * FACE.height),
    );
    assert.equal(
      result.cropRegion.top + result.cropRegion.height,
      Math.ceil(FACE.y + FACE.height + IDENTITY_CROP_BELOW_FACE * FACE.height),
    );

    // The hair marker above the face is inside the retained region.
    assert.equal(result.cropRegion.top <= FACE.y - 80, true);
    // The envelope is a head close-up, not a body crop.
    assert.equal(result.cropRegion.height < SOURCE_HEIGHT / 2, true);
    // The face now dominates the reference instead of being ~1% of it.
    assert.equal(result.faceCoverageOfSourcePct < 1, true);
    assert.equal(
      result.faceCoverageOfReferencePct > result.faceCoverageOfSourcePct * 5,
      true,
    );
  });

  it("5. dimensions are deterministic, undistorted and upscaled", async () => {
    const talent = await makeTalentPlate();
    const a = await buildTalentIdentityReference({
      talentImageBuffer: talent,
      faceAnchorDetector: detectorOk,
    });
    const b = await buildTalentIdentityReference({
      talentImageBuffer: talent,
      faceAnchorDetector: detectorOk,
    });
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) return;

    assert.equal(a.width, b.width);
    assert.equal(a.height, b.height);
    assert.equal(a.identitySha256_16, b.identitySha256_16);

    const meta = await sharp(a.image).metadata();
    assert.equal(meta.width, a.width);
    assert.equal(meta.height, a.height);

    // Longest edge hits the target; aspect ratio matches the source crop.
    assert.equal(
      Math.max(a.width, a.height),
      IDENTITY_REFERENCE_TARGET_LONG_EDGE,
    );
    const cropAspect = a.cropRegion.width / a.cropRegion.height;
    assert.equal(Math.abs(a.width / a.height - cropAspect) < 0.01, true);
    assert.equal(a.scaleFactor > 1, true);
  });

  it("6. an empty envelope after clamping fails closed", async () => {
    const offscreenFace: FaceAnchorDetector = async () => ({
      ok: true,
      face: { ...FACE, x: 2000, y: 2000 },
    });
    const result = await buildTalentIdentityReference({
      talentImageBuffer: await makeTalentPlate(),
      faceAnchorDetector: offscreenFace,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "CROP_DOES_NOT_CONTAIN_FACE");
  });

  it("7. a tightly framed Talent still yields a clamped, valid reference", async () => {
    // Face near the top edge: the envelope clamps rather than padding.
    const edgeFace: FaceAnchorDetector = async () => ({
      ok: true,
      face: { ...FACE, y: 10 },
    });
    const result = await buildTalentIdentityReference({
      talentImageBuffer: await makeTalentPlate(),
      faceAnchorDetector: edgeFace,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.cropRegion.top, 0);
    assert.equal(result.cropRegion.left >= 0, true);
    assert.equal(
      result.cropRegion.left + result.cropRegion.width <= SOURCE_WIDTH,
      true,
    );
  });

  it("8. the reference is a PNG data URI with a recorded hash", async () => {
    const result = await buildTalentIdentityReference({
      talentImageBuffer: await makeTalentPlate(),
      faceAnchorDetector: detectorOk,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.dataUri.startsWith("data:image/png;base64,"), true);
    assert.equal(
      result.identitySha256_16,
      createHash("sha256").update(result.image).digest("hex").slice(0, 16),
    );
    assert.notEqual(result.identitySha256_16, result.sourceSha256_16);
  });
});
