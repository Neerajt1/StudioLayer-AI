// ---------------------------------------------------------------------------
// TEMPORARY DIAGNOSTIC — Headless mask/containment forensics
//
// Opt-in via HEADLESS_FORENSICS_ENABLED=true.
// Captures Stage-1 + EVF-SAM + cleaned-mask artifacts ONLY on Headless
// mask/containment FAILURE. Never on success. Never under renders/{id}/.
//
// Does NOT change gates, thresholds, Nano Pro call count, or fail-closed
// generation behaviour. Forensic upload failures are logged and swallowed.
// ---------------------------------------------------------------------------

import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { logger } from "../../lib/logger.js";
import { createR2S3Client, getR2Config } from "../../lib/r2-config.js";
import type { FaceAnchorDetection, FaceBox } from "../image-processing/face-anchor-detector.js";
import type {
  HeadMaskFailureReason,
  HeadMaskMetrics,
} from "../image-processing/headless-head-mask.js";

/** Env flag — OFF unless exactly the string "true". */
export const HEADLESS_FORENSICS_ENV = "HEADLESS_FORENSICS_ENABLED" as const;

/** Isolated R2 prefix — never `renders/{id}/`. */
export const HEADLESS_FORENSICS_STORAGE_PREFIX = "headless-forensics/" as const;

export function isHeadlessForensicsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[HEADLESS_FORENSICS_ENV] === "true";
}

type DiagnosticLogFn = (
  obj: Record<string, unknown>,
  msg: string,
) => void;

/**
 * SAFE startup diagnostic — logs only the boolean recognition of the forensics
 * flag. Never logs secrets, raw env dumps, image bytes, or credentials.
 * Evaluates process.env at call time (not module load).
 */
export function logHeadlessForensicsStartupConfig(
  env: NodeJS.ProcessEnv = process.env,
  logInfo: DiagnosticLogFn = (obj, msg) => logger.info(obj, msg),
): boolean {
  const enabled = isHeadlessForensicsEnabled(env);
  logInfo(
    { temporaryDiagnostic: true, enabled },
    `headless-forensics: enabled=${enabled}`,
  );
  return enabled;
}

export type HeadlessMaskPipelineTimings = {
  falUploadMs: number | null;
  falSubscribeMs: number | null;
  /** Passthrough of fal.subscribe result timing fields when the SDK exposes them. */
  falSubscribeSdkTimings: Record<string, unknown> | null;
  maskFetchMs: number | null;
  sharpResizeMs: number | null;
  cleanHeadMaskMs: number | null;
  geometryValidationMs: number | null;
  primaryYunetMs: number | null;
  secondaryYunetMs: number | null;
  cropExtractMs: number | null;
  containmentMs: number | null;
  totalMaskPipelineMs: number | null;
};

export type HeadHairEnvelopeCoords = {
  ex0: number;
  ex1: number;
  ey0: number;
  ey1: number;
  multipliers: {
    halfWidthsOfFace: number;
    aboveFace: number;
    belowFace: number;
  };
};

/**
 * Structured mask-pipeline diagnostics for distinguishing:
 *   A. EVF-SAM undersized/incomplete mask
 *   B. cleanHeadMask removed face pixels
 *   C. fit:"fill" resize aspect distortion
 * Capture-only — never alters the production mask used for Stage 2.
 */
export type HeadlessMaskPipelineDiagnostics = {
  stage1: {
    width: number;
    height: number;
    format: string | null;
    channels: number | null;
    space: string | null;
  };
  rawEvfSamMask: {
    nativeWidth: number | null;
    nativeHeight: number | null;
    format: string | null;
    coveragePct: number | null;
    maskedPixels: number | null;
  };
  resizedMask: {
    sourceWidth: number | null;
    sourceHeight: number | null;
    destinationWidth: number;
    destinationHeight: number;
    operation: {
      fit: "fill";
      kernel: "lanczos3";
    };
    coveragePct: number | null;
    maskedPixels: number | null;
    sourceAspect: number | null;
    destinationAspect: number | null;
    aspectDeltaPct: number | null;
    /** True when source/dest aspect ratios match within 1% — evidence for spatial alignment. */
    spatialAlignmentPreserved: boolean | null;
  };
  cleanHeadMask: {
    coveragePctBefore: number | null;
    coveragePctAfter: number | null;
    maskedPixelsBefore: number | null;
    maskedPixelsAfter: number | null;
    connectedComponentCount: number | null;
    largestComponentPixels: number | null;
    pixelsRemovedByClean: number | null;
    pixelsAddedByClean: number | null;
    dilationPx: number | null;
  };
  yunet: {
    faceBox: FaceBox | null;
    faceScore: number | null;
    coordinateSpace: "stage1_full_frame";
  };
  containment: {
    faceCoveredPct: number | null;
    maskInsideEnvelopePct: number | null;
    faceEnvelope: HeadHairEnvelopeCoords | null;
    failureReasons: HeadMaskFailureReason[];
  };
};

