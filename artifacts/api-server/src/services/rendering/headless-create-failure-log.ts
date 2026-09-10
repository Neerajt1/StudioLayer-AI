// ---------------------------------------------------------------------------
// Structured Headless Create failure observability (production-safe).
// ---------------------------------------------------------------------------

import { logger } from "../../lib/logger.js";
import {
  HeadlessIdentityReferenceFailureError,
  HeadlessMaskFailureError,
  HeadlessStage2FailureError,
} from "../rendering/providers/nano-pro-headless-mannequin-trial.js";
import type { HeadMaskFailureReason } from "../image-processing/headless-head-mask.js";

export type HeadlessFailureStage =
  | "stage1"
  | "mask"
  | "face_anchor"
  | "identity"
  | "stage2"
  | "upload"
  | "timeout"
  | "pose_missing"
  | "unknown";

export type HeadlessCreateFailureLog = {
  renderId?: number | null;
  sessionId?: string | null;
  shotIndex?: number;
  trialRunId?: string | null;
  stage1RunId?: string | null;
  stage2RunId?: string | null;
  failureStage: HeadlessFailureStage;
  failureReason: string;
  stage1NanoProAttempted: boolean;
  stage1ReturnedImage: boolean;
  stage2Attempted: boolean;
  elapsedMs?: {
    stage1?: number | null;
    mask?: number | null;
    identity?: number | null;
    stage2?: number | null;
    total?: number | null;
  };
  timeoutMs?: number | null;
  maskFailureReasons?: HeadMaskFailureReason[];
  maskMetrics?: Record<string, unknown>;
  errMessage?: string;
};

function classifyMaskFailureStage(
  reasons: readonly HeadMaskFailureReason[],
  detail: string,
): HeadlessFailureStage {
  if (reasons.includes("FACE_ANCHOR_INVALID") || /NO_FACE_DETECTED/i.test(detail)) {
    return "face_anchor";
  }
  if (reasons.includes("SEGMENTATION_FAILED")) {
    return "mask";
  }
  return "mask";
}

export function classifyHeadlessCreateFailure(error: unknown): HeadlessCreateFailureLog {
  if (error instanceof HeadlessMaskFailureError) {
    return {
      trialRunId: error.trialRunId,
      stage1RunId: error.stage1.stageRunId,
      stage2RunId: null,
      failureStage: classifyMaskFailureStage(error.reasons, error.detail),
      failureReason: error.detail || error.reasons.join(", "),
      stage1NanoProAttempted: true,
      stage1ReturnedImage: Boolean(error.stage1.imageDataUri),
      stage2Attempted: false,
      elapsedMs: {
        stage1: error.elapsedMs.stage1Ms,
        mask: error.elapsedMs.maskMs,
        total: error.elapsedMs.totalMs,
      },
      maskFailureReasons: error.reasons,
      maskMetrics: error.metrics as Record<string, unknown>,
      errMessage: error.message,
    };
  }

  if (error instanceof HeadlessIdentityReferenceFailureError) {
    return {
      trialRunId: error.trialRunId,
      stage1RunId: error.stage1.stageRunId,
      stage2RunId: null,
      failureStage: "identity",
      failureReason: error.detail || error.reason,
      stage1NanoProAttempted: true,
      stage1ReturnedImage: Boolean(error.stage1.imageDataUri),
      stage2Attempted: false,
      elapsedMs: {
        stage1: error.elapsedMs.stage1Ms,
        mask: error.elapsedMs.maskMs,
        identity: error.elapsedMs.identityMs,
        total: error.elapsedMs.totalMs,
      },
      errMessage: error.message,
    };
  }

  if (error instanceof HeadlessStage2FailureError) {
    const msg = error.message.toLowerCase();
    const isTimeout =
      msg.includes("aborted") || msg.includes("timeout");
    return {
      trialRunId: error.trialRunId,
      stage1RunId: error.stage1.stageRunId,
      stage2RunId: error.stage2RunId,
      failureStage: isTimeout ? "timeout" : "stage2",
      failureReason: error.message,
      stage1NanoProAttempted: true,
      stage1ReturnedImage: Boolean(error.stage1.imageDataUri),
      stage2Attempted: true,
      elapsedMs: {
        stage1: error.elapsedMs.stage1Ms,
        mask: error.elapsedMs.maskMs,
        identity: error.elapsedMs.identityMs,
        stage2: error.elapsedMs.stage2Ms,
        total: error.elapsedMs.totalMs,
      },
      errMessage: error.message,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("aborted") || lower.includes("timeout")) {
    return {
      failureStage: "timeout",
      failureReason: message,
      stage1NanoProAttempted: true,
      stage1ReturnedImage: false,
      stage2Attempted: /stage 2/i.test(message),
      errMessage: message,
    };
  }
  if (/stage 1/i.test(message) || /no valid image/i.test(message)) {
    return {
      failureStage: "stage1",
      failureReason: message,
      stage1NanoProAttempted: true,
      stage1ReturnedImage: false,
      stage2Attempted: false,
      errMessage: message,
    };
  }

  return {
    failureStage: "unknown",
    failureReason: message,
    stage1NanoProAttempted: true,
    stage1ReturnedImage: false,
    stage2Attempted: false,
    errMessage: message,
  };
}

export function logHeadlessCreateShotFailure(
  fields: HeadlessCreateFailureLog & {
    provider?: string;
    shotIndex?: number;
  },
): void {
  logger.warn(
    {
      headlessCreateFailure: true,
      ...fields,
    },
    "OpenRouterProvider: Headless Create shot failed — no single-pass fallback",
  );
}
