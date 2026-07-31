---
name: SL-017 Render Orchestrator
description: Architecture of the rendering layer — how the main generate flow and the orchestrator relate after the SL-019 backend switch.
---

# Rendering Architecture (post SL-019)

## Main generate flow (POST /api/renders)

```
renders.ts → ai-pipeline.ts → preprocessing.ts (BirefNet + model resolution)
                             → intelligence/ (prompt composition)
                             → RenderingEngine.ts → OpenRouterProvider.ts
                             → image-storage.ts (base64 → fal CDN)
                             → onComplete(httpsUrl)
```

`ai-pipeline.ts` calls `getRenderingEngine()` (not `getOrchestrator()`). The Render Orchestrator is **not** in the main generate path.

## Render Orchestrator (render-orchestrator.ts)

Still exists and is fully functional. Its `orchestrate()` method uses the same `prepareGarmentImage` / `resolveModelImage` utilities from `preprocessing.ts`. It is reachable but not wired into `runAIPipeline`.

**Why:** The FASHN rendering backend was replaced with OpenRouter (Gemini image) because FASHN's documented behavior for `category="tops"` does not guarantee lower-body preservation.

## Shared utilities

- `src/rendering/preprocessing.ts` — `prepareGarmentImage()` (BirefNet) + `resolveModelImage()` (SL-016 4-branch model selection). Both the orchestrator and the OpenRouter pipeline use these.
- `src/rendering/image-storage.ts` — `uploadBase64Image()`: converts OpenRouter's base64 data-URI output to a fal CDN HTTPS URL before storing in the DB.

## How to apply

- New rendering strategies or providers belong in `src/services/rendering/` (OpenRouter layer) or `src/rendering/strategies/` (FASHN/Hybrid layer).
- `preprocessing.ts` utilities are safe to call from any pipeline entry point.
- If re-wiring the orchestrator back into the main flow, update `ai-pipeline.ts` to call `getOrchestrator().orchestrate()` and remove the OpenRouter calls.
