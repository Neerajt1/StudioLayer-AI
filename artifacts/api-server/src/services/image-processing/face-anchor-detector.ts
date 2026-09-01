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
  options: { viewHeightFractions?: readonly number[]; scoreThreshold?: number } = {},
): Promise<FaceAnchorDetection> {
  const viewFractions =
    options.viewHeightFractions ?? FACE_DETECTION_VIEW_HEIGHT_FRACTIONS;
  const scoreThreshold = options.scoreThreshold ?? FACE_DETECTION_SCORE_THRESHOLD;

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
        background: { r: 0, g: 0, b: 0 },
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
