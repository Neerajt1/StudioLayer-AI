// ---------------------------------------------------------------------------
// Shared pose selection types (Phase 2).
// ---------------------------------------------------------------------------

import type { PoseFamily, PoseName, ShootType } from "./pose-library";

/** Cross-request recency memory entry for variety modifier and planner. */
export interface RecentPoseSelection {
  poseName: PoseName;
  shootType: ShootType;
  /** Fingerprint from buildPoseProfileKey() — category + subcategory. */
  profileKey: string;
  /** Persisted family for same-garment family-level recency. */
  poseFamily?: PoseFamily;
}

export interface PoseSelectionContext {
  profile: import("./types").GarmentProfile;
  shootType: ShootType;
  count: number;
  modelGender?: string | null;
  usedPoses?: string[];
  recentPoseSelections?: RecentPoseSelection[];
  seed?: number;
  /** Custom Campaign — use bucket recipe + composition planner (Phase 5). */
  useCampaignComposition?: boolean;
}
