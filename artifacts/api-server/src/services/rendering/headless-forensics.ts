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

    const metadata = {
      temporaryDiagnostic: true as const,
      schemaVersion: 1,
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
}): Promise<HeadlessForensicsPersistResult | { attempted: false }> {
  if (!(params.enabled ?? isHeadlessForensicsEnabled())) {
    return { attempted: false };
  }
  if (!params.bundle) {
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
