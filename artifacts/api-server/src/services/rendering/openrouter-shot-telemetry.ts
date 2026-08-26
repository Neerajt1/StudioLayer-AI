/**
 * Production-safe OpenRouter per-shot latency telemetry.
 *
 * Captures timing and non-sensitive response metadata only.
 * Never logs prompts, image bytes, authorization, or full response bodies.
 */

import { logger } from "../../lib/logger.js";
import type { PipelineTraceContext, PipelineTraceRef } from "../../lib/render-pipeline-observability.js";
import type { NativeOutputResolution } from "./rendering.config.js";

export type OpenRouterShotFailurePhase = "fetch" | "body" | "parse" | "http";

export interface OpenRouterUsageTelemetry {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface OpenRouterResponseTelemetry {
  openrouterRequestId: string | null;
  headerRequestId: string | null;
  provider: string | null;
  finishReason: string | null;
  usage: OpenRouterUsageTelemetry;
}

export interface OpenRouterShotTimingInput {
  generationSessionId: string | null;
  renderId: number | null;
  shotIndex: number;
  attempt: number;
  model: string;
  imageSize: NativeOutputResolution;
  httpStatus: number | null;
  success: boolean;
  failurePhase: OpenRouterShotFailurePhase | null;
  errorMessage: string | null;
  openrouterRequestId: string | null;
  headerRequestId: string | null;
  provider: string | null;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  fetchStartMs: number;
  headersAtMs: number | null;
  bodyCompleteAtMs: number | null;
  parseCompleteAtMs: number | null;
  shotCompleteMs: number;
}

const REQUEST_ID_HEADERS = [
  "x-request-id",
  "x-openrouter-id",
  "x-generation-id",
] as const;

const PROVIDER_HEADERS = [
  "x-openrouter-provider",
  "x-provider",
] as const;

function optionalNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstHeader(
  headers: Headers,
  names: readonly string[],
): string | null {
  for (const name of names) {
    const value = optionalNonEmptyString(headers.get(name));
    if (value) return value;
  }
  return null;
}

function isoOrNull(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function durationOrNull(endMs: number | null, startMs: number | null): number | null {
  if (endMs == null || startMs == null) return null;
  return Math.max(0, endMs - startMs);
}

export function extractOpenRouterHeaderTelemetry(
  headers: Headers,
): Pick<OpenRouterResponseTelemetry, "headerRequestId" | "provider"> {
  return {
    headerRequestId: firstHeader(headers, REQUEST_ID_HEADERS),
    provider: firstHeader(headers, PROVIDER_HEADERS),
  };
}

/**
 * Reads only known non-sensitive fields. Missing keys become null.
 * Does not walk image payloads or error message bodies.
 */
export function extractOpenRouterBodyTelemetry(
  body: unknown,
): Omit<OpenRouterResponseTelemetry, "headerRequestId"> {
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;

  const usageRecord =
    record && record["usage"] && typeof record["usage"] === "object"
      ? (record["usage"] as Record<string, unknown>)
      : null;

  const choices = record?.["choices"];
  const firstChoice =
    Array.isArray(choices) && choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>)
      : null;

  return {
    openrouterRequestId: optionalNonEmptyString(record?.["id"]),
    provider: optionalNonEmptyString(record?.["provider"]),
    finishReason: optionalNonEmptyString(firstChoice?.["finish_reason"]),
    usage: {
      promptTokens: optionalFiniteNumber(usageRecord?.["prompt_tokens"]),
      completionTokens: optionalFiniteNumber(usageRecord?.["completion_tokens"]),
      totalTokens: optionalFiniteNumber(usageRecord?.["total_tokens"]),
    },
  };
}

export function mergeOpenRouterResponseTelemetry(
  headers: Headers,
  body: unknown,
): OpenRouterResponseTelemetry {
  const fromHeaders = extractOpenRouterHeaderTelemetry(headers);
  const fromBody = extractOpenRouterBodyTelemetry(body);
  return {
    openrouterRequestId: fromBody.openrouterRequestId,
    headerRequestId: fromHeaders.headerRequestId,
    provider: fromBody.provider ?? fromHeaders.provider,
    finishReason: fromBody.finishReason,
    usage: fromBody.usage,
  };
}

export function emptyOpenRouterResponseTelemetry(
  headers?: Headers,
): OpenRouterResponseTelemetry {
  const fromHeaders = headers
    ? extractOpenRouterHeaderTelemetry(headers)
    : { headerRequestId: null, provider: null };
  return {
    openrouterRequestId: null,
    headerRequestId: fromHeaders.headerRequestId,
    provider: fromHeaders.provider,
    finishReason: null,
    usage: {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    },
  };
}

export function tryParseOpenRouterJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

const SENSITIVE_LOG_KEYS = new Set([
  "authorization",
  "apiKey",
  "prompt",
  "garmentImageUrl",
  "modelImageUrl",
  "poseReferenceImageUrl",
  "body",
  "responseBody",
  "errorBody",
  "messages",
  "content",
  "images",
]);

export function buildOpenRouterShotTimingFields(
  input: OpenRouterShotTimingInput,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    event: "openrouter:shot_timing",
    generationSessionId: input.generationSessionId,
    renderId: input.renderId,
    shotIndex: input.shotIndex,
    attempt: input.attempt,
    model: input.model,
    imageSize: input.imageSize,
    status: input.httpStatus,
    success: input.success,
    failurePhase: input.failurePhase,
    errorMessage: input.errorMessage,
    openrouterRequestId: input.openrouterRequestId,
    headerRequestId: input.headerRequestId,
    provider: input.provider,
    finishReason: input.finishReason,
    fetchStart: isoOrNull(input.fetchStartMs),
    headersAt: isoOrNull(input.headersAtMs),
    bodyCompleteAt: isoOrNull(input.bodyCompleteAtMs),
    parseCompleteAt: isoOrNull(input.parseCompleteAtMs),
    shotCompleteAt: isoOrNull(input.shotCompleteMs),
    headersWaitMs: durationOrNull(input.headersAtMs, input.fetchStartMs),
    bodyReadMs: durationOrNull(input.bodyCompleteAtMs, input.headersAtMs),
    parseMs: durationOrNull(input.parseCompleteAtMs, input.bodyCompleteAtMs),
    totalShotMs: durationOrNull(input.shotCompleteMs, input.fetchStartMs),
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.totalTokens,
  };

  for (const key of SENSITIVE_LOG_KEYS) {
    delete fields[key];
  }

  return fields;
}

export function logOpenRouterShotTiming(
  ctx: PipelineTraceContext | PipelineTraceRef | undefined,
  input: Omit<OpenRouterShotTimingInput, "generationSessionId" | "renderId"> & {
    generationSessionId?: string | null;
    renderId?: number | null;
  },
): Record<string, unknown> {
  const fields = buildOpenRouterShotTimingFields({
    ...input,
    generationSessionId:
      input.generationSessionId ?? ctx?.generationSessionId ?? null,
    renderId: input.renderId ?? ctx?.primaryRenderId ?? null,
  });

  if (input.success) {
    logger.info(fields, "openrouter:shot_timing");
  } else {
    logger.warn(fields, "openrouter:shot_timing");
  }

  return fields;
}
