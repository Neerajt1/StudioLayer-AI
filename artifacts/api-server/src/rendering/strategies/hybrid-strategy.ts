// ---------------------------------------------------------------------------
// StudioLayer AI — Hybrid Rendering Strategy (SL-017, Part 4)
//
// Implements the FLUX → FASHN two-stage rendering pipeline:
//
//   Stage 1: PromptComposer output → SceneProvider (FLUX.1-schnell)
//            Generates a complete editorial fashion scene with coordinated
//            complementary garments, styled background, and correct pose.
//
//   Stage 2: Generated scene (as model_image) → FASHN V1.6
//            Places the exact uploaded garment into the generated scene with
//            full segmentation accuracy. Garment fidelity is preserved.
//
// The Intelligence Engine's natural language prompt — composed by PromptComposer
// and available as intelligenceResult.prompt — is fully consumed here for the
// first time. The prompt drives the FLUX scene generation; FASHN delivers
// the product accuracy that text-to-image models cannot guarantee.
//
// FEATURE FLAG: This strategy is disabled by default.
//   Enable: HYBRID_RENDERING_ENABLED=true (environment variable)
//   The orchestrator checks RENDERING_CONFIG.hybrid.enabled via canHandle().
//
// Fallback behaviour:
//   If Stage 1 (FLUX) fails → the orchestrator catches the error and
//   falls back to StandardRenderingStrategy. Garment rendering never stops.
// ---------------------------------------------------------------------------

import { fal } from "@fal-ai/client";
import { logger } from "../../lib/logger";
import { RENDERING_CONFIG, FASHN_CONFIG, FASHN_PRIMARY_MODEL, FASHN_FALLBACK_MODEL } from "../rendering-config";
import { hashPrompt, type SceneCache } from "../scene-cache";
import type { SceneProvider } from "../scene-provider";
import type { RenderingStrategy } from "./rendering-strategy";
import type { OrchestratorContext, StrategyResult } from "../types";

// ---------------------------------------------------------------------------
// HybridRenderingStrategy
// ---------------------------------------------------------------------------

export class HybridRenderingStrategy implements RenderingStrategy {
  readonly name = "hybrid" as const;

  constructor(
    private readonly sceneProvider: SceneProvider,
    private readonly sceneCache: SceneCache,
  ) {}

  // ── canHandle ──────────────────────────────────────────────────────────────

  canHandle(context: OrchestratorContext): boolean {
    // Feature flag must be enabled AND the intelligence result must have a prompt
    if (!RENDERING_CONFIG.hybrid.enabled) return false;
    if (!context.intelligenceResult.prompt) return false;
    return true;
  }

  // ── execute ────────────────────────────────────────────────────────────────