/** Failure-only diagnostic overlays — never Gallery / never generation output. */
export type HeadlessMaskDiagnosticOverlays = {
  overlayRawMaskPng: Buffer | null;
  overlayCleanedMaskPng: Buffer | null;
  overlayYunetFacePng: Buffer | null;
  overlayFaceEnvelopePng: Buffer | null;
};

/**
 * In-memory forensic bundle attached to a Headless mask failure.
 * Uploaded only when HEADLESS_FORENSICS_ENABLED=true.
 */
export type HeadlessMaskForensicsBundle = {
  /** TEMPORARY DIAGNOSTIC marker */
  temporaryDiagnostic: true;
  capturedAtIso: string;
  stage1ImageBuffer: Buffer;
  rawEvfSamMaskPng: Buffer | null;
  rawMaskResizedPng: Buffer | null;
  cleanedMaskPng: Buffer | null;
  renderWidth: number;
  renderHeight: number;
  rawMaskNativeWidth: number | null;
  rawMaskNativeHeight: number | null;
  cleanedMaskWidth: number | null;
  cleanedMaskHeight: number | null;
  primaryYunet: FaceAnchorDetection | null;
  secondaryYunetCropSpace: FaceAnchorDetection | null;
  secondaryAttempted: boolean;
  secondaryCrop: { left: number; top: number; width: number; height: number } | null;
  remappedFaceAabb: FaceBox | null;
  headHairEnvelope: HeadHairEnvelopeCoords | null;
  geometryMetrics: Partial<HeadMaskMetrics>;
  containmentMetrics: Partial<HeadMaskMetrics>;
  failureReasons: HeadMaskFailureReason[];
  failureDetail: string;
  timings: HeadlessMaskPipelineTimings;
  usedMaskHint: boolean;
  /** Extended diagnostics — schemaVersion 2+. */
  pipelineDiagnostics: HeadlessMaskPipelineDiagnostics | null;
  diagnosticOverlays: HeadlessMaskDiagnosticOverlays | null;
};

export type HeadlessForensicsPersistInput = {
  renderId?: number | null;
  trialRunId?: string | null;
  stage1RunId?: string | null;
  bundle: HeadlessMaskForensicsBundle;
  /** Injectable for tests — production uses R2 PutObject. */
  putObject?: (params: {
    objectKey: string;
    body: Buffer;
    contentType: string;
  }) => Promise<void>;
};

export type HeadlessForensicsPersistResult = {
  attempted: true;
  ok: boolean;
  prefix: string;
  objectKeys: string[];
  error?: string;
};

export function buildHeadlessForensicsObjectKey(params: {
  renderId?: number | null;
  trialRunId?: string | null;
  filename: string;
}): string {
  const idPart =
    params.renderId != null && Number.isFinite(params.renderId)
      ? String(params.renderId)
      : params.trialRunId?.trim()
        ? `trial-${params.trialRunId.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)}`
        : "unknown";
  if (idPart.includes("..") || idPart.includes("/") || idPart.includes("\\")) {
    throw new Error("headless-forensics: invalid id segment");
  }
  const filename = params.filename.replace(/^\/+/, "");
  const key = `${HEADLESS_FORENSICS_STORAGE_PREFIX}${idPart}/${filename}`;
  assertHeadlessForensicsObjectKeySafe(key);
  return key;
}

