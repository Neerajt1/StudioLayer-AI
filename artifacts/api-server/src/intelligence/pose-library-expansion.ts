// ---------------------------------------------------------------------------
// Phase 5B — expansion poses merged into pose-library-catalog.ts.
// This module remains for backward-compatible import paths only.
// ---------------------------------------------------------------------------

export const POSE_EXPANSION_NAMES = [] as const;
export type PoseExpansionName = never;

export const POSE_EXPANSION_HERO: readonly never[] = [];
export const POSE_EXPANSION_CAMPAIGN: readonly never[] = [];
export const POSE_EXPANSION_EDITORIAL: readonly never[] = [];

export const POSE_EXPANSION_INTELLIGENCE = {} as const;
export const POSE_EXPANSION_DEFINITIONS = {} as const;

export function isExpansionPoseName(_name: string): _name is PoseExpansionName {
  return false;
}