  async execute(context: OrchestratorContext): Promise<StrategyResult> {
    const { renderId, garmentImageUrl, category } = context;
    const prompt = context.intelligenceResult.prompt;

    // ── Stage 1: Scene generation ────────────────────────────────────────────
    const promptHash = hashPrompt(prompt);

    logger.info(
      {
        renderId,
        strategy:    this.name,
        promptHash,
        provider:    this.sceneProvider.name,
        costEstimate: this.sceneProvider.costEstimate({ prompt }),
      },
      "Hybrid strategy: Stage 1 — scene generation",
    );

    // Check scene cache first
    const cached = this.sceneCache.get(promptHash);
    let sceneImageUrl: string;
    let fluxLatencyMs: number;
    let cacheHit: boolean;

    if (cached) {
      sceneImageUrl = cached.imageUrl;
      fluxLatencyMs = 0;
      cacheHit      = true;
      logger.info(
        { renderId, strategy: this.name, promptHash, cachedProvider: cached.provider },
        "Hybrid strategy: scene cache HIT — skipping FLUX generation",
      );
    } else {
      cacheHit = false;
      const sceneResult = await this.sceneProvider.generateScene({ prompt });
      sceneImageUrl = sceneResult.imageUrl;
      fluxLatencyMs = sceneResult.latencyMs;

      // Cache the generated scene for future identical prompts
      this.sceneCache.set(promptHash, {
        imageUrl:  sceneImageUrl,
        timestamp: Date.now(),
        provider:  sceneResult.provider,
        latencyMs: sceneResult.latencyMs,
      });

      logger.info(
        {
          renderId,
          strategy:  this.name,
          promptHash,
          fluxLatencyMs,
          cacheSize: this.sceneCache.size(),
        },
        "Hybrid strategy: scene cache MISS — generated and cached",
      );
    }

    // ── Stage 2: FASHN garment try-on using generated scene as model_image ──
    logger.info(
      { renderId, strategy: this.name, sceneImageUrl, garmentImageUrl, category },
      "Hybrid strategy: Stage 2 — FASHN garment placement",
    );

    const fashnStart = Date.now();
    let outputImageUrl: string | undefined;
    let fashnModelUsed  = FASHN_PRIMARY_MODEL;
    let fallbackReason: string | null = null;

    const falPayload = {
      model_image:        sceneImageUrl,   // FLUX-generated scene replaces static model image
      garment_image:      garmentImageUrl, // uploaded garment (BirefNet preprocessed)
      category,
      mode:               FASHN_CONFIG.mode,
      segmentation_free:  FASHN_CONFIG.segmentation_free,
      garment_photo_type: FASHN_CONFIG.garment_photo_type,
      output_format:      FASHN_CONFIG.output_format,
      num_samples:        FASHN_CONFIG.num_samples,
      ...(FASHN_CONFIG.seed !== undefined ? { seed: FASHN_CONFIG.seed } : {}),
    };

    logger.info(
      { renderId, strategy: this.name, payload: falPayload },
      "Hybrid strategy: calling FASHN V1.6",
    );

    try {
      const result = await fal.subscribe(FASHN_PRIMARY_MODEL, {
        input: falPayload,
        logs:  false,
      });

      outputImageUrl = this.extractImageUrl(result.data);
      logger.info(
        { renderId, strategy: this.name, outputImageUrl },
        "Hybrid strategy: FASHN V1.6 succeeded",
      );
    } catch (primaryError) {
      // Emergency fallback within Hybrid: try image-apps-v2 before returning error
      logger.warn(
        { renderId, strategy: this.name, primaryError },
        "Hybrid strategy: FASHN V1.6 failed — falling back to image-apps-v2",
      );

      fashnModelUsed = FASHN_FALLBACK_MODEL;
      fallbackReason  = "fashn_v1_6_failed_in_hybrid";

      const fallbackResult = await fal.subscribe(FASHN_FALLBACK_MODEL, {
        input: {
          person_image_url:   sceneImageUrl,
          clothing_image_url: garmentImageUrl,
          preserve_pose:      true,
        },
        logs: false,
      });

      outputImageUrl = this.extractImageUrl(fallbackResult.data);
      logger.info(
        { renderId, strategy: this.name, outputImageUrl },
        "Hybrid strategy: image-apps-v2 fallback succeeded",
      );
    }

    if (!outputImageUrl) {
      throw new Error(
        `HybridRenderingStrategy: no output image URL returned from FASHN (primary + fallback)`,
      );
    }

    const fashnLatencyMs = Date.now() - fashnStart;

    return {
      outputImageUrl,
      fashnModelUsed,
      fashnLatencyMs,
      fluxLatencyMs,
      cacheHit,
      promptHash,
      fallbackReason,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private extractImageUrl(data: unknown): string | undefined {
    const d = data as Record<string, unknown> | undefined;
    const candidates: unknown[] = [
      (d?.["images"] as Array<{ url: string }> | undefined)?.[0]?.url,
      (d?.["image"]  as { url?: string }       | undefined)?.url,
      d?.["image_url"],
      d?.["url"],
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.startsWith("http")) return c;
    }
    return undefined;
  }
}
