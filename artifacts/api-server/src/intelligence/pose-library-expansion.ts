// ---------------------------------------------------------------------------
// Pose Library Expansion — Phase 2
// 34 genuinely distinct pose concepts filling editorial visual-language gaps.
// Merged into pose-library.ts at build time — no imports from pose-library.
// ---------------------------------------------------------------------------

import type { GarmentCategory } from "./types";

type ShootType = "hero" | "campaign" | "editorial";
type PoseGenderPool = "universal" | "female" | "male";
type PoseStance = "standing" | "sitting" | "movement";
type PoseCameraAngle =
  | "front"
  | "three_quarter"
  | "profile"
  | "rear"
  | "dynamic"
  | "elevated";
type PoseBodyOrientation = "front" | "three_quarter" | "profile" | "rear";
type FabricMovementLevel = "none" | "subtle" | "moderate" | "dramatic";

type PoseFamily =
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
  | "ethnic_garment_interaction";

type PoseSelectionClass =
  | "signature"
  | "rotational"
  | "contextual"
  | "high_repetition_risk";

interface PoseIntelligenceMetadata {
  poseFamily: PoseFamily;
  selectionClass: PoseSelectionClass;
  heroEligible: boolean;
  campaignEligible: boolean;
  editorialEligible: boolean;
}

interface PoseDefinitionCore {
  name: PoseExpansionName;
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
}

export const POSE_EXPANSION_NAMES = [
  // Seated / body level
  "Seated on Stool",
  "Cross-Leg Seated",
  "Asymmetric Seated Editorial",
  "Floor Editorial Seated",
  "Chair Seated Three-Quarter",
  "Stair Seated Editorial",
  // Profile / head turn
  "Full Profile Standing",
  "Strong Head Turn Profile",
  "Profile Walk Past",
  "Static Back Presentation",
  // Gaze direction
  "Upward Gaze Editorial",
  "Downward Gaze Contemplative",
  "Chin Lift Gaze Away",
  // Natural hands
  "Hands Clasped Front",
  "Hands Behind Back",
  "One Hand on Opposite Elbow",
  "Relaxed Hands at Side",
  "Natural Hand on Thigh",
  // Torso / face contrast
  "Torso Forward Face Turned",
  "Shoulders Back Face Soft",
  "Upper Body Lean Lower Body Still",
  // Body level / composition
  "Low Angle Power Stance",
  "Elevated Three-Quarter Crop",
  "Kneeling Editorial",
  "Crouched Fashion Pose",
  // Relaxed editorial
  "Relaxed Editorial Lounge",
  "Soft Editorial Pause",
  "Candid Mid-Laugh Editorial",
  // Ethnic / garment-specific
  "Saree Pallu Drape Hold",
  "Dupatta Flow Hold",
  "Open Coat Front Presentation",
  // Motion without hair
  "Pivot Stop Motion",
  "Step Down Editorial",
  "Walk Past Camera",
] as const;

export type PoseExpansionName = (typeof POSE_EXPANSION_NAMES)[number];

export const POSE_EXPANSION_HERO: readonly PoseExpansionName[] = [
  "Relaxed Hands at Side",
  "Hands Clasped Front",
  "Full Profile Standing",
  "Open Coat Front Presentation",
] as const;

export const POSE_EXPANSION_CAMPAIGN: readonly PoseExpansionName[] = [
  "Seated on Stool",
  "Cross-Leg Seated",
  "Chair Seated Three-Quarter",
  "Full Profile Standing",
  "Strong Head Turn Profile",
  "Static Back Presentation",
  "Downward Gaze Contemplative",
  "Chin Lift Gaze Away",
  "Hands Clasped Front",
  "Hands Behind Back",
  "One Hand on Opposite Elbow",
  "Relaxed Hands at Side",
  "Natural Hand on Thigh",
  "Shoulders Back Face Soft",
  "Soft Editorial Pause",
  "Saree Pallu Drape Hold",
  "Open Coat Front Presentation",
  "Pivot Stop Motion",
  "Walk Past Camera",
] as const;

