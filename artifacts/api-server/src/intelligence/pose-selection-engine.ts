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
  getPoseDefinition,
  getPoseDescription,
  getPosesInCollection,
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelGender = "womens" | "mens" | "kids" | "unisex";

/** Cross-request recency memory entry for variety modifier. */
export interface RecentPoseSelection {
  poseName: PoseName;
  shootType: ShootType;
  /** Fingerprint from buildPoseProfileKey() — category + subcategory. */
  profileKey: string;
}

export interface PoseSelectionContext {
  profile: GarmentProfile;
  shootType: ShootType;
  count: number;
  modelGender?: string | null;
  /** Poses already used in the current refinement session. */
  usedPoses?: string[];
  /** Recent selections for the same shoot type + garment profile (optional). */
  recentPoseSelections?: RecentPoseSelection[];
  /** Optional seed for reproducible weighted draws in tests. */
  seed?: number;
}

export interface ShotDirection {
  label: string;
  camera: string;
  energy: string;
}

// ---------------------------------------------------------------------------
// Algorithm tuning — multipliers only, never pose suitability scores
// ---------------------------------------------------------------------------

/** Weight tuning constants (Batch 17A). Pose scores live in pose-library.ts. */
export const POSE_SELECTION_TUNING = {
  /** garmentCompatibility bounds */
  compatMin: 0.5,
  compatMax: 1.5,
  /** varietyModifier floor — never eliminate a pose completely */
  varietyMin: 0.65,
  /** Penalty when pose appeared recently for same profile + shoot type */
  recencyPenalty: 0.72,
  /** Per overlapping dimension with poses already selected this generation */
  inBatchStancePenalty: 0.85,
  inBatchCameraPenalty: 0.92,
  inBatchOrientationPenalty: 0.92,
} as const;

const GENERIC_GARMENT_TAGS = new Set([
  "catalog", "ecommerce", "hero", "minimal", "luxury", "campaign", "editorial",
  "magazine", "high_fashion", "movement", "lifestyle", "commercial",
  "no_pocket_alternative", "pocket", "three_quarter", "statement", "feminine",
  "everyday", "street", "formal", "silhouette",
]);

