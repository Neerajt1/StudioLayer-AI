// ---------------------------------------------------------------------------
// StudioLayer AI — Temporary Internal Test Route for OpenRouter Integration
//
// Purpose (spec §11): validate authentication, image generation, and returned
// image URLs WITHOUT touching any existing pages or production renders.
//
// POST /api/test/openrouter-render
//
// Request body (all fields optional — defaults are provided for quick testing):
// {
//   "garmentImageUrl": "https://...",   // URL of the garment image
//   "modelImageUrl":   "https://...",   // URL of the model image
//   "prompt":          "...",           // Creative brief
//   "shots":           1               // 1 | 2 | 4 | 8  (default: 1)
// }
//
// Response:
// {
//   "ok": true,
//   "images": [{ "url": "...", "index": 0 }],
//   "durationMs": 4321,
//   "shotsRequested": 1,
//   "shotsGenerated": 1
// }
//
// This route is intentionally unauthenticated for ease of internal testing.
// Remove or gate it behind auth before any public release.
// ---------------------------------------------------------------------------

import { Router } from "express";
import { getRenderingEngine } from "../services/rendering/RenderingEngine.js";
import { logger } from "../lib/logger.js";
import type { ShotCount } from "../services/rendering/types.js";

const testOpenRouterRouter = Router();

// ---------------------------------------------------------------------------
// Test images — royalty-free reference garment and model for smoke-testing.
// These are used when the caller does not provide their own URLs.
// ---------------------------------------------------------------------------

const DEFAULT_GARMENT_URL =
  "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80"; // white t-shirt flat-lay
const DEFAULT_MODEL_URL =
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=80"; // male portrait

const VALID_SHOTS = new Set([1, 2, 4, 8]);

testOpenRouterRouter.post(
  "/test/openrouter-render",
  async (req, res): Promise<void> => {
    const body = req.body as Record<string, unknown> | undefined;

    const garmentImageUrl =
      typeof body?.["garmentImageUrl"] === "string"
        ? body["garmentImageUrl"]
        : DEFAULT_GARMENT_URL;

    const modelImageUrl =
      typeof body?.["modelImageUrl"] === "string"
        ? body["modelImageUrl"]
        : DEFAULT_MODEL_URL;

    const prompt =
      typeof body?.["prompt"] === "string"
        ? body["prompt"]
        : "A professional fashion editorial photograph. Clean studio background. Full-body shot.";

    const rawShots = Number(body?.["shots"] ?? 1);
    const shots: ShotCount = VALID_SHOTS.has(rawShots)
      ? (rawShots as ShotCount)
      : 1;

    logger.info(
      { garmentImageUrl, modelImageUrl, shots, promptPreview: prompt.slice(0, 80) },
      "test-openrouter: received request"
    );

    try {
      const engine = getRenderingEngine();
      const result = await engine.generatePhotoshoot({
        garmentImageUrl,
        modelImageUrl,
        prompt,
        shots,
      });

      res.json({
        ok: true,
        images: result.images,
        durationMs: result.durationMs,
        shotsRequested: shots,
        shotsGenerated: result.images.length,
        // Internal metadata included only in this test route
        _provider: result.provider,
        _model: result.model,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message }, "test-openrouter: generation failed");
      res.status(500).json({
        ok: false,
        error: message,
      });
    }
  }
);

export default testOpenRouterRouter;
