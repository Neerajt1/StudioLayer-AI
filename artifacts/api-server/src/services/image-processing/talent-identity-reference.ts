// ---------------------------------------------------------------------------
// Studio Talent identity reference — mechanically derived, never generated.
//
// A full-body Studio Talent plate carries the face in roughly 1–1.5% of its
// pixels, so a model asked to reproduce fine facial structure from it is really
// being asked to reconstruct it. This module crops a deterministic head
// envelope out of the ORIGINAL Talent bytes and scales it up, so the identity
// evidence handed to a renderer is actual Talent pixels at a useful size.
//
// Strictly mechanical: detect (YuNet) → crop → resample. No image model, no
// enhancement, no sharpening, no beautification, no inpainting.
//
// FAIL-CLOSED: if the face cannot be located, no reference is produced.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import sharp from "sharp";
import { logger } from "../../lib/logger.js";
import {
  detectFaceAnchor,
  type FaceAnchorDetection,
  type FaceBox,
} from "./face-anchor-detector.js";

/**
 * Head envelope around the detected face box, in multiples of the face box.
 * Chosen to include the whole head and hair plus a controlled amount of neck
 * and minimal shoulder context — enough anatomical grounding to place the head,
 * not enough to imply a body, garment, or pose.
 *
 * These are independent of the head-MASK thresholds in headless-head-mask.ts
 * and must not be confused with them.
 */
export const IDENTITY_CROP_HALF_WIDTHS_OF_FACE = 1.6;
export const IDENTITY_CROP_ABOVE_FACE = 1.5;
export const IDENTITY_CROP_BELOW_FACE = 2.2;

/** Long edge of the delivered reference. Upscale only; never downscale. */
export const IDENTITY_REFERENCE_TARGET_LONG_EDGE = 1536;

/** Deterministic, non-generative resampling kernel. */
export const IDENTITY_REFERENCE_RESAMPLE_KERNEL = "lanczos3" as const;

export type IdentityReferenceFailureReason =
  | "FACE_ANCHOR_INVALID"
  | "SOURCE_UNREADABLE"
  | "CROP_DOES_NOT_CONTAIN_FACE";

export type TalentIdentityReferenceSuccess = {
  ok: true;
  /** PNG bytes of the cropped, upscaled identity reference. */
  image: Buffer;
  dataUri: string;
  width: number;
  height: number;
  /** The crop rectangle in ORIGINAL Talent pixel coordinates. */
  cropRegion: { left: number; top: number; width: number; height: number };
  scaleFactor: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceSha256_16: string;
  identitySha256_16: string;
  face: FaceBox;
  /** Share of reference pixels occupied by the detected face box. */
  faceCoverageOfReferencePct: number;
  /** The same share in the original full-body plate, for comparison. */
  faceCoverageOfSourcePct: number;
};

export type TalentIdentityReferenceFailure = {
  ok: false;
  reason: IdentityReferenceFailureReason;
  detail: string;
};

export type TalentIdentityReferenceResult =
  | TalentIdentityReferenceSuccess
  | TalentIdentityReferenceFailure;

/** Injectable for tests; production uses the shipped YuNet detector. */
export type FaceAnchorDetector = (
  imageBuffer: Buffer,
) => Promise<FaceAnchorDetection>;