/** Stable garment fingerprint for cross-request variety tracking. */
export function buildPoseProfileKey(profile: GarmentProfile): string {
  return `${profile.category}:${profile.subcategory.toLowerCase().trim()}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Gender resolution
// ---------------------------------------------------------------------------

export function resolveModelGender(
  modelGender: string | null | undefined,
  profileGender: ModelGender,
): ModelGender {
  const raw = (modelGender ?? profileGender).toLowerCase();
  if (raw === "mens" || raw === "male") return "mens";
  if (raw === "kids" || raw === "kid" || raw === "child") return "kids";
  if (raw === "unisex") return "unisex";
  return "womens";
}

function genderMatchesPool(pool: PoseDefinition["genderPool"], gender: ModelGender): boolean {
  if (pool === "universal") return true;
  if (gender === "kids") return false;
  if (pool === "female") return gender === "womens" || gender === "unisex";
  if (pool === "male") return gender === "mens" || gender === "unisex";
  return true;
}

// ---------------------------------------------------------------------------
// Garment characteristics & tags
// ---------------------------------------------------------------------------

export function garmentHasUsablePockets(profile: GarmentProfile): boolean {
  if (profile.hasPockets === true) return true;
  if (profile.hasPockets === false) return false;

  // Vision inconclusive — do NOT assume pockets. Pocket poses require confirmed
  // pockets or strong subcategory evidence (Predictability Contract §9).
  const sub = profile.subcategory.toLowerCase();
  const { category } = profile;

  if (category === "bottoms") {
    if (
      sub.includes("jean") ||
      sub.includes("denim") ||
      sub.includes("trouser") ||
      sub.includes("pant") ||
      sub.includes("short") ||
      sub.includes("cargo")
    ) {
      return !sub.includes("legging") && !sub.includes("tight");
    }
    return false;
  }

  if (category === "outerwear") {
    if (
      sub.includes("jacket") ||
      sub.includes("blazer") ||
      sub.includes("coat") ||
      sub.includes("hoodie") ||
      sub.includes("cargo")
    ) {
      return true;
    }
    return false;
  }

  if (category === "one-pieces") {
    return sub.includes("cargo") || sub.includes("utility");
  }

  return false;
}

export function inferGarmentTags(profile: GarmentProfile): Set<string> {
  const tags = new Set<string>();
  const sub = profile.subcategory.toLowerCase();
  const occ = profile.occasion.map((o) => o.toLowerCase());
  const { category, fit, fabric } = profile;

  if (category === "one-pieces") {
    tags.add("dress");
    if (sub.includes("gown") || sub.includes("maxi") || sub.includes("evening")) {
      tags.add("gown");
      tags.add("formal_dress");
    }
  }
  if (category === "bottoms") {
    if (sub.includes("jean") || sub.includes("denim")) tags.add("jeans");
    else if (sub.includes("trouser") || sub.includes("pant")) tags.add("trousers");
    else if (sub.includes("short")) tags.add("shorts");
  }
  if (category === "outerwear" || sub.includes("blazer") || sub.includes("jacket") || sub.includes("coat")) {
    tags.add("blazer");
    tags.add("jacket");
  }
  if (sub.includes("suit")) tags.add("business");
  if (sub.includes("blazer")) tags.add("blazer");

  if (
    profile.isFlowingGarment === true ||
    sub.includes("maxi") ||
    sub.includes("gown") ||
    sub.includes("flow") ||
    sub.includes("cape") ||
    sub.includes("skirt") ||
    fabric.toLowerCase().includes("silk") ||
    fabric.toLowerCase().includes("chiffon") ||
    fabric.toLowerCase().includes("satin")
  ) {
    tags.add("flowing");
  }

  if (profile.garmentLength === "maxi" || profile.garmentLength === "full-length") {
    tags.add("full_length");
    tags.add("flowing");
  }

  if (occ.some((o) => o.includes("sport") || o.includes("athletic") || o.includes("gym"))) {
    tags.add("sportswear");
  }
  if (occ.some((o) => o.includes("formal") || o.includes("evening") || o.includes("office") || o.includes("business"))) {
    tags.add("formal");
    if (occ.some((o) => o.includes("office") || o.includes("business"))) tags.add("business");
  }
  if (occ.some((o) => o.includes("casual") || o.includes("street"))) tags.add("casual");

  if (profile.gender === "kids") tags.add("kidswear");
  if (fit.toLowerCase().includes("structured")) tags.add("structured");

  if (garmentHasUsablePockets(profile)) tags.add("pocket");
  else tags.add("no_pocket");

  if (category === "tops" && !sub.includes("dress")) tags.add("everyday");
  if (sub.includes("shirt") && !sub.includes("t-shirt")) tags.add("shirt");

  return tags;
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
  return getPoseDefinition(altName) ?? getPoseDefinition("Hip Rest Pose")!;
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
 * Select garment-appropriate poses for a shoot using weighted probability.
 *
 * Campaign / Editorial — unique poses per generation (without replacement).
 * Hero — single weighted draw from the hero collection.
 */
export function selectPosesForShoot(ctx: PoseSelectionContext): PoseName[] {
  const {
    profile,
    shootType,
    count,
    modelGender,
    usedPoses = [],
    recentPoseSelections = [],
    seed,
  } = ctx;

  const captureDevReport = isPoseDevLoggingEnabled();
  const gender = resolveModelGender(modelGender, profile.gender);
  const garmentTags = inferGarmentTags(profile);
  const hasPockets = garmentHasUsablePockets(profile);
  const profileKey = buildPoseProfileKey(profile);
  const sessionUsed = new Set(usedPoses.map((p) => p.toLowerCase()));
  const rng = createRng(seed ?? Date.now());

  const collectionPoses = getPosesInCollection(shootType);
  let compatible = filterCompatiblePoses(collectionPoses, {
    gender,
    profile,
    garmentTags,
    hasPockets,
    usedPoses: sessionUsed,
  });

  if (compatible.length < count) {
    compatible = filterCompatiblePoses(getPosesInCollection(shootType), {
      gender,
      profile,
      garmentTags,
      hasPockets,
      usedPoses: sessionUsed,
    });
  }

  const devEntries: PoseSelectionDevEntry[] = [];
  let pocketAltIndex = 0;
  let pocketSubstitutions = 0;
  const selected: PoseDefinition[] = [];

  const pickWeighted = (pool: PoseDefinition[], picks: number): PoseDefinition[] => {
    const results: PoseDefinition[] = [];

    for (let i = 0; i < picks; i++) {
      const remaining = pool.filter(
        (pose) => !results.some((s) => s.name.toLowerCase() === pose.name.toLowerCase()),
      );

      if (remaining.length === 0) break;

      const weightCtx = {
        garmentTags,
        shootType,
        profileKey,
        selectedInBatch: [...selected, ...results],
        recentPoseSelections,
      };

      const [pick] = weightedSelectWithoutReplacement(
        remaining,
        1,
        (pose) => computeSelectionWeight(pose, weightCtx),
        rng,
      );

      if (!pick) break;

      const requestedName = pick.name;
      let resolved = resolvePocketPose(pick, hasPockets, pocketAltIndex);
      const pocketSubstitute =
        requestedName !== resolved.name && pick.requiresPockets && !hasPockets;

      if (pick.requiresPockets && !hasPockets) pocketAltIndex += 1;
      if (pocketSubstitute) pocketSubstitutions += 1;

      if (captureDevReport) {
        const breakdown = computeWeightBreakdown(resolved, weightCtx);
        devEntries.push({
          code: getPoseCollectionCode(shootType, resolved.name),
          name: resolved.name,
          requestedName: pocketSubstitute ? requestedName : undefined,
          pocketSubstitute,
          suitabilityScore: breakdown.suitabilityScore,
          finalWeight: breakdown.finalWeight,
          garmentCompatibility: breakdown.garmentCompatibility,
          varietyModifier: breakdown.varietyModifier,
        });
      }

      results.push(resolved);
    }

    return results;
  };

  if (compatible.length === 0) {
    const fallback = Array.from({ length: count }, () => "Relaxed Standing" as PoseName);
    if (captureDevReport) {
      emitPoseSelectionDevReport({
        shootType,
        gender,
        profile,
        garmentTags,
        hasPockets,
        collectionPoses,
        compatible,
        selectedEntries: fallback.map((name) => ({
          code: getPoseCollectionCode(shootType, name),
          name,
          suitabilityScore: getPoseDefinition(name)?.suitabilityScore ?? 0,
          finalWeight: 0,
          garmentCompatibility: 0,
          varietyModifier: 0,
          pocketSubstitute: false,
        })),
        pocketSubstitutions: 0,
        filterNotes: ["No compatible poses — using Relaxed Standing fallback"],
      });
    }
    return fallback;
  }

  if (shootType === "hero") {
    const [heroPose] = pickWeighted(compatible, 1);
    const result = [heroPose?.name ?? "Relaxed Standing"];
    if (captureDevReport) {
      emitPoseSelectionDevReport({
        shootType,
        gender,
        profile,
        garmentTags,
        hasPockets,
        collectionPoses,
        compatible,
        selectedEntries: devEntries,
        pocketSubstitutions,
        filterNotes: buildPoseFilterNotes({
          shootType,
          gender,
          collectionPoses,
          compatible,
          hasPockets,
          garmentTags,
        }),
      });
    }
    return result;
  }

  selected.push(...pickWeighted(compatible, count));

  while (selected.length < count) {
    const fallback = getPoseDefinition("Relaxed Standing");
    if (fallback && !selected.some((s) => s.name === fallback.name)) {
      selected.push(fallback);
    } else {
      break;
    }
  }

  const result = selected.slice(0, count).map((p) => p.name);

  if (captureDevReport) {
    emitPoseSelectionDevReport({
      shootType,
      gender,
      profile,
      garmentTags,
      hasPockets,
      collectionPoses,
      compatible,
      selectedEntries: devEntries,
      pocketSubstitutions,
      filterNotes: buildPoseFilterNotes({
        shootType,
        gender,
        collectionPoses,
        compatible,
        hasPockets,
        garmentTags,
      }),
    });
  }

  return result;
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
  if (shots >= 4) return "editorial";
  if (shots >= 2) return "campaign";
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

function buildDiverseShotPrompt(
  basePrompt: string,
  poseName: PoseName,
  direction: ShotDirection,
): string {
  const description = getPoseDescription(poseName);

  return `${basePrompt}

SHOT DIRECTION — ${direction.label}:
${direction.camera}
Energy: ${direction.energy}

POSE — ${poseName}:
${description}

${POSE_CONSISTENCY_RULES}

Apply this pose precisely as described. Do not blend or combine poses.`;
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

export function buildShotPrompts(
  basePrompt: string,
  profile: GarmentProfile,
  options: {
    shootType: ShootType;
    modelGender?: string | null;
    usedPoses?: string[];
    recentPoseSelections?: RecentPoseSelection[];
    seed?: number;
  },
): string[] {
  const { shootType, modelGender, usedPoses, recentPoseSelections, seed } = options;
  const count = shootType === "editorial" ? 4 : shootType === "campaign" ? 2 : 1;
  const poses = selectPosesForShoot({
    profile,
    shootType,
    count,
    modelGender,
    usedPoses,
    recentPoseSelections,
    seed,
  });

  const neutralBase = neutralizeBasePromptPose(basePrompt);

  if (shootType === "hero") {
    return [buildDiverseShotPrompt(neutralBase, poses[0] ?? "Relaxed Standing", HERO_DIRECTION)];
  }

  if (shootType === "campaign") {
    return poses.map((pose, index) =>
      buildDiverseShotPrompt(
        neutralBase,
        pose,
        CAMPAIGN_DIRECTIONS[index] ?? CAMPAIGN_DIRECTIONS[CAMPAIGN_DIRECTIONS.length - 1]!,
      ),
    );
  }

  const directions = buildEditorialDirections(profile);
  return poses.map((pose, index) =>
    buildDiverseShotPrompt(neutralBase, pose, directions[index] ?? directions[directions.length - 1]!),
  );
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
