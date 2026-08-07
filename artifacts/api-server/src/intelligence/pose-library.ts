// ---------------------------------------------------------------------------
// StudioLayer AI — Professional Pose Library (Batch 17)
//
// Curated pose collections for Hero, Campaign, and Editorial shoots.
// Each pose carries metadata that drives garment-aware selection.
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

export interface PoseDefinition {
  /** Human-readable pose name — stable identifier across sessions. */
  name: PoseName;
  /** Universal / female / male pose pool (~40 / 35 / 25 split). */
  genderPool: PoseGenderPool;
  /** Shoot types this pose is curated for. */
  collections: ShootType[];
  /** Garment categories this pose supports. "all" = any category. */
  garmentCategories: GarmentCategory[] | "all";
  /** Style tags for compatibility filtering — dress, blazer, jeans, flowing, etc. */
  garmentTags: string[];
  /** Tags that disqualify this pose for a garment. */
  avoidForTags: string[];
  stance: PoseStance;
  cameraAngle: PoseCameraAngle;
  bodyOrientation: PoseBodyOrientation;
  fabricMovement: FabricMovementLevel;
  accessoriesAllowed: boolean;
  /** True pocket pose — only used when garment has usable pockets. */
  requiresPockets: boolean;
  /** Selection priority within a collection (higher = preferred for Hero). */
  heroPriority: number;
  /** Configurable pose suitability for weighted selection (1–10). */
  suitabilityScore: number;
  /** Detailed execution direction sent to the rendering model. */
  description: string;
}

// ---------------------------------------------------------------------------
// Pose names — canonical union
// ---------------------------------------------------------------------------

export const POSE_NAMES = [
  // Universal — standing & movement
  "Catalog Front Showcase",
  "Relaxed Standing",
  "Fashion Power Pose",
  "Three-Quarter Front",
  "Walking Towards Camera",
  "Walking Across Frame",
  "Walking Away",
  "Looking Over Shoulder",
  "Looking Away Naturally",
  "Leaning Against Wall",
  "Leaning Forward Slightly",
  "Resting One Foot Higher",
  "Sitting",
  "Natural Turning Motion",
  "Arms Crossed",
  "Casual Conversation Pose",
  "Minimalist Editorial",
  "Magazine Cover Pose",
  "Premium Luxury Campaign Pose",
  "Mid-Stride Editorial",
  "Dynamic Editorial Movement",
  "Luxury Fashion Editorial",
  // Pocket poses
  "One Hand in Pocket",
  "Both Hands in Pocket",
  "Pocket Illusion Pose",
  "Thumb Hook Pose",
  "Hip Rest Pose",
  // Female collection
  "Elegant Dress Pose",
  "Twirl",
  "Holding Dress Hem",
  "Soft Cross-Leg Standing",
  "Elegant Shoulder Turn",
  "Soft Contrapposto",
  "Hair Touch Editorial",
  "Hand on Waist",
  // Male collection
  "Adjusting Collar",
  "Holding Jacket Lapel",
  "Jacket Adjustment",
  "Watch Adjustment",
  "Business Stance",
  "Blazer Hold",
] as const;

export type PoseName = (typeof POSE_NAMES)[number];

/** Backward-compatible export — full canonical library. */
export const CANONICAL_POSES: readonly PoseName[] = POSE_NAMES;

// ---------------------------------------------------------------------------
// Collection membership (~10 Hero, ~20 Campaign, ~20 Editorial with overlap)
// ---------------------------------------------------------------------------

export const HERO_COLLECTION: readonly PoseName[] = [
  "Relaxed Standing",
  "Minimalist Editorial",
  "Three-Quarter Front",
  "Fashion Power Pose",
  "Premium Luxury Campaign Pose",
  "Hand on Waist",
  "Elegant Shoulder Turn",
  "Looking Away Naturally",
  "Soft Cross-Leg Standing",
  "Catalog Front Showcase",
] as const;