function sha256Short16(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

/**
 * Build the identity reference from the original Studio Talent bytes.
 *
 * The crop is clamped to the source bounds, so a Talent photographed tight to
 * an edge yields a smaller envelope rather than a distorted or padded one.
 * Aspect ratio is preserved exactly: a single uniform scale factor is applied.
 */
export async function buildTalentIdentityReference(params: {
  talentImageBuffer: Buffer;
  faceAnchorDetector?: FaceAnchorDetector;
  trialRunId?: string;
}): Promise<TalentIdentityReferenceResult> {
  const detectFace = params.faceAnchorDetector ?? detectFaceAnchor;

  const meta = await sharp(params.talentImageBuffer).metadata();
  const sourceWidth = meta.width ?? 0;
  const sourceHeight = meta.height ?? 0;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return {
      ok: false,
      reason: "SOURCE_UNREADABLE",
      detail: "Studio Talent image dimensions could not be read",
    };
  }

  const detection = await detectFace(params.talentImageBuffer);
  if (!detection.ok) {
    logger.warn(
      {
        experimental: true,
        trialRunId: params.trialRunId,
        reason: detection.reason,
      },
      "talent-identity-reference: no face anchor — refusing to build a reference",
    );
    return {
      ok: false,
      reason: "FACE_ANCHOR_INVALID",
      detail: `face anchor unavailable: ${detection.reason}`,
    };
  }

  const face = detection.face;
  const centreX = face.x + face.width / 2;

  const rawLeft = centreX - IDENTITY_CROP_HALF_WIDTHS_OF_FACE * face.width;
  const rawRight = centreX + IDENTITY_CROP_HALF_WIDTHS_OF_FACE * face.width;
  const rawTop = face.y - IDENTITY_CROP_ABOVE_FACE * face.height;
  const rawBottom = face.y + face.height + IDENTITY_CROP_BELOW_FACE * face.height;

  const left = Math.max(0, Math.floor(rawLeft));
  const top = Math.max(0, Math.floor(rawTop));
  const right = Math.min(sourceWidth, Math.ceil(rawRight));
  const bottom = Math.min(sourceHeight, Math.ceil(rawBottom));

  const cropWidth = right - left;
  const cropHeight = bottom - top;
  if (cropWidth <= 0 || cropHeight <= 0) {
    return {
      ok: false,
      reason: "CROP_DOES_NOT_CONTAIN_FACE",
      detail: "computed head envelope is empty after clamping to image bounds",
    };
  }

  // The envelope must still contain the whole detected face.
  const faceRight = face.x + face.width;
  const faceBottom = face.y + face.height;
  if (
    face.x < left ||
    face.y < top ||
    faceRight > right ||
    faceBottom > bottom
  ) {
    return {
      ok: false,
      reason: "CROP_DOES_NOT_CONTAIN_FACE",
      detail: "detected face falls outside the clamped head envelope",
    };
  }

  const cropped = await sharp(params.talentImageBuffer)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .toBuffer();

  // Uniform upscale only — never downscale, never distort, never enhance.
  const longEdge = Math.max(cropWidth, cropHeight);
  const scaleFactor = Math.max(1, IDENTITY_REFERENCE_TARGET_LONG_EDGE / longEdge);
  const width = Math.round(cropWidth * scaleFactor);
  const height = Math.round(cropHeight * scaleFactor);

  const image = await sharp(cropped)
    .resize(width, height, {
      fit: "fill",
      kernel: IDENTITY_REFERENCE_RESAMPLE_KERNEL,
    })
    .png()
    .toBuffer();

  const faceArea = face.width * face.height;
  const result: TalentIdentityReferenceSuccess = {
    ok: true,
    image,
    dataUri: `data:image/png;base64,${image.toString("base64")}`,
    width,
    height,
    cropRegion: { left, top, width: cropWidth, height: cropHeight },
    scaleFactor,
    sourceWidth,
    sourceHeight,
    sourceSha256_16: sha256Short16(params.talentImageBuffer),
    identitySha256_16: sha256Short16(image),
    face,
    faceCoverageOfReferencePct: +(
      (faceArea / (cropWidth * cropHeight)) *
      100
    ).toFixed(1),
    faceCoverageOfSourcePct: +(
      (faceArea / (sourceWidth * sourceHeight)) *
      100
    ).toFixed(2),
  };

  logger.info(
    {
      experimental: true,
      trialRunId: params.trialRunId,
      sourceDimensions: `${sourceWidth}x${sourceHeight}`,
      referenceDimensions: `${width}x${height}`,
      cropRegion: result.cropRegion,
      scaleFactor: +scaleFactor.toFixed(3),
      faceCoverageOfSourcePct: result.faceCoverageOfSourcePct,
      faceCoverageOfReferencePct: result.faceCoverageOfReferencePct,
      generative: false,
    },
    "talent-identity-reference: identity reference derived mechanically",
  );

  return result;
}
