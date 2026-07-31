// ---------------------------------------------------------------------------
// StudioLayer AI — Intelligence Layer Public API (SL-013A / SL-014)
//
// This is the single entry point for all intelligence functionality.
// The rendering engine imports only from this barrel — never from individual
// submodules directly.
// ---------------------------------------------------------------------------

export { runIntelligenceAnalysis } from "./decision-engine";
export type { IntelligenceParams, IntelligenceResult } from "./decision-engine";

export { buildCreativeBrief, buildEditorialShotPrompts, CANONICAL_CAMERA_ANGLES } from "./creative-director";
export type { ActionType, CreativeBrief, CameraAngle } from "./creative-director";

export { composeRenderPrompt }      from "./prompt-composer";
export type { PromptComposerParams } from "./prompt-composer";

export { analyzeGarment }           from "./garment-analyzer";
export { FashionKnowledgeBase }     from "./fashion-knowledge-base";
export { selectStyleMode, describeStyleMode } from "./style-engine";
export { getCompletionPlan }        from "./wardrobe-completion";

export type {
  GarmentProfile,
  GarmentCategory,
  OutfitRecommendation,
  RecommendedOutfit,
  StyleMode,
  KnowledgeBase,
  KBRule,
} from "./types";
