// ---------------------------------------------------------------------------
// StudioLayer AI — Rendering Layer Public API (SL-017)
//
// This is the single import point for the rendering layer.
// External code (ai-pipeline.ts, future route handlers) imports only from here.
// ---------------------------------------------------------------------------

// Primary orchestrator entry point
export { RenderOrchestrator, getOrchestrator } from "./render-orchestrator";

// Shared preprocessing utilities — used by orchestrator and OpenRouter pipeline
export { prepareGarmentImage, resolveModelImage, mapStyleModeToTemplate, isLocalIdentityImageUrl, loadStudioTalentImageAsDataUri } from "./preprocessing";
export type { ModelResolutionResult } from "./preprocessing";

// Image storage — base64 data-URI → Cloudflare R2 public HTTPS URL
export { uploadBase64Image } from "./image-storage";

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
