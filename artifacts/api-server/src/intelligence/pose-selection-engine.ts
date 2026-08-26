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
import { prepareNormalizedPoseMasterDefinition } from "./pose-definition-normalizer";
import type { FurnitureAsset } from "./furniture-catalog";
import {
  buildFurniturePromptLayer,
  buildGarmentFidelityCloser,
  furnitureDiversitySeed,
  poseRequiresFurnitureSelection,
  selectFurnitureAsset,
} from "./furniture-selector";
import type { FurnitureUsageRecord } from "./furniture-selector";
import { deriveSupportContactClass, deriveSupportSpatialRelation } from "./furniture-support";

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
SHOT BATCH:
Across shots in this generation, keep model identity, garment, and footwear unchanged. Only pose, camera, and lighting may change.
Do not invent or repeat a carry bag across shots unless that shot's Pose Master requires a bag.
Do not invent pockets the uploaded garment lacks.`;

export function neutralizeBasePromptPose(basePrompt: string): string {
  return basePrompt.replace(
    "Natural standing pose, balanced posture, neutral expression.",
    "Follow the pose direction specified in this shot brief precisely.",
  );
}

/**
 * Strip standing-biased defaults from the shared base prompt when a manual Pose ID
 * is authoritative. Preserve explicit preferredFraming when present:
 * - full_body → keep head-to-feet
 * - portrait/crop → keep crop requirement (do not force full-body)
 * - unset → defer to the authoritative body pose
 */
export function neutralizeBasePromptForManualPose(
  basePrompt: string,
  preferredFraming?: string | null,
): string {
  let result = neutralizeBasePromptPose(basePrompt);

  const framing = (preferredFraming ?? "").toLowerCase().trim();
  const hasExplicitFullBody =
    framing === "full_body" || framing.includes("full_body");
  const hasExplicitCrop =
    framing.includes("portrait") ||
    framing.includes("close") ||
    framing.includes("chest") ||
    framing.includes("waist") ||
    framing.includes("knee") ||
    framing.includes("detail");

  if (hasExplicitFullBody) {
    // Keep compose's explicit full-body line — do not soften it.
  } else if (hasExplicitCrop) {
    result = result.replace(
      "Full body visible head to foot.",
      "Preserve the directed pose's requested framing — do not expand a portrait/crop pose into full-body head-to-feet.",
    );
    result = result.replace(
      /^A full-body studio fashion photograph/m,
      "A studio fashion photograph",
    );
  } else {
    result = result.replace(
      "Full body visible head to foot.",
      "Frame the body as required by the authoritative body pose below.",
    );
  }

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

/**
 * Pass G1 — shared framing policy (minimal):
 * When a pose's preferredFraming / CAMERA·FRAMING is intentionally portrait/crop,
 * neutralize Hero/Campaign/Editorial "full-body" camera language so it cannot
 * contradict the Pose Master. Does not change the Pass B POSE contract.
 */
export function posePrefersCropFraming(
  preferredFraming?: string | null,
  description?: string | null,
): boolean {
  const framing = (preferredFraming ?? "").toLowerCase();
  const cameraField =
    description?.match(/CAMERA\s*\/\s*FRAMING:\s*([^\n]+)/i)?.[1]?.toLowerCase() ??
    "";
  if (
    framing === "full_body" ||
    framing.includes("full_body") ||
    framing.includes("three_quarter_body")
  ) {
    // Explicit full-body preferredFraming wins even if description text mentions crop language elsewhere.
    return false;
  }
  return (
    framing.includes("portrait") ||
    framing.includes("close") ||
    framing.includes("chest") ||
    framing.includes("waist") ||
    framing.includes("knee") ||
    framing.includes("detail") ||
    cameraField.includes("portrait") ||
    cameraField.includes("chest") ||
    cameraField.includes("waist") ||
    cameraField.includes("mid-thigh") ||
    cameraField.includes("mid-torso") ||
    cameraField.includes("face") ||
    cameraField.includes("crop") ||
    cameraField.includes("close")
  );
}

/** Strip full-body forcing from shot camera copy when the pose requires a crop. */
export function adaptShotDirectionForPoseFraming(
  direction: ShotDirection,
  preferredFraming?: string | null,
  description?: string | null,
): ShotDirection {
  if (!posePrefersCropFraming(preferredFraming, description)) {
    return direction;
  }

  const camera = direction.camera
    .replace(/\s*Full-body framing from head to feet\.?/gi, "")
    .replace(/\s*Full-body framing with slightly asymmetric composition\.?/gi, "")
    .replace(/\s*Full-body or three-quarter body visible\.?/gi, "")
    .replace(/\s*or full-body with strong editorial composition\.?/gi, "")
    .replace(/\s*Full-body framing\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\.\s*\./g, ".")
    .trim();

  return { ...direction, camera };
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

/** Photography-only: human fashion performance — does not alter canonical pose geometry or identity. */
export function buildFashionPerformanceLayer(poseIdOrName: string): string {
  const variant =
    FASHION_PERFORMANCE_VARIANTS[
      poseIdNumericSeed(poseIdOrName) % FASHION_PERFORMANCE_VARIANTS.length
    ]!;

  return `FASHION PERFORMANCE — PHOTOGRAPHY ONLY (does NOT change the authoritative body pose):
