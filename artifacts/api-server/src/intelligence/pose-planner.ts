// ---------------------------------------------------------------------------
// Pose Planner — Phase 2
//
// Family-aware, recency-aware, same-garment-aware batch pose planning.
// Supports current Hero (1) / Campaign (2) / Editorial (4) and future N-image
// campaigns (12–20) without UI changes.
// ---------------------------------------------------------------------------

import type { GarmentProfile } from "./types";
import {
  type PoseDefinition,
  type PoseFamily,
  type PoseName,
  type PoseSelectionClass,
  type ShootType,
  POCKET_ALTERNATIVE_POSES,
  getPoseDefinition,
  getPosesInCollection,
} from "./pose-library";
import {
  POSE_SELECTION_TUNING,
  buildPoseProfileKey,
  garmentHasUsablePockets,
  inferGarmentTags,
  resolveModelGender,
  type ModelGender,
} from "./pose-garment-utils";
import type { RecentPoseSelection } from "./pose-selection-types";

export const POSE_PLANNER_TUNING = {
  /** Strong penalty when exact pose used recently for same garment profile */
  sameGarmentExactPosePenalty: 0.32,
  /** Penalty when pose family appeared in recent same-garment history */
  sameGarmentFamilyPenalty: 0.58,
  /** Soft decay for signature (Class A) poses — allows sensible recurrence */
  signatureRecencyDecay: 0.76,
  /** Strong penalty for high-repetition-risk (Class D) on same garment */
  highRiskSameGarmentPenalty: 0.18,
  /** Weight multiplier cap for Class D poses in pool */
  highRiskWeightCap: 0.42,
  /** In-batch penalty when family already selected this generation */
  inBatchFamilyPenalty: 0.38,
  /** Max Class D poses per batch by shoot type */
  highRiskBatchCap: { hero: 0, campaign: 0, editorial: 1 } as const,
} as const;

export interface PosePlannerContext {
  profile: GarmentProfile;
  shootType: ShootType;
  count: number;
  modelGender?: string | null;
  usedPoses?: string[];
  recentPoseSelections?: RecentPoseSelection[];
  seed?: number;
}

export interface PlannedPose {
  name: PoseName;
  family: PoseFamily;
  selectionClass: PoseSelectionClass;
}

