// ---------------------------------------------------------------------------
// Mechanical head/hair neutralisation for the headless-mannequin experiment.
//
// Takes a completed photograph and replaces ONLY the head/face/hair region with
// a neutral grey plate, leaving every other pixel byte-identical.
//
// Pipeline (no image generation at any point):
//   1. EVF-SAM text-prompted head/hair segmentation (fal-ai/evf-sam)
//   2. deterministic cleanup — largest component, hole fill, dilation
//   3. independent YuNet face anchor
//   4. geometric plausibility gate + face-anchor cross-check
//   5. sharp composite of the neutral plate inside the mask only
//
// FAIL-CLOSED: an uncertain or implausible mask is rejected with a
// machine-readable reason. It is never repaired to make it pass.
//
// Thresholds are the ones validated against real 2K fashion photographs.
// Do not loosen them without re-running that validation.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { logger } from "../../lib/logger.js";
import {
  detectFaceAnchor,
  type FaceAnchorDetection,
  type FaceBox,
} from "./face-anchor-detector.js";

/** Neutral plate grey, matching the shipped face-neutral convention. */
export const HEAD_PLATE_GRAY = 165;

export const HEAD_SEGMENTATION_MODEL = "fal-ai/evf-sam" as const;

export const HEAD_SEGMENTATION_PROMPT =
  "the person's entire head including all hair and face" as const;

export const HEAD_SEGMENTATION_NEGATIVE_PROMPT =
  "neck, shoulders, torso, clothing, garment, hands, arms, background" as const;

export const HEAD_SEGMENTATION_TIMEOUT_MS = Number(
  process.env["FAL_HEAD_SEGMENTATION_TIMEOUT_MS"] ?? 120_000,
);

// ── validated geometric thresholds ─────────────────────────────────────────
export const HEAD_MASK_MIN_COVERAGE = 0.003;
export const HEAD_MASK_MAX_COVERAGE = 0.12;
export const HEAD_MASK_MAX_BOX_TOP = 0.45;
export const HEAD_MASK_MAX_CENTRE_Y = 0.5;
export const HEAD_MASK_MAX_BOX_BOTTOM = 0.6;
export const HEAD_MASK_MIN_BOX_WIDTH = 0.04;
export const HEAD_MASK_MAX_BOX_WIDTH = 0.45;
export const HEAD_MASK_MIN_ASPECT = 0.6;
export const HEAD_MASK_MAX_ASPECT = 2.4;
export const HEAD_MASK_MIN_BBOX_FILL = 0.3;

// ── validated face-anchor thresholds ───────────────────────────────────────
export const ENVELOPE_HALF_WIDTHS_OF_FACE = 1.5;
export const ENVELOPE_ABOVE_FACE = 1.6;
export const ENVELOPE_BELOW_FACE = 2.0;
export const MIN_FACE_COVERED_BY_MASK = 0.95;
export const MIN_MASK_INSIDE_ENVELOPE = 0.97;

/** Dilation as a fraction of image height — clears hairline and jaw. */
export const HEAD_MASK_DILATION_FRACTION = 0.004;

export type HeadMaskFailureReason =
  | "SEGMENTATION_FAILED"
  | "MISSED_HEAD"
  | "IMPLAUSIBLE_SIZE"
  | "IMPLAUSIBLE_LOCATION"
  | "EXTENDS_INTO_NECK_OR_TORSO"
  | "EXTENDS_INTO_SHOULDERS"
  | "IMPLAUSIBLE_ASPECT"
  | "SCATTERED_MASK"
  | "FACE_ANCHOR_INVALID"
  | "FACE_NOT_CONTAINED"
  | "HEAD_MASK_EXTENDS_BEYOND_FACE_ENVELOPE";

export type HeadMaskMetrics = {
  width: number;
  height: number;
  coveragePct: number;
  boxTopPct: number;
  boxBottomPct: number;
  centreYPct: number;
  boxWidthPct: number;
  aspect: number;
  bboxFill: number;
  maskedPixels: number;
  faceScore: number | null;
  faceCoveredPct: number | null;
  maskInsideEnvelopePct: number | null;
};

