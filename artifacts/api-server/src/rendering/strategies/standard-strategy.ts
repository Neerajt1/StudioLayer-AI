// ---------------------------------------------------------------------------
// StudioLayer AI — Standard Rendering Strategy (SL-017, Part 3)
//
// Exactly reproduces the production rendering behaviour established in SL-016:
//   Intelligence Engine result + Base Model image → FASHN V1.6 → output
//
// This strategy is always available (canHandle returns true unconditionally).
// It is the last resort in the orchestrator's fallback chain — it must never
// fail silently. If FASHN V1.6 fails, it internally falls back to the
// image-apps-v2 virtual try-on model (SL-014 emergency fallback).
//
// DO NOT add FLUX or any external scene generation call here.
// Those belong in HybridRenderingStrategy and the provider layer.
// ---------------------------------------------------------------------------

import { fal } from "@fal-ai/client";
import { logger } from "../../lib/logger";
import {
  FASHN_CONFIG,
  FASHN_PRIMARY_MODEL,
  FASHN_FALLBACK_MODEL,
} from "../rendering-config";
import type { RenderingStrategy } from "./rendering-strategy";
import type { OrchestratorContext, StrategyResult } from "../types";

// ---------------------------------------------------------------------------
// StandardRenderingStrategy
// ---------------------------------------------------------------------------

export class StandardRenderingStrategy implements RenderingStrategy {
  readonly name = "standard" as const;

  // ── canHandle ──────────────────────────────────────────────────────────────

  canHandle(_context: OrchestratorContext): boolean {
    // Standard strategy is always available — it is the baseline that must
    // never be unavailable. The orchestrator relies on this guarantee.
    return true;
  }

  // ── execute ────────────────────────────────────────────────────────────────

  async execute(context: OrchestratorContext): Promise<StrategyResult> {
    const { renderId, garmentImageUrl, modelImageUrl, category } = context;
    const fashnStart = Date.now();

    // Build the V1.6 payload — official parameters only (SL-011A compliance).
    // All unsupported parameters remain absent:
    //   ✗ prompt / negative_prompt / denoise_strength
    //   ✗ fidelity_weight / cover_weight / restore_clothes
    const falPayload = {
      model_image:        modelImageUrl,
      garment_image:      garmentImageUrl,
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
      "Standard strategy: calling FASHN V1.6",
    );

    // ── Primary: fal-ai/fashn/tryon/v1.6 ──────────────────────────────────

    let outputImageUrl: string | undefined;
    let fashnModelUsed  = FASHN_PRIMARY_MODEL;
    let fallbackReason: string | null = null;

    try {
      const result = await fal.subscribe(FASHN_PRIMARY_MODEL, {
        input: falPayload,
        logs:  false,
      });

      outputImageUrl = this.extractImageUrl(result.data);
      logger.info(
        { renderId, strategy: this.name, outputImageUrl },
        "Standard strategy: FASHN V1.6 succeeded",
      );
    } catch (primaryError) {
      // ── Emergency fallback: fal-ai/image-apps-v2/virtual-try-on ──────────
      logger.warn(
        { renderId, strategy: this.name, primaryError },
        "Standard strategy: FASHN V1.6 failed — falling back to image-apps-v2/virtual-try-on",
      );

      fashnModelUsed = FASHN_FALLBACK_MODEL;
      fallbackReason  = "fashn_v1_6_failed";

      const fallbackResult = await fal.subscribe(FASHN_FALLBACK_MODEL, {
        input: {
          person_image_url:   modelImageUrl,
          clothing_image_url: garmentImageUrl,
          preserve_pose:      true,
        },
        logs: false,
      });

      outputImageUrl = this.extractImageUrl(fallbackResult.data);
      logger.info(
        { renderId, strategy: this.name, outputImageUrl },
        "Standard strategy: image-apps-v2 fallback succeeded",
      );
    }

    if (!outputImageUrl) {
      throw new Error(
        `StandardRenderingStrategy: no output image URL returned from either ${FASHN_PRIMARY_MODEL} or ${FASHN_FALLBACK_MODEL}`,
      );
    }

    const fashnLatencyMs = Date.now() - fashnStart;

    return {
      outputImageUrl,
      fashnModelUsed,
      fashnLatencyMs,
      fluxLatencyMs: null,
      cacheHit:      false,
      promptHash:    null,
      fallbackReason,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Defensive URL extraction from any fal.ai response shape. */
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
