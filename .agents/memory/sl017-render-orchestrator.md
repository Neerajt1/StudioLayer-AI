---
name: SL-017 Render Orchestrator
description: Architecture decisions and extension points for the Render Orchestrator introduced in SL-017.
---

# SL-017 — Render Orchestrator Architecture

## The rule
**All rendering goes through `getOrchestrator().orchestrate(request)`.** Never add provider-specific code to `ai-pipeline.ts` or `renders.ts`. Add new strategies to `rendering/strategies/` and new providers to `rendering/providers/`.

**Why:** SL-017 separated rendering concerns so future capabilities (Hybrid, multi-garment, video, new AI providers) slot in as new files without touching the pipeline entry point or the Intelligence Engine.

## How to apply
- New AI provider → implement `SceneProvider` in `rendering/providers/`, register in `RenderOrchestrator` constructor.
- New rendering approach → implement `RenderingStrategy`, register in `this.strategies[]` in order of preference.
- Strategy selection order is priority-ordered: first `canHandle()` that returns true wins.

## Key design decisions

### Singleton orchestrator
`getOrchestrator()` returns a module-level singleton so `SceneCache` persists across requests. Cache is in-memory; a cold restart clears it.

### Hybrid strategy is feature-flagged
`HYBRID_RENDERING_ENABLED=true` env var required. Default `AUTO` mode resolves to Standard while Hybrid is unvalidated. No code change needed to graduate to Hybrid — flip the env var.

### FASHN_CONFIG moved to rendering-config.ts
Was in `ai-pipeline.ts` (SL-011A). Now canonical in `rendering/rendering-config.ts`. Both Standard and Hybrid strategies import from there.

### BirefNet and model selection live in the orchestrator
`prepareGarmentImage()` and `selectModelImage()` (4-branch SL-016 logic) are private methods of `RenderOrchestrator`. Strategies receive a fully-resolved `OrchestratorContext` — they never call the Intelligence Engine or do model selection.

### `ai-pipeline.ts` is intentionally thin (~40 lines)
It only maps `runAIPipeline()` params to `RenderingRequest` and calls `getOrchestrator().orchestrate()`. The `runAIPipeline()` signature is unchanged for backward compatibility with `renders.ts`.

## File map
```
rendering/
  types.ts                        — shared types + mapToFashnCategory()
  rendering-config.ts             — FASHN_CONFIG, RENDERING_CONFIG, feature flags
  scene-provider.ts               — SceneProvider interface
  scene-cache.ts                  — SceneCache (LRU, SHA-256 keyed)
  render-orchestrator.ts          — main orchestrator + singleton
  providers/flux-provider.ts      — FLUX.1-schnell via fal.ai
  strategies/rendering-strategy.ts — RenderingStrategy interface
  strategies/standard-strategy.ts — Standard (current production behavior)
  strategies/hybrid-strategy.ts   — Hybrid (FLUX → FASHN, feature-flagged)
  index.ts                        — barrel export
services/ai-pipeline.ts           — thin wrapper (~40 loc)
```
