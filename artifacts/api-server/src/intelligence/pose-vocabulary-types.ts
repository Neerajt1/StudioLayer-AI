// ---------------------------------------------------------------------------
// StudioLayer AI — Pose Vocabulary Types (Phase 5B)
// ---------------------------------------------------------------------------

import type { GarmentCategory } from "./types";

export type ShootType = "hero" | "campaign" | "editorial";
export type PoseGenderPool = "universal" | "female" | "male";
export type PoseStance = "standing" | "sitting" | "movement";
export type PoseCameraAngle =
  | "front"
  | "three_quarter"
  | "profile"
  | "rear"
  | "dynamic"
  | "elevated";
export type PoseBodyOrientation = "front" | "three_quarter" | "profile" | "rear";
export type FabricMovementLevel = "none" | "subtle" | "moderate" | "dramatic";

export type PoseFamily =
  | "catalog_front_presentation"
  | "three_quarter_s_twist"
  | "contrapposto_weight_shift"
  | "cross_leg_stance_variation"
  | "walking_motion"
  | "turning_over_shoulder"
  | "gaze_away_candid_head"
  | "garment_interaction_dress_skirt"
  | "garment_interaction_jacket_blazer"
  | "pocket_hip_hand"
  | "arms_torso_editorial"
  | "hair_face_interaction"
  | "accessory_detail_gesture"
  | "leaning_environmental"
  | "seated"
  | "high_fashion_elevated_editorial"
  | "rear_back_presentation"
  | "profile_presentation"
  | "gaze_direction"
  | "hands_natural_position"
  | "torso_face_contrast"
  | "body_level_variation"
  | "ethnic_garment_interaction"
  | "portrait_presentation"
  | "prop_interaction";

export type PoseSelectionClass =
  | "signature"
  | "rotational"
  | "contextual"
  | "high_repetition_risk";

export type PoseBodyState =
  | "standing"
  | "walking"
  | "seated"
  | "perched"
  | "leaning"
  | "kneeling"
  | "crouching"
  | "floor_seated"
  | "reclining"
  | "transitional";

export type PosePreferredFraming =
  | "full_body"
  | "three_quarter_body"
  | "knee_up"
  | "waist_up"
  | "chest_up"
  | "portrait"
  | "close_up"
  | "garment_detail";

export type PoseEnergy =
  | "calm"
  | "elegant"
  | "relaxed"
  | "confident"
  | "joyful"
  | "playful"
  | "sophisticated"
  | "dynamic"
  | "editorial"
  | "contemplative"
  | "aspirational";

export type PoseExpression =
  | "neutral"
  | "soft_smile"
  | "confident"
  | "joyful"
  | "contemplative"
  | "editorial";

export type PoseMovementLevel = "static" | "dynamic" | "transitional";

export type PoseProp = "none" | "stool" | "chair" | "wall" | "step";

export type PoseCoveragePurpose =
  | "front"
  | "profile"
  | "rear"
  | "three_quarter"
  | "movement"
  | "portrait"
  | "detail"
  | "silhouette"
  | "garment_structure";

export interface PoseExposureFlags {
  heroEligible: boolean;
  campaignEligible: boolean;
  editorialEligible: boolean;
}

export interface PoseIntelligenceMetadata {
  poseFamily: PoseFamily;
  selectionClass: PoseSelectionClass;
  heroEligible: boolean;
  campaignEligible: boolean;
  editorialEligible: boolean;
  visualCluster?: string;
}

export interface PoseVocabularyMetadata {
  bodyState: PoseBodyState;
  bodyGeometry: string[];
  cameraRelationship: string;
  preferredFraming: PosePreferredFraming;
  energy: PoseEnergy;
  expression: PoseExpression;
  movement: PoseMovementLevel;
  interaction: string;
  prop: PoseProp;
  editorialIntensity: 1 | 2 | 3 | 4 | 5;
  coveragePurpose: PoseCoveragePurpose[];
  poseReferenceImage: string | null;
}

export interface PoseCatalogSpec {
  poseId?: string;
  active?: boolean;
  name: string;
  description: string;
  category: string;
  bodyState: PoseBodyState;
  bodyGeometry: readonly string[];
  cameraRelationship: string;
  preferredFraming: PosePreferredFraming;
  energy: PoseEnergy;
  expression: PoseExpression;
  movement: PoseMovementLevel;
  interaction: string;
  prop: PoseProp;
  editorialIntensity: 1 | 2 | 3 | 4 | 5;
  coveragePurpose: readonly PoseCoveragePurpose[];
  genderPool: PoseGenderPool;
  collections: readonly ShootType[];
  garmentCategories: GarmentCategory[] | "all";
  garmentTags: readonly string[];
  avoidForTags: readonly string[];
  poseFamily: PoseFamily;
  selectionClass: PoseSelectionClass;
  exposure: PoseExposureFlags;
  visualCluster?: string;
  stance: PoseStance;
  cameraAngle: PoseCameraAngle;
  bodyOrientation: PoseBodyOrientation;
  fabricMovement: FabricMovementLevel;
  accessoriesAllowed: boolean;
  requiresPockets: boolean;
  heroPriority: number;
  suitabilityScore: number;
  poseReferenceImage?: string | null;
}

