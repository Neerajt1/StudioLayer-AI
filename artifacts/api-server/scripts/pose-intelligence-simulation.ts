#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Pose Intelligence Phase 2 — offline simulation (no DB required)
// Run: node --experimental-strip-types scripts/pose-intelligence-simulation.ts
// Or after build: node dist/scripts/pose-intelligence-simulation.js
// ---------------------------------------------------------------------------

import { POSE_NAMES, HERO_COLLECTION, CAMPAIGN_COLLECTION, EDITORIAL_COLLECTION } from "../src/intelligence/pose-library.ts";
import { planPosesForShoot } from "../src/intelligence/pose-planner.ts";
import type { GarmentProfile } from "../src/intelligence/types.ts";
import type { RecentPoseSelection } from "../src/intelligence/pose-selection-types.ts";

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

function simulateEditorialWithHistory(
  label: string,
  history: RecentPoseSelection[],
  seed: number,
) {
  const plan = planPosesForShoot({
    profile: femaleDressProfile,
    shootType: "editorial",
    count: 4,
    modelGender: "womens",
    recentPoseSelections: history,
    seed,
  });
  const hairFamilyCount = plan.poses.filter((p) => p.family === "hair_face_interaction").length;
  const hairTouchCount = plan.poses.filter((p) => p.name === "Portrait — Hair Frame").length;
  console.log(`\n--- ${label} (seed=${seed}) ---`);
  console.log("Poses:", plan.poses.map((p) => `${p.name} [${p.family}]`).join(" | "));
  console.log("Hair/face family in batch:", hairFamilyCount);
  console.log("Portrait — Hair Frame count:", hairTouchCount);
  console.log("Plan notes:", plan.planNotes.join("; "));
  return { plan, hairTouchCount, hairFamilyCount };
}

console.log("=== Pose Intelligence Phase 2 Simulation ===");
console.log("Total canonical poses:", POSE_NAMES.length);
console.log("Hero collection:", HERO_COLLECTION.length);
console.log("Campaign collection:", CAMPAIGN_COLLECTION.length);
console.log("Editorial collection:", EDITORIAL_COLLECTION.length);

// Baseline editorial — no history
const baseline = simulateEditorialWithHistory("Editorial baseline (no history)", [], 42);

// Same garment — prior campaign used Hair Touch + Magazine Cover
const priorHistory: RecentPoseSelection[] = [
  {
    poseName: "Portrait — Hair Frame",
    shootType: "editorial",
    profileKey: "one-pieces:evening gown",
    poseFamily: "hair_face_interaction",
  },
  {
    poseName: "Magazine Cover Pose",
    shootType: "editorial",
    profileKey: "one-pieces:evening gown",
    poseFamily: "hair_face_interaction",
  },
  {
    poseName: "Walking Towards Camera",
    shootType: "campaign",
    profileKey: "one-pieces:evening gown",
    poseFamily: "walking_motion",
  },
  {
    poseName: "Looking Over Shoulder",
    shootType: "editorial",
    profileKey: "one-pieces:evening gown",
    poseFamily: "turning_over_shoulder",
  },
];

const withHistory = simulateEditorialWithHistory("Editorial with same-garment history", priorHistory, 42);

// Second campaign — should differ from first
const campaign1 = planPosesForShoot({
  profile: femaleDressProfile,
  shootType: "campaign",
  count: 2,
  modelGender: "womens",
  seed: 100,
});
const campaign2 = planPosesForShoot({
  profile: femaleDressProfile,
  shootType: "campaign",
  count: 2,
  modelGender: "womens",
  recentPoseSelections: campaign1.poses.map((p) => ({
    poseName: p.name,
    shootType: "campaign",
    profileKey: "one-pieces:evening gown",
    poseFamily: p.family,
  })),
  seed: 101,
});

console.log("\n--- Campaign diversity (same garment) ---");
console.log("Campaign 1:", campaign1.poses.map((p) => p.name).join(", "));
console.log("Campaign 2 (after history):", campaign2.poses.map((p) => p.name).join(", "));
const overlap = campaign1.poses.filter((p) => campaign2.poses.some((q) => q.name === p.name));
console.log("Exact pose overlap:", overlap.length === 0 ? "none" : overlap.map((p) => p.name).join(", "));

console.log("\n--- Summary ---");
console.log("Baseline Hair Touch count:", baseline.hairTouchCount);
console.log("With-history Hair Touch count:", withHistory.hairTouchCount);
console.log("Hair/face family reduced with history:", withHistory.hairFamilyCount <= baseline.hairFamilyCount);