export const POSE_EXPANSION_EDITORIAL: readonly PoseExpansionName[] = [
  "Seated on Stool",
  "Cross-Leg Seated",
  "Asymmetric Seated Editorial",
  "Floor Editorial Seated",
  "Chair Seated Three-Quarter",
  "Stair Seated Editorial",
  "Full Profile Standing",
  "Strong Head Turn Profile",
  "Profile Walk Past",
  "Static Back Presentation",
  "Upward Gaze Editorial",
  "Downward Gaze Contemplative",
  "Chin Lift Gaze Away",
  "Hands Behind Back",
  "One Hand on Opposite Elbow",
  "Natural Hand on Thigh",
  "Torso Forward Face Turned",
  "Shoulders Back Face Soft",
  "Upper Body Lean Lower Body Still",
  "Low Angle Power Stance",
  "Elevated Three-Quarter Crop",
  "Kneeling Editorial",
  "Crouched Fashion Pose",
  "Relaxed Editorial Lounge",
  "Soft Editorial Pause",
  "Candid Mid-Laugh Editorial",
  "Saree Pallu Drape Hold",
  "Dupatta Flow Hold",
  "Open Coat Front Presentation",
  "Pivot Stop Motion",
  "Step Down Editorial",
  "Walk Past Camera",
] as const;

function meta(
  poseFamily: PoseFamily,
  selectionClass: PoseSelectionClass,
  hero: boolean,
  campaign: boolean,
  editorial: boolean,
): PoseIntelligenceMetadata {
  return {
    poseFamily,
    selectionClass,
    heroEligible: hero,
    campaignEligible: campaign,
    editorialEligible: editorial,
  };
}

export const POSE_EXPANSION_INTELLIGENCE: Record<PoseExpansionName, PoseIntelligenceMetadata> = {
  "Seated on Stool": meta("seated", "contextual", false, true, true),
  "Cross-Leg Seated": meta("seated", "contextual", false, true, true),
  "Asymmetric Seated Editorial": meta("seated", "rotational", false, false, true),
  "Floor Editorial Seated": meta("seated", "contextual", false, false, true),
  "Chair Seated Three-Quarter": meta("seated", "rotational", false, true, true),
  "Stair Seated Editorial": meta("body_level_variation", "contextual", false, false, true),
  "Full Profile Standing": meta("profile_presentation", "signature", true, true, true),
  "Strong Head Turn Profile": meta("profile_presentation", "rotational", false, true, true),
  "Profile Walk Past": meta("profile_presentation", "rotational", false, false, true),
  "Static Back Presentation": meta("rear_back_presentation", "rotational", false, true, true),
  "Upward Gaze Editorial": meta("gaze_direction", "contextual", false, false, true),
  "Downward Gaze Contemplative": meta("gaze_direction", "rotational", false, true, true),
  "Chin Lift Gaze Away": meta("gaze_direction", "rotational", false, true, true),
  "Hands Clasped Front": meta("hands_natural_position", "rotational", true, true, false),
  "Hands Behind Back": meta("hands_natural_position", "contextual", false, true, true),
  "One Hand on Opposite Elbow": meta("hands_natural_position", "contextual", false, true, true),
  "Relaxed Hands at Side": meta("hands_natural_position", "rotational", true, true, false),
  "Natural Hand on Thigh": meta("hands_natural_position", "contextual", false, true, true),
  "Torso Forward Face Turned": meta("torso_face_contrast", "contextual", false, false, true),
  "Shoulders Back Face Soft": meta("torso_face_contrast", "rotational", false, true, true),
  "Upper Body Lean Lower Body Still": meta("torso_face_contrast", "contextual", false, false, true),
  "Low Angle Power Stance": meta("body_level_variation", "contextual", false, false, true),
  "Elevated Three-Quarter Crop": meta("body_level_variation", "rotational", false, false, true),
  "Kneeling Editorial": meta("body_level_variation", "contextual", false, false, true),
  "Crouched Fashion Pose": meta("body_level_variation", "contextual", false, false, true),
  "Relaxed Editorial Lounge": meta("high_fashion_elevated_editorial", "rotational", false, false, true),
  "Soft Editorial Pause": meta("high_fashion_elevated_editorial", "rotational", false, true, true),
  "Candid Mid-Laugh Editorial": meta("high_fashion_elevated_editorial", "contextual", false, false, true),
  "Saree Pallu Drape Hold": meta("ethnic_garment_interaction", "contextual", false, true, true),
  "Dupatta Flow Hold": meta("ethnic_garment_interaction", "contextual", false, false, true),
  "Open Coat Front Presentation": meta("garment_interaction_jacket_blazer", "signature", true, true, true),
  "Pivot Stop Motion": meta("walking_motion", "rotational", false, true, true),
  "Step Down Editorial": meta("walking_motion", "contextual", false, false, true),
  "Walk Past Camera": meta("walking_motion", "rotational", false, true, true),
};

