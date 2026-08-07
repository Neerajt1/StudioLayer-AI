// ---------------------------------------------------------------------------
// StudioLayer AI — OpenRouter Rendering Service — OpenRouterProvider
//
// Responsibilities (spec §5):
//   • Authenticate with OpenRouter using OPENROUTER_API_KEY
//   • Accept garment image, model image, user prompt, and shot count
//   • Return generated image URLs
//   • Handle API errors gracefully
//   • Retry once on transient failure
//   • Log request duration
//
// The application NEVER calls OpenRouter directly — all calls go through
// RenderingEngine → OpenRouterProvider → OpenRouter API.
// ---------------------------------------------------------------------------

import { logger } from "../../../lib/logger.js";
import {
  logOpenRouterRequest,
  PipelineStage,
  type PipelineTraceContext,
} from "../../../lib/render-pipeline-observability.js";
import { traceRenderFailure } from "../../../lib/render-pipeline-trace.js";
import { OPENROUTER_RENDERING_CONFIG } from "../rendering.config.js";
import type {
  RenderingProvider,
  ProviderInput,
  GeneratedImage,
  ShotCount,
} from "../types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract image URL(s) from an OpenRouter chat-completion response.
 *
 * OpenRouter image-generation models (e.g. google/gemini-*-image) place
 * generated images in message.images — a non-standard field alongside the
 * standard message.content (which is null for pure image responses).
 *
 * Shape confirmed against live API:
 *   choices[0].message.images = [{ type: "image_url", image_url: { url: "data:..." } }]
 *
 * Falls back to scanning message.content parts for safety.
 */
function extractImageUrls(responseBody: unknown): string[] {
  const body = responseBody as Record<string, unknown>;
  const choices = body?.["choices"] as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(choices) || choices.length === 0) return [];

  const urls: string[] = [];

  /** Pull image URLs out of an array of image_url parts (used by both images and content). */
  function extractFromParts(parts: Array<Record<string, unknown>>): void {
    for (const part of parts) {
      if (part["type"] === "image_url") {
        const imageUrl = part["image_url"] as Record<string, string> | undefined;
        if (imageUrl?.["url"]) urls.push(imageUrl["url"]);
      } else if (part["type"] === "text") {
        const text = part["text"] as string | undefined;
        if (text && (text.startsWith("http") || text.startsWith("data:"))) {
          urls.push(text.trim());
        }
      }
    }
  }

  for (const choice of choices) {
    const message = choice?.["message"] as Record<string, unknown> | undefined;
    if (!message) continue;

    // ── Primary: message.images (OpenRouter image-gen models) ───────────────
    const images = message["images"];
    if (Array.isArray(images) && images.length > 0) {
      extractFromParts(images as Array<Record<string, unknown>>);
      continue; // images field is authoritative — skip content scan
    }

    // ── Fallback: message.content (standard chat completions shape) ──────────
    const content = message["content"];
    if (typeof content === "string") {
      if (content.startsWith("http") || content.startsWith("data:")) {
        urls.push(content);
      }
    } else if (Array.isArray(content)) {
      extractFromParts(content as Array<Record<string, unknown>>);
    }
  }

  return urls;
}

/**
 * Execute a single image-generation request against OpenRouter.
 * Returns the extracted image URLs from the response.
 */
