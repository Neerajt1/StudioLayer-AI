import { logger } from "./logger.js";

/**
 * Production pipeline observability — stage naming map
 *
 * Active render path: POST /renders → runAIPipeline → OpenRouterProvider
 *
 * | Observability stage              | Implementation                         | External? |
 * |----------------------------------|----------------------------------------|-----------|
 * | garment_preprocessing_*          | prepareGarmentImage → fal-ai/birefnet  | Yes (FAL) |
 * | intelligence_analysis_*          | runIntelligenceAnalysis (internal)     | No*       |
 * | prompt_generation_completed      | Creative Director / prompt composer    | No        |
 * | openrouter_*                     | OpenRouterProvider → Gemini image API  | Yes       |
 * | r2_upload_*                      | Cloudflare R2                          | Yes       |
 *
 * * Intelligence may invoke OpenAI GPT only as a styling fallback when rule
 *   confidence is low. It does not call FAL or OpenRouter for generation.
 *
 * Legacy FASHN/FAL try-on strategies (render-orchestrator, standard/hybrid
 * strategies) are not used by the active ai-pipeline entry point.
 */

/** External provider identifiers referenced in structured logs. */
export const PipelineExternalProvider = {
  GARMENT_PREPROCESSING: "fal-ai/birefnet",
  IMAGE_GENERATION: "openrouter",
  INTELLIGENCE_ENGINE: "internal_intelligence_engine",
} as const;

/** Canonical pipeline stage identifiers for structured log correlation. */
export const PipelineStage = {
  REQUEST_RECEIVED: "request_received",
  VALIDATION_COMPLETE: "validation_complete",
  DATABASE_INSERT_COMPLETE: "database_insert_complete",
  CREDIT_DEDUCTION_COMPLETE: "credit_deduction_complete",
  AI_PIPELINE_STARTED: "ai_pipeline_started",
  GARMENT_PREPROCESSING_STARTED: "garment_preprocessing_started",
  GARMENT_PREPROCESSING_COMPLETED: "garment_preprocessing_completed",
  INTELLIGENCE_ANALYSIS_STARTED: "intelligence_analysis_started",
  INTELLIGENCE_ANALYSIS_COMPLETED: "intelligence_analysis_completed",
  PROMPT_GENERATION_COMPLETED: "prompt_generation_completed",
  OPENROUTER_REQUEST_STARTED: "openrouter_request_started",
  OPENROUTER_RESPONSE_RECEIVED: "openrouter_response_received",
  OPENROUTER_IMAGE_DOWNLOAD_COMPLETED: "openrouter_image_download_completed",
  R2_UPLOAD_STARTED: "r2_upload_started",
  R2_UPLOAD_COMPLETED: "r2_upload_completed",
  DATABASE_UPDATE_COMPLETED: "database_update_completed",
  CREDIT_TRANSACTION_FINALIZED: "credit_transaction_finalized",
  RENDER_COMPLETED: "render_completed",
  RENDER_FAILED: "render_failed",
  API_RESPONSE_RETURNED: "api_response_returned",
} as const;

export type PipelineStageName = (typeof PipelineStage)[keyof typeof PipelineStage];

/** Mutable trace context — pass through the render lifecycle for correlation. */
export interface PipelineTraceContext {
  generationSessionId: string | null;
  primaryRenderId: number;
  renderIds: number[];
  userId?: number;
  shots: number;
  traceStartedAtMs: number;
  lastStageAtMs: number;
  openRouterRetryCount: number;
}

export function createPipelineTrace(params: {
  generationSessionId: string | null;
  primaryRenderId: number;
  renderIds: number[];
  userId?: number;
  shots?: number;
}): PipelineTraceContext {
  const now = Date.now();
  return {
    generationSessionId: params.generationSessionId,
    primaryRenderId: params.primaryRenderId,
    renderIds: params.renderIds,
    userId: params.userId,
    shots: params.shots ?? params.renderIds.length,
    traceStartedAtMs: now,
    lastStageAtMs: now,
    openRouterRetryCount: 0,
  };
}

/** Lightweight reference passed into rendering providers. */
export type PipelineTraceRef = Pick<
  PipelineTraceContext,
  | "generationSessionId"
  | "primaryRenderId"
  | "userId"
  | "shots"
  | "traceStartedAtMs"
  | "openRouterRetryCount"
>;

export function toPipelineTraceRef(ctx: PipelineTraceContext): PipelineTraceRef {
  return {
    generationSessionId: ctx.generationSessionId,
    primaryRenderId: ctx.primaryRenderId,
    userId: ctx.userId,
    shots: ctx.shots,
    traceStartedAtMs: ctx.traceStartedAtMs,
    openRouterRetryCount: ctx.openRouterRetryCount,
  };
}