export const POSE_EXPANSION_DEFINITIONS: Record<PoseExpansionName, PoseDefinitionCore> = {
  "Seated on Stool": {
    name: "Seated on Stool",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "lifestyle"],
    avoidForTags: ["sportswear"],
    stance: "sitting",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model seated on a simple studio stool — upright posture, feet on floor or one foot slightly forward. Three-quarter camera angle. Garment drape and seated silhouette fully visible. Clean editorial commercial energy.",
  },
  "Cross-Leg Seated": {
    name: "Cross-Leg Seated",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "casual", "lifestyle"],
    avoidForTags: ["business"],
    stance: "sitting",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model seated with legs crossed at the ankle or knee — relaxed but composed editorial posture. Hands resting naturally on lap or beside the body. Full garment visible from seated perspective.",
  },
  "Asymmetric Seated Editorial": {
    name: "Asymmetric Seated Editorial",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "high_fashion"],
    avoidForTags: [],
    stance: "sitting",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model seated with deliberately asymmetric posture — one knee raised, torso angled, weight off-centre. High-fashion editorial composition. Garment folds and asymmetry create visual interest without obscuring the product.",
  },
  "Floor Editorial Seated": {
    name: "Floor Editorial Seated",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "high_fashion", "flowing"],
    avoidForTags: ["business"],
    stance: "sitting",
    cameraAngle: "elevated",
    bodyOrientation: "three_quarter",
    fabricMovement: "moderate",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 7,
    description:
      "Model seated on the studio floor — legs extended, folded, or tucked to one side. Elevated camera angle captures full garment spread on the floor plane. Relaxed high-fashion editorial mood.",
  },
  "Chair Seated Three-Quarter": {
    name: "Chair Seated Three-Quarter",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "lifestyle", "formal"],
    avoidForTags: [],
    stance: "sitting",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model seated on a chair, body turned three-quarters to camera. One arm on the chair back or armrest, the other relaxed. Premium lifestyle editorial — garment silhouette clear in seated three-quarter view.",
  },
  "Stair Seated Editorial": {
    name: "Stair Seated Editorial",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "high_fashion", "lifestyle"],
    avoidForTags: ["sportswear"],
    stance: "sitting",
    cameraAngle: "dynamic",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 7,
    description:
      "Model seated on studio steps or stairs — body at a different vertical level than standing poses. Legs positioned on steps create depth. Editorial composition with varied body level and strong garment visibility.",
  },
  "Full Profile Standing": {
    name: "Full Profile Standing",
    genderPool: "universal",
    collections: ["hero", "campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["catalog", "silhouette", "editorial"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "profile",
    bodyOrientation: "profile",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 70,
    suitabilityScore: 9,
    description:
      "Model standing in clean full side profile — body perpendicular to camera, head in neutral profile alignment. Pure silhouette presentation. Garment side seam, length, and profile construction fully visible.",
  },
  "Strong Head Turn Profile": {
    name: "Strong Head Turn Profile",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "three_quarter"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "profile",
    bodyOrientation: "profile",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model in profile stance with a strong head turn — body in side profile, head rotated toward or away from camera creating dynamic neck and jawline tension. Garment profile silhouette remains primary.",
  },
  "Profile Walk Past": {
    name: "Profile Walk Past",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "movement"],
    avoidForTags: [],
    stance: "movement",
    cameraAngle: "profile",
    bodyOrientation: "profile",
    fabricMovement: "moderate",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model walking past camera in clean side profile — mid-stride, natural walking motion captured perpendicular to lens. Garment side silhouette and movement visible. Dynamic editorial without frontal repetition.",
  },
  "Static Back Presentation": {
    name: "Static Back Presentation",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["catalog", "silhouette", "editorial"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "rear",
    bodyOrientation: "rear",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model standing with back to camera — static rear presentation. Head may be neutral or slightly turned. Full back construction, hemline, and rear silhouette of garment clearly visible.",
  },
  "Upward Gaze Editorial": {
    name: "Upward Gaze Editorial",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "high_fashion", "magazine"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model standing with eyes directed upward — chin slightly lifted, gaze above camera line. Dreamy, aspirational editorial mood. Body in composed three-quarter stance. Garment remains central; expression adds editorial depth.",
  },
  "Downward Gaze Contemplative": {
    name: "Downward Gaze Contemplative",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "lifestyle"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model with gaze directed downward — contemplative, introspective editorial mood. Eyes lowered naturally, not closed. Soft three-quarter body stance. Candid, thoughtful fashion moment.",
  },
  "Chin Lift Gaze Away": {
    name: "Chin Lift Gaze Away",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "luxury"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model with chin lifted and gaze directed away from camera — confident, aloof editorial presence. Neck elongated, shoulders relaxed. Three-quarter body angle. Distinct from hair-touch poses — no hand-to-hair gesture.",
  },
  "Hands Clasped Front": {
    name: "Hands Clasped Front",
    genderPool: "universal",
    collections: ["hero", "campaign"],
    garmentCategories: "all",
    garmentTags: ["catalog", "formal", "minimal"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 75,
    suitabilityScore: 9,
    description:
      "Model standing front-facing with hands gently clasped in front — fingers interlaced or one hand over the other at waist level. Composed, minimal catalog presentation. Garment front fully unobstructed.",
  },
  "Hands Behind Back": {
    name: "Hands Behind Back",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "formal"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model standing with both hands clasped or resting behind the back — open, unobstructed garment front. Upright posture, confident editorial poise. Clean front presentation with natural hand placement.",
  },
  "One Hand on Opposite Elbow": {
    name: "One Hand on Opposite Elbow",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "casual", "lifestyle"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model standing with one hand resting on the opposite elbow — casual, relaxed editorial gesture. Creates natural arm geometry without obscuring garment front. Three-quarter body angle.",
  },
  "Relaxed Hands at Side": {
    name: "Relaxed Hands at Side",
    genderPool: "universal",
    collections: ["hero", "campaign"],
    garmentCategories: "all",
    garmentTags: ["catalog", "casual", "everyday"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 88,
    suitabilityScore: 9,
    description:
      "Model standing naturally with both arms relaxed at sides — fingers loose, shoulders down. Pure catalog clarity with zero hand distraction. Maximum garment front visibility.",
  },
  "Natural Hand on Thigh": {
    name: "Natural Hand on Thigh",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "casual", "lifestyle"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 7,
    description:
      "Model standing with one hand resting naturally on the upper thigh or hip — relaxed, grounded editorial gesture. Weight slightly shifted. Garment front and side visible.",
  },
  "Torso Forward Face Turned": {
    name: "Torso Forward Face Turned",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "high_fashion"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model with torso facing camera while head is turned to the side — deliberate torso/face contrast. Creates editorial tension between body and gaze direction. Garment front construction visible.",
  },
  "Shoulders Back Face Soft": {
    name: "Shoulders Back Face Soft",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "luxury"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model with shoulders pulled back, chest open, face in soft three-quarter turn — elegant posture contrast. Neck elongated, garment drape enhanced by open shoulder line.",
  },
  "Upper Body Lean Lower Body Still": {
    name: "Upper Body Lean Lower Body Still",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "high_fashion"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 7,
    description:
      "Model with upper body leaning slightly forward or to one side while lower body remains planted — dynamic torso/leg contrast. Editorial asymmetry without full movement.",
  },
  "Low Angle Power Stance": {
    name: "Low Angle Power Stance",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "high_fashion", "statement"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "dynamic",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model in a strong standing stance photographed from a slightly low camera angle — legs apart, posture commanding. Heroic, powerful editorial framing. Full garment visible from low perspective.",
  },
  "Elevated Three-Quarter Crop": {
    name: "Elevated Three-Quarter Crop",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "high_fashion", "magazine"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "elevated",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model in three-quarter stance captured from slightly elevated camera angle — looking down toward subject. Magazine-style editorial crop potential. Garment top and silhouette emphasized.",
  },
  "Kneeling Editorial": {
    name: "Kneeling Editorial",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "high_fashion", "flowing"],
    avoidForTags: ["business"],
    stance: "sitting",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "moderate",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 7,
    description:
      "Model kneeling on one or both knees — upright torso, editorial poise at a lower body level. Garment drape around knees and floor contact visible. Distinct from standing catalogue poses.",
  },
  "Crouched Fashion Pose": {
    name: "Crouched Fashion Pose",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: ["bottoms", "one-pieces", "tops"],
    garmentTags: ["editorial", "street", "high_fashion"],
    avoidForTags: ["gown", "formal_dress"],
    stance: "sitting",
    cameraAngle: "dynamic",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 7,
    description:
      "Model in a controlled crouch — balanced, fashion-directed, not casual. Low body level creates strong compositional contrast. Garment folds and fit visible at compressed posture.",
  },
  "Relaxed Editorial Lounge": {
    name: "Relaxed Editorial Lounge",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "lifestyle", "luxury"],
    avoidForTags: ["business"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model in a relaxed, lounge-like editorial stance — weight sunk into one hip, shoulders soft, effortless luxury energy. Not rigid catalog posture. Natural, approachable high-fashion mood.",
  },
  "Soft Editorial Pause": {
    name: "Soft Editorial Pause",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "lifestyle"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model caught in a soft pause between movements — weight neutral, expression calm, hands in natural resting position. Candid editorial stillness. Garment clearly visible.",
  },
  "Candid Mid-Laugh Editorial": {
    name: "Candid Mid-Laugh Editorial",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "lifestyle", "magazine"],
    avoidForTags: ["formal"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 7,
    description:
      "Model in a candid moment of genuine expression — mid-laugh or soft smile with natural body language. Lifestyle editorial authenticity. Garment remains the styled focal point.",
  },
  "Saree Pallu Drape Hold": {
    name: "Saree Pallu Drape Hold",
    genderPool: "female",
    collections: ["campaign", "editorial"],
    garmentCategories: ["one-pieces", "tops"],
    garmentTags: ["saree"],
    avoidForTags: ["jeans", "sportswear", "gown", "formal_dress"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "moderate",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model gracefully holding the pallu or drape of ethnic wear — fabric gathered lightly in one hand, drape flowing naturally. Showcases garment textile, border, and traditional silhouette with editorial poise.",
  },
  "Dupatta Flow Hold": {
    name: "Dupatta Flow Hold",
    genderPool: "female",
    collections: ["editorial"],
    garmentCategories: ["one-pieces", "tops"],
    garmentTags: ["dupatta"],
    avoidForTags: ["jeans", "sportswear", "gown", "formal_dress"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "moderate",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 7,
    description:
      "Model holding dupatta or scarf fabric lightly — allowing natural flow and movement. Ethnic or Indo-western editorial styling. Fabric transparency and drape visible.",
  },
  "Open Coat Front Presentation": {
    name: "Open Coat Front Presentation",
    genderPool: "universal",
    collections: ["hero", "campaign", "editorial"],
    garmentCategories: ["outerwear"],
    garmentTags: ["blazer", "jacket", "coat"],
    avoidForTags: ["dress"],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 72,
    suitabilityScore: 9,
    description:
      "Model standing with coat, blazer, or jacket worn open — front panels apart, inner layer and lapel construction visible. Hands at sides or lightly holding lapels. Showcases outerwear fit and layering.",
  },
  "Pivot Stop Motion": {
    name: "Pivot Stop Motion",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["movement", "editorial"],
    avoidForTags: [],
    stance: "movement",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "moderate",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model captured mid-pivot — body rotating from one direction to another, frozen at the turn. Dynamic motion without walking repetition. Garment swing and silhouette visible.",
  },
  "Step Down Editorial": {
    name: "Step Down Editorial",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["movement", "editorial", "flowing"],
    avoidForTags: [],
    stance: "movement",
    cameraAngle: "dynamic",
    bodyOrientation: "three_quarter",
    fabricMovement: "moderate",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model stepping down from a step or platform — one foot lower, body in transitional motion. Vertical body-level change creates editorial depth. Hem and garment movement visible.",
  },
  "Walk Past Camera": {
    name: "Walk Past Camera",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["movement", "editorial", "lifestyle"],
    avoidForTags: [],
    stance: "movement",
    cameraAngle: "dynamic",
    bodyOrientation: "three_quarter",
    fabricMovement: "moderate",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model walking past the camera at close range — motion blur minimal, body in three-quarter walk-by. Candid street-style editorial energy. Garment in natural movement.",
  },
};

/** Type guard — expansion names are a subset of full PoseName after merge. */
export function isExpansionPoseName(name: string): name is PoseExpansionName {
  return (POSE_EXPANSION_NAMES as readonly string[]).includes(name);
}
