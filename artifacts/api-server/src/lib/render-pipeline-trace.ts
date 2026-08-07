import { logger } from "./logger.js";
import type { PipelineTraceContext } from "./render-pipeline-observability.js";
import {
  categorizePipelineError,
  logPipelineFailure,
  logPipelineStage,
} from "./render-pipeline-observability.js";

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const pg = error as Error & { code?: string; detail?: string; cause?: unknown };
    return {
      message: error.message,
      code: pg.code,
      detail: pg.detail,
      errorCategory: categorizePipelineError(error),
    };
  }
  return { message: String(error), errorCategory: categorizePipelineError(error) };
}

type TraceDetail = Record<string, unknown> & {
  pipelineTrace?: PipelineTraceContext;
};

function resolveTrace(detail: TraceDetail): PipelineTraceContext | undefined {
  return detail.pipelineTrace;
}

/** Structured stage checkpoint — production-safe; correlates when pipelineTrace is provided. */
export function traceRenderStage(
  stage: string,
  detail: TraceDetail = {},
): void {
  const { pipelineTrace, ...rest } = detail;

  if (pipelineTrace) {
    logPipelineStage(pipelineTrace, stage, rest);
    return;
  }

  logger.info(
    {
      event: "pipeline_stage",
      stage,
      timestamp: new Date().toISOString(),
      ...rest,
    },
    `pipeline: ${stage}`,
  );
}

/** Structured failure log — production-safe; correlates when pipelineTrace is provided. */
export function traceRenderFailure(
  stage: string,
  error: unknown,
  detail: TraceDetail = {},
): void {
  const { pipelineTrace, ...rest } = detail;

  if (pipelineTrace) {
    logPipelineFailure(pipelineTrace, stage, error, rest);
    return;
  }

  logger.error(
    {
      event: "pipeline_failure",
      stage,
      failed: true,
      timestamp: new Date().toISOString(),
      error: serializeError(error),
      ...rest,
    },
    `pipeline: failed at ${stage}`,
  );
}
