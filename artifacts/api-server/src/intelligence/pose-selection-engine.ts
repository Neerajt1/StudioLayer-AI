// ---------------------------------------------------------------------------
// StudioLayer AI — Professional Pose Selection Engine (Batch 17 / 17A)
//
// POSE SELECTION ALGORITHM
// ========================
//
//   Filter  →  Score  →  Weight  →  Random Selection  →  Prompt Injection
//
// 1. FILTER
//    Narrow the shoot-type collection by model gender, garment category,
//    garment tags, pocket requirements, session usedPoses, and (for multi-
//    shot) poses already picked in this generation.
//
// 2. SCORE
//    Read suitabilityScore (1–10) from pose-library.ts — never hard-coded here.
//
// 3. WEIGHT
//    finalWeight = suitabilityScore × garmentCompatibility × varietyModifier
//
//    • garmentCompatibility — tag/category overlap multiplier (0.5–1.5)
//    • varietyModifier      — recency + in-batch diversity (0.65–1.0)
//
// 4. RANDOM SELECTION
//    Weighted probability pick WITHOUT replacement for campaign/editorial.
//    Hero uses the same weighted draw (count = 1).
//
// 5. PROMPT INJECTION
//    buildShotPrompts() appends the chosen pose — wording unchanged.
// ---------------------------------------------------------------------------

import type { GarmentProfile, GarmentCategory } from "./types";
import {
  type PoseDefinition,
  type PoseName,
  type ShootType,
  POCKET_ALTERNATIVE_POSES,
  POSE_FAMILY_LABELS,
  POSE_SELECTION_CLASS_LABELS,
  getPoseDefinition,
  getPoseDescription,
  getPosesInCollection,
  getAutomaticSelectionFallbackPose,
  getPoseDefinitionById,
  POSE_ID_LIST,
} from "./pose-library";
import {
  type PoseSelectionDevEntry,
  type PoseSelectionDevReport,
  formatPoseGarmentLabel,
  formatPoseModelLabel,
  getPoseCollectionCode,
  isPoseDevLoggingEnabled,
  logPoseSelectionDevReport,
} from "./pose-selection-dev-log";
import {
  POSE_SELECTION_TUNING,
  buildPoseProfileKey,
  garmentHasUsablePockets,
  inferGarmentTags,
  resolveModelGender,
  GENERIC_GARMENT_TAGS,
  type ModelGender,
} from "./pose-garment-utils";
import {
  defaultShotCountForShootType,
  planPosesForShoot,
  type PlannedPose,
} from "./pose-planner";
import { planCampaignComposition } from "./campaign-composition-planner";
import type { PoseSelectionContext, RecentPoseSelection } from "./pose-selection-types";

export type { PoseSelectionContext, RecentPoseSelection };

function buildFallbackPoseDevEntry(
  name: PoseName,
  ctx: { shootType: ShootType; profile: GarmentProfile },
): PoseSelectionDevEntry {
  const def = getPoseDefinition(name)!;
  return {
    code: getPoseCollectionCode(ctx.shootType, name),
    name,
    poseFamily: def.poseFamily,
    poseFamilyLabel: POSE_FAMILY_LABELS[def.poseFamily],
    selectionClass: def.selectionClass,
    selectionClassLabel: POSE_SELECTION_CLASS_LABELS[def.selectionClass],
    garmentCategory: ctx.profile.category,
    suitabilityScore: def.suitabilityScore,
    finalWeight: 0,
    garmentCompatibility: 0,
    varietyModifier: 0,
    pocketSubstitute: false,
  };
}

function buildPoseDevEntry(
  resolved: PoseDefinition,
  breakdown: ReturnType<typeof computeWeightBreakdown>,
  ctx: { shootType: ShootType; profile: GarmentProfile },
  options?: { requestedName?: PoseName; pocketSubstitute?: boolean },
): PoseSelectionDevEntry {
  return {
    code: getPoseCollectionCode(ctx.shootType, resolved.name),
    name: resolved.name,
    poseFamily: resolved.poseFamily,
    poseFamilyLabel: POSE_FAMILY_LABELS[resolved.poseFamily],
    selectionClass: resolved.selectionClass,
    selectionClassLabel: POSE_SELECTION_CLASS_LABELS[resolved.selectionClass],
    garmentCategory: ctx.profile.category,
    requestedName: options?.requestedName,
    pocketSubstitute: options?.pocketSubstitute ?? false,
    suitabilityScore: breakdown.suitabilityScore,
    finalWeight: breakdown.finalWeight,
    garmentCompatibility: breakdown.garmentCompatibility,
    varietyModifier: breakdown.varietyModifier,
  };
}

// ---------------------------------------------------------------------------

export interface ShotDirection {
  label: string;
  camera: string;
  energy: string;
}

