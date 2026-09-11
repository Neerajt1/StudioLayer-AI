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
  detectFaceAnchorWithMaskHint,
  type FaceAnchorDetection,
  type FaceBox,
} from "./face-anchor-detector.js";
import {
  isHeadlessForensicsEnabled,
  buildHeadlessMaskDiagnosticOverlays,
  type HeadHairEnvelopeCoords,
  type HeadlessMaskForensicsBundle,
  type HeadlessMaskPipelineDiagnostics,
  type HeadlessMaskPipelineTimings,
  type HeadlessMaskDiagnosticOverlays,
} from "../rendering/headless-forensics.js";

function computeHeadHairEnvelopeCoords(face: FaceBox): HeadHairEnvelopeCoords {
  const centreX = face.x + face.width / 2;
  return {
    ex0: centreX - HEAD_HAIR_ENVELOPE.halfWidthsOfFace * face.width,
    ex1: centreX + HEAD_HAIR_ENVELOPE.halfWidthsOfFace * face.width,
    ey0: face.y - HEAD_HAIR_ENVELOPE.aboveFace * face.height,
    ey1: face.y + face.height + HEAD_HAIR_ENVELOPE.belowFace * face.height,
    multipliers: { ...HEAD_HAIR_ENVELOPE },
  };
}

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
export const MIN_FACE_COVERED_BY_MASK = 0.95;
export const MIN_MASK_INSIDE_ENVELOPE = 0.97;

/**
 * YuNet locates the FACE; EVF-SAM segments the full HEAD including hair.
 * The containment envelope must bound that hair-inclusive head mask — not
 * treat the YuNet face box as the outer head boundary.
 */
export const HEAD_HAIR_ENVELOPE_HALF_WIDTHS_OF_FACE = 2.0;
export const HEAD_HAIR_ENVELOPE_ABOVE_FACE = 2.25;
export const HEAD_HAIR_ENVELOPE_BELOW_FACE = 2.0;

/** Pre–Run-1 face-tight multipliers — regression tests only. */
export const LEGACY_FACE_TIGHT_ENVELOPE_HALF_WIDTHS_OF_FACE = 1.5;
export const LEGACY_FACE_TIGHT_ENVELOPE_ABOVE_FACE = 1.6;
export const LEGACY_FACE_TIGHT_ENVELOPE_BELOW_FACE = 2.0;

export type HeadHairEnvelopeMultipliers = {
  halfWidthsOfFace: number;
  aboveFace: number;
  belowFace: number;
};

export const HEAD_HAIR_ENVELOPE: HeadHairEnvelopeMultipliers = {
  halfWidthsOfFace: HEAD_HAIR_ENVELOPE_HALF_WIDTHS_OF_FACE,
  aboveFace: HEAD_HAIR_ENVELOPE_ABOVE_FACE,
  belowFace: HEAD_HAIR_ENVELOPE_BELOW_FACE,
};

export const LEGACY_FACE_TIGHT_ENVELOPE: HeadHairEnvelopeMultipliers = {
  halfWidthsOfFace: LEGACY_FACE_TIGHT_ENVELOPE_HALF_WIDTHS_OF_FACE,
  aboveFace: LEGACY_FACE_TIGHT_ENVELOPE_ABOVE_FACE,
  belowFace: LEGACY_FACE_TIGHT_ENVELOPE_BELOW_FACE,
};

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
  forensics?: HeadlessMaskForensicsBundle;
};

export type HeadMaskResult = HeadMaskSuccess | HeadMaskFailure;

/** Segmentation is injectable so tests never make live provider calls. */
export type HeadSegmentationResult = {
  maskPng: Buffer;
  /** Optional timings from the stock EVF-SAM provider. */
  timings?: {
    falUploadMs: number;
    falSubscribeMs: number;
    falSubscribeSdkTimings: Record<string, unknown> | null;
    maskFetchMs: number;
  };
};

