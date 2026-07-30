// ---------------------------------------------------------------------------
// StudioLayer AI — Intelligence Layer Public API (SL-013A)
//
// This is the single entry point for all intelligence functionality.
// The rendering engine consumes only this export — it never imports
// individual modules directly.
// ---------------------------------------------------------------------------

export { runIntelligenceAnalysis } from "./decision-engine";
export type { IntelligenceParams }  from "./decision-engine";

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