The Studio Talent performs this pose with professional fashion energy — not a mannequin.
Preferred expression energy: ${variant}
Expression may vary. Do NOT force a smile on every image.
Do not move limbs, torso, head, gaze, or support points away from the authoritative pose.`;
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

/**
 * Resolve furniture for a prop-bearing pose via the global furniture selector.
 * Selection is application-level and pose-geometry-aware (support contact class).
 */
export function resolveFurnitureForPose(input: {
  prop: string | null | undefined;
  poseIdOrName: string;
  /** Full pose definition when available — enables seat-profile compatibility. */
  pose?: ReturnType<typeof getPoseDefinition>;
  userHistory?: FurnitureUsageRecord[];
  excludeAssetIdsInBatch?: string[];
  excludeFamiliesInBatch?: string[];
  seed?: number;
}): FurnitureAsset | null {
  if (!poseRequiresFurnitureSelection(input.prop)) return null;
  const pose =
    input.pose ??
    getPoseDefinition(input.poseIdOrName) ??
    null;
  const selected = selectFurnitureAsset({
    prop: input.prop ?? pose?.prop,
    pose,
    userHistory: input.userHistory,
    excludeAssetIdsInBatch: input.excludeAssetIdsInBatch,
    excludeFamiliesInBatch: input.excludeFamiliesInBatch,
    seed:
      input.seed ??
      furnitureDiversitySeed({
        poseIdOrName: input.poseIdOrName,
        historyLength: input.userHistory?.length ?? 0,
      }),
  });
  return selected?.asset ?? null;
}

/**
 * Pass C — furniture prompt entry point.
 * prop none / no required support → emit nothing (pose definition already forbids inventing furniture).
 * Required support → single FURNITURE contract via buildFurniturePromptLayer.
 */
export function buildIntrinsicPropQualityLayer(
  prop: string | null | undefined,
  description: string,
  poseIdOrName?: string,
  furnitureAsset?: FurnitureAsset | null,
): string {
  if (!requiresPremiumStudioFurniture(prop, description)) {
    return "";
  }

  const pose = poseIdOrName ? getPoseDefinition(poseIdOrName) : null;
  const asset =
    furnitureAsset ??
    resolveFurnitureForPose({
      prop,
      poseIdOrName: poseIdOrName ?? description,
      pose,
    });

  if (asset) {
    const supportClass = deriveSupportContactClass(pose);
    const spatialRelation = deriveSupportSpatialRelation(pose);
    const poseId = pose?.poseId ?? poseIdOrName;
    return buildFurniturePromptLayer(asset, supportClass, spatialRelation, poseId);
  }

  return `FURNITURE:
This pose requires a visible support. Include the required furniture type and preserve the pose's body-to-support relationship.`;
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
This framing lock does not alter body-pose geometry, limb positions, weight distribution, or support points.`;
  }

  return `SHOT FRAMING LOCK — PHOTOGRAPHY ONLY (does NOT change the authoritative body pose):
Preserve the requested shot framing exactly. Do not spontaneously convert a full-body or fashion full-figure shot into a close-up, medium shot, portrait crop, or tighter framing.
When the requested shot is full-body, preserve the complete model from head through feet.
If the requested shot does not specify close-up framing, do not invent close-up framing.
This framing lock does not alter body-pose geometry, limb positions, weight distribution, or support points.`;
}

function buildPhotographyRefinementLayers(
  poseIdOrName: string,
  prop: string | null | undefined,
  description: string,
  preferredFraming?: string | null,
  directionCamera?: string,
  furnitureAsset?: FurnitureAsset | null,
): string {
  return `${buildShotFramingLockLayer(preferredFraming, directionCamera)}

${buildFashionPerformanceLayer(poseIdOrName)}

