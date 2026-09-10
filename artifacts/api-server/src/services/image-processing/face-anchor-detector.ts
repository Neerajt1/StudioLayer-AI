// ---------------------------------------------------------------------------
// Face anchor detection — YuNet (ONNX) via onnxruntime-node.
//
// Used as an INDEPENDENT anatomical cross-check for head masking. It must be
// able to contradict the segmentation model, so it deliberately shares no code
// or service with it.
//
// Model: face_detection_yunet_2023mar.onnx (vendored under assets/models/).
// Returns the highest-confidence face box in SOURCE image pixel coordinates.
// ---------------------------------------------------------------------------

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import sharp from "sharp";
import type { InferenceSession, Tensor } from "onnxruntime-node";

const require_ = createRequire(import.meta.url);

export const YUNET_MODEL_FILENAME = "face_detection_yunet_2023mar.onnx" as const;

/** The vendored YuNet graph has a fixed 640x640 input. */
export const YUNET_INPUT_SIZE = 640 as const;

/**
 * Deterministic view sweep. Full-body fashion frames place the head high and
 * small, so alongside the whole frame we present upper-frame crops that raise
 * the face to a workable pixel size. Fractions are of full image height,
 * anchored at the top.
 */
export const FACE_DETECTION_VIEW_HEIGHT_FRACTIONS = [1, 0.6, 0.35] as const;

/** Validated YuNet score threshold. Do not loosen. */
export const FACE_DETECTION_SCORE_THRESHOLD = 0.6;

/** Validated NMS IoU threshold. */
export const FACE_DETECTION_NMS_IOU = 0.3;

const STRIDES = [8, 16, 32] as const;

export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  /** Which view fraction produced this detection (forensics only). */
  detectedAtViewFraction: number;
};

export type FaceAnchorDetection =
  | { ok: true; face: FaceBox }
  | { ok: false; reason: "NO_FACE_DETECTED" | "FACE_DETECTOR_UNAVAILABLE"; detail?: string };

function resolveModelPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // src/services/image-processing → package root (dev / tsx).
    join(here, "../../../assets/models", YUNET_MODEL_FILENAME),
    // dist/ → package root (bundled build).
    join(here, "../assets/models", YUNET_MODEL_FILENAME),
    join(here, "../../assets/models", YUNET_MODEL_FILENAME),
    join(process.cwd(), "assets/models", YUNET_MODEL_FILENAME),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

let sessionPromise: Promise<InferenceSession> | null = null;

async function getSession(): Promise<InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = require_("onnxruntime-node") as typeof import("onnxruntime-node");
      return ort.InferenceSession.create(resolveModelPath());
    })().catch((error: unknown) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

type Candidate = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
};

/**
 * Decode YuNet head outputs for one stride.
 * score = sqrt(cls * obj); box centre is the anchor cell plus the predicted
 * offset, size is exp(prediction) scaled by the stride.
 */
function decodeStride(
  stride: number,
  cls: Float32Array,
  obj: Float32Array,
  bbox: Float32Array,
  inputWidth: number,
  inputHeight: number,
  scoreThreshold: number,
): Candidate[] {
  const cols = Math.floor(inputWidth / stride);
  const rows = Math.floor(inputHeight / stride);
  const out: Candidate[] = [];

  for (let i = 0; i < rows * cols; i++) {
    const clsScore = Math.min(Math.max(cls[i] ?? 0, 0), 1);
    const objScore = Math.min(Math.max(obj[i] ?? 0, 0), 1);
    const score = Math.sqrt(clsScore * objScore);
    if (score < scoreThreshold) continue;

    const c = i % cols;
    const r = Math.floor(i / cols);
    const b = i * 4;

    const cx = (c + (bbox[b] ?? 0)) * stride;
    const cy = (r + (bbox[b + 1] ?? 0)) * stride;
    const w = Math.exp(bbox[b + 2] ?? 0) * stride;
    const h = Math.exp(bbox[b + 3] ?? 0) * stride;

    out.push({ x: cx - w / 2, y: cy - h / 2, width: w, height: h, score });
  }
  return out;
}

function iou(a: Candidate, b: Candidate): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (inter <= 0) return 0;
  return inter / (a.width * a.height + b.width * b.height - inter);
}

function nonMaximumSuppression(candidates: Candidate[], iouThreshold: number): Candidate[] {
  const sorted = [...candidates].sort((p, q) => q.score - p.score);
  const kept: Candidate[] = [];
  for (const candidate of sorted) {
    if (kept.every((k) => iou(k, candidate) <= iouThreshold)) kept.push(candidate);
  }
  return kept;
}

/**
 * Locate the highest-confidence face in an image.
 *
 * Never throws for detection failure — an undetectable face is a legitimate,
 * reportable outcome that callers must treat as fail-closed.
 */