// Re-export garment utilities (pose-garment-utils is canonical source).
export type { ModelGender };
export {
  POSE_SELECTION_TUNING,
  buildPoseProfileKey,
  garmentHasUsablePockets,
  inferGarmentTags,
  resolveModelGender,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function genderMatchesPool(pool: PoseDefinition["genderPool"], gender: ModelGender): boolean {
  if (pool === "universal") return true;
  if (gender === "kids") return false;
  if (pool === "female") return gender === "womens" || gender === "unisex";
  if (pool === "male") return gender === "mens" || gender === "unisex";
  return true;
}

function categoryMatches(
  pose: PoseDefinition,
  category: GarmentCategory,
): boolean {
  if (pose.garmentCategories === "all") return true;
  return pose.garmentCategories.includes(category);
}

function tagsCompatible(pose: PoseDefinition, garmentTags: Set<string>): boolean {
  for (const avoid of pose.avoidForTags) {
    if (garmentTags.has(avoid)) return false;
  }

  if (pose.garmentTags.length === 0) return true;

  const requiredStyleTags = pose.garmentTags.filter(
    (tag) => !["catalog", "ecommerce", "hero", "minimal", "luxury", "campaign", "editorial", "magazine", "high_fashion", "movement", "lifestyle", "commercial", "no_pocket_alternative", "pocket", "three_quarter", "statement", "feminine", "everyday", "street", "formal", "silhouette"].includes(tag),
  );

  if (requiredStyleTags.length === 0) return true;

  return requiredStyleTags.some((tag) => garmentTags.has(tag));
}

// ---------------------------------------------------------------------------
// Weight components (Batch 17A)
// ---------------------------------------------------------------------------

/**
 * Garment compatibility multiplier — derived from tag/category overlap.
 * Reads pose metadata; does not embed pose suitability scores.
 */
function garmentCompatibilityMultiplier(
  pose: PoseDefinition,
  garmentTags: Set<string>,
): number {
  const { compatMin, compatMax } = POSE_SELECTION_TUNING;
  let multiplier = 1;

  const styleTags = pose.garmentTags.filter((tag) => !GENERIC_GARMENT_TAGS.has(tag));

  if (styleTags.length > 0) {
    const matches = styleTags.filter((tag) => garmentTags.has(tag)).length;
    const ratio = matches / styleTags.length;
    multiplier *= 0.85 + ratio * 0.35;
  }

  if (garmentTags.has("no_pocket") && pose.garmentTags.includes("no_pocket_alternative")) {
    multiplier *= 1.15;
  }

  if (garmentTags.has("pocket") && pose.requiresPockets) {
    multiplier *= 1.12;
  }

  return clamp(multiplier, compatMin, compatMax);
}

/**
 * Variety modifier — reduces weight for recently used poses and for in-batch
 * repetition. Never drops to zero.
 */
function varietyModifier(
  pose: PoseDefinition,
  selectedInBatch: PoseDefinition[],
  recentPoseSelections: RecentPoseSelection[],
  shootType: ShootType,
  profileKey: string,
): number {
  const {
    varietyMin,
    recencyPenalty,
    inBatchStancePenalty,
    inBatchCameraPenalty,
    inBatchOrientationPenalty,
  } = POSE_SELECTION_TUNING;

  let modifier = 1;

  for (const recent of recentPoseSelections) {
    if (
      recent.shootType === shootType &&
      recent.profileKey === profileKey &&
      recent.poseName.toLowerCase() === pose.name.toLowerCase()
    ) {
      modifier *= recencyPenalty;
    }
  }

  for (const prev of selectedInBatch) {
    if (prev.stance === pose.stance) modifier *= inBatchStancePenalty;
    if (prev.cameraAngle === pose.cameraAngle) modifier *= inBatchCameraPenalty;
    if (prev.bodyOrientation === pose.bodyOrientation) modifier *= inBatchOrientationPenalty;
  }

  return clamp(modifier, varietyMin, 1);
}

/** finalWeight = suitabilityScore × garmentCompatibility × varietyModifier */
function computeSelectionWeight(
  pose: PoseDefinition,
  ctx: {
    garmentTags: Set<string>;
    shootType: ShootType;
    profileKey: string;
    selectedInBatch: PoseDefinition[];
    recentPoseSelections: RecentPoseSelection[];
  },
): number {
  const suitability = pose.suitabilityScore;
  const compatibility = garmentCompatibilityMultiplier(pose, ctx.garmentTags);
  const variety = varietyModifier(
    pose,
    ctx.selectedInBatch,
    ctx.recentPoseSelections,
    ctx.shootType,
    ctx.profileKey,
  );

  return suitability * compatibility * variety;
}

function computeWeightBreakdown(
  pose: PoseDefinition,
  ctx: {
    garmentTags: Set<string>;
    shootType: ShootType;
    profileKey: string;
    selectedInBatch: PoseDefinition[];
    recentPoseSelections: RecentPoseSelection[];
  },
): {
  suitabilityScore: number;
  garmentCompatibility: number;
  varietyModifier: number;
  finalWeight: number;
} {
  const suitabilityScore = pose.suitabilityScore;
  const garmentCompatibility = garmentCompatibilityMultiplier(pose, ctx.garmentTags);
  const variety = varietyModifier(
    pose,
    ctx.selectedInBatch,
    ctx.recentPoseSelections,
    ctx.shootType,
    ctx.profileKey,
  );
  return {
    suitabilityScore,
    garmentCompatibility,
    varietyModifier: variety,
    finalWeight: suitabilityScore * garmentCompatibility * variety,
  };
}

// ---------------------------------------------------------------------------
// Pocket intelligence
// ---------------------------------------------------------------------------

function resolvePocketPose(
  pose: PoseDefinition,
  hasPockets: boolean,
  alternativeIndex: number,
): PoseDefinition {
  if (!pose.requiresPockets || hasPockets) return pose;

  const altName = POCKET_ALTERNATIVE_POSES[alternativeIndex % POCKET_ALTERNATIVE_POSES.length]!;
  return getPoseDefinition(altName) ?? getAutomaticSelectionFallbackPose();
}

// ---------------------------------------------------------------------------
// Filtering pipeline
// ---------------------------------------------------------------------------

function filterCompatiblePoses(
  candidates: PoseDefinition[],
  ctx: {
    gender: ModelGender;
    profile: GarmentProfile;
    garmentTags: Set<string>;
    hasPockets: boolean;
    usedPoses: Set<string>;
  },
): PoseDefinition[] {
  return candidates.filter((pose) => {
    if (!genderMatchesPool(pose.genderPool, ctx.gender)) return false;
    if (!categoryMatches(pose, ctx.profile.category)) return false;
    if (!tagsCompatible(pose, ctx.garmentTags)) return false;
    if (pose.requiresPockets && !ctx.hasPockets) return false;
    if (ctx.usedPoses.has(pose.name.toLowerCase())) return false;
    if (pose.poseId && ctx.usedPoses.has(pose.poseId.toLowerCase())) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Weighted random selection (without replacement)
// ---------------------------------------------------------------------------

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Pick `count` unique items by weighted probability without replacement.
 * Higher-weight items are more likely but not guaranteed.
 */
function weightedSelectWithoutReplacement<T>(
  candidates: T[],
  count: number,
  weightFn: (item: T) => number,
  rng: () => number,
): T[] {
  const selected: T[] = [];
  const pool = [...candidates];

  while (selected.length < count && pool.length > 0) {
    const weights = pool.map((item) => Math.max(0, weightFn(item)));
    const total = weights.reduce((sum, w) => sum + w, 0);

    if (total <= 0) {
      selected.push(pool[0]!);
      pool.splice(0, 1);
      continue;
    }

    let threshold = rng() * total;
    let pickIndex = pool.length - 1;

    for (let i = 0; i < pool.length; i++) {
      threshold -= weights[i]!;
      if (threshold <= 0) {
        pickIndex = i;
        break;
      }
    }

    selected.push(pool[pickIndex]!);
    pool.splice(pickIndex, 1);
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Public selection API
// ---------------------------------------------------------------------------

/**
 * Select garment-appropriate poses for a shoot using the Phase 2 pose planner.
 *
 * Campaign / Editorial — unique poses per generation with family-aware diversity.
 * Hero — single conservative draw from the hero collection.
 */
export function selectPosesForShoot(ctx: PoseSelectionContext): PoseName[] {
  return selectPosesWithPlan(ctx).poses.map((p) => p.name);
}

/** Full planner result including families — used for persistence and dev logging. */
export function selectPosesWithPlan(ctx: PoseSelectionContext): {
  poses: PlannedPose[];
  planNotes: string[];
} {
  const {
    profile,
    shootType,
    count,
    modelGender,
    usedPoses = [],
    recentPoseSelections = [],
    seed,
    useCampaignComposition = false,
  } = ctx;

  const captureDevReport = isPoseDevLoggingEnabled();
  const gender = resolveModelGender(modelGender, profile.gender);
  const garmentTags = inferGarmentTags(profile);
  const hasPockets = garmentHasUsablePockets(profile);
  const profileKey = buildPoseProfileKey(profile);
  const collectionPoses = getPosesInCollection(shootType);
  const sessionUsed = new Set(usedPoses.map((p) => p.toLowerCase()));
  let compatible = filterCompatiblePoses(collectionPoses, {
    gender,
    profile,
    garmentTags,
    hasPockets,
    usedPoses: sessionUsed,
  });

  const plannerCtx = {
    profile,
    shootType,
    count,
    modelGender,
    usedPoses,
    recentPoseSelections,
    seed,
  };

  const plan = useCampaignComposition
    ? planCampaignComposition(plannerCtx)
    : planPosesForShoot(plannerCtx);

  if (captureDevReport) {
    const devEntries: PoseSelectionDevEntry[] = plan.poses.map((planned) => {
      const def = getPoseDefinition(planned.name)!;
      const weightCtx = {
        garmentTags,
        shootType,
        profileKey,
        selectedInBatch: [] as PoseDefinition[],
        recentPoseSelections,
      };
      const breakdown = computeWeightBreakdown(def, weightCtx);
      return buildPoseDevEntry(def, breakdown, { shootType, profile });
    });

    emitPoseSelectionDevReport({
      shootType,
      gender,
      profile,
      garmentTags,
      hasPockets,
      collectionPoses,
      compatible,
      selectedEntries: devEntries,
      pocketSubstitutions: 0,
      filterNotes: [
        ...buildPoseFilterNotes({
          shootType,
          gender,
          collectionPoses,
          compatible,
          hasPockets,
          garmentTags,
        }),
        ...plan.planNotes,
      ],
    });
  }

  return plan;
}

function buildPoseFilterNotes(input: {
  shootType: ShootType;
  gender: ModelGender;
  collectionPoses: PoseDefinition[];
  compatible: PoseDefinition[];
  hasPockets: boolean;
  garmentTags: Set<string>;
}): string[] {
  const notes: string[] = [];
  const excluded = input.collectionPoses.length - input.compatible.length;

  if (excluded > 0) {
    notes.push(`${excluded} collection pose(s) excluded by garment/gender filters`);
  }

  const pocketBlocked = input.collectionPoses.filter(
    (pose) => pose.requiresPockets && !input.hasPockets,
  ).length;
  if (pocketBlocked > 0) {
    notes.push(`${pocketBlocked} pocket pose(s) blocked — no usable pockets`);
  }

  if (input.garmentTags.has("flowing")) {
    notes.push("Flowing garment rules applied");
  }
  if (input.garmentTags.has("dress") || input.garmentTags.has("gown")) {
    notes.push("Dress category rules applied");
  }
  if (input.garmentTags.has("no_pocket")) {
    notes.push("No-pocket alternatives favoured");
  }

  notes.push(`Gender pool: ${formatPoseModelLabel(input.gender)}`);

  return notes;
}

function emitPoseSelectionDevReport(input: {
  shootType: ShootType;
  gender: ModelGender;
  profile: GarmentProfile;
  garmentTags: Set<string>;
  hasPockets: boolean;
  collectionPoses: PoseDefinition[];
  compatible: PoseDefinition[];
  selectedEntries: PoseSelectionDevEntry[];
  pocketSubstitutions: number;
  filterNotes: string[];
}): void {
  const flowingGarment =
    input.profile.isFlowingGarment === true || input.garmentTags.has("flowing");

  const garmentTagsApplied = [...input.garmentTags]
    .filter((tag) => tag !== "everyday")
    .sort()
    .map((tag) => tag.replace(/_/g, " "));

  const report: PoseSelectionDevReport = {
    shootType: input.shootType,
    modelLabel: formatPoseModelLabel(input.gender),
    garmentLabel: formatPoseGarmentLabel(input.profile),
    flowingGarment,
    pockets: input.hasPockets,
    pocketIntelligenceActive:
      input.pocketSubstitutions > 0 ||
      (!input.hasPockets &&
        input.collectionPoses.some((pose) => pose.requiresPockets)),
    garmentTagsApplied,
    collectionSize: input.collectionPoses.length,
    eligibleCount: input.compatible.length,
    filterNotes: input.filterNotes,
    eligiblePoses: input.compatible.map((pose) => ({
      code: getPoseCollectionCode(input.shootType, pose.name),
      name: pose.name,
    })),
    selectedPoses: input.selectedEntries,
  };

  logPoseSelectionDevReport(report);
}

/**
 * Select the next unused pose for refinements (Improve Pose).
 */
export function selectNextPose(
  profile: GarmentProfile,
  usedPoses: string[],
  options?: { modelGender?: string | null; shootType?: ShootType },
): PoseName | undefined {
  const shootType = options?.shootType ?? "editorial";
  const picks = selectPosesForShoot({
    profile,
    shootType,
    count: 1,
    modelGender: options?.modelGender,
    usedPoses,
  });
  return picks[0];
}

export function imageCountToShootType(shots: number): ShootType {
  if (shots >= 4) return "campaign";
  if (shots >= 2) return "editorial";
  return "hero";
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

export const POSE_CONSISTENCY_RULES = `
POSE CONSISTENCY — ABSOLUTE RULES:
Changing pose must NEVER change garment construction, garment colour, garment texture, garment proportions, garment dimensions, model identity, body proportions, hairstyle, facial features, footwear, or accessories.
Only pose, camera angle, and lighting may change — never the uploaded garment's dimensions, proportions, or footwear styling.
The uploaded garment must remain the primary visual focal point.
Never invent garment pockets that do not exist on the uploaded product.
Never use a pose that requires inserting a hand into a pocket unless the uploaded garment clearly shows usable pockets.
A pose must NEVER cause footwear to disappear — walking, standing, cross-leg, and editorial movement poses must preserve the established footwear styling from the shoot brief.
Never render bare feet for a commercial fashion garment when the shoot brief establishes footwear.
BATCH COLOUR LOCK — every image in this generation batch must show identical garment colour, hue, saturation, brightness, print registration, and fabric appearance as Reference Image 1. Pose and camera may vary; garment colour must not.
FOOTWEAR BATCH LOCK — every image in this generation batch must show identical footwear styling. Never switch between barefoot, heels, sandals, sneakers, or boots between shots.`;

export function neutralizeBasePromptPose(basePrompt: string): string {
  return basePrompt.replace(
    "Natural standing pose, balanced posture, neutral expression.",
    "Follow the pose direction specified in this shot brief precisely.",
  );
}

/** Strip standing-biased defaults from the shared base prompt when a manual Pose ID is authoritative. */
export function neutralizeBasePromptForManualPose(basePrompt: string): string {
  let result = neutralizeBasePromptPose(basePrompt);

  result = result.replace(
    "Full body visible head to foot.",
    "Frame the body as required by the authoritative body pose below.",
  );
  result = result.replace(
    "Subtle realistic grounding shadow beneath the feet.",
    "Use natural studio floor contact appropriate to the authoritative body pose.",
  );
  result = result.replace(
    /Allow: ([^.]*\bstanding\b[^.]*)\./gi,
    "Allow: subtle fabric drape appropriate to the authoritative body pose.",
  );
  result = result.replace(
    /Allow: ([^.]*\bnatural standing\b[^.]*)\./gi,
    "Allow: subtle fabric drape appropriate to the authoritative body pose.",
  );

  return result;
}

const MANUAL_PHOTOGRAPHY_ENERGY: Record<string, string> = {
  "HERO PRODUCT SHOWCASE":
    "Maximum garment visibility, minimal distraction. Premium commercial studio lighting and presentation.",
  "HERO COMMERCIAL":
    "Approachable, direct, premium commercial campaign hero energy. Professional studio lighting.",
  "LIFESTYLE COMMERCIAL":
    "Relaxed lifestyle commercial energy — authentic but polished. Natural lighting and framing.",
  "HERO FRONT":
    "Premium commercial hero presence with editorial polish. Clean studio lighting.",
  "THREE-QUARTER EDITORIAL":
    "Three-quarter editorial framing — asymmetric composition, premium luxury quality.",
  "WALKING EDITORIAL":
    "Dynamic fashion editorial energy — purposeful lighting and framing.",
  "HIGH-FASHION EDITORIAL":
    "High-fashion editorial energy — fashion magazine style, expressive premium luxury quality.",
};

const MANUAL_PHOTOGRAPHY_CAMERA: Record<string, string> = {
  "HERO PRODUCT SHOWCASE":
    "Camera position: Eye level. Full-body framing from head to feet. Model centred with clean, uncluttered composition.",
  "HERO COMMERCIAL":
    "Camera position: Eye level. Full-body framing from head to feet. Model centred in frame.",
  "LIFESTYLE COMMERCIAL":
    "Camera position: Three-quarter angle with natural lifestyle framing. Full-body or three-quarter body visible.",
  "HERO FRONT":
    "Camera position: Eye level. Full-body framing from head to feet. Model centred with clean composition.",
  "THREE-QUARTER EDITORIAL":
    "Camera position: Three-quarter angle, approximately 45 degrees to the model. Full-body framing with slightly asymmetric composition.",
  "HIGH-FASHION EDITORIAL":
    "Camera position: Slightly elevated three-quarter crop from mid-thigh upward, or full-body with strong editorial composition.",
};

function toPhotographyOnlyDirection(direction: ShotDirection): ShotDirection {
  let camera =
    MANUAL_PHOTOGRAPHY_CAMERA[direction.label] ??
    direction.camera
      .replace(/,?\s*directly facing the model\.?/gi, ".")
      .replace(/directly facing the model\.?\s*/gi, "")
      .replace(/capturing natural movement\.?\s*/gi, "");

  if (direction.label === "WALKING EDITORIAL") {
    camera = direction.camera.replace(/capturing natural movement\.?\s*/gi, "");
  }

  const energy =
    MANUAL_PHOTOGRAPHY_ENERGY[direction.label] ?? direction.energy;

  return { ...direction, camera, energy };
}

// ---------------------------------------------------------------------------
// Photography refinements (Pose Master geometry untouched)
// Framing lock + fashion performance + premium intrinsic furniture —
// never override body pose.
// ---------------------------------------------------------------------------

const FASHION_PERFORMANCE_VARIANTS = [
  "Confident editorial — composed confidence, purposeful eyes, sophisticated controlled intensity.",
  "Natural / approachable — relaxed face, warm eyes, subtle natural presence; smile only if it feels authentic.",
  "Serious editorial — sophisticated serious expression, controlled gaze, high-fashion facial presence.",
  "Light / lively — subtle genuine smile or understated amusement; lively eyes without cartoonish energy.",
  "Relaxed fashion presence — calm, effortless, self-assured, comfortable in front of the camera.",
] as const;

function poseIdNumericSeed(poseIdOrName: string): number {
  const match = poseIdOrName.match(/(\d+)/);
  if (match) return Number(match[1]);
  let hash = 0;
  for (let i = 0; i < poseIdOrName.length; i++) {
    hash = (hash + poseIdOrName.charCodeAt(i) * (i + 1)) % 997;
  }
  return hash;
}

/** Photography-only: human fashion-model performance — does not alter canonical pose geometry. */
export function buildFashionPerformanceLayer(poseIdOrName: string): string {
  const variant =
    FASHION_PERFORMANCE_VARIANTS[
      poseIdNumericSeed(poseIdOrName) % FASHION_PERFORMANCE_VARIANTS.length
    ]!;

  return `FASHION PERFORMANCE — PHOTOGRAPHY ONLY (does NOT change the authoritative body pose):
The model is a professional fashion model naturally performing this exact pose — not a mannequin placed into position.
Preferred expression energy for this shot: ${variant}
Expression may vary naturally between generations. Do NOT force a smile on every image. Serious, confident, relaxed, warm, or subtly playful are all valid when they suit the pose and garment.
Keep natural hand/finger relaxation, believable muscle tension, subtle eye engagement, authentic garment contact already specified by the pose, and convincing weight/balance — without moving limbs, torso, head, gaze, or support points away from the authoritative pose.
Where the authoritative pose already specifies interaction with face, hair, collar, jacket, sleeve, pocket, or an intrinsic object, render that contact naturally and convincingly. Do not invent extra garment interactions.`;
}

function requiresPremiumStudioFurniture(
  prop: string | null | undefined,
  description: string,
): boolean {
  if (prop === "chair" || prop === "stool" || prop === "step") return true;
  const d = description.toLowerCase();
  return (
    /\bintrinsic object \(required for this pose only\):\s*(chair|stool|block)\b/i.test(
      description,
    ) ||
    (/\b(chair|stool|block)\b/.test(d) &&
      /intrinsic object \(required for this pose only\)/i.test(description))
  );
}

/** Photography-only: premium fashion-editorial furniture when Pose Master requires chair/stool/block. */
export function buildIntrinsicPropQualityLayer(
  prop: string | null | undefined,
  description: string,
): string {
  if (!requiresPremiumStudioFurniture(prop, description)) {
    return `INTRINSIC PROP RULE — PHOTOGRAPHY ONLY:
Do not invent chairs, stools, blocks, tables, bags, plants, books, cups, lamps, decorative objects, or lifestyle furniture. Include a support object only when the authoritative pose explicitly requires it.`;
  }

  const objectLabel =
    prop === "stool"
      ? "stool"
      : prop === "step"
        ? "block / elevated studio seat"
        : prop === "chair"
          ? "chair"
          : "chair, stool, or block";

  return `INTRINSIC PROP QUALITY — PHOTOGRAPHY ONLY (does NOT change pose geometry or add extra props):
This pose requires an intrinsic ${objectLabel} as a professional fashion-photography studio prop — not ordinary household or commercial furniture.
Prefer: solid natural wood, premium hardwood, refined dark or warm wood, elegant contemporary or carefully chosen vintage/antique wood when aesthetically appropriate, sculptural but believable studio furniture, refined proportions, high-quality craftsmanship.
Strictly avoid: plastic, molded plastic, cafeteria furniture, office chairs, gaming chairs, cheap folding chairs, mass-market or childish furniture, visibly low-quality or CGI-looking furniture, and ornate pieces that distract from the garment.
Furniture is a supporting element only — the garment and model remain the visual priority.
Do NOT add tables, bags, plants, books, cups, lamps, decorative objects, random furniture, or environmental props beyond this single intrinsic support object.`;
}

/** Photography-only: lock requested shot framing — never invent close-ups or crop pose-defining anatomy. */
export function buildShotFramingLockLayer(
  preferredFraming?: string | null,
  directionCamera?: string,
): string {
  const framing = (preferredFraming ?? "").toLowerCase();
  const camera = (directionCamera ?? "").toLowerCase();
  const allowsTighterCrop =
    framing.includes("portrait") ||
    framing.includes("close") ||
    framing.includes("chest") ||
    framing.includes("waist") ||
    framing.includes("detail") ||
    camera.includes("mid-thigh upward") ||
    camera.includes("portrait") ||
    camera.includes("close-up");

  if (allowsTighterCrop) {
    return `SHOT FRAMING LOCK — PHOTOGRAPHY ONLY (does NOT change the authoritative body pose):
Preserve the requested shot framing exactly as specified in this brief.
Do not spontaneously convert this shot into a different crop than requested.
Photography may improve lighting, expression, camera quality, and fashion presence, but must never override the requested shot framing.
This framing lock does not alter body-pose geometry, limb positions, weight distribution, or support points.`;
  }

  return `SHOT FRAMING LOCK — PHOTOGRAPHY ONLY (does NOT change the authoritative body pose):
Preserve the requested shot framing exactly. Do not spontaneously convert a full-body or fashion full-figure shot into a close-up, medium shot, portrait crop, or tighter framing.
When the requested shot is full-body, preserve the complete model from head through feet. Do not crop feet, hands, lower legs, or other pose-defining body parts merely to create a more editorial or dramatic composition.
If the requested shot does not specify close-up framing, do not invent close-up framing.
Photography may improve lighting, expression, camera quality, and fashion presence, but must never override the requested shot framing.
This framing lock does not alter body-pose geometry, limb positions, weight distribution, or support points.`;
}

function buildPhotographyRefinementLayers(
  poseIdOrName: string,
  prop: string | null | undefined,
  description: string,
  preferredFraming?: string | null,
  directionCamera?: string,
): string {
  return `${buildShotFramingLockLayer(preferredFraming, directionCamera)}

${buildFashionPerformanceLayer(poseIdOrName)}

${buildIntrinsicPropQualityLayer(prop, description)}`;
}

/** Pose Master text + Reference Image 3 — creative pose/action direction, not exact geometry lock. */
export function buildPoseMasterReferenceAuthorityLayer(
  poseId: string,
  displayName: string,
  structuredDefinition: string,
  hasVisualReference: boolean,
): string {
  const visualClause = hasVisualReference
    ? `Reference Image 3 is the Pose Master visual reference — a strong creative direction for the fashion photograph, not an instruction to mechanically reproduce exact body geometry or to copy the reference image.
Use Reference Image 3 together with the Pose Master structured definition below to understand the overall pose character, body attitude, action, movement, gesture, weight distribution, body orientation, head direction, interaction with any visible intrinsic prop, and overall editorial energy.
Recreate the same TYPE and FEEL of pose naturally on the target model (Reference Image 2) wearing the uploaded garment (Reference Image 1).
Do NOT copy the reference person's identity, face, hair, clothing, styling, proportions, or visual appearance.
Do NOT turn the output into a traced or reconstructed version of the reference. The result must look like a professionally directed fashion photograph of the TARGET MODEL.`
    : `The Pose Master structured definition below is the creative pose/action direction for this shot.
No Pose Master visual reference image is attached — follow the structured definition as a strong creative clue for pose type, action and editorial energy, executed naturally on the target model.`;

  return `POSE & ACTION DIRECTION (Pose ID: ${poseId} — ${displayName}):
${visualClause}

POSE MASTER STRUCTURED DEFINITION:
${structuredDefinition}

IMPORTANT:
- Preserve the target model's identity, facial features, hair and natural appearance (Reference Image 2).
- Preserve the uploaded garment faithfully, including silhouette, construction, material, colour, texture, seams, pockets, buttons, closures and visible design details (Reference Image 1).
- Do not invent, relocate, enlarge, expose or paste garment labels, neck tags, brand tags or logos. Never place a garment label or tag on the model's neck or skin unless it is genuinely part of the visible exterior garment design.
- Preserve the selected pose's ACTION and EDITORIAL ENERGY even when naturally adapting exact body positioning.
- If the reference/definition shows walking, stepping, turning, leaning, sitting, floor interaction, chair/stool interaction, garment movement or another physical action, preserve that action concept rather than converting it into a static standing pose.
- Prefer natural asymmetry, weight shift, gesture, movement and body attitude over rigid symmetrical catalog posing.
- Do not default to a front-facing standing pose when the selected reference communicates a different action or attitude.
- When multiple images are generated for the same shot, maintain meaningful pose/action diversity rather than producing near-identical standing variations.

The goal is NOT exact pose duplication.
The goal is to use the Pose Master as a strong creative clue that guides WHAT KIND OF FASHION PHOTOGRAPH TO PRODUCE, while allowing the model to naturally execute the pose, action and fashion energy on the target model and garment.
Pose Master direction does not override garment fidelity, model identity, photography direction, or requested framing.`;
}

function buildManualDirectedShotPrompt(
  basePrompt: string,
  poseIdOrName: PoseName,
  direction: ShotDirection,
): string {
  const definition = getPoseDefinition(poseIdOrName);
  const description =
    definition?.description ?? getPoseDescription(poseIdOrName);
  const poseId = definition?.poseId ?? poseIdOrName;
  const displayName = definition?.name ?? poseIdOrName;
  const neutralBase = neutralizeBasePromptForManualPose(basePrompt);
  const photoDirection = toPhotographyOnlyDirection(direction);
  const photographyRefinements = buildPhotographyRefinementLayers(
    poseId,
    definition?.prop,
    description,
    definition?.preferredFraming,
    photoDirection.camera,
  );
  const hasVisualReference = Boolean(definition?.poseReferenceImage);
  const poseAuthority = buildPoseMasterReferenceAuthorityLayer(
    poseId,
    displayName,
    description,
    hasVisualReference,
  );

  return `${poseAuthority}

MODEL REFERENCE — IDENTITY ONLY:
Reference Image 2 provides model identity and appearance only. Do NOT copy its body pose, stance, or limb placement.

${neutralBase}

SHOT DIRECTION — ${photoDirection.label} (photography and styling only — not body pose):
${photoDirection.camera}
Energy: ${photoDirection.energy}

${photographyRefinements}

${POSE_CONSISTENCY_RULES}

Produce a natural premium fashion photograph of the target model in the uploaded garment, guided by the Pose Master type/feel/action${hasVisualReference ? " (structured definition + Reference Image 3)" : ""}. Do not mechanically trace the reference or invent an unrelated pose.`;
}

function buildDiverseShotPrompt(
  basePrompt: string,
  poseIdOrName: PoseName,
  direction: ShotDirection,
): string {
  const definition = getPoseDefinition(poseIdOrName);
  const description =
    definition?.description ?? getPoseDescription(poseIdOrName);
  const poseId = definition?.poseId ?? poseIdOrName;
  const displayName = definition?.name ?? poseIdOrName;
  const photographyRefinements = buildPhotographyRefinementLayers(
    poseId,
    definition?.prop,
    description,
    definition?.preferredFraming,
    direction.camera,
  );
  const hasVisualReference = Boolean(definition?.poseReferenceImage);
  const poseAuthority = buildPoseMasterReferenceAuthorityLayer(
    poseId,
    displayName,
    description,
    hasVisualReference,
  );

  return `${basePrompt}

SHOT DIRECTION — ${direction.label}:
${direction.camera}
Energy: ${direction.energy}

${poseAuthority}

MODEL REFERENCE — IDENTITY ONLY:
Reference Image 2 provides model identity and appearance only. Do NOT copy its body pose, stance, or limb placement.

${photographyRefinements}

${POSE_CONSISTENCY_RULES}

Produce a natural premium fashion photograph of the target model in the uploaded garment, guided by the Pose Master type/feel/action${hasVisualReference ? " (structured definition + Reference Image 3)" : ""}. Do not mechanically trace the reference or invent an unrelated pose.`;
}

const HERO_DIRECTION: ShotDirection = {
  label: "HERO PRODUCT SHOWCASE",
  camera:
    "Camera position: Eye level, directly facing the model. Full-body framing from head to feet. Model centred with clean, uncluttered composition.",
  energy:
    "Maximum garment visibility, catalog-quality presentation, minimal distraction. Confident, neutral commercial presence.",
};

const CAMPAIGN_DIRECTIONS: ShotDirection[] = [
  {
    label: "HERO COMMERCIAL",
    camera:
      "Camera position: Eye level, directly facing the model. Full-body framing from head to feet. Model centred in frame.",
    energy:
      "Approachable, direct, premium commercial campaign hero energy. Confident eye contact with the camera.",
  },
  {
    label: "LIFESTYLE COMMERCIAL",
    camera:
      "Camera position: Three-quarter angle with natural lifestyle framing. Full-body or three-quarter body visible.",
    energy:
      "Relaxed, natural movement and engaging posture. Lifestyle commercial energy — authentic but polished.",
  },
];

function buildEditorialDirections(profile: GarmentProfile): ShotDirection[] {
  const sub = profile.subcategory.toLowerCase();
  const isLongGarment = sub.includes("gown") || sub.includes("maxi") || sub.includes("full length");
  const isOuterwear = profile.category === "outerwear";

  return [
    {
      label: "HERO FRONT",
      camera:
        "Camera position: Eye level, directly facing the model. Full-body framing from head to feet. Model centred with clean composition.",
      energy:
        "Clean front fashion pose — premium commercial hero presence with editorial polish.",
    },
    {
      label: "THREE-QUARTER EDITORIAL",
      camera:
        "Camera position: Three-quarter angle, approximately 45 degrees to the model. Full-body framing with slightly asymmetric composition.",
      energy:
        "Three-quarter editorial pose — weight shifted, slight shoulder rotation, natural hand placement.",
    },
    {
      label: "WALKING EDITORIAL",
      camera: `Camera position: Three-quarter to side angle capturing natural movement. Full-body framing.${isLongGarment ? " Hem or skirt movement visible." : ""}${isOuterwear ? " Outerwear silhouette and movement visible." : ""}`,
      energy:
        "Walking editorial pose — mid-step, natural movement, dynamic body posture. Purposeful fashion-in-motion energy.",
    },
    {
      label: "HIGH-FASHION EDITORIAL",
      camera:
        "Camera position: Slightly elevated three-quarter crop from mid-thigh upward, or full-body with strong editorial composition.",
      energy:
        "High-fashion editorial pose — fashion magazine style, elegant body angle, expressive but premium luxury quality.",
    },
  ];
}

function resolveShotDirection(
  profile: GarmentProfile,
  shootType: ShootType,
  slotIndex: number,
): ShotDirection {
  if (shootType === "hero") return HERO_DIRECTION;

  if (shootType === "campaign") {
    return CAMPAIGN_DIRECTIONS[slotIndex] ?? CAMPAIGN_DIRECTIONS[CAMPAIGN_DIRECTIONS.length - 1]!;
  }

  const directions = buildEditorialDirections(profile);
  return directions[slotIndex] ?? directions[directions.length - 1]!;
}

export interface BuildShotPromptAtSlotOptions {
  /** When true, the supplied Pose ID is authoritative — photography-only shot direction. */
  manualDirected?: boolean;
}

/** Build one shot prompt using the global slot index for campaign/editorial directions. */
export function buildShotPromptAtSlot(
  basePrompt: string,
  profile: GarmentProfile,
  shootType: ShootType,
  poseName: PoseName,
  slotIndex: number,
  options?: BuildShotPromptAtSlotOptions,
): string {
  const direction = resolveShotDirection(profile, shootType, slotIndex);

  if (options?.manualDirected) {
    return buildManualDirectedShotPrompt(basePrompt, poseName, direction);
  }

  const neutralBase = neutralizeBasePromptPose(basePrompt);
  return buildDiverseShotPrompt(neutralBase, poseName, direction);
}

export function buildShotPromptsWithPlan(
  basePrompt: string,
  profile: GarmentProfile,
  options: {
    shootType: ShootType;
    modelGender?: string | null;
    usedPoses?: string[];
    recentPoseSelections?: RecentPoseSelection[];
    seed?: number;
    /** Override default 1/2/4 — supports future 12–20 image campaigns. */
    count?: number;
    /** Custom Campaign — bucket recipe composition (Phase 5). */
    useCampaignComposition?: boolean;
  },
): { prompts: string[]; plannedPoses: PlannedPose[]; planNotes: string[] } {
  const { shootType, modelGender, usedPoses, recentPoseSelections, seed, count, useCampaignComposition } = options;
  const shotCount = count ?? defaultShotCountForShootType(shootType);
  const plan = selectPosesWithPlan({
    profile,
    shootType,
    count: shotCount,
    modelGender,
    usedPoses,
    recentPoseSelections,
    seed,
    useCampaignComposition,
  });
  const poses = plan.poses.map((p) => p.name);
  const neutralBase = neutralizeBasePromptPose(basePrompt);

  if (shootType === "hero") {
    return {
      prompts: [buildDiverseShotPrompt(neutralBase, poses[0] ?? POSE_ID_LIST[0]!, HERO_DIRECTION)],
      plannedPoses: plan.poses,
      planNotes: plan.planNotes,
    };
  }

  if (shootType === "campaign") {
    return {
      prompts: poses.map((pose, index) =>
        buildDiverseShotPrompt(
          neutralBase,
          pose,
          CAMPAIGN_DIRECTIONS[index] ?? CAMPAIGN_DIRECTIONS[CAMPAIGN_DIRECTIONS.length - 1]!,
        ),
      ),
      plannedPoses: plan.poses,
      planNotes: plan.planNotes,
    };
  }

  const directions = buildEditorialDirections(profile);
  return {
    prompts: poses.map((pose, index) =>
      buildDiverseShotPrompt(neutralBase, pose, directions[index] ?? directions[directions.length - 1]!),
    ),
    plannedPoses: plan.poses,
    planNotes: plan.planNotes,
  };
}

export function buildShotPrompts(
  basePrompt: string,
  profile: GarmentProfile,
  options: {
    shootType: ShootType;
    modelGender?: string | null;
    usedPoses?: string[];
    recentPoseSelections?: RecentPoseSelection[];
    seed?: number;
    count?: number;
  },
): string[] {
  return buildShotPromptsWithPlan(basePrompt, profile, options).prompts;
}

/** @deprecated Use buildShotPrompts — kept for backward compatibility. */
export function buildCampaignShotPrompts(
  basePrompt: string,
  profile: GarmentProfile,
  modelGender?: string | null,
): [string, string] {
  const prompts = buildShotPrompts(basePrompt, profile, {
    shootType: "campaign",
    modelGender,
  });
  return [prompts[0]!, prompts[1]!];
}

/** @deprecated Use buildShotPrompts — kept for backward compatibility. */
export function buildEditorialShotPrompts(
  basePrompt: string,
  profile: GarmentProfile,
  modelGender?: string | null,
): [string, string, string, string] {
  const prompts = buildShotPrompts(basePrompt, profile, {
    shootType: "editorial",
    modelGender,
  });
  return [prompts[0]!, prompts[1]!, prompts[2]!, prompts[3]!];
}

export function buildHeroShotPrompt(
  basePrompt: string,
  profile: GarmentProfile,
  modelGender?: string | null,
): string {
  return buildShotPrompts(basePrompt, profile, {
    shootType: "hero",
    modelGender,
  })[0]!;
}

export { getPoseDescription as getPoseDescriptionForName };
