// ---------------------------------------------------------------------------
// Pose Buckets — Phase 5 Campaign Composition (derived membership)
//
// Bucket membership is derived from Phase 5B pose catalog metadata.
// Recipe / interpolation logic unchanged — keys updated for new pose names.
// ---------------------------------------------------------------------------

import type { PoseName } from "./pose-library";
import { POSE_CATALOG } from "./pose-library-catalog";
import type { PoseCatalogSpec } from "./pose-vocabulary-types";

/** Primary creative buckets — every pose has exactly one. */
export type PoseBucketId =
  | "standing_classic"
  | "s_curve_editorial"
  | "hands_position"
  | "garment_interaction"
  | "walking_movement"
  | "profile_directional"
  | "seated"
  | "low_level"
  | "gaze_mood"
  | "torso_contrast"
  | "editorial_attitude"
  | "rear_back"
  | "ethnic_interaction";

export const POSE_BUCKET_LABELS: Record<PoseBucketId, string> = {
  standing_classic: "Standing / Classic Presentation",
  s_curve_editorial: "S-Curve / Contrapposto",
  hands_position: "Hands / Natural Hand Position",
  garment_interaction: "Garment Interaction",
  walking_movement: "Walking / Movement",
  profile_directional: "Profile / Directional",
  seated: "Seated",
  low_level: "Low-Level / Kneeling / Floor",
  gaze_mood: "Gaze / Face Direction",
  torso_contrast: "Torso / Face Contrast",
  editorial_attitude: "Editorial / High Fashion",
  rear_back: "Rear / Back Presentation",
  ethnic_interaction: "Ethnic Garment Interaction",
};

export const BUCKET_SLOT_PRIORITY: readonly PoseBucketId[] = [
  "standing_classic",
  "walking_movement",
  "seated",
  "profile_directional",
  "hands_position",
  "garment_interaction",
  "s_curve_editorial",
  "editorial_attitude",
  "gaze_mood",
  "torso_contrast",
  "low_level",
  "rear_back",
  "ethnic_interaction",
];

export const ADJACENT_POSE_BUCKETS: Record<PoseBucketId, readonly PoseBucketId[]> = {
  standing_classic: ["s_curve_editorial", "editorial_attitude", "hands_position"],
  s_curve_editorial: ["standing_classic", "editorial_attitude", "hands_position"],
  hands_position: ["standing_classic", "s_curve_editorial", "garment_interaction"],
  garment_interaction: ["hands_position", "s_curve_editorial", "ethnic_interaction"],
  walking_movement: ["profile_directional", "editorial_attitude", "standing_classic"],
  profile_directional: ["walking_movement", "gaze_mood", "rear_back"],
  seated: ["low_level", "editorial_attitude", "hands_position"],
  low_level: ["seated", "editorial_attitude", "walking_movement"],
  gaze_mood: ["torso_contrast", "profile_directional", "editorial_attitude"],
  torso_contrast: ["gaze_mood", "s_curve_editorial", "editorial_attitude"],
  editorial_attitude: ["standing_classic", "s_curve_editorial", "gaze_mood"],
  rear_back: ["profile_directional", "walking_movement", "standing_classic"],
  ethnic_interaction: ["garment_interaction", "hands_position", "editorial_attitude"],
};

export interface PoseBucketMembership {
  primary: PoseBucketId;
  secondary: PoseBucketId[];
}

function derivePrimaryBucket(spec: PoseCatalogSpec): PoseBucketId {
  if (spec.category === "Portrait") return "gaze_mood";
  if (spec.category === "Garment Interaction") {
    if (spec.garmentTags.includes("saree") || spec.garmentTags.includes("dupatta")) {
      return "ethnic_interaction";
    }
    return "garment_interaction";
  }
  if (spec.category === "Movement") return "walking_movement";
  if (spec.category === "Seated") return "seated";
  if (spec.category === "Floor") return "low_level";
  if (spec.category === "Rear/Profile") {
    if (spec.coveragePurpose.includes("rear") || spec.bodyOrientation === "rear") {
      return "rear_back";
    }
    return "profile_directional";
  }
  if (spec.category === "Editorial") {
    if (spec.poseFamily === "torso_face_contrast") return "torso_contrast";
    return "editorial_attitude";
  }

  if (spec.visualCluster === "feminine_s_curve") return "s_curve_editorial";
  if (spec.requiresPockets || spec.interaction.includes("pocket")) return "hands_position";
  if (
    spec.bodyGeometry.some((g) => g.includes("contrapposto") || g.includes("s_curve") || g.includes("hip_shift"))
  ) {
    return "s_curve_editorial";
  }
  if (spec.prop !== "none" && spec.bodyState === "standing") return "editorial_attitude";
  if (spec.bodyState === "leaning") return "editorial_attitude";
  return "standing_classic";
}