export type HeadMaskSuccess = {
  ok: true;
  /** PNG bytes of the original photograph with the head region neutralised. */
  maskedImage: Buffer;
  maskedDataUri: string;
  width: number;
  height: number;
  originalSha256_16: string;
  maskedSha256_16: string;
  /** Greyscale PNG of the final mask, for forensics. */
  maskImage: Buffer;
  metrics: HeadMaskMetrics;
  face: FaceBox;
};

export type HeadMaskFailure = {
  ok: false;
  reasons: HeadMaskFailureReason[];
  detail: string;
  metrics: Partial<HeadMaskMetrics>;
};

export type HeadMaskResult = HeadMaskSuccess | HeadMaskFailure;

/** Segmentation is injectable so tests never make live provider calls. */
export type HeadSegmentationProvider = (
  imageBuffer: Buffer,
) => Promise<{ maskPng: Buffer }>;

/** Face detection is injectable for the same reason. */
export type FaceAnchorDetector = (
  imageBuffer: Buffer,
) => Promise<FaceAnchorDetection>;

function sha256Short16(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

export function dataUriToBuffer(dataUri: string): Buffer {
  const comma = dataUri.indexOf(",");
  if (!dataUri.startsWith("data:") || comma < 0) {
    throw new Error("headless-head-mask: expected a data URI");
  }
  return Buffer.from(dataUri.slice(comma + 1), "base64");
}

function withAsyncTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Default provider — EVF-SAM text-prompted segmentation through FAL. */
export const evfSamHeadSegmentationProvider: HeadSegmentationProvider = async (
  imageBuffer,
) => {
  fal.config({ credentials: process.env["FAL_KEY"] });

  const uploadedUrl = await fal.storage.upload(
    new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }),
  );

  const result = await withAsyncTimeout(
    fal.subscribe(HEAD_SEGMENTATION_MODEL, {
      input: {
        prompt: HEAD_SEGMENTATION_PROMPT,
        negative_prompt: HEAD_SEGMENTATION_NEGATIVE_PROMPT,
        image_url: uploadedUrl,
        mask_only: true,
        fill_holes: true,
        expand_mask: 4,
        semantic_type: false,
      },
      logs: false,
    }),
    HEAD_SEGMENTATION_TIMEOUT_MS,
    `headless-head-mask: EVF-SAM timed out after ${HEAD_SEGMENTATION_TIMEOUT_MS}ms`,
  );

  const data = (result as { data?: Record<string, unknown> }).data;
  const maskUrl = (data?.["image"] as { url?: string } | undefined)?.url;
  if (typeof maskUrl !== "string" || !maskUrl.startsWith("http")) {
    throw new Error("headless-head-mask: EVF-SAM returned no mask URL");
  }

  const response = await fetch(maskUrl);
  if (!response.ok) {
    throw new Error(
      `headless-head-mask: failed to fetch EVF-SAM mask HTTP ${response.status}`,
    );
  }
  return { maskPng: Buffer.from(await response.arrayBuffer()) };
};

/**
 * Deterministic mask cleanup — no model involved.
 *   1. keep only the largest connected component (removes stray blobs)
 *   2. fill interior holes (eyes/mouth patches the segmenter missed)
 *   3. dilate so the boundary clears the hairline and jaw
 */
