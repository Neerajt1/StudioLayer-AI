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
  previousOutputUrl?: string,
  refinementInstruction?: string,
): Promise<string[]> {
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
        // OpenRouter recommends these headers for routing and analytics
        "HTTP-Referer": "https://studiolayer.ai",
        "X-Title": "StudioLayer AI",
      },
      body: JSON.stringify({
        model: OPENROUTER_RENDERING_CONFIG.defaultModel,
        messages: [
          {
            role: "user",
            content: [
              // ── Part 1: garment instruction (+ optional refinement block) ─
              // References "Reference Image 1" (garment) and "Reference Image 2"
              // (model) — order must match the image_url parts below.
              // In refinement mode, the instruction also references Reference
              // Image 3 (the previously generated output).
              {
                type: "text",
                text: refinementInstruction
                  ? `${OPENROUTER_RENDERING_CONFIG.garmentInstruction}\n\n${refinementInstruction}`
                  : OPENROUTER_RENDERING_CONFIG.garmentInstruction,
              },
              // ── Part 2: Reference Image 1 — garment ─────────────────────
              {
                type: "image_url",
                image_url: {
                  url: garmentImageUrl,
                  detail: "high",
                },
              },
              // ── Part 3: Reference Image 2 — model ───────────────────────
              {
                type: "image_url",
                image_url: {
                  url: modelImageUrl,
                  detail: "high",
                },
              },
              // ── Part 4 (refinement only): Reference Image 3 — previous output
              // Provides the model with the prior generation as visual context
              // so it can apply targeted changes rather than generating from scratch.
              ...(previousOutputUrl
                ? [{
                    type: "image_url" as const,
                    image_url: {
                      url: previousOutputUrl,
                      detail: "high" as const,
                    },
                  }]
                : []),
              // ── Part 5: optional additional creative direction ───────────
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

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "(unreadable)");
    throw new Error(
      `OpenRouter API error: HTTP ${response.status} — ${errorBody}`
    );
  }

  const data: unknown = await response.json();
  const urls = extractImageUrls(data);
  return urls;
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
  previousOutputUrl?: string,
  refinementInstruction?: string,
): Promise<string | null> {
  const { timeoutMs, retryCount } = OPENROUTER_RENDERING_CONFIG;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const attemptLabel = attempt === 0 ? "initial" : `retry ${attempt}`;
    const t0 = Date.now();

    try {
      const urls = await callOpenRouter(
        prompt,
        garmentImageUrl,
        modelImageUrl,
        apiKey,
        timeoutMs,
        previousOutputUrl,
        refinementInstruction,
      );
      const durationMs = Date.now() - t0;

      logger.info(
        {
          provider: OPENROUTER_RENDERING_CONFIG.provider,
          model: OPENROUTER_RENDERING_CONFIG.defaultModel,
          shotIndex,
          attempt: attemptLabel,
          durationMs,
          urlsReturned: urls.length,
        },
        "OpenRouterProvider: shot generated"
      );

      if (urls.length > 0) return urls[0]!;

      // No URLs extracted — treat as a soft failure and retry
      lastError = new Error("No image URLs in OpenRouter response");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(
        {
          provider: OPENROUTER_RENDERING_CONFIG.provider,
          model: OPENROUTER_RENDERING_CONFIG.defaultModel,
          shotIndex,
          attempt: attemptLabel,
          error: lastError.message,
        },
        "OpenRouterProvider: attempt failed"
      );
    }
  }

  logger.error(
    {
      provider: OPENROUTER_RENDERING_CONFIG.provider,
      model: OPENROUTER_RENDERING_CONFIG.defaultModel,
      shotIndex,
      error: lastError?.message,
    },
    "OpenRouterProvider: all attempts exhausted for shot"
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
      previousOutputUrl,
      refinementInstruction,
    } = input;

    logger.info(
      {
        provider: this.name,
        model: this.model,
        shots,
        isRefinement: !!previousOutputUrl,
      },
      "OpenRouterProvider: starting generation"
    );

    const t0 = Date.now();

    // Fan out N parallel shot requests with a small stagger (150 ms apart)
    // to avoid hitting OpenRouter rate limits with burst simultaneous calls.
    const STAGGER_MS = 150;
    const results = await Promise.all(
      Array.from({ length: shots }, (_, i) =>
        new Promise<string | null>((resolve) => {
          setTimeout(
            () =>
              generateSingleShot(
                prompt,
                garmentImageUrl,
                modelImageUrl,
                this.apiKey,
                i,
                previousOutputUrl,
                refinementInstruction,
              )
                .then(resolve)
                .catch(() => resolve(null)),
            i * STAGGER_MS,
          );
        }),
      ),
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
