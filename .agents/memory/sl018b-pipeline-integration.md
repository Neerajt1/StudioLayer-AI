---
name: SL-018B Pipeline Integration
description: How outfitStyle flows from frontend through all backend layers to PromptComposer; critical build step for api-zod types.
---

# SL-018B — Complete the Look Pipeline Integration

## The integration seam pattern

When adding a new field to the rendering pipeline, five files must be updated in order:

1. `lib/api-spec/openapi.yaml` — add the field to `RenderInput` schema
2. `lib/api-zod/src/generated/api.ts` — add to `CreateRenderBody` Zod schema
3. `lib/api-zod/src/generated/types/renderInput.ts` — add to TypeScript interface
4. **CRITICAL: run `cd lib/api-zod && npx tsc --build`** — the package emits to `dist/` and `api-server` reads compiled `.d.ts` files, not source. Without this rebuild, TypeScript sees stale types in `api-server`.
5. `rendering/types.ts` — add to `RenderingRequest`
6. `ai-pipeline.ts` — forward in params
7. `routes/renders.ts` — destructure from `parsed.data` and forward
8. `render-orchestrator.ts` — forward to `runIntelligenceAnalysis()`
9. `intelligence/decision-engine.ts` — consume in `IntelligenceParams`

## outfitStyle override contract

- **"none"** or absent → Intelligence Engine determines outfit (no override)
- Any other value (ai_recommended, formal, business_casual, casual, denim, streetwear, ethnic, sportswear) → `resolveOutfitOverride()` in `intelligence/outfit-style-override.ts` returns a `RecommendedOutfit` that replaces the KB/GPT result before `composeRenderPrompt()` is called.
- Override is applied in `decision-engine.ts` between steps 6 (outfit determination) and 8 (PromptComposer).
- The override is logged with `outfitOverrideApplied: true` and `completeTheLookStyle` in the intelligence log.

## Backend rule table

`intelligence/outfit-style-override.ts` — 72 rules covering:
- 3 placement groups (upper/lower/full) × 3 genders (mens/womens/kids) × 8 styles
- Placement derived from `garmentCategory`: tops/outerwear→upper, bottoms→lower, one-pieces/footwear/accessories→full
- Exact same outfit items as frontend `outfit-completion-engine.ts` (both must be kept in sync if items change)

## Pre-existing TS errors (do not fix)

`hybrid-strategy.ts:163` and `standard-strategy.ts:92` have `Type '"fal-ai/image-apps-v2/virtual-try-on"' is not assignable to type '"fal-ai/fashn/tryon/v1.6"'`. These are pre-existing fal.ai SDK type issues, not caused by SL-018B work. Do not touch them.

**Why:** fal-ai SDK types the `subscribe()` model param as a literal, making the fallback model string incompatible at compile time. Runtime behavior is correct — the fallback still fires.