export function cleanHeadMask(
  mask: Buffer,
  width: number,
  height: number,
  dilate: number,
): Buffer {
  const total = width * height;
  const bin = new Uint8Array(total);
  for (let i = 0; i < total; i++) bin[i] = mask[i]! > 127 ? 1 : 0;

  const comp = new Int32Array(total).fill(-1);
  const queue = new Int32Array(total);
  let bestId = -1;
  let bestSize = 0;
  let id = 0;

  for (let seed = 0; seed < total; seed++) {
    if (bin[seed] !== 1 || comp[seed] !== -1) continue;
    let head = 0;
    let tail = 0;
    let size = 0;
    queue[tail++] = seed;
    comp[seed] = id;
    while (head < tail) {
      const p = queue[head++]!;
      size++;
      const x = p % width;
      const y = (p / width) | 0;
      if (x > 0 && bin[p - 1] === 1 && comp[p - 1] === -1) {
        comp[p - 1] = id;
        queue[tail++] = p - 1;
      }
      if (x < width - 1 && bin[p + 1] === 1 && comp[p + 1] === -1) {
        comp[p + 1] = id;
        queue[tail++] = p + 1;
      }
      if (y > 0 && bin[p - width] === 1 && comp[p - width] === -1) {
        comp[p - width] = id;
        queue[tail++] = p - width;
      }
      if (y < height - 1 && bin[p + width] === 1 && comp[p + width] === -1) {
        comp[p + width] = id;
        queue[tail++] = p + width;
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestId = id;
    }
    id++;
  }

  const keep = new Uint8Array(total);
  if (bestId >= 0) {
    for (let i = 0; i < total; i++) keep[i] = comp[i] === bestId ? 1 : 0;
  }

  // Flood the background inward from the border; anything unreached is a hole.
  const outside = new Uint8Array(total);
  let head = 0;
  let tail = 0;
  const push = (p: number): void => {
    if (keep[p] === 0 && outside[p] === 0) {
      outside[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const p = queue[head++]!;
    const x = p % width;
    const y = (p / width) | 0;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (y > 0) push(p - width);
    if (y < height - 1) push(p + width);
  }

  const filled = new Uint8Array(total);
  for (let i = 0; i < total; i++) filled[i] = outside[i] === 1 ? 0 : 1;

  let result = filled;
  if (dilate > 0) {
    const dist = new Int32Array(total).fill(1 << 20);
    for (let i = 0; i < total; i++) if (filled[i] === 1) dist[i] = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (x > 0) dist[p] = Math.min(dist[p]!, dist[p - 1]! + 1);
        if (y > 0) dist[p] = Math.min(dist[p]!, dist[p - width]! + 1);
      }
    }
    for (let y = height - 1; y >= 0; y--) {
      for (let x = width - 1; x >= 0; x--) {
        const p = y * width + x;
        if (x < width - 1) dist[p] = Math.min(dist[p]!, dist[p + 1]! + 1);
        if (y < height - 1) dist[p] = Math.min(dist[p]!, dist[p + width]! + 1);
      }
    }
    const grown = new Uint8Array(total);
    for (let i = 0; i < total; i++) grown[i] = dist[i]! <= dilate ? 1 : 0;
    result = grown;
  }

  const out = Buffer.alloc(total);
  for (let i = 0; i < total; i++) out[i] = result[i] === 1 ? 255 : 0;
  return out;
}

type GeometryCheck = {
  reasons: HeadMaskFailureReason[];
  details: string[];
  metrics: Omit<
    HeadMaskMetrics,
    "width" | "height" | "faceScore" | "faceCoveredPct" | "maskInsideEnvelopePct"
  >;
};

/** Geometric plausibility gate. Conservative; rejects rather than repairs. */
export function checkHeadMaskGeometry(
  mask: Buffer,
  width: number,
  height: number,
): GeometryCheck {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let area = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]! <= 127) continue;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (area === 0) {
    return {
      reasons: ["MISSED_HEAD"],
      details: ["segmentation produced an empty mask"],
      metrics: {
        coveragePct: 0,
        boxTopPct: 0,
        boxBottomPct: 0,
        centreYPct: 0,
        boxWidthPct: 0,
        aspect: 0,
        bboxFill: 0,
        maskedPixels: 0,
      },
    };
  }

  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  const coverage = area / (width * height);
  const boxTop = minY / height;
  const boxBottom = maxY / height;
  const centreY = (minY + boxHeight / 2) / height;
  const relativeWidth = boxWidth / width;
  const aspect = boxHeight / boxWidth;
  const fill = area / (boxWidth * boxHeight);

  const reasons: HeadMaskFailureReason[] = [];
  const details: string[] = [];

  if (coverage < HEAD_MASK_MIN_COVERAGE) {
    reasons.push("IMPLAUSIBLE_SIZE");
    details.push(`mask covers only ${(coverage * 100).toFixed(2)}% of the frame`);
  }
  if (coverage > HEAD_MASK_MAX_COVERAGE) {
    reasons.push("IMPLAUSIBLE_SIZE");
    details.push(
      `mask covers ${(coverage * 100).toFixed(2)}% of the frame — likely body or garment`,
    );
  }
  if (boxTop > HEAD_MASK_MAX_BOX_TOP) {
    reasons.push("IMPLAUSIBLE_LOCATION");
    details.push(`mask starts at ${(boxTop * 100).toFixed(1)}% height`);
  }
  if (centreY > HEAD_MASK_MAX_CENTRE_Y) {
    reasons.push("IMPLAUSIBLE_LOCATION");
    details.push(`mask centre is at ${(centreY * 100).toFixed(1)}% height`);
  }
  if (boxBottom > HEAD_MASK_MAX_BOX_BOTTOM) {
    reasons.push("EXTENDS_INTO_NECK_OR_TORSO");
    details.push(`mask reaches ${(boxBottom * 100).toFixed(1)}% height`);
  }
  if (relativeWidth < HEAD_MASK_MIN_BOX_WIDTH) {
    reasons.push("IMPLAUSIBLE_SIZE");
    details.push(`mask is only ${(relativeWidth * 100).toFixed(1)}% of frame width`);
  }
  if (relativeWidth > HEAD_MASK_MAX_BOX_WIDTH) {
    reasons.push("EXTENDS_INTO_SHOULDERS");
    details.push(`mask spans ${(relativeWidth * 100).toFixed(1)}% of frame width`);
  }
  if (aspect < HEAD_MASK_MIN_ASPECT || aspect > HEAD_MASK_MAX_ASPECT) {
    reasons.push("IMPLAUSIBLE_ASPECT");
    details.push(`mask aspect ratio is ${aspect.toFixed(2)}`);
  }
  if (fill < HEAD_MASK_MIN_BBOX_FILL) {
    reasons.push("SCATTERED_MASK");
    details.push(`mask fills only ${(fill * 100).toFixed(0)}% of its bounding box`);
  }

  return {
    reasons,
    details,
    metrics: {
      coveragePct: +(coverage * 100).toFixed(2),
      boxTopPct: +(boxTop * 100).toFixed(1),
      boxBottomPct: +(boxBottom * 100).toFixed(1),
      centreYPct: +(centreY * 100).toFixed(1),
      boxWidthPct: +(relativeWidth * 100).toFixed(1),
      aspect: +aspect.toFixed(2),
      bboxFill: +fill.toFixed(2),
      maskedPixels: area,
    },
  };
}