export function assertHeadlessForensicsObjectKeySafe(objectKey: string): void {
  if (!objectKey.startsWith(HEADLESS_FORENSICS_STORAGE_PREFIX)) {
    throw new Error(
      `headless-forensics: object key must start with ${HEADLESS_FORENSICS_STORAGE_PREFIX}`,
    );
  }
  if (objectKey.includes("..")) {
    throw new Error("headless-forensics: path traversal is not allowed");
  }
  if (
    objectKey.startsWith("renders/") ||
    objectKey.includes("/renders/") ||
    /(^|\/)renders\/\d+\//.test(objectKey)
  ) {
    throw new Error(
      "headless-forensics: refusing to write under production renders/ prefix",
    );
  }
}

/** Forensic overlay only — does not alter production pipeline bytes. */
export async function buildMaskTintOverlayPng(params: {
  stage1ImageBuffer: Buffer;
  maskRaw: Buffer;
  width: number;
  height: number;
  tint: { r: number; g: number; b: number; alpha: number };
}): Promise<Buffer> {
  const { width, height, maskRaw, tint } = params;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (maskRaw[i]! <= 127) continue;
    const o = i * 4;
    rgba[o] = tint.r;
    rgba[o + 1] = tint.g;
    rgba[o + 2] = tint.b;
    rgba[o + 3] = tint.alpha;
  }
  const overlay = await sharp(rgba, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
  return sharp(params.stage1ImageBuffer)
    .ensureAlpha()
    .composite([{ input: overlay, blend: "over" }])
    .png()
    .toBuffer();
}

