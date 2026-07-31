// ---------------------------------------------------------------------------
// StudioLayer AI — AI Router
//
// The AI Router is the single decision point for provider selection.
// Every rendering request passes through this layer before reaching any
// AI model.
//
// PIPELINE:
//   User Action
//     ↓
//   StudioLayer Intelligence Engine  (creative-director.ts / decision-engine.ts)
//     ↓
//   Intent Analysis + Task Classification
//     ↓
//   AI Router  ← YOU ARE HERE
//     ↓
//   Selected Rendering Provider
//     ↓
//   Result
//
// DESIGN PRINCIPLES:
//   1. The frontend NEVER knows which provider executes a task.
//   2. Provider selection is an implementation detail — never leaked to UI.
//   3. Routing logic lives here and ONLY here.
//   4. To add a new provider: implement RenderingProvider, register it in
//      PROVIDER_REGISTRY, and add routing logic in classifyTask/routeTask.
//   5. To add a new task type: add it to TaskType (task-types.ts) and add
//      a routing rule in routeTask().
//
// CURRENT ROUTING TABLE (Sprint SL-021):
//   fashion_generation → openrouter
//   image_refinement   → openrouter
//   All future tasks   → openrouter (placeholder, will be specialised)
// ---------------------------------------------------------------------------

import { logger } from "../lib/logger";
import type { RouteDecision, TaskType } from "./task-types";

// ---------------------------------------------------------------------------
// Task classification — determines TaskType from request shape
// ---------------------------------------------------------------------------

/**
 * Classify a rendering request into a TaskType.
 *
 * @param params.isRefinement  True when the request includes a parentRenderId / refinementPrompt.
 * @param params.shots         Number of images requested.
 */
export function classifyTask(params: {
  isRefinement: boolean;
  shots: number;
}): TaskType {
  if (params.isRefinement) {
    return "image_refinement";
  }
  return "fashion_generation";
}

// ---------------------------------------------------------------------------
// Routing table — maps TaskType → RouteDecision
//
// FUTURE: replace hardcoded openrouter with dynamic provider selection
// based on task requirements, cost, latency, and provider availability.
// ---------------------------------------------------------------------------

const ROUTING_TABLE: Record<TaskType, Omit<RouteDecision, "taskType">> = {
  // Active tasks
  fashion_generation: {
    provider: "openrouter",
    supportsPerShotPrompts: true,
  },
  image_refinement: {
    provider: "openrouter",
    supportsPerShotPrompts: false,
  },

  // Future tasks — architecturally ready, provider TBD
  background_removal: {
    provider: "openrouter",   // TODO: route to birefnet when integrated
    supportsPerShotPrompts: false,
  },
  segmentation: {
    provider: "openrouter",   // TODO: route to segmentation specialist
    supportsPerShotPrompts: false,
  },
  upscaling: {
    provider: "openrouter",   // TODO: route to real_esrgan when integrated
    supportsPerShotPrompts: false,
  },
  face_restoration: {
    provider: "openrouter",   // TODO: route to codeformer when integrated
    supportsPerShotPrompts: false,
  },
};

// ---------------------------------------------------------------------------
// routeTask — public API
// ---------------------------------------------------------------------------

/**
 * Route a classified task to the appropriate provider.
 *
 * Currently all tasks route to OpenRouter.  In future versions this function
 * will select specialised providers based on task type, garment category,
 * required quality level, and provider availability.
 *
 * @param taskType  Classified task type from classifyTask().
 * @param renderId  For logging only — never influences routing.
 * @returns RouteDecision with provider and model selection.
 */
export function routeTask(taskType: TaskType, renderId?: number): RouteDecision {
  const routing = ROUTING_TABLE[taskType];

  const decision: RouteDecision = {
    taskType,
    ...routing,
  };

  logger.info(
    {
      renderId,
      taskType,
      provider: decision.provider,
      modelOverride: decision.modelOverride ?? "default",
      supportsPerShotPrompts: decision.supportsPerShotPrompts,
    },
    "AI Router: task routed to provider",
  );

  return decision;
}
