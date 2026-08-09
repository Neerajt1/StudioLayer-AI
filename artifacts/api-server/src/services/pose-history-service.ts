// ---------------------------------------------------------------------------
// Pose History Service — Phase 2
//
// Loads prior pose selections for the same user + uploaded garment (sourceImageUrl).
// Garment article identity uses the existing stable sourceImageUrl — no new article ID.
// ---------------------------------------------------------------------------

import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, rendersTable } from "@workspace/db";
import type { PoseFamily, PoseName, ShootType } from "../intelligence/pose-library";
import {
  buildPoseProfileKey,
  type RecentPoseSelection,
} from "../intelligence/pose-selection-engine";
import type { GarmentProfile } from "../intelligence/types";

export const POSE_HISTORY_LOOKBACK = 48;

/** Stable garment article key — same upload URL = same garment article. */
export function buildGarmentArticleKey(sourceImageUrl: string): string {
  return sourceImageUrl.trim();
}

function shootTypeFromGenerationType(generationType: string | null): ShootType {
  if (generationType === "editorial") return "editorial";
  if (generationType === "campaign") return "campaign";
  return "hero";
}

export async function loadRecentPoseSelections(params: {
  userId: number;
  sourceImageUrl: string;
  profile: GarmentProfile;
  shootType?: ShootType;
  limit?: number;
}): Promise<RecentPoseSelection[]> {
  const { userId, sourceImageUrl, profile, shootType, limit = POSE_HISTORY_LOOKBACK } = params;
  const profileKey = buildPoseProfileKey(profile);
  const garmentKey = buildGarmentArticleKey(sourceImageUrl);

  const rows = await db
    .select({
      selectedPoseName: rendersTable.selectedPoseName,
      selectedPoseFamily: rendersTable.selectedPoseFamily,
      generationType: rendersTable.generationType,
    })
    .from(rendersTable)
    .where(
      and(
        eq(rendersTable.userId, userId),
        eq(rendersTable.sourceImageUrl, garmentKey),
        eq(rendersTable.status, "completed"),
        isNotNull(rendersTable.selectedPoseName),
      ),
    )
    .orderBy(desc(rendersTable.createdAt))
    .limit(limit);

  const results: RecentPoseSelection[] = [];
  for (const row of rows) {
    const name = row.selectedPoseName as PoseName;
    const rowShootType = shootTypeFromGenerationType(row.generationType);
    if (shootType && rowShootType !== shootType) continue;
    results.push({
      poseName: name,
      shootType: rowShootType,
      profileKey,
      poseFamily: (row.selectedPoseFamily as PoseFamily | null) ?? undefined,
    });
  }
  return results;
}

export async function saveRenderPoseSelection(params: {
  renderId: number;
  poseName: PoseName;
  poseFamily: PoseFamily;
}): Promise<void> {
  await db
    .update(rendersTable)
    .set({
      selectedPoseName: params.poseName,
      selectedPoseFamily: params.poseFamily,
    })
    .where(eq(rendersTable.id, params.renderId));
}