/**
 * Face-anchor cross-check. The retained mask must contain the independently
 * detected face and must not sprawl beyond a bounded head envelope around it.
 */
export function checkFaceAnchorContainment(
  mask: Buffer,
  width: number,
  height: number,
  face: FaceBox,
): {
  reasons: HeadMaskFailureReason[];
  details: string[];
  faceCoveredPct: number;
  maskInsideEnvelopePct: number;
} {
  const fx0 = Math.max(0, Math.floor(face.x));
  const fy0 = Math.max(0, Math.floor(face.y));
  const fx1 = Math.min(width - 1, Math.ceil(face.x + face.width));
  const fy1 = Math.min(height - 1, Math.ceil(face.y + face.height));

  let faceTotal = 0;
  let faceInMask = 0;
  for (let y = fy0; y <= fy1; y++) {
    for (let x = fx0; x <= fx1; x++) {
      faceTotal++;
      if (mask[y * width + x]! > 127) faceInMask++;
    }
  }
  const faceCovered = faceTotal > 0 ? faceInMask / faceTotal : 0;

  const centreX = face.x + face.width / 2;
  const ex0 = centreX - ENVELOPE_HALF_WIDTHS_OF_FACE * face.width;
  const ex1 = centreX + ENVELOPE_HALF_WIDTHS_OF_FACE * face.width;
  const ey0 = face.y - ENVELOPE_ABOVE_FACE * face.height;
  const ey1 = face.y + face.height + ENVELOPE_BELOW_FACE * face.height;

  let maskTotal = 0;
  let maskInside = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]! <= 127) continue;
      maskTotal++;
      if (x >= ex0 && x <= ex1 && y >= ey0 && y <= ey1) maskInside++;
    }
  }
  const insideEnvelope = maskTotal > 0 ? maskInside / maskTotal : 0;

  const reasons: HeadMaskFailureReason[] = [];
  const details: string[] = [];

  if (faceCovered < MIN_FACE_COVERED_BY_MASK) {
    reasons.push("FACE_NOT_CONTAINED");
    details.push(
      `only ${(faceCovered * 100).toFixed(1)}% of the detected face lies inside the mask`,
    );
  }
  if (insideEnvelope < MIN_MASK_INSIDE_ENVELOPE) {
    reasons.push("HEAD_MASK_EXTENDS_BEYOND_FACE_ENVELOPE");
    details.push(
      `${((1 - insideEnvelope) * 100).toFixed(1)}% of mask pixels lie outside the head envelope`,
    );
  }

  return {
    reasons,
    details,
    faceCoveredPct: +(faceCovered * 100).toFixed(1),
    maskInsideEnvelopePct: +(insideEnvelope * 100).toFixed(1),
  };
}

