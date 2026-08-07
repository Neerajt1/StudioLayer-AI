// ---------------------------------------------------------------------------
// StudioLayer AI — Intelligence Layer Public API (SL-013A / SL-014)
//
// This is the single entry point for all intelligence functionality.
// The rendering pipeline imports only from this barrel — never from individual
// submodules directly.
// ---------------------------------------------------------------------------

export { runIntelligenceAnalysis } from "./decision-engine";
export type { IntelligenceParams, IntelligenceResult } from "./decision-engine";

export {
  buildCreativeBrief,
  buildEditorialShotPrompts,
  buildCampaignShotPrompts,
  buildHeroShotPrompt,
  buildShotPrompts,
  CANONICAL_CAMERA_ANGLES,
  CANONICAL_POSES,
} from "./creative-director";
export type { ActionType, CreativeBrief, CameraAngle, PoseName } from "./creative-director";

export {
  selectPosesForShoot,
  selectNextPose,
  imageCountToShootType,
  garmentHasUsablePockets,
  inferGarmentTags,
  resolveModelGender,
  buildPoseProfileKey,
  POSE_SELECTION_TUNING,
} from "./pose-selection-engine";
export type { PoseSelectionContext, ModelGender, RecentPoseSelection } from "./pose-selection-engine";
export {
  isPoseDevLoggingEnabled,
  getPoseCollectionCode,
  logPoseSelectionDevReport,
} from "./pose-selection-dev-log";
export type { PoseSelectionDevReport, PoseSelectionDevEntry } from "./pose-selection-dev-log";
export type { ShootType } from "./pose-library";

export {
  HERO_COLLECTION,
  CAMPAIGN_COLLECTION,
  EDITORIAL_COLLECTION,
} from "./pose-library";

export {
  applyGarmentIntelligence,
  applyGarmentLengthSelection,
  buildGarmentIntelligencePrompt,
  buildGarmentPreservationPrompt,
  buildGarmentConsistencyRules,
  formatGarmentLengthLabel,
  resolveFabricBehaviourClass,
} from "./garment-intelligence";
export type { GarmentLengthSelection, FabricBehaviourClass } from "./garment-intelligence";

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