async function callOpenRouter(
  prompt: string,
  garmentImageUrl: string,
  modelImageUrl: string,
  apiKey: string,
  timeoutMs: number,
  shotIndex: number,
  attempt: number,
  pipelineTrace: PipelineTraceContext | undefined,
  previousOutputUrl?: string,
  refinementInstruction?: string,
): Promise<{ urls: string[]; httpStatus: number; fetchDurationMs: number; parseDurationMs: number }> {
  const provider = OPENROUTER_RENDERING_CONFIG.provider;
  const model = OPENROUTER_RENDERING_CONFIG.defaultModel;
  const fetchStartedAt = Date.now();

  if (pipelineTrace) {
    logOpenRouterRequest(pipelineTrace, "started", {
      shotIndex,
      attempt,
      model,
      provider,
      durationMs: 0,
      timeoutMs,
      success: true,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_RENDERING_CONFIG.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://studiolayer.ai",
        "X-Title": "StudioLayer AI",
      },
      body: JSON.stringify({
        model: OPENROUTER_RENDERING_CONFIG.defaultModel,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: refinementInstruction
                  ? `${OPENROUTER_RENDERING_CONFIG.garmentInstruction}\n\n${refinementInstruction}`
                  : OPENROUTER_RENDERING_CONFIG.garmentInstruction,
              },
              {
                type: "image_url",
                image_url: {
                  url: garmentImageUrl,
                  detail: "high",
                },
              },
              {
                type: "image_url",
                image_url: {
                  url: modelImageUrl,
                  detail: "high",
                },
              },
              ...(previousOutputUrl
                ? [{
                    type: "image_url" as const,
                    image_url: {
                      url: previousOutputUrl,
                      detail: "high" as const,
                    },
                  }]
                : []),
              ...(prompt
                ? [{ type: "text" as const, text: prompt }]
                : []),
            ],
          },
        ],
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  const fetchDurationMs = Date.now() - fetchStartedAt;

  if (pipelineTrace) {
    logOpenRouterRequest(pipelineTrace, "response_received", {
      shotIndex,
      attempt,
      model,
      provider,
      durationMs: fetchDurationMs,
      timeoutMs,
      httpStatus: response.status,
      success: response.ok,
    });
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "(unreadable)");
    const err = new Error(
      `OpenRouter API error: HTTP ${response.status}`,
    );
    if (pipelineTrace) {
      logOpenRouterRequest(pipelineTrace, "attempt_failed", {
        shotIndex,
        attempt,
        model,
        provider,
        durationMs: fetchDurationMs,
        timeoutMs,
        httpStatus: response.status,
        success: false,
        errorMessage: err.message,
      });
    }
    traceRenderFailure(PipelineStage.OPENROUTER_RESPONSE_RECEIVED, err, {
      pipelineTrace,
      shotIndex,
      attempt,
      httpStatus: response.status,
      providerErrorLength: errorBody.length,
    });
    throw err;
  }

  const parseStartedAt = Date.now();
  const data: unknown = await response.json();
  const urls = extractImageUrls(data);
  const parseDurationMs = Date.now() - parseStartedAt;

  if (pipelineTrace) {
    logOpenRouterRequest(pipelineTrace, "image_download_completed", {
      shotIndex,
      attempt,
      model,
      provider,
      durationMs: parseDurationMs,
      timeoutMs,
      httpStatus: response.status,
      success: urls.length > 0,
    });
  }

  return {
    urls,
    httpStatus: response.status,
    fetchDurationMs,
    parseDurationMs,
  };
}

/**
 * Single-shot generation with one automatic retry on transient failure (spec §5).
 */
async function generateSingleShot(
  prompt: string,
  garmentImageUrl: string,
  modelImageUrl: string,
  apiKey: string,
  shotIndex: number,
  pipelineTrace: PipelineTraceContext | undefined,
  previousOutputUrl?: string,
  refinementInstruction?: string,
): Promise<string | null> {
  const { timeoutMs, retryCount } = OPENROUTER_RENDERING_CONFIG;
  const provider = OPENROUTER_RENDERING_CONFIG.provider;
  const model = OPENROUTER_RENDERING_CONFIG.defaultModel;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const t0 = Date.now();

    try {
      const result = await callOpenRouter(
        prompt,
        garmentImageUrl,
        modelImageUrl,
        apiKey,
        timeoutMs,
        shotIndex,
        attempt,
        pipelineTrace,
        previousOutputUrl,
        refinementInstruction,
      );
      const durationMs = Date.now() - t0;

      logger.info(
        {
          provider,
          model,
          shotIndex,
          attempt,
          durationMs,
          urlsReturned: result.urls.length,
          ...(pipelineTrace
            ? {
                generationSessionId: pipelineTrace.generationSessionId,
                renderId: pipelineTrace.primaryRenderId,
              }
            : {}),
        },
        "OpenRouterProvider: shot generated",
      );

      if (result.urls.length > 0) return result.urls[0]!;

      lastError = new Error("No image URLs in OpenRouter response");
      if (pipelineTrace) {
        logOpenRouterRequest(pipelineTrace, "attempt_failed", {
          shotIndex,
          attempt,
          model,
          provider,
          durationMs,
          timeoutMs,
          httpStatus: result.httpStatus,
          success: false,
          errorMessage: lastError.message,
        });
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const durationMs = Date.now() - t0;
      if (pipelineTrace) {
        logOpenRouterRequest(pipelineTrace, "attempt_failed", {
          shotIndex,
          attempt,
          model,
          provider,
          durationMs,
          timeoutMs,
          success: false,
          errorMessage: lastError.message,
        });
      }
      traceRenderFailure(PipelineStage.OPENROUTER_REQUEST_STARTED, lastError, {
        pipelineTrace,
        shotIndex,
        attempt,
      });
      logger.warn(
        {
          provider,
          model,
          shotIndex,
          attempt,
          error: lastError.message,
        },
        "OpenRouterProvider: attempt failed",
      );
    }
  }

  logger.error(
    {
      provider,
      model,
      shotIndex,
      error: lastError?.message,
      ...(pipelineTrace
        ? {
            generationSessionId: pipelineTrace.generationSessionId,
            renderId: pipelineTrace.primaryRenderId,
            retryCount: pipelineTrace.openRouterRetryCount,
          }
        : {}),
    },
    "OpenRouterProvider: all attempts exhausted for shot",
  );
  return null;
}

