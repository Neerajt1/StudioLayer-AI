// ---------------------------------------------------------------------------
// Remove Background — API refinement type (Phase 2)
//
// Backend POST /renders still accepts refinementType for lineage compatibility.
// User-facing UI exposes only "Remove Background" — no Face/Garment enhance.
// ---------------------------------------------------------------------------

/** API value sent to POST /renders for background removal. */
export type RemoveBackgroundRefinementType = 'remove_background';

/** @deprecated Use RemoveBackgroundRefinementType — kept for gradual migration. */
export type RefinementType = RemoveBackgroundRefinementType;

export const REMOVE_BACKGROUND_TYPE: RemoveBackgroundRefinementType = 'remove_background';