${buildIntrinsicPropQualityLayer(prop, description, poseIdOrName, furnitureAsset)}`;
}

/**
 * Prepare Pose Master structured definition for generation.
 * Applies garment-neutral GI repairs when needed, plus validated Pose 7/38/39
 * geometric anchors. Does not mutate Excel / catalog / PNG source files.
 * Does not inject a generic catalog-era support-contact reinterpretation layer.
 */
export function preparePoseMasterStructuredDefinition(
  poseId: string,
  structuredDefinition: string,
): string {
  return prepareNormalizedPoseMasterDefinition(poseId, structuredDefinition);
}

/**
 * Pass B — pose closer removed; single POSE contract lives in
 * buildPoseMasterReferenceAuthorityLayer. Kept as empty for call-site stability.
 */
export function buildPoseAuthorityClosingConstraint(
  _hasVisualReference: boolean,
): string {
  return "";
}

/**
 * Pass B — single POSE contract:
 * Pose Master PNG = visual geometry; structured definition = semantic meaning.
 * Does not restate identity or garment authority.
 */
export function buildPoseMasterReferenceAuthorityLayer(
  poseId: string,
  displayName: string,
  structuredDefinition: string,
  hasVisualReference: boolean,
): string {
  const preparedDefinition = preparePoseMasterStructuredDefinition(
    poseId,
    structuredDefinition,
  );
  const visualClause = hasVisualReference
    ? `POSE:
Reference Image 3 is the Pose Master visual geometry for BODY POSE AND ACTION only (pose, body position, movement, limb placement, gesture, weight distribution, torso orientation, pose-related framing).
Use it together with the structured definition below.
The figure depicted in the Pose Master is NOT the identity reference — do not derive face, facial structure, hair, skin tone, identity, or physical appearance from it.
Do not copy garment, furniture design, or illustration style from the Pose Master.
Preserve the camera/viewpoint and subject-to-camera side relationship demonstrated in Reference Image 3 unless the structured definition requires otherwise.
Do not replace this pose with a generic standing, walking, sitting, or freestanding fashion pose.`
    : `POSE:
The structured definition below is the body-pose authority for this shot (no Pose Master image attached).`;

  return `POSE & ACTION DIRECTION (Pose ID: ${poseId} — ${displayName}):
${visualClause}

POSE MASTER STRUCTURED DEFINITION:
${preparedDefinition}`;
}

function buildManualDirectedShotPrompt(
  basePrompt: string,
  poseIdOrName: PoseName,
  direction: ShotDirection,
  furnitureAsset?: FurnitureAsset | null,
): string {
  const definition = getPoseDefinition(poseIdOrName);
  const description =
    definition?.description ?? getPoseDescription(poseIdOrName);
  const poseId = definition?.poseId ?? poseIdOrName;
  const displayName = definition?.name ?? poseIdOrName;
  const neutralBase = neutralizeBasePromptForManualPose(
    basePrompt,
    definition?.preferredFraming,
  );
  const photoDirection = adaptShotDirectionForPoseFraming(
    toPhotographyOnlyDirection(direction),
    definition?.preferredFraming,
    description,
  );
  const photographyRefinements = buildPhotographyRefinementLayers(
    poseId,
    definition?.prop,
    description,
    definition?.preferredFraming,
    photoDirection.camera,
    furnitureAsset,
  );
  const hasVisualReference = Boolean(definition?.poseReferenceImage);
  const poseAuthority = buildPoseMasterReferenceAuthorityLayer(
    poseId,
    displayName,
    description,
    hasVisualReference,
  );

  return `${poseAuthority}

${neutralBase}

SHOT DIRECTION — ${photoDirection.label} (photography and styling only — not body pose):
${photoDirection.camera}
Energy: ${photoDirection.energy}

${photographyRefinements}

${POSE_CONSISTENCY_RULES}

${buildGarmentFidelityCloser()}`;
}

function buildDiverseShotPrompt(
  basePrompt: string,
  poseIdOrName: PoseName,
  direction: ShotDirection,
  furnitureAsset?: FurnitureAsset | null,
): string {
  const definition = getPoseDefinition(poseIdOrName);
  const description =
    definition?.description ?? getPoseDescription(poseIdOrName);
  const poseId = definition?.poseId ?? poseIdOrName;
  const displayName = definition?.name ?? poseIdOrName;
  const framedDirection = adaptShotDirectionForPoseFraming(
    direction,
    definition?.preferredFraming,
    description,
  );
  const photographyRefinements = buildPhotographyRefinementLayers(
    poseId,
    definition?.prop,
    description,
    definition?.preferredFraming,
    framedDirection.camera,
    furnitureAsset,
  );
  const hasVisualReference = Boolean(definition?.poseReferenceImage);
  const poseAuthority = buildPoseMasterReferenceAuthorityLayer(
    poseId,
    displayName,
    description,
    hasVisualReference,
  );

  return `${basePrompt}