export async function detectFaceAnchor(
  imageBuffer: Buffer,
  options: {
    viewHeightFractions?: readonly number[];
    scoreThreshold?: number;
    /** Letterbox fill behind the content. Default black (primary path). */
    letterboxBackground?: { r: number; g: number; b: number };
  } = {},
): Promise<FaceAnchorDetection> {
  const viewFractions =
    options.viewHeightFractions ?? FACE_DETECTION_VIEW_HEIGHT_FRACTIONS;
  const scoreThreshold = options.scoreThreshold ?? FACE_DETECTION_SCORE_THRESHOLD;
  const letterbox = options.letterboxBackground ?? { r: 0, g: 0, b: 0 };

  let session: InferenceSession;
  let ort: typeof import("onnxruntime-node");
  try {
    ort = require_("onnxruntime-node") as typeof import("onnxruntime-node");
    session = await getSession();
  } catch (error) {
    return {
      ok: false,
      reason: "FACE_DETECTOR_UNAVAILABLE",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const meta = await sharp(imageBuffer).metadata();
  const sourceWidth = meta.width ?? 0;
  const sourceHeight = meta.height ?? 0;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { ok: false, reason: "FACE_DETECTOR_UNAVAILABLE", detail: "unreadable image" };
  }

  const size = YUNET_INPUT_SIZE;
  let best: FaceBox | null = null;

  for (const fraction of viewFractions) {
    // Upper-anchored view of the source frame.
    const viewHeight = Math.max(1, Math.round(sourceHeight * fraction));
    const viewBuffer =
      fraction >= 1
        ? imageBuffer
        : await sharp(imageBuffer)
            .extract({ left: 0, top: 0, width: sourceWidth, height: viewHeight })
            .toBuffer();

    // Letterbox into the fixed square input so the face is never distorted.
    const contentScale = Math.min(size / sourceWidth, size / viewHeight);
    const contentWidth = Math.max(1, Math.round(sourceWidth * contentScale));
    const contentHeight = Math.max(1, Math.round(viewHeight * contentScale));
    const padX = Math.floor((size - contentWidth) / 2);
    const padY = Math.floor((size - contentHeight) / 2);

    const { data } = await sharp({
      create: {
        width: size,
        height: size,
        channels: 3,
        background: letterbox,
      },
    })
      .composite([
        {
          input: await sharp(viewBuffer)
            .resize(contentWidth, contentHeight, { fit: "fill" })
            .removeAlpha()
            .toBuffer(),
          left: padX,
          top: padY,
        },
      ])
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // YuNet consumes BGR, NCHW, unnormalised 0–255.
    const plane = size * size;
    const input = new Float32Array(plane * 3);
    for (let i = 0; i < plane; i++) {
      const o = i * 3;
      input[i] = data[o + 2]!; // B
      input[plane + i] = data[o + 1]!; // G
      input[plane * 2 + i] = data[o]!; // R
    }

    const feeds: Record<string, Tensor> = {
      input: new ort.Tensor("float32", input, [1, 3, size, size]),
    };
    const results = await session.run(feeds);

    const candidates: Candidate[] = [];
    for (const stride of STRIDES) {
      const cls = results[`cls_${stride}`]?.data as Float32Array | undefined;
      const obj = results[`obj_${stride}`]?.data as Float32Array | undefined;
      const bbox = results[`bbox_${stride}`]?.data as Float32Array | undefined;
      if (!cls || !obj || !bbox) continue;
      candidates.push(
        ...decodeStride(stride, cls, obj, bbox, size, size, scoreThreshold),
      );
    }

    for (const candidate of nonMaximumSuppression(candidates, FACE_DETECTION_NMS_IOU)) {
      if (best && candidate.score <= best.score) continue;
      // Undo letterbox, then the view crop (top-anchored, so x is unchanged).
      best = {
        x: (candidate.x - padX) / contentScale,
        y: (candidate.y - padY) / contentScale,
        width: candidate.width / contentScale,
        height: candidate.height / contentScale,
        score: candidate.score,
        detectedAtViewFraction: fraction,
      };
    }
  }

  return best ? { ok: true, face: best } : { ok: false, reason: "NO_FACE_DETECTED" };
}

/** Axis-aligned foreground bounding box for a greyscale mask (>127 = foreground). */
export function maskForegroundBoundingBox(
  mask: Buffer,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]! <= 127) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Padding around an EVF-SAM head mask when building a YuNet secondary view.
 * Asymmetric on purpose: hair-inclusive masks put the facial box in the lower
 * portion of the bbox, so we pad more below than above. Does not change score threshold.
 */
export const MASK_HINT_PAD_FRACTION = 0.35 as const;
export const MASK_HINT_PAD_FRACTION_X = 0.4 as const;
export const MASK_HINT_PAD_FRACTION_ABOVE = 0.25 as const;
export const MASK_HINT_PAD_FRACTION_BELOW = 0.55 as const;