export interface PoseDefinition extends PoseIntelligenceMetadata, PoseVocabularyMetadata {
  poseId?: string;
  active?: boolean;
  name: string;
  genderPool: PoseGenderPool;
  collections: ShootType[];
  garmentCategories: GarmentCategory[] | "all";
  garmentTags: string[];
  avoidForTags: string[];
  stance: PoseStance;
  cameraAngle: PoseCameraAngle;
  bodyOrientation: PoseBodyOrientation;
  fabricMovement: FabricMovementLevel;
  accessoriesAllowed: boolean;
  requiresPockets: boolean;
  heroPriority: number;
  suitabilityScore: number;
  description: string;
  category: string;
}

export const POSE_FAMILY_LABELS: Record<PoseFamily, string> = {
  catalog_front_presentation: "Catalog / Front Presentation",
  three_quarter_s_twist: "Three-Quarter / S-Twist",
  contrapposto_weight_shift: "Contrapposto / Weight Shift",
  cross_leg_stance_variation: "Cross-Leg / Stance Variation",
  walking_motion: "Walking / Motion",
  turning_over_shoulder: "Turning / Over-Shoulder",
  gaze_away_candid_head: "Gaze Away / Candid Head",
  garment_interaction_dress_skirt: "Garment Interaction — Dress/Skirt",
  garment_interaction_jacket_blazer: "Garment Interaction — Jacket/Blazer",
  pocket_hip_hand: "Pocket / Hip Hand",
  arms_torso_editorial: "Arms / Torso Editorial",
  hair_face_interaction: "Hair / Face Interaction",
  accessory_detail_gesture: "Accessory / Detail Gesture",
  leaning_environmental: "Leaning / Environmental",
  seated: "Seated",
  high_fashion_elevated_editorial: "High-Fashion / Elevated Editorial",
  rear_back_presentation: "Rear / Back Presentation",
  profile_presentation: "Profile Presentation",
  gaze_direction: "Gaze Direction",
  hands_natural_position: "Hands — Natural Position",
  torso_face_contrast: "Torso / Face Contrast",
  body_level_variation: "Body Level / Composition",
  ethnic_garment_interaction: "Ethnic Garment Interaction",
  portrait_presentation: "Portrait Presentation",
  prop_interaction: "Prop Interaction",
};

export const POSE_SELECTION_CLASS_LABELS: Record<PoseSelectionClass, string> = {
  signature: "A — Signature",
  rotational: "B — Rotational",
  contextual: "C — Contextual",
  high_repetition_risk: "D — High-Repetition-Risk",
};

export function buildPoseDefinition(spec: PoseCatalogSpec): PoseDefinition {
  return {
    poseId: spec.poseId,
    active: spec.active ?? true,
    name: spec.name,
    description: spec.description,
    category: spec.category,
    genderPool: spec.genderPool,
    collections: [...spec.collections],
    garmentCategories: spec.garmentCategories,
    garmentTags: [...spec.garmentTags],
    avoidForTags: [...spec.avoidForTags],
    stance: spec.stance,
    cameraAngle: spec.cameraAngle,
    bodyOrientation: spec.bodyOrientation,
    fabricMovement: spec.fabricMovement,
    accessoriesAllowed: spec.accessoriesAllowed,
    requiresPockets: spec.requiresPockets,
    heroPriority: spec.heroPriority,
    suitabilityScore: spec.suitabilityScore,
    poseFamily: spec.poseFamily,
    selectionClass: spec.selectionClass,
    heroEligible: spec.exposure.heroEligible,
    campaignEligible: spec.exposure.campaignEligible,
    editorialEligible: spec.exposure.editorialEligible,
    visualCluster: spec.visualCluster,
    bodyState: spec.bodyState,
    bodyGeometry: [...spec.bodyGeometry],
    cameraRelationship: spec.cameraRelationship,
    preferredFraming: spec.preferredFraming,
    energy: spec.energy,
    expression: spec.expression,
    movement: spec.movement,
    interaction: spec.interaction,
    prop: spec.prop,
    editorialIntensity: spec.editorialIntensity,
    coveragePurpose: [...spec.coveragePurpose],
    poseReferenceImage: spec.poseReferenceImage ?? null,
  };
}