SHOT DIRECTION — ${framedDirection.label}:
${framedDirection.camera}
Energy: ${framedDirection.energy}

${poseAuthority}

${photographyRefinements}

${POSE_CONSISTENCY_RULES}

${buildGarmentFidelityCloser()}`;
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
  /** Pre-selected furniture asset from the global furniture selector. */
  furnitureAsset?: FurnitureAsset | null;
  /** Per-user furniture history for selector fallback when asset not pre-selected. */
  furnitureUserHistory?: FurnitureUsageRecord[];
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
  const definition = getPoseDefinition(poseName);
  const furnitureAsset =
    options?.furnitureAsset !== undefined
      ? options.furnitureAsset
      : resolveFurnitureForPose({
          prop: definition?.prop,
          poseIdOrName: definition?.poseId ?? poseName,
          pose: definition,
          userHistory: options?.furnitureUserHistory,
          seed: furnitureDiversitySeed({
            poseIdOrName: definition?.poseId ?? poseName,
            slotIndex,
            historyLength: options?.furnitureUserHistory?.length ?? 0,
          }),
        });

  if (options?.manualDirected) {
    return buildManualDirectedShotPrompt(
      basePrompt,
      poseName,
      direction,
      furnitureAsset,
    );
  }

  const neutralBase = neutralizeBasePromptPose(basePrompt);
  return buildDiverseShotPrompt(
    neutralBase,
    poseName,
    direction,
    furnitureAsset,
  );
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
    furnitureUserHistory?: FurnitureUsageRecord[];
    furnitureExcludeAssetIdsInBatch?: string[];
    furnitureExcludeFamiliesInBatch?: string[];
  },
): {
  prompts: string[];
  plannedPoses: PlannedPose[];
  planNotes: string[];
  furnitureSelections: Array<FurnitureAsset | null>;
} {
  const {
    shootType,
    modelGender,
    usedPoses,
    recentPoseSelections,
    seed,
    count,
    useCampaignComposition,
    furnitureUserHistory,
    furnitureExcludeAssetIdsInBatch = [],
    furnitureExcludeFamiliesInBatch = [],
  } = options;
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
  const batchAssetIds = [...furnitureExcludeAssetIdsInBatch];
  const batchFamilies = [...furnitureExcludeFamiliesInBatch];
  const furnitureSelections: Array<FurnitureAsset | null> = [];

  const prompts = poses.map((pose, index) => {
    const definition = getPoseDefinition(pose);
    const poseId = definition?.poseId ?? pose;
    const furnitureAsset = resolveFurnitureForPose({
      prop: definition?.prop,
      poseIdOrName: poseId,
      pose: definition,
      userHistory: furnitureUserHistory,
      excludeAssetIdsInBatch: batchAssetIds,
      excludeFamiliesInBatch: batchFamilies,
      seed: furnitureDiversitySeed({
        poseIdOrName: poseId,
        slotIndex: index,
        historyLength: furnitureUserHistory?.length ?? 0,
        extraSalt: seed ?? 0,
      }),
    });
    if (furnitureAsset) {
      batchAssetIds.push(furnitureAsset.id);
      batchFamilies.push(furnitureAsset.family);
    }
    furnitureSelections.push(furnitureAsset);

    if (shootType === "hero") {
      return buildDiverseShotPrompt(
        neutralBase,
        pose,
        HERO_DIRECTION,
        furnitureAsset,
      );
    }
    if (shootType === "campaign") {
      return buildDiverseShotPrompt(
        neutralBase,
        pose,
        CAMPAIGN_DIRECTIONS[index] ?? CAMPAIGN_DIRECTIONS[CAMPAIGN_DIRECTIONS.length - 1]!,
        furnitureAsset,
      );
    }
    const directions = buildEditorialDirections(profile);
    return buildDiverseShotPrompt(
      neutralBase,
      pose,
      directions[index] ?? directions[directions.length - 1]!,
      furnitureAsset,
    );
  });

  return {
    prompts,
    plannedPoses: plan.poses,
    planNotes: plan.planNotes,
    furnitureSelections,
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