export const CAMPAIGN_COLLECTION: readonly PoseName[] = [
  "Premium Luxury Campaign Pose",
  "Casual Conversation Pose",
  "Walking Towards Camera",
  "Natural Turning Motion",
  "Hand on Waist",
  "Looking Away Naturally",
  "Leaning Forward Slightly",
  "Resting One Foot Higher",
  "Walking Across Frame",
  "One Hand in Pocket",
  "Pocket Illusion Pose",
  "Thumb Hook Pose",
  "Hip Rest Pose",
  "Arms Crossed",
  "Elegant Shoulder Turn",
  "Mid-Stride Editorial",
  "Soft Cross-Leg Standing",
  "Holding Dress Hem",
  "Adjusting Collar",
  "Holding Jacket Lapel",
  "Business Stance",
  "Relaxed Standing",
  "Fashion Power Pose",
] as const;

export const EDITORIAL_COLLECTION: readonly PoseName[] = [
  "Fashion Power Pose",
  "Elegant Shoulder Turn",
  "Mid-Stride Editorial",
  "Luxury Fashion Editorial",
  "Magazine Cover Pose",
  "Dynamic Editorial Movement",
  "Minimalist Editorial",
  "Looking Over Shoulder",
  "Elegant Dress Pose",
  "Twirl",
  "Natural Turning Motion",
  "Walking Away",
  "Leaning Against Wall",
  "Sitting",
  "Premium Luxury Campaign Pose",
  "Soft Contrapposto",
  "Hair Touch Editorial",
  "Watch Adjustment",
  "Blazer Hold",
  "Jacket Adjustment",
] as const;

const COLLECTION_MAP: Record<ShootType, readonly string[]> = {
  hero: HERO_COLLECTION,
  campaign: CAMPAIGN_COLLECTION,
  editorial: EDITORIAL_COLLECTION,
};

export function getCollectionForShootType(shootType: ShootType): readonly string[] {
  return COLLECTION_MAP[shootType];
}

// ---------------------------------------------------------------------------
// Pose definitions
// ---------------------------------------------------------------------------

