#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Phase 5 — Campaign Composition Simulation
// Run: node --experimental-strip-types scripts/campaign-composition-simulation.ts
// ---------------------------------------------------------------------------

import { POSE_NAMES } from "../src/intelligence/pose-library.ts";
import {
  POSE_BUCKET_MEMBERSHIP,
  POSE_BUCKET_LABELS,
  resolveBatchRecipeSlots,
  getPrimaryPoseBucket,
  type PoseBucketId,
} from "../src/intelligence/pose-buckets.ts";
import { planCampaignComposition } from "../src/intelligence/campaign-composition-planner.ts";
import { getPoseDefinition } from "../src/intelligence/pose-library.ts";
import type { GarmentProfile } from "../src/intelligence/types.ts";

const femaleDressProfile: GarmentProfile = {
  category: "one-pieces",
  subcategory: "Evening Gown",
  gender: "womens",
  fit: "structured",
  fabric: "silk satin",
  occasion: ["formal", "evening"],
  garmentLength: "maxi",
  isFlowingGarment: true,
  hasPockets: false,
};

const jeansProfile: GarmentProfile = {
  category: "bottoms",
  subcategory: "Jeans",
  gender: "womens",
  fit: "slim",
  fabric: "denim",
  occasion: ["casual"],
  garmentLength: "full-length",
  hasPockets: true,
};

interface SimulationStats {
  bucketDistribution: Record<string, number>;
  uniquePoseIds: number;
  uniqueFamilies: number;
  seatedCount: number;
  movementCount: number;
  profileCount: number;
  standingCount: number;
  visualClusters: Record<string, number>;
}

function simulateBatch(
  profile: GarmentProfile,
  count: number,
  seed: number,
): SimulationStats {
  const plan = planCampaignComposition({
    profile,
    shootType: "campaign",
    count,
    modelGender: "womens",
    seed,
  });

  const bucketDistribution: Record<string, number> = {};
  let seatedCount = 0;
  let movementCount = 0;
  let profileCount = 0;
  let standingCount = 0;
  const visualClusters: Record<string, number> = {};
  const families = new Set<string>();

  for (const planned of plan.poses) {
    const def = getPoseDefinition(planned.name)!;
    const bucket = getPrimaryPoseBucket(planned.name);
    bucketDistribution[bucket] = (bucketDistribution[bucket] ?? 0) + 1;
    families.add(planned.family);

    if (bucket === "seated" || def.stance === "sitting") seatedCount += 1;
    if (bucket === "walking_movement" || def.stance === "movement") movementCount += 1;
    if (bucket === "profile_directional") profileCount += 1;
    if (bucket === "standing_classic" || def.stance === "standing") standingCount += 1;
    if (def.visualCluster) {
      visualClusters[def.visualCluster] = (visualClusters[def.visualCluster] ?? 0) + 1;
    }
  }

  return {
    bucketDistribution,
    uniquePoseIds: new Set(plan.poses.map((p) => p.name)).size,
    uniqueFamilies: families.size,
    seatedCount,
    movementCount,
    profileCount,
    standingCount,
    visualClusters,
  };
}

function aggregateStats(runs: SimulationStats[]) {
  const bucketTotals: Record<string, number> = {};
  let seatedTotal = 0;
  let movementTotal = 0;
  let profileTotal = 0;
  let standingTotal = 0;
  let uniquePoseTotal = 0;
  let uniqueFamilyTotal = 0;

  for (const run of runs) {
    seatedTotal += run.seatedCount;
    movementTotal += run.movementCount;
    profileTotal += run.profileCount;
    standingTotal += run.standingCount;
    uniquePoseTotal += run.uniquePoseIds;
    uniqueFamilyTotal += run.uniqueFamilies;
    for (const [bucket, count] of Object.entries(run.bucketDistribution)) {
      bucketTotals[bucket] = (bucketTotals[bucket] ?? 0) + count;
    }
  }

  const n = runs.length;
  return {
    avgSeated: seatedTotal / n,
    avgMovement: movementTotal / n,
    avgProfile: profileTotal / n,
    avgStanding: standingTotal / n,
    avgUniquePoses: uniquePoseTotal / n,
    avgUniqueFamilies: uniqueFamilyTotal / n,
    bucketTotals,
    runs: n,
  };
}

function runSimulation(
  label: string,
  profile: GarmentProfile,
  count: number,
  seeds: number,
) {
  const runs: SimulationStats[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    runs.push(simulateBatch(profile, count, seed));
  }
  const agg = aggregateStats(runs);

  console.log(`\n=== ${label} — N=${count} × ${seeds} seeds ===`);
  console.log(`Avg unique pose IDs: ${agg.avgUniquePoses.toFixed(2)}`);
  console.log(`Avg unique families: ${agg.avgUniqueFamilies.toFixed(2)}`);
  console.log(`Avg seated: ${agg.avgSeated.toFixed(2)}`);
  console.log(`Avg movement: ${agg.avgMovement.toFixed(2)}`);
  console.log(`Avg profile: ${agg.avgProfile.toFixed(2)}`);
  console.log(`Avg standing (classic bucket + standing stance): ${agg.avgStanding.toFixed(2)}`);
  console.log("Bucket totals across all runs:");
  for (const [bucket, total] of Object.entries(agg.bucketTotals).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${POSE_BUCKET_LABELS[bucket as PoseBucketId]}: ${total} (${(total / (count * seeds) * 100).toFixed(1)}% of slots)`);
  }
}

console.log("=== Phase 5 Campaign Composition Simulation ===");
console.log("Canonical poses:", POSE_NAMES.length);
console.log("Bucket mappings:", Object.keys(POSE_BUCKET_MEMBERSHIP).length);

const missing = POSE_NAMES.filter((name) => !POSE_BUCKET_MEMBERSHIP[name]);
if (missing.length > 0) {
  console.error("Missing bucket membership:", missing.join(", "));
  process.exit(1);
}

console.log("\n--- Recipe slot preview ---");
for (const n of [4, 5, 6, 7, 8, 12, 16, 20]) {
  const slots = resolveBatchRecipeSlots(n);
  console.log(`N=${n}: ${slots.map((b) => b.replace(/_/g, " ")).join(" → ")}`);
}

runSimulation("Evening Gown", femaleDressProfile, 6, 100);
runSimulation("Evening Gown", femaleDressProfile, 8, 100);
runSimulation("Evening Gown", femaleDressProfile, 12, 100);
runSimulation("Jeans", jeansProfile, 20, 50);

console.log("\n--- Preset parity check (composition OFF path unchanged) ---");
import { planPosesForShoot } from "../src/intelligence/pose-planner.ts";
const presetEditorial = planPosesForShoot({
  profile: femaleDressProfile,
  shootType: "editorial",
  count: 4,
  modelGender: "womens",
  seed: 42,
});
console.log("Editorial preset (seed=42):", presetEditorial.poses.map((p) => p.name).join(", "));
console.log("Uses bucket notes:", presetEditorial.planNotes.some((n) => n.includes("Bucket recipe")));

console.log("\n--- Custom Campaign composition (seed=42) ---");
const custom6 = planCampaignComposition({
  profile: femaleDressProfile,
  shootType: "campaign",
  count: 6,
  modelGender: "womens",
  seed: 42,
});
console.log("Custom 6 (seed=42):", custom6.poses.map((p) => p.name).join(", "));
console.log("Plan notes:");
for (const note of custom6.planNotes) console.log(`  • ${note}`);

console.log("\nDone.");