export type HeadSegmentationProvider = (
  imageBuffer: Buffer,
) => Promise<HeadSegmentationResult>;

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

  const uploadStarted = Date.now();
  const uploadedUrl = await fal.storage.upload(
    new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }),
  );
  const falUploadMs = Date.now() - uploadStarted;

  const subscribeStarted = Date.now();
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
  const falSubscribeMs = Date.now() - subscribeStarted;

  // Capture SDK timing fields when present — do not invent values.
  const falSubscribeSdkTimings = extractFalSubscribeSdkTimings(result);

  const data = (result as { data?: Record<string, unknown> }).data;
  const maskUrl = (data?.["image"] as { url?: string } | undefined)?.url;
  if (typeof maskUrl !== "string" || !maskUrl.startsWith("http")) {
    throw new Error("headless-head-mask: EVF-SAM returned no mask URL");
  }

  const fetchStarted = Date.now();
  const response = await fetch(maskUrl);
  if (!response.ok) {
    throw new Error(
      `headless-head-mask: failed to fetch EVF-SAM mask HTTP ${response.status}`,
    );
  }
  const maskPng = Buffer.from(await response.arrayBuffer());
  const maskFetchMs = Date.now() - fetchStarted;

  return {
    maskPng,
    timings: {
      falUploadMs,
      falSubscribeMs,
      falSubscribeSdkTimings,
      maskFetchMs,
    },
  };
};

/** Pull known timing-like fields from fal.subscribe results without assuming a schema. */
function extractFalSubscribeSdkTimings(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== "object") return null;
  const root = result as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of [
    "timings",
    "timing",
    "metrics",
    "queue_time",
    "inference_time",
    "request_id",
  ] as const) {
    if (key in root && root[key] != null) out[key] = root[key];
  }
  const data = root["data"];
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    for (const key of ["timings", "timing", "metrics"] as const) {
      if (key in d && d[key] != null) out[`data.${key}`] = d[key];
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

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

/** Forensic-only — binary mask coverage. Does not alter production masks. */
export function measureBinaryMaskCoverage(
  mask: Buffer,
  width: number,
  height: number,
): { maskedPixels: number; coveragePct: number } {
  const total = width * height;
  let maskedPixels = 0;
  for (let i = 0; i < total; i++) {
    if (mask[i]! > 127) maskedPixels++;
  }
  return {
    maskedPixels,
    coveragePct: total > 0 ? +((maskedPixels / total) * 100).toFixed(4) : 0,
  };
}

/**
 * Forensic-only — connected-component stats on a greyscale mask.
 * Mirrors cleanHeadMask's 4-connected labelling without mutating the mask.
 */
export function measureMaskConnectedComponents(
  mask: Buffer,
  width: number,
  height: number,
): { connectedComponentCount: number; largestComponentPixels: number } {
  const total = width * height;
  const bin = new Uint8Array(total);
  for (let i = 0; i < total; i++) bin[i] = mask[i]! > 127 ? 1 : 0;

  const comp = new Int32Array(total).fill(-1);
  const queue = new Int32Array(total);
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
    if (size > bestSize) bestSize = size;
    id++;
  }

  return {
    connectedComponentCount: id,
    largestComponentPixels: bestSize,
  };
}