/** Forensic rectangle overlay (YuNet face or envelope) — SVG stroke only. */
export async function buildRectOutlineOverlayPng(params: {
  stage1ImageBuffer: Buffer;
  width: number;
  height: number;
  rect: { x0: number; y0: number; x1: number; y1: number };
  stroke: string;
  label?: string;
}): Promise<Buffer> {
  const x0 = Math.max(0, Math.min(params.width - 1, params.rect.x0));
  const y0 = Math.max(0, Math.min(params.height - 1, params.rect.y0));
  const x1 = Math.max(0, Math.min(params.width - 1, params.rect.x1));
  const y1 = Math.max(0, Math.min(params.height - 1, params.rect.y1));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const label = params.label
    ? `<text x="${x0 + 4}" y="${Math.max(12, y0 - 6)}" fill="${params.stroke}" font-size="18" font-family="sans-serif">${params.label}</text>`
    : "";
  const svg = Buffer.from(
    `<svg width="${params.width}" height="${params.height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="none" stroke="${params.stroke}" stroke-width="4"/>` +
      label +
      `</svg>`,
  );
  return sharp(params.stage1ImageBuffer)
    .composite([{ input: svg, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/**
 * Build the four diagnostic overlays for a containment/mask failure.
 * Best-effort: individual overlay failures return null for that artifact only.
 */
export async function buildHeadlessMaskDiagnosticOverlays(params: {
  stage1ImageBuffer: Buffer;
  width: number;
  height: number;
  rawMaskResized: Buffer | null;
  cleanedMask: Buffer | null;
  face: FaceBox | null;
  envelope: HeadHairEnvelopeCoords | null;
}): Promise<HeadlessMaskDiagnosticOverlays> {
  const out: HeadlessMaskDiagnosticOverlays = {
    overlayRawMaskPng: null,
    overlayCleanedMaskPng: null,
    overlayYunetFacePng: null,
    overlayFaceEnvelopePng: null,
  };
  try {
    if (params.rawMaskResized) {
      out.overlayRawMaskPng = await buildMaskTintOverlayPng({
        stage1ImageBuffer: params.stage1ImageBuffer,
        maskRaw: params.rawMaskResized,
        width: params.width,
        height: params.height,
        tint: { r: 255, g: 64, b: 64, alpha: 110 },
      });
    }
  } catch {
    out.overlayRawMaskPng = null;
  }
  try {
    if (params.cleanedMask) {
      out.overlayCleanedMaskPng = await buildMaskTintOverlayPng({
        stage1ImageBuffer: params.stage1ImageBuffer,
        maskRaw: params.cleanedMask,
        width: params.width,
        height: params.height,
        tint: { r: 64, g: 160, b: 255, alpha: 110 },
      });
    }
  } catch {
    out.overlayCleanedMaskPng = null;
  }
  try {
    if (params.face) {
      out.overlayYunetFacePng = await buildRectOutlineOverlayPng({
        stage1ImageBuffer: params.stage1ImageBuffer,
        width: params.width,
        height: params.height,
        rect: {
          x0: params.face.x,
          y0: params.face.y,
          x1: params.face.x + params.face.width,
          y1: params.face.y + params.face.height,
        },
        stroke: "#00ff88",
        label: `YuNet ${params.face.score.toFixed(3)}`,
      });
    }
  } catch {
    out.overlayYunetFacePng = null;
  }
  try {
    if (params.envelope) {
      out.overlayFaceEnvelopePng = await buildRectOutlineOverlayPng({
        stage1ImageBuffer: params.stage1ImageBuffer,
        width: params.width,
        height: params.height,
        rect: {
          x0: params.envelope.ex0,
          y0: params.envelope.ey0,
          x1: params.envelope.ex1,
          y1: params.envelope.ey1,
        },
        stroke: "#ffcc00",
        label: "envelope",
      });
    }
  } catch {
    out.overlayFaceEnvelopePng = null;
  }
  return out;
}

/**
 * Upload forensic artifacts. Never throws to the caller — returns ok:false on failure.
 * MUST NOT alter Headless fail-closed generation behaviour.
 */
export async function persistHeadlessMaskForensics(
  input: HeadlessForensicsPersistInput,
): Promise<HeadlessForensicsPersistResult> {
  const { bundle } = input;
  const objectKeys: string[] = [];

  try {
    const put =
      input.putObject ??
      (async (params: { objectKey: string; body: Buffer; contentType: string }) => {
        const config = getR2Config();
        if (!config) {
          throw new Error("headless-forensics: R2 is not configured");
        }
        const client = createR2S3Client(config);
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: params.objectKey,
            Body: params.body,
            ContentType: params.contentType,
          }),
        );
      });

    const keyFor = (filename: string) =>
      buildHeadlessForensicsObjectKey({
        renderId: input.renderId,
        trialRunId: input.trialRunId,
        filename,
      });

    const uploads: Array<{ filename: string; body: Buffer; contentType: string }> = [
      {
        filename: "stage1.png",
        body: bundle.stage1ImageBuffer,
        contentType: "image/png",
      },
    ];
    if (bundle.rawEvfSamMaskPng) {
      uploads.push({
        filename: "raw-evf-sam-mask.png",
        body: bundle.rawEvfSamMaskPng,
        contentType: "image/png",
      });
    }
    if (bundle.rawMaskResizedPng) {
      uploads.push({
        filename: "raw-mask-resized.png",
        body: bundle.rawMaskResizedPng,
        contentType: "image/png",
      });
    }
    if (bundle.cleanedMaskPng) {
      uploads.push({
        filename: "cleaned-mask.png",
        body: bundle.cleanedMaskPng,
        contentType: "image/png",
      });
    }
    const overlays = bundle.diagnosticOverlays;
    if (overlays?.overlayRawMaskPng) {
      uploads.push({
        filename: "overlay-stage1-raw-mask.png",
        body: overlays.overlayRawMaskPng,
        contentType: "image/png",
      });
    }
    if (overlays?.overlayCleanedMaskPng) {
      uploads.push({
        filename: "overlay-stage1-cleaned-mask.png",
        body: overlays.overlayCleanedMaskPng,
        contentType: "image/png",
      });
    }
    if (overlays?.overlayYunetFacePng) {
      uploads.push({
        filename: "overlay-stage1-yunet-face.png",
        body: overlays.overlayYunetFacePng,
        contentType: "image/png",
      });
    }
    if (overlays?.overlayFaceEnvelopePng) {
      uploads.push({
        filename: "overlay-stage1-face-envelope.png",
        body: overlays.overlayFaceEnvelopePng,
        contentType: "image/png",
      });
    }

    const metadata = {
      temporaryDiagnostic: true as const,
      schemaVersion: 2,
      renderId: input.renderId ?? null,
      trialRunId: input.trialRunId ?? null,
      stage1RunId: input.stage1RunId ?? null,
      timestamp: bundle.capturedAtIso,
      renderDimensions: {
        width: bundle.renderWidth,
        height: bundle.renderHeight,
      },
      rawMaskNativeDimensions: {
        width: bundle.rawMaskNativeWidth,
        height: bundle.rawMaskNativeHeight,
      },
      cleanedMaskDimensions: {
        width: bundle.cleanedMaskWidth,
        height: bundle.cleanedMaskHeight,
      },
      primaryYunet: bundle.primaryYunet,
      secondaryYunetCropSpace: bundle.secondaryYunetCropSpace,
      secondaryAttempted: bundle.secondaryAttempted,
      secondaryCrop: bundle.secondaryCrop,
      remappedFaceAabb: bundle.remappedFaceAabb,
      headHairEnvelope: bundle.headHairEnvelope,
      geometryMetrics: bundle.geometryMetrics,
      containmentMetrics: bundle.containmentMetrics,
      failureReasons: bundle.failureReasons,
      failureDetail: bundle.failureDetail,
      timings: bundle.timings,
      usedMaskHint: bundle.usedMaskHint,
      pipelineDiagnostics: bundle.pipelineDiagnostics,
      diagnosticOverlayFiles: [
        overlays?.overlayRawMaskPng ? "overlay-stage1-raw-mask.png" : null,
        overlays?.overlayCleanedMaskPng ? "overlay-stage1-cleaned-mask.png" : null,
        overlays?.overlayYunetFacePng ? "overlay-stage1-yunet-face.png" : null,
        overlays?.overlayFaceEnvelopePng
          ? "overlay-stage1-face-envelope.png"
          : null,
      ].filter(Boolean),
      artifacts: uploads.map((u) => u.filename),
    };

    uploads.push({
      filename: "metadata.json",
      body: Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, "utf8"),
      contentType: "application/json",
    });

    for (const file of uploads) {
      const objectKey = keyFor(file.filename);
      assertHeadlessForensicsObjectKeySafe(objectKey);
      await put({
        objectKey,
        body: file.body,
        contentType: file.contentType,
      });
      objectKeys.push(objectKey);
    }

    const prefix = keyFor("").replace(/\/$/, "") + "/";
    logger.info(
      {
        temporaryDiagnostic: true,
        renderId: input.renderId ?? null,
        trialRunId: input.trialRunId ?? null,
        objectKeys,
        prefix,
      },
      "headless-forensics: captured mask/containment failure artifacts",
    );

    return { attempted: true, ok: true, prefix, objectKeys };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      {
        temporaryDiagnostic: true,
        renderId: input.renderId ?? null,
        trialRunId: input.trialRunId ?? null,
        objectKeys,
        errMessage: message,
      },
      "headless-forensics: upload failed — generation fail-closed path unchanged",
    );
    return {
      attempted: true,
      ok: false,
      prefix: `${HEADLESS_FORENSICS_STORAGE_PREFIX}${input.renderId ?? "unknown"}/`,
      objectKeys,
      error: message,
    };
  }
}