function baseFields(ctx: PipelineTraceContext | PipelineTraceRef) {
  return {
    generationSessionId: ctx.generationSessionId,
    renderId: ctx.primaryRenderId,
    ...(ctx.userId != null ? { userId: ctx.userId } : {}),
  };
}

function timingFields(ctx: PipelineTraceContext, stageDurationMs: number) {
  const now = Date.now();
  return {
    timestamp: new Date(now).toISOString(),
    elapsedMs: now - ctx.traceStartedAtMs,
    stageDurationMs,
  };
}

/** Production-safe structured stage log — no prompts, payloads, or image data. */
export function logPipelineStage(
  ctx: PipelineTraceContext,
  stage: PipelineStageName | string,
  detail: Record<string, unknown> = {},
): void {
  const now = Date.now();
  const stageDurationMs = now - ctx.lastStageAtMs;
  ctx.lastStageAtMs = now;

  logger.info(
    {
      event: "pipeline_stage",
      stage,
      ...baseFields(ctx),
      ...timingFields(ctx, stageDurationMs),
      ...detail,
    },
    `pipeline: ${stage}`,
  );
}

export function categorizePipelineError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "timeout";
    const message = error.message.toLowerCase();
    if (message.includes("429") || message.includes("rate limit")) return "rate_limit";
    if (message.includes("http 5") || message.includes("502") || message.includes("503")) {
      return "provider_error";
    }
    if (message.includes("http 4")) return "client_error";
    if (message.includes("timeout") || message.includes("aborted")) return "timeout";
    if (message.includes("r2") || message.includes("upload")) return "storage_error";
    if (message.includes("database") || message.includes("postgres")) return "database_error";
    return "pipeline_error";
  }
  return "unknown";
}

function serializeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Production-safe failure log with stage, elapsed time, and error category. */
export function logPipelineFailure(
  ctx: PipelineTraceContext,
  stage: PipelineStageName | string,
  error: unknown,
  detail: Record<string, unknown> = {},
): void {
  const now = Date.now();
  const errorCategory = categorizePipelineError(error);

  logger.error(
    {
      event: "pipeline_failure",
      stage,
      failed: true,
      ...baseFields(ctx),
      timestamp: new Date(now).toISOString(),
      elapsedMs: now - ctx.traceStartedAtMs,
      retryCount: ctx.openRouterRetryCount,
      errorCategory,
      errorMessage: serializeErrorMessage(error),
      ...detail,
    },
    `pipeline: failed at ${stage}`,
  );
}

export interface OpenRouterLogDetail {
  shotIndex: number;
  attempt: number;
  model: string;
  provider: string;
  durationMs: number;
  timeoutMs: number;
  httpStatus?: number;
  success: boolean;
  errorMessage?: string;
}

/** OpenRouter-specific timing — no request payloads or image data. */
export function logOpenRouterRequest(
  ctx: PipelineTraceContext | PipelineTraceRef,
  phase: "started" | "response_received" | "image_download_completed" | "attempt_failed",
  detail: OpenRouterLogDetail,
): void {
  if (phase === "attempt_failed" && "openRouterRetryCount" in ctx) {
    ctx.openRouterRetryCount += 1;
  }

  const stage =
    phase === "started"
      ? PipelineStage.OPENROUTER_REQUEST_STARTED
      : phase === "response_received"
        ? PipelineStage.OPENROUTER_RESPONSE_RECEIVED
        : phase === "image_download_completed"
          ? PipelineStage.OPENROUTER_IMAGE_DOWNLOAD_COMPLETED
          : PipelineStage.OPENROUTER_REQUEST_STARTED;

  const now = Date.now();
  const elapsedMs = now - ctx.traceStartedAtMs;

  logger.info(
    {
      event: "openrouter_request",
      phase,
      stage,
      ...baseFields(ctx),
      timestamp: new Date(now).toISOString(),
      elapsedMs,
      shotIndex: detail.shotIndex,
      attempt: detail.attempt,
      retryNumber: detail.attempt > 0 ? detail.attempt : 0,
      model: detail.model,
      provider: detail.provider,
      durationMs: detail.durationMs,
      timeoutMs: detail.timeoutMs,
      httpStatus: detail.httpStatus,
      success: detail.success,
      ...(detail.errorMessage ? { errorMessage: detail.errorMessage } : {}),
    },
    `openrouter: ${phase} shot=${detail.shotIndex} attempt=${detail.attempt}`,
  );
}