const POSE_DEFINITIONS: Record<string, PoseDefinition> = {
  "Relaxed Standing": {
    name: "Relaxed Standing",
    genderPool: "universal",
    collections: ["hero", "campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["catalog", "casual", "everyday"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 95,
    suitabilityScore: 9,
    description:
      "Model stands naturally with feet shoulder-width apart. Weight balanced evenly or shifted slightly to one leg. Arms hang loosely at the sides. Shoulders relaxed. Natural, approachable posture — maximum garment visibility, minimal distraction.",
  },
  "Catalog Front Showcase": {
    name: "Catalog Front Showcase",
    genderPool: "universal",
    collections: ["hero"],
    garmentCategories: "all",
    garmentTags: ["catalog", "ecommerce", "hero"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: false,
    requiresPockets: false,
    heroPriority: 100,
    suitabilityScore: 10,
    description:
      "Model stands square to camera in a clean catalog front pose. Feet parallel, weight balanced, arms relaxed at sides. Direct eye contact. Every structural detail of the garment is fully visible — neckline, sleeves, hem, and silhouette. Zero distraction, premium ecommerce hero presentation.",
  },
  "Minimalist Editorial": {
    name: "Minimalist Editorial",
    genderPool: "universal",
    collections: ["hero", "editorial"],
    garmentCategories: "all",
    garmentTags: ["catalog", "minimal", "luxury"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 90,
    suitabilityScore: 9,
    description:
      "Model stands in a quiet, controlled, minimal pose — stillness and intentionality. Clean body line. Arms down or in a single simple position. The pose does not distract from the garment — it serves it. Shoulders back, chin level, expression composed.",
  },
  "Three-Quarter Front": {
    name: "Three-Quarter Front",
    genderPool: "universal",
    collections: ["hero", "campaign"],
    garmentCategories: "all",
    garmentTags: ["catalog", "three_quarter"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 85,
    suitabilityScore: 9,
    description:
      "Model stands at a gentle three-quarter angle to the camera. Weight shifted naturally to one leg. Front and side garment construction both visible. Arms relaxed. Clean product showcase with subtle depth.",
  },
  "Fashion Power Pose": {
    name: "Fashion Power Pose",
    genderPool: "universal",
    collections: ["hero", "campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "formal", "statement"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 80,
    suitabilityScore: 9,
    description:
      "Model stands tall with strong, confident posture. Feet slightly apart, chest open, shoulders back. Direct, commanding eye contact. Powerful editorial energy while keeping the garment fully visible.",
  },
  "Premium Luxury Campaign Pose": {
    name: "Premium Luxury Campaign Pose",
    genderPool: "universal",
    collections: ["hero", "campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["luxury", "campaign", "formal"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 88,
    suitabilityScore: 10,
    description:
      "Model adopts a premium, aspirational pose communicating luxury fashion. Body language is impeccable — regal but not stiff. Hand placement, shoulder angle, and weight distribution are precisely considered. Hero image of a major luxury fashion house campaign.",
  },
  "Hand on Waist": {
    name: "Hand on Waist",
    genderPool: "female",
    collections: ["hero", "campaign"],
    garmentCategories: ["one-pieces", "tops", "bottoms"],
    garmentTags: ["dress", "feminine", "silhouette"],
    avoidForTags: ["kidswear"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 75,
    suitabilityScore: 9,
    description:
      "Model places one hand firmly on the waist — thumb pointing backward, fingers forward. The opposite arm hangs naturally. Hip shifts toward the hand, creating a fashion S-curve silhouette that showcases garment fit and length.",
  },
  "Hip Rest Pose": {
    name: "Hip Rest Pose",
    genderPool: "universal",
    collections: ["campaign"],
    garmentCategories: "all",
    garmentTags: ["casual", "no_pocket_alternative"],
    avoidForTags: ["pocket"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 9,
    description:
      "Model rests one hand lightly on the hip bone — fingers on the hip, not in a pocket. The other arm hangs naturally at the side. Relaxed, confident commercial energy. Do NOT insert the hand into a pocket — the garment may not have one.",
  },
  "Looking Away Naturally": {
    name: "Looking Away Naturally",
    genderPool: "universal",
    collections: ["hero", "campaign"],
    garmentCategories: "all",
    garmentTags: ["lifestyle", "casual"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 70,
    suitabilityScore: 8,
    description:
      "Model's body faces the camera but the head turns naturally to one side, gaze directed away from the lens. Candid and editorial. Expression is thoughtful and composed. Garment front remains fully visible.",
  },
  "One Hand in Pocket": {
    name: "One Hand in Pocket",
    genderPool: "universal",
    collections: ["campaign"],
    garmentCategories: ["bottoms", "outerwear", "tops"],
    garmentTags: ["jeans", "trousers", "blazer", "jacket", "casual", "pocket"],
    avoidForTags: ["dress", "gown", "formal_dress", "flowing"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: true,
    heroPriority: 0,
    suitabilityScore: 9,
    description:
      "Model stands with one hand casually inserted in a REAL, VISIBLE garment pocket (trouser, jacket, or coat pocket that actually exists on the uploaded garment). The other arm hangs naturally. Do NOT invent or hallucinate pockets that are not on the garment.",
  },
  "Both Hands in Pocket": {
    name: "Both Hands in Pocket",
    genderPool: "male",
    collections: ["campaign"],
    garmentCategories: ["bottoms", "outerwear"],
    garmentTags: ["jeans", "trousers", "jacket", "casual", "pocket"],
    avoidForTags: ["dress", "gown", "flowing"],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: true,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model stands with both hands inserted in REAL garment pockets that exist on the uploaded garment. Elbows slightly bent outward. Confident, understated lifestyle energy. Never invent pockets.",
  },
  "Pocket Illusion Pose": {
    name: "Pocket Illusion Pose",
    genderPool: "universal",
    collections: ["campaign"],
    garmentCategories: "all",
    garmentTags: ["no_pocket_alternative", "casual"],
    avoidForTags: ["pocket"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model's hand rests casually near the hip or waist seam where a pocket might be — fingers curved lightly against the garment surface but NOT inserted into any opening. Relaxed, effortless commercial confidence without inventing garment pockets.",
  },
  "Thumb Hook Pose": {
    name: "Thumb Hook Pose",
    genderPool: "universal",
    collections: ["campaign"],
    garmentCategories: ["bottoms", "tops", "one-pieces"],
    garmentTags: ["no_pocket_alternative", "casual"],
    avoidForTags: ["pocket"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model hooks the thumb casually into a belt loop, waistband, or side seam — NOT into a pocket. The other arm hangs naturally. Modern commercial pose that conveys relaxed confidence without requiring garment pockets.",
  },
  "Arms Crossed": {
    name: "Arms Crossed",
    genderPool: "universal",
    collections: ["campaign"],
    garmentCategories: ["tops", "outerwear", "one-pieces"],
    garmentTags: ["blazer", "business", "casual"],
    avoidForTags: ["flowing", "gown"],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model stands with arms folded across the body — forearms crossed, each hand loosely gripping the opposite upper arm. Confident and composed, not defensive. Slight natural hip shift. Direct eye contact.",
  },
  "Casual Conversation Pose": {
    name: "Casual Conversation Pose",
    genderPool: "universal",
    collections: ["campaign"],
    garmentCategories: "all",
    garmentTags: ["lifestyle", "casual", "commercial"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 9,
    description:
      "Model adopts a natural, conversational stance — slightly open body language, weight shifted, arms in a relaxed open position. Natural and engaged. Candid, approachable lifestyle commercial energy.",
  },
  "Walking Towards Camera": {
    name: "Walking Towards Camera",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["movement", "commercial", "jeans", "trousers"],
    avoidForTags: [],
    stance: "movement",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "moderate",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 10,
    description:
      "Model walks directly toward the camera with a confident, natural stride. One leg forward, weight mid-transfer. Arms swing slightly. The garment moves naturally with the body. Purposeful, aspirational commercial energy.",
  },
  "Walking Across Frame": {
    name: "Walking Across Frame",
    genderPool: "universal",
    collections: ["campaign"],
    garmentCategories: "all",
    garmentTags: ["movement", "street", "commercial"],
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
      "Model walks horizontally across the frame. Body in three-quarter view. Natural mid-stride. The garment shows movement and drape. Street editorial commercial energy.",
  },
  "Walking Away": {
    name: "Walking Away",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["movement", "editorial"],
    avoidForTags: [],
    stance: "movement",
    cameraAngle: "rear",
    bodyOrientation: "rear",
    fabricMovement: "moderate",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model walks directly away from the camera. Full rear view of the garment visible. Natural walking stride. Showcases back construction, rear hem, and silhouette from behind.",
  },
  "Natural Turning Motion": {
    name: "Natural Turning Motion",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["movement", "lifestyle"],
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
      "Model captured mid-turn — body rotating naturally, weight shifting, one shoulder coming forward. Hair may have slight movement. The garment reveals both front and side details during the turn.",
  },
  "Mid-Stride Editorial": {
    name: "Mid-Stride Editorial",
    genderPool: "universal",
    collections: ["campaign", "editorial"],
    garmentCategories: "all",
    garmentTags: ["movement", "editorial", "commercial"],
    avoidForTags: [],
    stance: "movement",
    cameraAngle: "dynamic",
    bodyOrientation: "three_quarter",
    fabricMovement: "dramatic",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 9,
    description:
      "Model captured in a bold, dynamic mid-stride — one leg extended forward, the other pushing off. Confident and intentional. The garment shows clear movement and energy. Editorial fashion in motion.",
  },
  "Leaning Forward Slightly": {
    name: "Leaning Forward Slightly",
    genderPool: "universal",
    collections: ["campaign"],
    garmentCategories: ["tops", "one-pieces", "outerwear"],
    garmentTags: ["lifestyle", "casual"],
    avoidForTags: ["gown"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 7,
    description:
      "Model leans gently forward from the waist — not dramatically. Arms hang naturally. Creates an intimate, engaged editorial quality. Garment front construction clearly visible.",
  },
  "Resting One Foot Higher": {
    name: "Resting One Foot Higher",
    genderPool: "universal",
    collections: ["campaign"],
    garmentCategories: ["bottoms", "one-pieces", "outerwear"],
    garmentTags: ["lifestyle", "casual", "jeans"],
    avoidForTags: ["gown", "formal_dress"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 7,
    description:
      "Model stands with one foot raised on a step or elevated surface. Raised knee bent naturally. Arms relaxed — at sides or one arm resting on the raised knee. Relaxed urban lifestyle energy.",
  },
  "Leaning Against Wall": {
    name: "Leaning Against Wall",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: ["tops", "outerwear", "bottoms"],
    garmentTags: ["lifestyle", "casual", "street"],
    avoidForTags: ["gown", "formal_dress"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 7,
    description:
      "Model leans casually against a wall — one shoulder in contact. Weight on the supporting side. Arms crossed, hands at sides, or one arm raised. Legs may be crossed at ankles. Effortless lifestyle editorial.",
  },
  "Sitting": {
    name: "Sitting",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: ["tops", "one-pieces"],
    garmentTags: ["editorial", "lifestyle"],
    avoidForTags: ["flowing", "gown", "maxi", "full_length"],
    stance: "sitting",
    cameraAngle: "three_quarter",
    bodyOrientation: "front",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 6,
    description:
      "Model sits elegantly on a surface — chair, step, or ledge. Posture upright and composed. Legs crossed or placed neatly. The garment drapes naturally. Upper body garment details clearly visible.",
  },
  "Looking Over Shoulder": {
    name: "Looking Over Shoulder",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "dress", "formal"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "rear",
    bodyOrientation: "rear",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 9,
    description:
      "Model's body faces away from or at 45–90° from the camera. Head turned back over one shoulder, looking at the camera. Reveals rear or side garment construction with direct eye contact. Elegant editorial tension.",
  },
  "Elegant Shoulder Turn": {
    name: "Elegant Shoulder Turn",
    genderPool: "female",
    collections: ["hero", "campaign", "editorial"],
    garmentCategories: ["one-pieces", "tops", "outerwear"],
    garmentTags: ["dress", "editorial", "formal", "feminine"],
    avoidForTags: ["kidswear"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 78,
    suitabilityScore: 10,
    description:
      "Model's lower body faces slightly away while the upper body rotates back toward the camera — a classic fashion S-twist. Shoulders at approximately 45° to the camera. Head faces the camera. Elongates the silhouette.",
  },
  "Soft Cross-Leg Standing": {
    name: "Soft Cross-Leg Standing",
    genderPool: "female",
    collections: ["hero", "campaign"],
    garmentCategories: ["one-pieces", "bottoms", "tops"],
    garmentTags: ["dress", "feminine", "commercial"],
    avoidForTags: ["kidswear", "sportswear"],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 72,
    suitabilityScore: 9,
    description:
      "Model stands with one leg crossed in front of the other — ankles crossing naturally. Elegant, relaxed silhouette. Arms at sides or one hand on hip. Full garment length visible.",
  },
  "Elegant Dress Pose": {
    name: "Elegant Dress Pose",
    genderPool: "female",
    collections: ["editorial"],
    garmentCategories: ["one-pieces"],
    garmentTags: ["dress", "gown", "formal", "evening"],
    avoidForTags: ["kidswear"],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 10,
    description:
      "Model stands in a classically elegant fashion pose — weight on one leg, the other foot turned slightly outward. Hips tilted. Full-length garment completely visible from neckline to hem. Shoulders back, chin slightly raised.",
  },
  "Twirl": {
    name: "Twirl",
    genderPool: "female",
    collections: ["editorial"],
    garmentCategories: ["one-pieces"],
    garmentTags: ["dress", "gown", "flowing", "formal"],
    avoidForTags: ["structured", "blazer"],
    stance: "movement",
    cameraAngle: "dynamic",
    bodyOrientation: "three_quarter",
    fabricMovement: "dramatic",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 9,
    description:
      "Model is mid-twirl — body rotating, skirt or dress flaring outward with movement. Arms slightly raised for balance. Hair has movement. Full hem and silhouette spectacularly visible.",
  },
  "Holding Dress Hem": {
    name: "Holding Dress Hem",
    genderPool: "female",
    collections: ["campaign", "editorial"],
    garmentCategories: ["one-pieces"],
    garmentTags: ["dress", "gown", "flowing", "formal"],
    avoidForTags: ["blazer", "jeans"],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "moderate",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 9,
    description:
      "Model stands elegantly and lightly holds the hem of the dress or skirt with one or both hands, lifting it slightly. Highlights fabric, drape, and construction. Weight shifted to one leg.",
  },
  "Soft Contrapposto": {
    name: "Soft Contrapposto",
    genderPool: "female",
    collections: ["editorial"],
    garmentCategories: ["one-pieces", "tops", "bottoms"],
    garmentTags: ["dress", "feminine", "editorial"],
    avoidForTags: ["kidswear"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 10,
    description:
      "Model stands in soft contrapposto — weight on one leg, the other relaxed, creating a gentle S-curve through the body. Shoulders and hips counter-rotate naturally. Poised, editorial femininity.",
  },
  "Hair Touch Editorial": {
    name: "Hair Touch Editorial",
    genderPool: "female",
    collections: ["editorial"],
    garmentCategories: ["one-pieces", "tops"],
    garmentTags: ["editorial", "feminine", "magazine"],
    avoidForTags: ["kidswear"],
    stance: "standing",
    cameraAngle: "elevated",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model stands with one hand raised, fingers lightly touching or running through hair in a candid editorial gesture. Body in three-quarter view. Magazine-quality composed expression. Garment remains the focal point.",
  },
  "Magazine Cover Pose": {
    name: "Magazine Cover Pose",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "magazine", "luxury"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 9,
    description:
      "Model in a strong, composed editorial stance suited for a luxury fashion magazine cover. Direct, powerful gaze. Body language intentional. One hand may be at the chin or in hair — editorial, studied, precise.",
  },
  "Luxury Fashion Editorial": {
    name: "Luxury Fashion Editorial",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "luxury", "high_fashion"],
    avoidForTags: [],
    stance: "standing",
    cameraAngle: "elevated",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 9,
    description:
      "Model adopts a high-fashion editorial pose — deliberate, artistic, precisely composed. Body angles are intentional and architectural. More fashion-forward than commercial. Luxury fashion campaign quality.",
  },
  "Dynamic Editorial Movement": {
    name: "Dynamic Editorial Movement",
    genderPool: "universal",
    collections: ["editorial"],
    garmentCategories: "all",
    garmentTags: ["editorial", "movement", "high_fashion"],
    avoidForTags: [],
    stance: "movement",
    cameraAngle: "dynamic",
    bodyOrientation: "three_quarter",
    fabricMovement: "dramatic",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model captured in bold, dramatic motion — strong, energetic movement creating editorial impact. Hair, garment, and accessories in motion. Deliberate fashion-directed movement, not casual.",
  },
  "Adjusting Collar": {
    name: "Adjusting Collar",
    genderPool: "male",
    collections: ["campaign", "editorial"],
    garmentCategories: ["tops", "outerwear"],
    garmentTags: ["blazer", "shirt", "business", "formal"],
    avoidForTags: ["dress", "gown"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model's hands raised, fingers lightly adjusting the collar, lapel, or neckline in a natural candid gesture. Mid-motion — natural and editorial. Highlights neckline and upper garment construction.",
  },
  "Holding Jacket Lapel": {
    name: "Holding Jacket Lapel",
    genderPool: "male",
    collections: ["campaign", "editorial"],
    garmentCategories: ["outerwear", "tops"],
    garmentTags: ["blazer", "jacket", "coat", "business", "formal"],
    avoidForTags: ["dress"],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model holds one or both lapels of the jacket, blazer, or coat lightly between fingers and thumbs. Garment front construction and lapels fully visible. Confident, distinguished editorial pose.",
  },
  "Jacket Adjustment": {
    name: "Jacket Adjustment",
    genderPool: "male",
    collections: ["editorial"],
    garmentCategories: ["outerwear"],
    garmentTags: ["blazer", "jacket", "coat", "business"],
    avoidForTags: ["dress"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "subtle",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model adjusts the jacket or blazer with both hands — pulling the front panels lightly, straightening the fit in a natural editorial gesture. Showcases outerwear construction, lapels, and silhouette.",
  },
  "Watch Adjustment": {
    name: "Watch Adjustment",
    genderPool: "male",
    collections: ["editorial"],
    garmentCategories: ["tops", "outerwear"],
    garmentTags: ["business", "formal", "blazer", "shirt"],
    avoidForTags: ["dress", "gown"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 7,
    description:
      "Model raises one wrist slightly, adjusting a watch or cuff in a refined candid gesture. The other arm hangs naturally. Business editorial sophistication. Sleeve and cuff details visible.",
  },
  "Business Stance": {
    name: "Business Stance",
    genderPool: "male",
    collections: ["campaign"],
    garmentCategories: ["outerwear", "tops", "bottoms"],
    garmentTags: ["blazer", "suit", "business", "formal"],
    avoidForTags: ["sportswear", "gown"],
    stance: "standing",
    cameraAngle: "front",
    bodyOrientation: "front",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model stands in a composed business stance — feet parallel, shoulders square, posture upright and authoritative. Arms at sides or one hand adjusting a cuff. Professional, executive commercial energy.",
  },
  "Blazer Hold": {
    name: "Blazer Hold",
    genderPool: "male",
    collections: ["editorial"],
    garmentCategories: ["outerwear", "tops"],
    garmentTags: ["blazer", "jacket", "business", "formal"],
    avoidForTags: ["dress"],
    stance: "standing",
    cameraAngle: "three_quarter",
    bodyOrientation: "three_quarter",
    fabricMovement: "none",
    accessoriesAllowed: true,
    requiresPockets: false,
    heroPriority: 0,
    suitabilityScore: 8,
    description:
      "Model holds the front of the blazer lightly with one hand — fingers on the fabric near the button line. The other arm at the side. Showcases blazer fit, lapels, and front construction with editorial confidence.",
  },
};

/** Pocket-pose substitutes when garment has no usable pockets. */
export const POCKET_ALTERNATIVE_POSES: readonly PoseName[] = [
  "Pocket Illusion Pose",
  "Thumb Hook Pose",
  "Hip Rest Pose",
] as const;

export function getPoseDefinition(name: string): PoseDefinition | undefined {
  return POSE_DEFINITIONS[name];
}

export function getPoseDescription(name: PoseName): string {
  return POSE_DEFINITIONS[name]?.description ?? POSE_DEFINITIONS["Relaxed Standing"]!.description;
}

export function getAllPoseDefinitions(): PoseDefinition[] {
  return Object.values(POSE_DEFINITIONS);
}

export function getPosesInCollection(shootType: ShootType): PoseDefinition[] {
  const names = new Set(getCollectionForShootType(shootType));
  return getAllPoseDefinitions().filter((pose) => names.has(pose.name));
}