/**
 * Neutralise the head region of a completed photograph.
 *
 * Resolution is preserved exactly and every pixel outside the final mask is
 * copied byte-for-byte from the source.
 */
export async function neutralizeHeadRegion(params: {
  imageBuffer: Buffer;
  segmentationProvider?: HeadSegmentationProvider;
  faceAnchorDetector?: FaceAnchorDetector;
  /** Forensic correlation only. */
  trialRunId?: string;
}): Promise<HeadMaskResult> {
  const { imageBuffer } = params;
  const segment = params.segmentationProvider ?? evfSamHeadSegmentationProvider;
  const detectFace = params.faceAnchorDetector ?? detectFaceAnchor;

  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) {
    return {
      ok: false,
      reasons: ["SEGMENTATION_FAILED"],
      detail: "source image dimensions could not be read",
      metrics: {},
    };
  }

  let rawMaskPng: Buffer;
  try {
    ({ maskPng: rawMaskPng } = await segment(imageBuffer));
  } catch (error) {
    return {
      ok: false,
      reasons: ["SEGMENTATION_FAILED"],
      detail: error instanceof Error ? error.message : String(error),
      metrics: { width, height },
    };
  }

  const rawMask = await sharp(rawMaskPng)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .greyscale()
    .raw()
    .toBuffer();

  const dilation = Math.round(height * HEAD_MASK_DILATION_FRACTION);
  const mask = cleanHeadMask(rawMask, width, height, dilation);

  const geometry = checkHeadMaskGeometry(mask, width, height);

  const detection = await detectFace(imageBuffer);
  if (!detection.ok) {
    return {
      ok: false,
      reasons: [...geometry.reasons, "FACE_ANCHOR_INVALID"],
      detail: [...geometry.details, `face anchor unavailable: ${detection.reason}`].join(
        "; ",
      ),
      metrics: {
        width,
        height,
        ...geometry.metrics,
        faceScore: null,
        faceCoveredPct: null,
        maskInsideEnvelopePct: null,
      },
    };
  }

  const anchor = checkFaceAnchorContainment(mask, width, height, detection.face);

  const metrics: HeadMaskMetrics = {
    width,
    height,
    ...geometry.metrics,
    faceScore: +detection.face.score.toFixed(3),
    faceCoveredPct: anchor.faceCoveredPct,
    maskInsideEnvelopePct: anchor.maskInsideEnvelopePct,
  };

  const reasons = [...geometry.reasons, ...anchor.reasons];
  if (reasons.length > 0) {
    logger.warn(
      {
        experimental: true,
        trialRunId: params.trialRunId,
        reasons,
        metrics,
      },
      "headless-head-mask: rejected mask — Stage 2 must not run",
    );
    return {
      ok: false,
      reasons,
      detail: [...geometry.details, ...anchor.details].join("; "),
      metrics,
    };
  }

  // Composite the neutral plate inside the mask only.
  const source = await sharp(imageBuffer).removeAlpha().raw().toBuffer();
  const composited = Buffer.from(source);
  for (let i = 0; i < width * height; i++) {
    if (mask[i]! <= 127) continue;
    const o = i * 3;
    composited[o] = HEAD_PLATE_GRAY;
    composited[o + 1] = HEAD_PLATE_GRAY;
    composited[o + 2] = HEAD_PLATE_GRAY;
  }

  const maskedImage = await sharp(composited, {
    raw: { width, height, channels: 3 },
  })
    .png()
    .toBuffer();

  const maskImage = await sharp(mask, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();

  logger.info(
    {
      experimental: true,
      trialRunId: params.trialRunId,
      metrics,
      model: HEAD_SEGMENTATION_MODEL,
    },
    "headless-head-mask: head region neutralised",
  );

  return {
    ok: true,
    maskedImage,
    maskedDataUri: `data:image/png;base64,${maskedImage.toString("base64")}`,
    width,
    height,
    originalSha256_16: sha256Short16(imageBuffer),
    maskedSha256_16: sha256Short16(maskedImage),
    maskImage,
    metrics,
    face: detection.face,
  };
}