/**
 * Fire-and-forget safe wrapper used by the production provider catch path.
 * Never rethrows.
 */
export async function maybePersistHeadlessMaskForensics(params: {
  enabled?: boolean;
  renderId?: number | null;
  trialRunId?: string | null;
  stage1RunId?: string | null;
  bundle?: HeadlessMaskForensicsBundle | null;
  putObject?: HeadlessForensicsPersistInput["putObject"];
  /** Injectable for tests — production uses logger.warn. */
  logWarn?: DiagnosticLogFn;
}): Promise<HeadlessForensicsPersistResult | { attempted: false }> {
  if (!(params.enabled ?? isHeadlessForensicsEnabled())) {
    return { attempted: false };
  }
  if (!params.bundle) {
    // Flag is on but neutralizeHeadRegion did not attach a bundle (typically
    // the process saw the flag as off during mask capture). Explicit so ops
    // can see the skip — never log image/mask bytes or secrets.
    const warn = params.logWarn ?? ((obj, msg) => logger.warn(obj, msg));
    warn(
      {
        temporaryDiagnostic: true,
        renderId: params.renderId ?? null,
        trialRunId: params.trialRunId ?? null,
        stage1RunId: params.stage1RunId ?? null,
        reason: "no_forensic_bundle",
      },
      "headless-forensics: skipped — no forensic bundle",
    );
    return { attempted: false };
  }
  return persistHeadlessMaskForensics({
    renderId: params.renderId,
    trialRunId: params.trialRunId,
    stage1RunId: params.stage1RunId,
    bundle: params.bundle,
    putObject: params.putObject,
  });
}
