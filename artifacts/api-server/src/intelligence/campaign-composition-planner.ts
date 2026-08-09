// ---------------------------------------------------------------------------
// Campaign Composition Planner — Phase 5
//
// Sits above the Phase 2 pose planner:
//   Batch Recipe → Bucket Slots → planPosesWithBucketSlots()
// ---------------------------------------------------------------------------

import { resolveBatchRecipeSlots } from "./pose-buckets";
import { planPosesWithBucketSlots, type PosePlannerContext, type PosePlanResult } from "./pose-planner";

export function planCampaignComposition(ctx: PosePlannerContext): PosePlanResult {
  const bucketSlots = resolveBatchRecipeSlots(ctx.count);
  return planPosesWithBucketSlots(ctx, bucketSlots);
}
