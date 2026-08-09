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
  buildShotPromptsWithPlan,
  CANONICAL_CAMERA_ANGLES,
  CANONICAL_POSES,
} from "./creative-director";
export type { ActionType, CreativeBrief, CameraAngle, PoseName } from "./creative-director";

export {
  selectPosesForShoot,
  selectPosesWithPlan,
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
  planPosesForShoot,
  defaultShotCountForShootType,
  POSE_PLANNER_TUNING,
} from "./pose-planner";
export type { PosePlannerContext, PlannedPose, PosePlanResult } from "./pose-planner";
export {
  isPoseDevLoggingEnabled,
  getPoseCollectionCode,
  logPoseSelectionDevReport,
} from "./pose-selection-dev-log";
export type { PoseSelectionDevReport, PoseSelectionDevEntry } from "./pose-selection-dev-log";
export type { ShootType, PoseFamily, PoseSelectionClass, PoseIntelligenceMetadata } from "./pose-library";

export {
  HERO_COLLECTION,
  CAMPAIGN_COLLECTION,
  EDITORIAL_COLLECTION,
  POSE_INTELLIGENCE_METADATA,
  POSE_FAMILY_LABELS,
  POSE_SELECTION_CLASS_LABELS,
  getPoseIntelligenceMetadata,
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

export {
  isBarefootAppropriateContext,
  resolveFootwearStyling,
  buildFootwearStylingPrompt,
  buildFootwearBatchConsistencyRules,
} from "./footwear-intelligence";
export type { FootwearStylingMode, FootwearStylingResolution } from "./footwear-intelligence";

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