export interface PosePlanResult {
  poses: PlannedPose[];
  planNotes: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function genderMatchesPool(pool: PoseDefinition["genderPool"], gender: ModelGender): boolean {
  if (pool === "universal") return true;
  if (gender === "kids") return false;
  if (pool === "female") return gender === "womens" || gender === "unisex";
  if (pool === "male") return gender === "mens" || gender === "unisex";
  return true;
}

function categoryMatches(pose: PoseDefinition, category: GarmentProfile["category"]): boolean {
  if (pose.garmentCategories === "all") return true;
  return pose.garmentCategories.includes(category);
}

function tagsCompatible(pose: PoseDefinition, garmentTags: Set<string>): boolean {
  for (const avoid of pose.avoidForTags) {
    if (garmentTags.has(avoid)) return false;
  }
  if (pose.garmentTags.length === 0) return true;
  const generic = new Set([
    "catalog", "ecommerce", "hero", "minimal", "luxury", "campaign", "editorial",
    "magazine", "high_fashion", "movement", "lifestyle", "commercial",
    "no_pocket_alternative", "pocket", "three_quarter", "statement", "feminine",
    "everyday", "street", "formal", "silhouette",
  ]);
  const required = pose.garmentTags.filter((tag) => !generic.has(tag));
  if (required.length === 0) return true;
  return required.some((tag) => garmentTags.has(tag));
}

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

function exposureEligible(pose: PoseDefinition, shootType: ShootType): boolean {
  if (shootType === "hero") return pose.heroEligible;
  if (shootType === "campaign") return pose.campaignEligible;
  return pose.editorialEligible;
}

function garmentCompatibilityMultiplier(
  pose: PoseDefinition,
  garmentTags: Set<string>,
): number {
  const { compatMin, compatMax } = POSE_SELECTION_TUNING;
  let multiplier = 1;
  const generic = new Set([
    "catalog", "ecommerce", "hero", "minimal", "luxury", "campaign", "editorial",
    "magazine", "high_fashion", "movement", "lifestyle", "commercial",
    "no_pocket_alternative", "pocket", "three_quarter", "statement", "feminine",
    "everyday", "street", "formal", "silhouette",
  ]);
  const styleTags = pose.garmentTags.filter((tag) => !generic.has(tag));
  if (styleTags.length > 0) {
    const matches = styleTags.filter((tag) => garmentTags.has(tag)).length;
    multiplier *= 0.85 + (matches / styleTags.length) * 0.35;
  }
  if (garmentTags.has("no_pocket") && pose.garmentTags.includes("no_pocket_alternative")) {
    multiplier *= 1.15;
  }
  if (garmentTags.has("pocket") && pose.requiresPockets) multiplier *= 1.12;
  return clamp(multiplier, compatMin, compatMax);
}

function maxVisualClusterOccurrences(count: number, shootType: ShootType): number {
  if (shootType === "hero") return 1;
  if (count <= 4) return 1;
  if (count <= 8) return 2;
  return Math.max(2, Math.ceil(count / 6));
}

function maxFamilyOccurrences(count: number, shootType: ShootType): number {
  if (shootType === "hero") return 1;
  if (count <= 4) return 1;
  if (count <= 8) return 2;
  return Math.max(2, Math.ceil(count / 6));
}

function plannerVarietyModifier(
  pose: PoseDefinition,
  selectedInBatch: PoseDefinition[],
  recentPoseSelections: RecentPoseSelection[],
  shootType: ShootType,
  profileKey: string,
  familyCountsInBatch: Map<PoseFamily, number>,
): number {
  const {
    varietyMin,
    recencyPenalty,
    inBatchStancePenalty,
    inBatchCameraPenalty,
    inBatchOrientationPenalty,
  } = POSE_SELECTION_TUNING;
  const {
    sameGarmentExactPosePenalty,
    sameGarmentFamilyPenalty,
    signatureRecencyDecay,
    highRiskSameGarmentPenalty,
    inBatchFamilyPenalty,
  } = POSE_PLANNER_TUNING;

  let modifier = 1;

  for (const recent of recentPoseSelections) {
    if (recent.profileKey !== profileKey) continue;

    if (recent.poseName.toLowerCase() === pose.name.toLowerCase()) {
      if (pose.selectionClass === "high_repetition_risk") {
        modifier *= highRiskSameGarmentPenalty;
      } else if (pose.selectionClass === "signature") {
        modifier *= signatureRecencyDecay;
      } else {
        modifier *= sameGarmentExactPosePenalty;
      }
    }

    const recentFamily = recent.poseFamily ?? getPoseDefinition(recent.poseName)?.poseFamily;
    if (recentFamily && recentFamily === pose.poseFamily) {
      modifier *= sameGarmentFamilyPenalty;
    }

    if (recent.shootType === shootType && recent.poseName.toLowerCase() === pose.name.toLowerCase()) {
      modifier *= recencyPenalty;
    }
  }

  const batchFamilyCount = familyCountsInBatch.get(pose.poseFamily) ?? 0;
  if (batchFamilyCount > 0) {
    modifier *= inBatchFamilyPenalty ** batchFamilyCount;
  }

  for (const prev of selectedInBatch) {
    if (prev.stance === pose.stance) modifier *= inBatchStancePenalty;
    if (prev.cameraAngle === pose.cameraAngle) modifier *= inBatchCameraPenalty;
    if (prev.bodyOrientation === pose.bodyOrientation) modifier *= inBatchOrientationPenalty;
  }

  return clamp(modifier, varietyMin, 1);
}

function computePlannerWeight(
  pose: PoseDefinition,
  ctx: {
    garmentTags: Set<string>;
    shootType: ShootType;
    profileKey: string;
    selectedInBatch: PoseDefinition[];
    recentPoseSelections: RecentPoseSelection[];
    familyCountsInBatch: Map<PoseFamily, number>;
    highRiskSelected: number;
  },
): number {
  let weight =
    pose.suitabilityScore *
    garmentCompatibilityMultiplier(pose, ctx.garmentTags) *
    plannerVarietyModifier(
      pose,
      ctx.selectedInBatch,
      ctx.recentPoseSelections,
      ctx.shootType,
      ctx.profileKey,
      ctx.familyCountsInBatch,
    );

  if (pose.selectionClass === "high_repetition_risk") {
    weight *= POSE_PLANNER_TUNING.highRiskWeightCap;
    const cap = POSE_PLANNER_TUNING.highRiskBatchCap[ctx.shootType];
    if (ctx.highRiskSelected >= cap) return 0;
  }

  return weight;
}

function weightedSelectOne<T>(
  candidates: T[],
  weightFn: (item: T) => number,
  rng: () => number,
): T | undefined {
  if (candidates.length === 0) return undefined;
  const weights = candidates.map((item) => Math.max(0, weightFn(item)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return candidates[0];

  let threshold = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    threshold -= weights[i]!;
    if (threshold <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

function resolvePocketPose(
  pose: PoseDefinition,
  hasPockets: boolean,
  alternativeIndex: number,
): PoseDefinition {
  if (!pose.requiresPockets || hasPockets) return pose;
  const altName = POCKET_ALTERNATIVE_POSES[alternativeIndex % POCKET_ALTERNATIVE_POSES.length]!;
  return getPoseDefinition(altName) ?? getPoseDefinition("Hip Rest Pose")!;
}

/**
 * Plan N distinct poses with family-aware batch diversity and same-garment memory.
 */
export function planPosesForShoot(ctx: PosePlannerContext): PosePlanResult {
  const {
    profile,
    shootType,
    count,
    modelGender,
    usedPoses = [],
    recentPoseSelections = [],
    seed,
  } = ctx;

  const planNotes: string[] = [];
  const gender = resolveModelGender(modelGender, profile.gender);
  const garmentTags = inferGarmentTags(profile);
  const hasPockets = garmentHasUsablePockets(profile);
  const profileKey = buildPoseProfileKey(profile);
  const sessionUsed = new Set(usedPoses.map((p) => p.toLowerCase()));
  const rng = createRng(seed ?? Date.now());
  const familyCap = maxFamilyOccurrences(count, shootType);
  const visualClusterCap = maxVisualClusterOccurrences(count, shootType);

  let compatible = filterCompatiblePoses(getPosesInCollection(shootType), {
    gender,
    profile,
    garmentTags,
    hasPockets,
    usedPoses: sessionUsed,
  }).filter((pose) => exposureEligible(pose, shootType));

  if (compatible.length < count) {
    compatible = filterCompatiblePoses(getPosesInCollection(shootType), {
      gender,
      profile,
      garmentTags,
      hasPockets,
      usedPoses: sessionUsed,
    });
    planNotes.push("Exposure band relaxed — insufficient eligible poses");
  }

  if (compatible.length === 0) {
    planNotes.push("No compatible poses — Relaxed Standing fallback");
    const fallback = getPoseDefinition("Relaxed Standing")!;
    return {
      poses: Array.from({ length: count }, () => ({
        name: fallback.name,
        family: fallback.poseFamily,
        selectionClass: fallback.selectionClass,
      })),
      planNotes,
    };
  }

  const selected: PoseDefinition[] = [];
  const familyCounts = new Map<PoseFamily, number>();
  const visualClusterCounts = new Map<string, number>();
  let highRiskSelected = 0;
  let pocketAltIndex = 0;

  for (let slot = 0; slot < count; slot++) {
    const weightCtx = {
      garmentTags,
      shootType,
      profileKey,
      selectedInBatch: selected,
      recentPoseSelections,
      familyCountsInBatch: familyCounts,
      highRiskSelected,
    };

    const pool = compatible.filter((pose) => {
      if (selected.some((s) => s.name === pose.name)) return false;
      const familyCount = familyCounts.get(pose.poseFamily) ?? 0;
      if (familyCount >= familyCap) return false;
      if (pose.visualCluster) {
        const clusterCount = visualClusterCounts.get(pose.visualCluster) ?? 0;
        if (clusterCount >= visualClusterCap) return false;
      }
      if (
        pose.selectionClass === "high_repetition_risk" &&
        highRiskSelected >= POSE_PLANNER_TUNING.highRiskBatchCap[shootType]
      ) {
        return false;
      }
      return true;
    });

    const pickPool = pool.length > 0 ? pool : compatible.filter(
      (pose) => !selected.some((s) => s.name === pose.name),
    );

    const pick = weightedSelectOne(pickPool, (pose) => computePlannerWeight(pose, weightCtx), rng);
    if (!pick) break;

    let resolved = resolvePocketPose(pick, hasPockets, pocketAltIndex);
    if (pick.requiresPockets && !hasPockets) pocketAltIndex += 1;

    selected.push(resolved);
    familyCounts.set(resolved.poseFamily, (familyCounts.get(resolved.poseFamily) ?? 0) + 1);
    if (resolved.visualCluster) {
      visualClusterCounts.set(
        resolved.visualCluster,
        (visualClusterCounts.get(resolved.visualCluster) ?? 0) + 1,
      );
    }
    if (resolved.selectionClass === "high_repetition_risk") highRiskSelected += 1;
  }

  while (selected.length < count) {
    const fallback = getPoseDefinition("Relaxed Standing");
    if (fallback && !selected.some((s) => s.name === fallback.name)) {
      selected.push(fallback);
    } else {
      break;
    }
  }

  if (recentPoseSelections.length > 0) {
    planNotes.push(`Same-garment history: ${recentPoseSelections.length} prior selection(s) applied`);
  }
  planNotes.push(`Family cap per batch: ${familyCap} (N=${count}, ${shootType})`);
  planNotes.push(`Visual cluster cap per batch: ${visualClusterCap}`);

  const uniqueFamilies = new Set(selected.map((p) => p.poseFamily)).size;
  planNotes.push(`Batch family diversity: ${uniqueFamilies} distinct families in ${selected.length} pose(s)`);
  const uniqueClusters = new Set(selected.map((p) => p.visualCluster).filter(Boolean)).size;
  if (uniqueClusters > 0) {
    planNotes.push(`Batch visual cluster diversity: ${uniqueClusters} distinct cluster(s)`);
  }

  return {
    poses: selected.slice(0, count).map((p) => ({
      name: p.name,
      family: p.poseFamily,
      selectionClass: p.selectionClass,
    })),
    planNotes,
  };
}

/** Default image count for a shoot type — overridable for future custom campaigns. */
export function defaultShotCountForShootType(shootType: ShootType): number {
  if (shootType === "editorial") return 4;
  if (shootType === "campaign") return 2;
  return 1;
}