/** Forensic-only — pixel delta between pre-clean and post-clean masks. */
export function measureMaskCleanDelta(
  before: Buffer,
  after: Buffer,
): { pixelsRemovedByClean: number; pixelsAddedByClean: number } {
  const n = Math.min(before.length, after.length);
  let pixelsRemovedByClean = 0;
  let pixelsAddedByClean = 0;
  for (let i = 0; i < n; i++) {
    const b = before[i]! > 127;
    const a = after[i]! > 127;
    if (b && !a) pixelsRemovedByClean++;
    if (!b && a) pixelsAddedByClean++;
  }
  return { pixelsRemovedByClean, pixelsAddedByClean };
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
 * detected face and must not sprawl beyond a hair-inclusive head envelope
 * centred on the YuNet face box.
 */
export function checkFaceAnchorContainment(
  mask: Buffer,
  width: number,
  height: number,
  face: FaceBox,
  envelope: HeadHairEnvelopeMultipliers = HEAD_HAIR_ENVELOPE,
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
  const ex0 = centreX - envelope.halfWidthsOfFace * face.width;
  const ex1 = centreX + envelope.halfWidthsOfFace * face.width;
  const ey0 = face.y - envelope.aboveFace * face.height;
  const ey1 = face.y + face.height + envelope.belowFace * face.height;

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
  const pipelineStarted = Date.now();
  const { imageBuffer } = params;
  const segment = params.segmentationProvider ?? evfSamHeadSegmentationProvider;
  const captureForensics = isHeadlessForensicsEnabled();

  const timings: HeadlessMaskPipelineTimings = {
    falUploadMs: null,
    falSubscribeMs: null,
    falSubscribeSdkTimings: null,
    maskFetchMs: null,
    sharpResizeMs: null,
    cleanHeadMaskMs: null,
    geometryValidationMs: null,
    primaryYunetMs: null,
    secondaryYunetMs: null,
    cropExtractMs: null,
    containmentMs: null,
    totalMaskPipelineMs: null,
  };

  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const stage1Format = meta.format ?? null;
  const stage1Channels = meta.channels ?? null;
  const stage1Space = meta.space ?? null;
  if (width <= 0 || height <= 0) {
    return failMask({
      reasons: ["SEGMENTATION_FAILED"],
      detail: "source image dimensions could not be read",
      metrics: {},
      captureForensics,
      imageBuffer,
      timings: { ...timings, totalMaskPipelineMs: Date.now() - pipelineStarted },
      rawEvfSamMaskPng: null,
      rawMaskResizedPng: null,
      cleanedMaskPng: null,
      rawMaskNativeWidth: null,
      rawMaskNativeHeight: null,
      primaryYunet: null,
      secondaryYunetCropSpace: null,
      secondaryAttempted: false,
      secondaryCrop: null,
      remappedFaceAabb: null,
      headHairEnvelope: null,
      usedMaskHint: false,
      geometryMetrics: {},
      pipelineDiagnostics: null,
      diagnosticOverlays: null,
    });
  }

  let rawMaskPng: Buffer;
  let segmentTimings: HeadSegmentationResult["timings"];
  try {
    const segmented = await segment(imageBuffer);
    rawMaskPng = segmented.maskPng;
    segmentTimings = segmented.timings;
  } catch (error) {
    return failMask({
      reasons: ["SEGMENTATION_FAILED"],
      detail: error instanceof Error ? error.message : String(error),
      metrics: { width, height },
      captureForensics,
      imageBuffer,
      timings: { ...timings, totalMaskPipelineMs: Date.now() - pipelineStarted },
      rawEvfSamMaskPng: null,
      rawMaskResizedPng: null,
      cleanedMaskPng: null,
      rawMaskNativeWidth: null,
      rawMaskNativeHeight: null,
      primaryYunet: null,
      secondaryYunetCropSpace: null,
      secondaryAttempted: false,
      secondaryCrop: null,
      remappedFaceAabb: null,
      headHairEnvelope: null,
      usedMaskHint: false,
      geometryMetrics: {},
      pipelineDiagnostics: null,
      diagnosticOverlays: null,
    });
  }

  if (segmentTimings) {
    timings.falUploadMs = segmentTimings.falUploadMs;
    timings.falSubscribeMs = segmentTimings.falSubscribeMs;
    timings.falSubscribeSdkTimings = segmentTimings.falSubscribeSdkTimings;
    timings.maskFetchMs = segmentTimings.maskFetchMs;
  }

  const rawMeta = await sharp(rawMaskPng).metadata();
  const rawMaskNativeWidth = rawMeta.width ?? null;
  const rawMaskNativeHeight = rawMeta.height ?? null;

  const resizeStarted = Date.now();
  const rawMask = await sharp(rawMaskPng)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .greyscale()
    .raw()
    .toBuffer();
  timings.sharpResizeMs = Date.now() - resizeStarted;

  const dilation = Math.round(height * HEAD_MASK_DILATION_FRACTION);
  const cleanStarted = Date.now();
  const mask = cleanHeadMask(rawMask, width, height, dilation);
  timings.cleanHeadMaskMs = Date.now() - cleanStarted;

  // Forensic-only measurements — never feed back into the production mask.
  let forensicMaskStats: {
    rawNativeCoveragePct: number | null;
    rawNativeMaskedPixels: number | null;
    resizedCoverage: ReturnType<typeof measureBinaryMaskCoverage>;
    cleanedCoverage: ReturnType<typeof measureBinaryMaskCoverage>;
    components: ReturnType<typeof measureMaskConnectedComponents>;
    cleanDelta: ReturnType<typeof measureMaskCleanDelta>;
  } | null = null;
  if (captureForensics) {
    let rawNativeCoveragePct: number | null = null;
    let rawNativeMaskedPixels: number | null = null;
    try {
      if (rawMaskNativeWidth && rawMaskNativeHeight) {
        const nativeRaw = await sharp(rawMaskPng)
          .greyscale()
          .raw()
          .toBuffer();
        const nativeCov = measureBinaryMaskCoverage(
          nativeRaw,
          rawMaskNativeWidth,
          rawMaskNativeHeight,
        );
        rawNativeCoveragePct = nativeCov.coveragePct;
        rawNativeMaskedPixels = nativeCov.maskedPixels;
      }
    } catch {
      rawNativeCoveragePct = null;
      rawNativeMaskedPixels = null;
    }
    forensicMaskStats = {
      rawNativeCoveragePct,
      rawNativeMaskedPixels,
      resizedCoverage: measureBinaryMaskCoverage(rawMask, width, height),
      cleanedCoverage: measureBinaryMaskCoverage(mask, width, height),
      components: measureMaskConnectedComponents(rawMask, width, height),
      cleanDelta: measureMaskCleanDelta(rawMask, mask),
    };
  }

  const geometryStarted = Date.now();
  const geometry = checkHeadMaskGeometry(mask, width, height);
  timings.geometryValidationMs = Date.now() - geometryStarted;

  // Stock path: full-frame YuNet, then mask-guided secondary on NO_FACE_DETECTED.
  // Injected detectors own their full contract (tests) — secondary is not applied.
  let detection: FaceAnchorDetection;
  let usedMaskHint = false;
  let secondaryAttempted = false;
  let secondaryCrop: { left: number; top: number; width: number; height: number } | null =
    null;
  let primaryYunet: FaceAnchorDetection | null = null;
  let secondaryYunetCropSpace: FaceAnchorDetection | null = null;

  if (params.faceAnchorDetector) {
    const yunetStarted = Date.now();
    detection = await params.faceAnchorDetector(imageBuffer);
    timings.primaryYunetMs = Date.now() - yunetStarted;
    primaryYunet = detection;
  } else {
    const hinted = await detectFaceAnchorWithMaskHint({
      imageBuffer,
      mask,
      width,
      height,
    });
    detection = hinted;
    usedMaskHint = Boolean(hinted.usedMaskHint);
    secondaryAttempted = Boolean(hinted.secondaryAttempted);
    secondaryCrop = hinted.secondaryCrop ?? null;
    primaryYunet = hinted.primary ?? null;
    secondaryYunetCropSpace = hinted.secondaryCropSpace ?? null;
    timings.primaryYunetMs = hinted.timings?.primaryDetectMs ?? null;
    timings.secondaryYunetMs = hinted.timings?.secondaryDetectMs ?? null;
    timings.cropExtractMs = hinted.timings?.cropExtractMs ?? null;
    if (usedMaskHint) {
      logger.info(
        {
          trialRunId: params.trialRunId,
          usedMaskHint: true,
          secondaryAttempted: true,
          secondaryCrop: hinted.secondaryCrop,
          faceScore: hinted.ok ? hinted.face.score : null,
        },
        "headless-head-mask: YuNet recovered face via mask-guided secondary view",
      );
    } else if (secondaryAttempted && !hinted.ok) {
      logger.warn(
        {
          trialRunId: params.trialRunId,
          usedMaskHint: false,
          secondaryAttempted: true,
          secondaryCrop: hinted.secondaryCrop,
          reason: hinted.reason,
        },
        "headless-head-mask: mask-guided YuNet secondary view still found no face",
      );
    }
  }

  const encodeGreyPng = async (raw: Buffer): Promise<Buffer> =>
    sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer();

  const buildFailureDiagnostics = async (params: {
    reasons: HeadMaskFailureReason[];
    face: FaceBox | null;
    faceScore: number | null;
    faceCoveredPct: number | null;
    maskInsideEnvelopePct: number | null;
    envelope: ReturnType<typeof computeHeadHairEnvelopeCoords> | null;
  }): Promise<{
    pipelineDiagnostics: HeadlessMaskPipelineDiagnostics | null;
    diagnosticOverlays: HeadlessMaskDiagnosticOverlays | null;
  }> => {
    if (!captureForensics || !forensicMaskStats) {
      return { pipelineDiagnostics: null, diagnosticOverlays: null };
    }
    const sourceAspect =
      rawMaskNativeWidth && rawMaskNativeHeight && rawMaskNativeHeight > 0
        ? rawMaskNativeWidth / rawMaskNativeHeight
        : null;
    const destinationAspect = height > 0 ? width / height : null;
    const aspectDeltaPct =
      sourceAspect != null && destinationAspect != null && destinationAspect > 0
        ? +((Math.abs(sourceAspect - destinationAspect) / destinationAspect) *
            100).toFixed(4)
        : null;
    const spatialAlignmentPreserved =
      aspectDeltaPct == null ? null : aspectDeltaPct <= 1;

    const pipelineDiagnostics: HeadlessMaskPipelineDiagnostics = {
      stage1: {
        width,
        height,
        format: stage1Format,
        channels: stage1Channels,
        space: stage1Space,
      },
      rawEvfSamMask: {
        nativeWidth: rawMaskNativeWidth,
        nativeHeight: rawMaskNativeHeight,
        format: rawMeta.format ?? null,
        coveragePct: forensicMaskStats.rawNativeCoveragePct,
        maskedPixels: forensicMaskStats.rawNativeMaskedPixels,
      },
      resizedMask: {
        sourceWidth: rawMaskNativeWidth,
        sourceHeight: rawMaskNativeHeight,
        destinationWidth: width,
        destinationHeight: height,
        operation: { fit: "fill", kernel: "lanczos3" },
        coveragePct: forensicMaskStats.resizedCoverage.coveragePct,
        maskedPixels: forensicMaskStats.resizedCoverage.maskedPixels,
        sourceAspect,
        destinationAspect,
        aspectDeltaPct,
        spatialAlignmentPreserved,
      },
      cleanHeadMask: {
        coveragePctBefore: forensicMaskStats.resizedCoverage.coveragePct,
        coveragePctAfter: forensicMaskStats.cleanedCoverage.coveragePct,
        maskedPixelsBefore: forensicMaskStats.resizedCoverage.maskedPixels,
        maskedPixelsAfter: forensicMaskStats.cleanedCoverage.maskedPixels,
        connectedComponentCount:
          forensicMaskStats.components.connectedComponentCount,
        largestComponentPixels:
          forensicMaskStats.components.largestComponentPixels,
        pixelsRemovedByClean: forensicMaskStats.cleanDelta.pixelsRemovedByClean,
        pixelsAddedByClean: forensicMaskStats.cleanDelta.pixelsAddedByClean,
        dilationPx: dilation,
      },
      yunet: {
        faceBox: params.face,
        faceScore: params.faceScore,
        coordinateSpace: "stage1_full_frame",
      },
      containment: {
        faceCoveredPct: params.faceCoveredPct,
        maskInsideEnvelopePct: params.maskInsideEnvelopePct,
        faceEnvelope: params.envelope,
        failureReasons: params.reasons,
      },
    };

    const diagnosticOverlays = await buildHeadlessMaskDiagnosticOverlays({
      stage1ImageBuffer: imageBuffer,
      width,
      height,
      rawMaskResized: rawMask,
      cleanedMask: mask,
      face: params.face,
      envelope: params.envelope,
    });

    return { pipelineDiagnostics, diagnosticOverlays };
  };

  if (!detection.ok) {
    timings.totalMaskPipelineMs = Date.now() - pipelineStarted;
    let rawMaskResizedPng: Buffer | null = null;
    let cleanedMaskPng: Buffer | null = null;
    if (captureForensics) {
      rawMaskResizedPng = await encodeGreyPng(rawMask);
      cleanedMaskPng = await encodeGreyPng(mask);
    }
    const reasons: HeadMaskFailureReason[] = [
      ...geometry.reasons,
      "FACE_ANCHOR_INVALID",
    ];
    const { pipelineDiagnostics, diagnosticOverlays } =
      await buildFailureDiagnostics({
        reasons,
        face: null,
        faceScore: null,
        faceCoveredPct: null,
        maskInsideEnvelopePct: null,
        envelope: null,
      });
    return failMask({
      reasons,
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
      captureForensics,
      imageBuffer,
      timings,
      rawEvfSamMaskPng: captureForensics ? rawMaskPng : null,
      rawMaskResizedPng,
      cleanedMaskPng,
      rawMaskNativeWidth,
      rawMaskNativeHeight,
      primaryYunet,
      secondaryYunetCropSpace,
      secondaryAttempted,
      secondaryCrop,
      remappedFaceAabb: null,
      headHairEnvelope: null,
      usedMaskHint,
      geometryMetrics: geometry.metrics,
      pipelineDiagnostics,
      diagnosticOverlays,
    });
  }

  const containmentStarted = Date.now();
  const anchor = checkFaceAnchorContainment(mask, width, height, detection.face);
  timings.containmentMs = Date.now() - containmentStarted;

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
    timings.totalMaskPipelineMs = Date.now() - pipelineStarted;
    logger.warn(
      {
        experimental: true,
        trialRunId: params.trialRunId,
        reasons,
        metrics,
        usedMaskHint,
        timings,
      },
      "headless-head-mask: rejected mask — Stage 2 must not run",
    );
    let rawMaskResizedPng: Buffer | null = null;
    let cleanedMaskPng: Buffer | null = null;
    if (captureForensics) {
      rawMaskResizedPng = await encodeGreyPng(rawMask);
      cleanedMaskPng = await encodeGreyPng(mask);
    }
    const envelope = computeHeadHairEnvelopeCoords(detection.face);
    const { pipelineDiagnostics, diagnosticOverlays } =
      await buildFailureDiagnostics({
        reasons,
        face: detection.face,
        faceScore: metrics.faceScore,
        faceCoveredPct: metrics.faceCoveredPct,
        maskInsideEnvelopePct: metrics.maskInsideEnvelopePct,
        envelope,
      });
    return failMask({
      reasons,
      detail: [...geometry.details, ...anchor.details].join("; "),
      metrics,
      captureForensics,
      imageBuffer,
      timings,
      rawEvfSamMaskPng: captureForensics ? rawMaskPng : null,
      rawMaskResizedPng,
      cleanedMaskPng,
      rawMaskNativeWidth,
      rawMaskNativeHeight,
      primaryYunet,
      secondaryYunetCropSpace,
      secondaryAttempted,
      secondaryCrop,
      remappedFaceAabb: detection.face,
      headHairEnvelope: envelope,
      usedMaskHint,
      geometryMetrics: geometry.metrics,
      pipelineDiagnostics,
      diagnosticOverlays,
    });
  }

  if (usedMaskHint) {
    logger.info(
      {
        trialRunId: params.trialRunId,
        usedMaskHint: true,
        faceScore: metrics.faceScore,
        faceCoveredPct: metrics.faceCoveredPct,
      },
      "headless-head-mask: mask-guided YuNet face passed containment gates",
    );
  }

  // Composite the neutral plate inside the mask only.
  // Success path: never attach forensics (requirement: failure only).
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

function failMask(params: {
  reasons: HeadMaskFailureReason[];
  detail: string;
  metrics: Partial<HeadMaskMetrics>;
  captureForensics: boolean;
  imageBuffer: Buffer;
  timings: HeadlessMaskPipelineTimings;
  rawEvfSamMaskPng: Buffer | null;
  rawMaskResizedPng: Buffer | null;
  cleanedMaskPng: Buffer | null;
  rawMaskNativeWidth: number | null;
  rawMaskNativeHeight: number | null;
  primaryYunet: FaceAnchorDetection | null;
  secondaryYunetCropSpace: FaceAnchorDetection | null;
  secondaryAttempted: boolean;
  secondaryCrop: { left: number; top: number; width: number; height: number } | null;
  remappedFaceAabb: FaceBox | null;
  headHairEnvelope: ReturnType<typeof computeHeadHairEnvelopeCoords> | null;
  usedMaskHint: boolean;
  geometryMetrics: Partial<HeadMaskMetrics>;
  pipelineDiagnostics: HeadlessMaskPipelineDiagnostics | null;
  diagnosticOverlays: HeadlessMaskDiagnosticOverlays | null;
}): HeadMaskFailure {
  const failure: HeadMaskFailure = {
    ok: false,
    reasons: params.reasons,
    detail: params.detail,
    metrics: params.metrics,
  };

  if (!params.captureForensics) {
    return failure;
  }

  const forensics: HeadlessMaskForensicsBundle = {
    temporaryDiagnostic: true,
    capturedAtIso: new Date().toISOString(),
    stage1ImageBuffer: params.imageBuffer,
    rawEvfSamMaskPng: params.rawEvfSamMaskPng,
    rawMaskResizedPng: params.rawMaskResizedPng,
    cleanedMaskPng: params.cleanedMaskPng,
    renderWidth: params.metrics.width ?? 0,
    renderHeight: params.metrics.height ?? 0,
    rawMaskNativeWidth: params.rawMaskNativeWidth,
    rawMaskNativeHeight: params.rawMaskNativeHeight,
    cleanedMaskWidth: params.cleanedMaskPng ? (params.metrics.width ?? null) : null,
    cleanedMaskHeight: params.cleanedMaskPng ? (params.metrics.height ?? null) : null,
    primaryYunet: params.primaryYunet,
    secondaryYunetCropSpace: params.secondaryYunetCropSpace,
    secondaryAttempted: params.secondaryAttempted,
    secondaryCrop: params.secondaryCrop,
    remappedFaceAabb: params.remappedFaceAabb,
    headHairEnvelope: params.headHairEnvelope,
    geometryMetrics: params.geometryMetrics,
    containmentMetrics: {
      faceScore: params.metrics.faceScore ?? null,
      faceCoveredPct: params.metrics.faceCoveredPct ?? null,
      maskInsideEnvelopePct: params.metrics.maskInsideEnvelopePct ?? null,
    },
    failureReasons: params.reasons,
    failureDetail: params.detail,
    timings: params.timings,
    usedMaskHint: params.usedMaskHint,
    pipelineDiagnostics: params.pipelineDiagnostics,
    diagnosticOverlays: params.diagnosticOverlays,
  };

  failure.forensics = forensics;
  return failure;
}
