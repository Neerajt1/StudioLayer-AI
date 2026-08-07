// ---------------------------------------------------------------------------
// StudioLayer AI — OpenRouter Rendering Service — RenderingEngine
//
// The sole public entry-point for this rendering layer.
// The UI (and any future callers) MUST interact only with this class.
//
// Architecture (spec §2 & §6):
//
//   Caller
//     ↓  generatePhotoshoot()
//   RenderingEngine
//     ↓
//   RenderingProvider  (currently: OpenRouterProvider)
//     ↓
//   OpenRouter API
//
// Swapping providers requires only changing the provider instantiated below.
// ---------------------------------------------------------------------------

import { logger } from "../../lib/logger.js";
import { OPENROUTER_RENDERING_CONFIG } from "./rendering.config.js";
import { OpenRouterProvider } from "./providers/OpenRouterProvider.js";
import type {
  PhotoshootInput,
  PhotoshootResult,
  RenderingProvider,
  ShotCount,
} from "./types.js";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_SHOT_COUNTS: ReadonlySet<number> = new Set([1, 2, 4, 8]);

function assertValidShots(shots: number): asserts shots is ShotCount {
  if (!VALID_SHOT_COUNTS.has(shots)) {
    throw new Error(
      `RenderingEngine: invalid shot count ${shots}. Must be 1, 2, 4, or 8.`
    );
  }
}

// ---------------------------------------------------------------------------
// RenderingEngine
// ---------------------------------------------------------------------------

export class RenderingEngine {
  private readonly provider: RenderingProvider;

  constructor(provider?: RenderingProvider) {
    // Default to OpenRouterProvider.  A different provider can be injected
    // for testing or future multi-provider expansion.
    this.provider = provider ?? new OpenRouterProvider();
  }

  /**
   * Generate a fashion photoshoot.
   *
   * @param input  Garment image, model image, creative prompt, and shot count.
   * @returns      Array of generated images with provider/model/timing metadata.
   *
   * The engine:
   *   1. Validates shot count (must be 1 | 2 | 4 | 8)
   *   2. Appends the fixed quality suffix to the user prompt (spec §8)
   *   3. Delegates to the active provider
   *   4. Returns a structured result — provider name and model are included
   *      in the result object but must NEVER be surfaced in the UI (spec §10)
   */
  async generatePhotoshoot(input: PhotoshootInput): Promise<PhotoshootResult> {
    const { garmentImageUrl, modelImageUrl, prompt, shots } = input;

    assertValidShots(shots);

    // The garmentInstruction in rendering.config.ts is the authoritative
    // generation instruction — it fully describes the virtual try-on task,
    // garment preservation, realism (Batch 19), and white studio background
    // standard (Batch 20). Future background modules resolve via rendering-background.ts.
    // Any caller-supplied prompt is forwarded as optional additional creative
    // context (e.g. location, mood) appended after the instruction + images.
    const finalPrompt = prompt.trim();

    logger.info(
      {
        provider: this.provider.name,
        model: this.provider.model,
        shots,
        promptLength: finalPrompt.length,
      },
      "RenderingEngine: generatePhotoshoot started"
    );

    const t0 = Date.now();

    const images = await this.provider.generate({
      garmentImageUrl,
      modelImageUrl,
      prompt: finalPrompt,
      shots,
      perShotPrompts: input.perShotPrompts,
      previousOutputUrl: input.previousOutputUrl,
      refinementInstruction: input.refinementInstruction,
      pipelineTrace: input.pipelineTrace,
    });

    const durationMs = Date.now() - t0;

    logger.info(
      {
        provider: this.provider.name,
        model: this.provider.model,
        shots,
        imagesReturned: images.length,
        durationMs,
      },
      "RenderingEngine: generatePhotoshoot complete"
    );

    return {
      images,
      provider: this.provider.name,   // internal metadata — not for UI
      model: this.provider.model,     // internal metadata — not for UI
      durationMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor — preferred import for routes and services.
// Lazy-initialised so the missing-key error surfaces at request time,
// not at module load time (safe for cold-start).
// ---------------------------------------------------------------------------

let _engine: RenderingEngine | undefined;

export function getRenderingEngine(): RenderingEngine {
  if (!_engine) _engine = new RenderingEngine();
  return _engine;
}
