// ---------------------------------------------------------------------------
// StudioLayer AI — Rendering Layer Public API (SL-017)
//
// This is the single import point for the rendering layer.
// External code (ai-pipeline.ts, future route handlers) imports only from here.
// ---------------------------------------------------------------------------

// Primary orchestrator entry point
export { RenderOrchestrator, getOrchestrator } from "./render-orchestrator";

// Types needed by callers
export type {
  RenderingRequest,
  RenderingResult,
  RenderMode,
  OrchestratorContext,
  StrategyResult,
  FashnCategory,
} from "./types";

// Config — exported for diagnostic endpoints and admin panels
export { RENDERING_CONFIG, FASHN_CONFIG } from "./rendering-config";

// Provider interface — exported for future provider implementations
export type { SceneProvider, ProviderHealth, SceneGenerationInput, SceneGenerationResult } from "./scene-provider";

// Cache — exported for health/stats endpoints
export { SceneCache, hashPrompt } from "./scene-cache";
