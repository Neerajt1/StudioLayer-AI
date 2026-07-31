---
name: SL-021 Creative Intelligence & AI Routing
description: Architecture and decisions from the Creative Director + AI Router sprint
---

# SL-021 Creative Intelligence & AI Routing

## New files added
- `src/intelligence/creative-director.ts` — action intelligence engine (Background/Camera/Pose/Styling)
- `src/router/task-types.ts` — TaskType enum + RouteDecision types
- `src/router/ai-router.ts` — classifyTask() + routeTask() — currently all → openrouter

## Key architectural decisions

### Creative Director replaces buildRefinementInstruction()
`buildCreativeBrief(refinementPrompt, profile)` in `creative-director.ts` now handles all refinement actions. The old `buildRefinementInstruction()` in `rendering.config.ts` is still present but is no longer called from `ai-pipeline.ts`. It can be removed in a future cleanup.

**Why:** The old function locked ALL elements (including pose and camera) regardless of what the user requested, making Improve Pose and Change Camera Angle physically unable to work.

### Per-shot prompts for editorial diversity
`PhotoshootInput.perShotPrompts?: string[]` added to the types chain. When `shots === 4` and no refinement, `buildEditorialShotPrompts()` generates 4 distinct shot briefs. The OpenRouterProvider uses `perShotPrompts[i]` per shot instead of the shared prompt.

**How to apply:** Only activated for `shots === 4` (Editorial) non-refinement renders. Hero (1) and Campaign (2) still share one prompt + rely on non-determinism.

### AI Router classifyTask() pattern
```typescript
classifyTask({ isRefinement: boolean, shots: number }) → TaskType
routeTask(taskType, renderId?) → RouteDecision
```
Both live in `src/router/ai-router.ts`. `ai-pipeline.ts` calls these before generating.

### Action type classification
The creative director classifies raw button text via keyword scoring:
- "Change Background" / "background" / "scene" → `change_background`
- "Change Camera Angle" / "camera" / "angle" → `change_camera`
- "Improve Pose" / "pose" / "posture" → `improve_pose`
- "Improve Styling" / "styling" / "accessories" → `improve_styling`
- Anything else → `custom` (original framing used)

### Garment replacement improvement
Added "COMPLETE GARMENT REPLACEMENT — CRITICAL FOR BOTTOMS" section to `garmentInstruction` in `rendering.config.ts`. Specifically calls out waistbands, trouser legs, cuffs as needing complete replacement (not compositing).

## What NOT to implement in this sprint (per spec)
- No new rendering providers — all tasks still route to OpenRouter
- No UI changes — all intelligence is server-side only
- No changes to credit system or Hero/Campaign/Editorial workflow
- Transparent PNG: architecture only (DownloadFormat type in task-types.ts), no implementation
