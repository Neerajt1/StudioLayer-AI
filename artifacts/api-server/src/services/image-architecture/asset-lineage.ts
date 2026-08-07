// ---------------------------------------------------------------------------
// StudioLayer AI — Asset Versioning & Lineage (Batch 23A)
//
// Every render carries explicit lineage: master ID, parent ID, version, type.
// Versions are immutable — Master = 1, each derivative = parent version + 1.
// ---------------------------------------------------------------------------

import type { RefinementType } from "../refinement/refinement-types.js";

/** Explicit asset types — never inferred from filenames or URLs. */
export type AssetType =
  | "master"
  | "crop"
  | "face_enhanced"
  | "garment_enhanced"
  | "background_removed"
  | "upscale"
  | "colour_corrected"
  | "print_export"
  | "story_export"
  /** Pre-lineage refinements backfilled without stored refinement type. */
  | "legacy_refinement";

export type CropPreset =
  | "original"
  | "portrait"
  | "full_body"
  | "square"
  | "story"
  | "landscape"
  | "banner";

export const MASTER_ASSET_VERSION = 1;

export interface AssetLineageNode {
  id: number;
  parentRenderId?: number | null;
  masterRenderId?: number | null;
  assetVersion?: number | null;
  assetType?: string | null;
  refinementType?: string | null;
  sourceAssetVersion?: number | null;
  cropPreset?: string | null;
  createdAt?: Date | string;
  studioCreditsUsed?: number | null;
}

/** Persisted lineage fields for database insert. */
export interface AssetLineageInsert {
  masterRenderId: number | null;
  parentRenderId: number | null;
  assetVersion: number;
  assetType: AssetType;
  refinementType: string | null;
  sourceAssetVersion: number | null;
  cropPreset: string | null;
}

/** Complete auditable lineage record exposed on each render. */
export interface AssetLineageRecord {
  masterAssetId: number;
  parentAssetId: number | null;
  assetVersion: number;
  assetType: AssetType;
  refinementType: string | null;
  sourceAssetVersion: number | null;
  cropPreset: string | null;
  createdAt: Date | string | null;
  studioCreditsUsed: number;
}

const REFINEMENT_TO_ASSET_TYPE: Record<RefinementType, AssetType> = {
  enhance_model_face: "face_enhanced",
  enhance_garment: "garment_enhanced",
  remove_background: "background_removed",
};

export function assetTypeFromRefinementType(type: RefinementType): AssetType {
  return REFINEMENT_TO_ASSET_TYPE[type];
}

export function resolveParentAssetVersion(parent: AssetLineageNode): number {
  if (parent.assetVersion != null && parent.assetVersion > 0) {
    return parent.assetVersion;
  }
  return MASTER_ASSET_VERSION;
}

/** Lineage fields for a new Master Asset (version 1). */
export function resolveAssetLineageForMaster(): AssetLineageInsert {
  return {
    masterRenderId: null,
    parentRenderId: null,
    assetVersion: MASTER_ASSET_VERSION,
    assetType: "master",
    refinementType: null,
    sourceAssetVersion: null,
    cropPreset: null,
  };
}

/** Lineage fields for an AI refinement — version = parent version + 1. */
export function resolveAssetLineageForRefinement(
  immediateParent: AssetLineageNode,
  master: AssetLineageNode,
  refinementType: RefinementType,
): AssetLineageInsert {
  const sourceAssetVersion = resolveParentAssetVersion(immediateParent);

  return {
    masterRenderId: master.id,
    parentRenderId: immediateParent.id,
    assetVersion: sourceAssetVersion + 1,
    assetType: assetTypeFromRefinementType(refinementType),
    refinementType,
    sourceAssetVersion,
    cropPreset: null,
  };
}

/** Lineage fields for a crop variant — future persistence hook (no AI). */
export function resolveAssetLineageForCrop(
  immediateParent: AssetLineageNode,
  master: AssetLineageNode,
  cropPreset: Exclude<CropPreset, "original">,
): AssetLineageInsert {
  const sourceAssetVersion = resolveParentAssetVersion(immediateParent);

  return {
    masterRenderId: master.id,
    parentRenderId: immediateParent.id,
    assetVersion: sourceAssetVersion + 1,
    assetType: "crop",
    refinementType: null,
    sourceAssetVersion,
    cropPreset,
  };
}

/** Builds the auditable lineage record from a persisted render row. */
export function buildAssetLineageRecord(render: AssetLineageNode): AssetLineageRecord {
  const masterAssetId = render.masterRenderId ?? render.id;

  return {
    masterAssetId,
    parentAssetId: render.parentRenderId ?? null,
    assetVersion: render.assetVersion ?? MASTER_ASSET_VERSION,
    assetType: (render.assetType ?? "master") as AssetType,
    refinementType: render.refinementType ?? null,
    sourceAssetVersion: render.sourceAssetVersion ?? null,
    cropPreset: render.cropPreset ?? null,
    createdAt: render.createdAt ?? null,
    studioCreditsUsed: render.studioCreditsUsed ?? 0,
  };
}

/**
 * Walks parent chain to recover version history from master → tip.
 * Returns ordered versions (v1 … vN).
 */
export function buildLineageHistory<T extends AssetLineageNode>(
  allRenders: T[],
  renderId: number,
): T[] {
  const byId = new Map(allRenders.map((r) => [r.id, r]));
  const chain: T[] = [];
  let current = byId.get(renderId);

  while (current) {
    chain.unshift(current);
    current =
      current.parentRenderId != null
        ? byId.get(current.parentRenderId)
        : undefined;
  }

  return chain.sort(
    (a, b) => (a.assetVersion ?? MASTER_ASSET_VERSION) - (b.assetVersion ?? MASTER_ASSET_VERSION),
  );
}