/** Mid-grey letterbox for mask-guided YuNet — avoids dark-hair/black-pad collapse. */
export const MASK_HINT_LETTERBOX = { r: 114, g: 114, b: 114 } as const;

/**
 * Views inside the mask crop. Full crop only — primary's top-anchored fractions
 * would clip faces that sit mid/lower in a hair-inclusive EVF-SAM bbox.
 */
export const MASK_HINT_VIEW_HEIGHT_FRACTIONS = [1] as const;

export type FaceAnchorDetectionWithHint = FaceAnchorDetection & {
  /** True when the successful detection came from the mask-guided secondary crop. */
  usedMaskHint?: boolean;
  /** True when the secondary crop path was attempted after primary NO_FACE_DETECTED. */
  secondaryAttempted?: boolean;
  secondaryCrop?: { left: number; top: number; width: number; height: number };
};

export type DetectFaceAnchorFn = (
  imageBuffer: Buffer,
  options?: {
    viewHeightFractions?: readonly number[];
    scoreThreshold?: number;
    letterboxBackground?: { r: number; g: number; b: number };
  },
) => Promise<FaceAnchorDetection>;

/**
 * Primary YuNet sweep on the full frame. Only when that returns NO_FACE_DETECTED
 * and a non-empty head-mask bbox is available, retry YuNet on a padded mask crop
 * at the SAME score threshold, then map coordinates back to the source frame.
 *
 * Does not loosen FACE_DETECTION_SCORE_THRESHOLD. Does not bypass downstream
 * containment / geometry gates — callers must still validate the face box.
 */
export async function detectFaceAnchorWithMaskHint(params: {
  imageBuffer: Buffer;
  mask: Buffer;
  width: number;
  height: number;
  scoreThreshold?: number;
  /**
   * When the caller already ran full-frame YuNet, pass that result to avoid a
   * redundant primary sweep. Secondary still runs on NO_FACE_DETECTED.
   */
  primaryResult?: FaceAnchorDetection;
  /** Injectable for tests — production uses stock YuNet. */
  detectFn?: DetectFaceAnchorFn;
}): Promise<FaceAnchorDetectionWithHint> {
  const detect = params.detectFn ?? detectFaceAnchor;
  const primary =
    params.primaryResult ??
    (await detect(params.imageBuffer, {
      scoreThreshold: params.scoreThreshold,
    }));
  if (primary.ok) return primary;
  if (primary.reason !== "NO_FACE_DETECTED") return primary;

  const bbox = maskForegroundBoundingBox(params.mask, params.width, params.height);
  if (!bbox) {
    return { ...primary, secondaryAttempted: false };
  }

  const padX = Math.max(8, Math.round(bbox.width * MASK_HINT_PAD_FRACTION_X));
  const padAbove = Math.max(8, Math.round(bbox.height * MASK_HINT_PAD_FRACTION_ABOVE));
  const padBelow = Math.max(8, Math.round(bbox.height * MASK_HINT_PAD_FRACTION_BELOW));
  const left = Math.max(0, bbox.x - padX);
  const top = Math.max(0, bbox.y - padAbove);
  const right = Math.min(params.width, bbox.x + bbox.width + padX);
  const bottom = Math.min(params.height, bbox.y + bbox.height + padBelow);
  const cropWidth = Math.max(1, right - left);
  const cropHeight = Math.max(1, bottom - top);
  const secondaryCrop = { left, top, width: cropWidth, height: cropHeight };

  if (cropWidth < 16 || cropHeight < 16) {
    return { ...primary, secondaryAttempted: false, secondaryCrop };
  }

  let cropBuffer: Buffer;
  try {
    // Force a deterministic sRGB PNG crop — Stage-1 bytes may be JPEG/WebP/PNG.
    // Do not auto-rotate: mask geometry is in the same pixel space as imageBuffer.
    cropBuffer = await sharp(params.imageBuffer)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .toColorspace("srgb")
      .removeAlpha()
      .png()
      .toBuffer();
  } catch {
    return { ...primary, secondaryAttempted: false, secondaryCrop };
  }

  const secondary = await detect(cropBuffer, {
    viewHeightFractions: MASK_HINT_VIEW_HEIGHT_FRACTIONS,
    scoreThreshold: params.scoreThreshold,
    letterboxBackground: MASK_HINT_LETTERBOX,
  });

  if (!secondary.ok) {
    return {
      ...primary,
      secondaryAttempted: true,
      secondaryCrop,
    };
  }

  return {
    ok: true,
    usedMaskHint: true,
    secondaryAttempted: true,
    secondaryCrop,
    face: {
      ...secondary.face,
      x: secondary.face.x + left,
      y: secondary.face.y + top,
      detectedAtViewFraction: secondary.face.detectedAtViewFraction,
    },
  };
}