function deriveSecondaryBuckets(spec: PoseCatalogSpec, primary: PoseBucketId): PoseBucketId[] {
  const secondary: PoseBucketId[] = [];
  if (spec.prop === "stool" && primary !== "seated") secondary.push("seated");
  if (spec.prop === "chair" && primary !== "seated") secondary.push("seated");
  if (spec.prop === "wall" && primary !== "editorial_attitude") secondary.push("editorial_attitude");
  if (spec.interaction.includes("garment") && primary !== "garment_interaction") {
    secondary.push("garment_interaction");
  }
  return secondary;
}

function buildBucketMembership(): Record<PoseName, PoseBucketMembership> {
  const result = {} as Record<PoseName, PoseBucketMembership>;
  for (const spec of POSE_CATALOG) {
    const primary = derivePrimaryBucket(spec);
    result[spec.name as PoseName] = {
      primary,
      secondary: deriveSecondaryBuckets(spec, primary),
    };
  }
  return result;
}

export const POSE_BUCKET_MEMBERSHIP: Record<PoseName, PoseBucketMembership> =
  buildBucketMembership();

export function getPrimaryPoseBucket(poseName: PoseName): PoseBucketId {
  return POSE_BUCKET_MEMBERSHIP[poseName].primary;
}

export function getSecondaryPoseBuckets(poseName: PoseName): PoseBucketId[] {
  return POSE_BUCKET_MEMBERSHIP[poseName].secondary;
}

export type BucketCountMap = Partial<Record<PoseBucketId, number>>;

export const BATCH_RECIPE_ANCHORS: readonly number[] = [1, 2, 4, 5, 6, 8, 12, 16, 20];

export const BATCH_RECIPE_COUNTS: Record<number, BucketCountMap> = {
  1: { standing_classic: 1 },
  2: { standing_classic: 1, walking_movement: 1 },
  4: {
    standing_classic: 1,
    seated: 1,
    walking_movement: 1,
    hands_position: 1,
  },
  5: {
    standing_classic: 1,
    seated: 1,
    walking_movement: 1,
    profile_directional: 1,
    s_curve_editorial: 1,
  },
  6: {
    standing_classic: 1,
    seated: 1,
    walking_movement: 1,
    profile_directional: 1,
    hands_position: 1,
    s_curve_editorial: 1,
  },
  8: {
    standing_classic: 2,
    seated: 1,
    walking_movement: 1,
    profile_directional: 1,
    hands_position: 1,
    garment_interaction: 1,
    s_curve_editorial: 1,
    editorial_attitude: 1,
  },
  12: {
    standing_classic: 2,
    seated: 2,
    walking_movement: 2,
    profile_directional: 1,
    hands_position: 1,
    garment_interaction: 1,
    s_curve_editorial: 1,
    editorial_attitude: 1,
    gaze_mood: 1,
  },
  16: {
    standing_classic: 3,
    seated: 2,
    walking_movement: 2,
    profile_directional: 2,
    hands_position: 2,
    garment_interaction: 2,
    s_curve_editorial: 2,
    editorial_attitude: 1,
    gaze_mood: 1,
    low_level: 1,
  },
  20: {
    standing_classic: 4,
    seated: 3,
    walking_movement: 3,
    profile_directional: 2,
    hands_position: 2,
    garment_interaction: 2,
    s_curve_editorial: 2,
    editorial_attitude: 2,
    gaze_mood: 2,
    low_level: 1,
    rear_back: 1,
  },
};

function cloneBucketCounts(source: BucketCountMap): BucketCountMap {
  return { ...source };
}

function sumBucketCounts(counts: BucketCountMap): number {
  return Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);
}

function enforceSeatedMinimum(counts: BucketCountMap, imageCount: number): BucketCountMap {
  const next = cloneBucketCounts(counts);
  const seated = next.seated ?? 0;

  let required = 0;
  if (imageCount >= 12) required = 2;
  else if (imageCount >= 8) required = 2;
  else if (imageCount >= 5) required = 1;

  if (seated >= required) return next;

  const deficit = required - seated;
  next.seated = required;

  let remaining = deficit;
  for (const bucket of ["editorial_attitude", "hands_position", "gaze_mood", "standing_classic"] as PoseBucketId[]) {
    if (remaining <= 0) break;
    const current = next[bucket] ?? 0;
    if (current <= 0) continue;
    const take = Math.min(current, remaining);
    next[bucket] = current - take;
    if (next[bucket] === 0) delete next[bucket];
    remaining -= take;
  }

  return next;
}