// ---------------------------------------------------------------------------
// OpenRouterProvider — concrete implementation of RenderingProvider
// ---------------------------------------------------------------------------

export class OpenRouterProvider implements RenderingProvider {
  readonly name = "openrouter";
  readonly model = OPENROUTER_RENDERING_CONFIG.defaultModel;

  private readonly apiKey: string;

  constructor() {
    const key = process.env["OPENROUTER_API_KEY"];
    if (!key) {
      throw new Error(
        "OpenRouterProvider: OPENROUTER_API_KEY environment variable is not set"
      );
    }
    this.apiKey = key;
  }

  /**
   * Generate the requested number of shots.
   *
   * Strategy (spec §7):
   * The model supports one image per request.  For multi-shot requests we
   * fan out N parallel calls and merge the results into one ordered array.
   * If any individual shot fails after retries it is omitted — the array
   * may be shorter than requested.
   */
  async generate(input: ProviderInput): Promise<GeneratedImage[]> {
    const {
      garmentImageUrl,
      modelImageUrl,
      prompt,
      shots,
      perShotPrompts,
      previousOutputUrl,
      refinementInstruction,
      pipelineTrace,
    } = input;

    const hasPerShotPrompts =
      Array.isArray(perShotPrompts) && perShotPrompts.length === shots;

    logger.info(
      {
        provider: this.name,
        model: this.model,
        shots,
        isRefinement: !!previousOutputUrl,
        editorialDiversity: hasPerShotPrompts,
      },
      "OpenRouterProvider: starting generation"
    );

    const t0 = Date.now();

    // Fan out N parallel shot requests with a small stagger (150 ms apart)
    // to avoid hitting OpenRouter rate limits with burst simultaneous calls.
    //
    // Editorial diversity: when perShotPrompts is provided, each shot uses
    // its own distinct creative brief instead of the shared prompt.
    const STAGGER_MS = 150;
    const results = await Promise.all(
      Array.from({ length: shots }, (_, i) => {
        // Each editorial shot gets its own brief; all other modes share prompt.
        const shotPrompt = hasPerShotPrompts ? (perShotPrompts[i] ?? prompt) : prompt;

        return new Promise<string | null>((resolve) => {
          setTimeout(
            () =>
              generateSingleShot(
                shotPrompt,
                garmentImageUrl,
                modelImageUrl,
                this.apiKey,
                i,
                pipelineTrace,
                previousOutputUrl,
                refinementInstruction,
              )
                .then(resolve)
                .catch(() => resolve(null)),
            i * STAGGER_MS,
          );
        });
      }),
    );

    const durationMs = Date.now() - t0;
    const images: GeneratedImage[] = results
      .map((url, i) => (url ? { url, index: i } : null))
      .filter((img): img is GeneratedImage => img !== null);

    logger.info(
      {
        provider: this.name,
        model: this.model,
        shotsRequested: shots,
        shotsGenerated: images.length,
        durationMs,
      },
      "OpenRouterProvider: generation complete"
    );

    return images;
  }
}