function enforceCompositionMinimums(counts: BucketCountMap, imageCount: number): BucketCountMap {
  let next = enforceSeatedMinimum(counts, imageCount);

  if (imageCount >= 4 && (next.standing_classic ?? 0) < 1) {
    next.standing_classic = 1;
    for (const bucket of ["editorial_attitude", "hands_position", "gaze_mood"] as PoseBucketId[]) {
      const current = next[bucket] ?? 0;
      if (current <= 0) continue;
      next[bucket] = current - 1;
      if (next[bucket] === 0) delete next[bucket];
      break;
    }
  }

  const total = sumBucketCounts(next);
  if (total > imageCount) {
    let excess = total - imageCount;
    for (const bucket of ["editorial_attitude", "hands_position", "gaze_mood", "garment_interaction"] as PoseBucketId[]) {
      if (excess <= 0) break;
      const current = next[bucket] ?? 0;
      if (current <= 0) continue;
      const take = Math.min(current, excess);
      next[bucket] = current - take;
      if (next[bucket] === 0) delete next[bucket];
      excess -= take;
    }
  }

  return next;
}

function interpolateBucketCounts(imageCount: number): BucketCountMap {
  if (BATCH_RECIPE_COUNTS[imageCount]) {
    return enforceCompositionMinimums(cloneBucketCounts(BATCH_RECIPE_COUNTS[imageCount]!), imageCount);
  }

  let lowerAnchor = BATCH_RECIPE_ANCHORS[0]!;
  let upperAnchor = BATCH_RECIPE_ANCHORS[BATCH_RECIPE_ANCHORS.length - 1]!;

  for (const anchor of BATCH_RECIPE_ANCHORS) {
    if (anchor <= imageCount) lowerAnchor = anchor;
    if (anchor >= imageCount) {
      upperAnchor = anchor;
      break;
    }
  }

  if (lowerAnchor === upperAnchor) {
    return cloneBucketCounts(BATCH_RECIPE_COUNTS[lowerAnchor]!);
  }

  const lower = BATCH_RECIPE_COUNTS[lowerAnchor]!;
  const upper = BATCH_RECIPE_COUNTS[upperAnchor]!;
  const t = (imageCount - lowerAnchor) / (upperAnchor - lowerAnchor);

  const allBuckets = new Set<PoseBucketId>([
    ...(Object.keys(lower) as PoseBucketId[]),
    ...(Object.keys(upper) as PoseBucketId[]),
  ]);

  const interpolated: BucketCountMap = {};
  let total = 0;

  for (const bucket of allBuckets) {
    const lowerCount = lower[bucket] ?? 0;
    const upperCount = upper[bucket] ?? 0;
    const value = Math.round(lowerCount + (upperCount - lowerCount) * t);
    if (value > 0) {
      interpolated[bucket] = value;
      total += value;
    }
  }

  if (total > imageCount) {
    let excess = total - imageCount;
    for (const bucket of ["editorial_attitude", "hands_position", "gaze_mood"] as PoseBucketId[]) {
      if (excess <= 0) break;
      const current = interpolated[bucket] ?? 0;
      if (current <= 0) continue;
      const take = Math.min(current, excess);
      interpolated[bucket] = current - take;
      excess -= take;
      if (interpolated[bucket] === 0) delete interpolated[bucket];
    }
  }

  if (total < imageCount) {
    let deficit = imageCount - total;
    for (const bucket of ["editorial_attitude", "garment_interaction", "gaze_mood", "torso_contrast", "low_level", "rear_back"] as PoseBucketId[]) {
      if (deficit <= 0) break;
      interpolated[bucket] = (interpolated[bucket] ?? 0) + 1;
      deficit -= 1;
    }
  }

  return enforceCompositionMinimums(interpolated, imageCount);
}

export function expandBucketCountsToSlots(counts: BucketCountMap): PoseBucketId[] {
  const remaining = cloneBucketCounts(counts);
  const slots: PoseBucketId[] = [];
  const total = sumBucketCounts(remaining);

  while (slots.length < total) {
    let progressed = false;
    for (const bucket of BUCKET_SLOT_PRIORITY) {
      const left = remaining[bucket] ?? 0;
      if (left <= 0) continue;
      slots.push(bucket);
      remaining[bucket] = left - 1;
      progressed = true;
      if (slots.length >= total) break;
    }
    if (!progressed) break;
  }

  return slots;
}

export function resolveBatchRecipeSlots(imageCount: number): PoseBucketId[] {
  const counts = enforceCompositionMinimums(interpolateBucketCounts(imageCount), imageCount);
  let slots = expandBucketCountsToSlots(counts);

  if (slots.length > imageCount) {
    slots = slots.slice(0, imageCount);
  }

  while (slots.length < imageCount) {
    slots.push("editorial_attitude");
  }

  return slots;
}
