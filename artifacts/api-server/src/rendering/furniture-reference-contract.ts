/**
 * Global furniture-reference generation contract.
 *
 * Enforces: selected furniture → loadable reference → provider image part.
 * No silent null fallback on production Create when furniture is required.
 */

import {
  FURNITURE_CATALOG,
  isSelectableFurniture,
  listFurnitureForCategory,
  type FurnitureAsset,
  type FurnitureCategory,
} from "../intelligence/furniture-catalog.js";
import type { SelectFurnitureInput } from "../intelligence/furniture-selector.js";
import {
  furnitureDiversitySeed,
  poseRequiresFurnitureSelection,
  selectFurnitureAsset,
} from "../intelligence/furniture-selector.js";
import { getPoseDefinition } from "../intelligence/pose-library.js";
import type { GarmentTone } from "../intelligence/garment-tone.js";
import { logger } from "../lib/logger.js";
import {
  hasFurnitureReferenceImage,
  resolveFurnitureReferenceDir,
  resolveFurnitureReferenceFilename,
  tryLoadFurnitureReferenceImage,
  type FurnitureReferenceLoadResult,
} from "./furniture-reference-backend.js";

/** Deterministic seed perturbation for reference-recovery re-selection. */
export const FURNITURE_REFERENCE_RECOVERY_SEED_STEP = 1009;

export class FurnitureReferenceIntegrityError extends Error {
  readonly furnitureAssetId: string | null;
  readonly reason: string;
  readonly expectedFilename: string | null;
  readonly expectedPath: string | null;
  readonly renderId?: number;
  readonly shotIndex?: number;

  constructor(params: {
    message: string;
    furnitureAssetId?: string | null;
    reason: string;
    expectedFilename?: string | null;
    expectedPath?: string | null;
    renderId?: number;
    shotIndex?: number;
  }) {
    super(params.message);
    this.name = "FurnitureReferenceIntegrityError";
    this.furnitureAssetId = params.furnitureAssetId ?? null;
    this.reason = params.reason;
    this.expectedFilename = params.expectedFilename ?? null;
    this.expectedPath = params.expectedPath ?? null;
    this.renderId = params.renderId;
    this.shotIndex = params.shotIndex;
  }
}

export type FurnitureReferenceCoverageAudit = {
  catalogueTotal: number;
  selectableTotal: number;
  referenceRegisteredTotal: number;
  referenceLoadableTotal: number;
  selectableWithoutReference: string[];
  registeredButMissingFile: string[];
};

/** Audit catalogue vs registry vs filesystem coverage. */
export function auditFurnitureReferenceCoverage(): FurnitureReferenceCoverageAudit {
  const selectable = FURNITURE_CATALOG.filter(isSelectableFurniture);
  const referenceRegisteredTotal = selectable.filter((asset) =>
    Boolean(resolveFurnitureReferenceFilename(asset.id)),
  ).length;
  const referenceLoadableTotal = selectable.filter((asset) =>
    hasFurnitureReferenceImage(asset.id),
  ).length;

  return {
    catalogueTotal: FURNITURE_CATALOG.length,
    selectableTotal: selectable.length,
    referenceRegisteredTotal,
    referenceLoadableTotal,
    selectableWithoutReference: selectable
      .filter((asset) => !hasFurnitureReferenceImage(asset.id))
      .map((asset) => asset.id),
    registeredButMissingFile: selectable
      .filter((asset) => {
        const filename = resolveFurnitureReferenceFilename(asset.id);
        return Boolean(filename) && !hasFurnitureReferenceImage(asset.id);
      })
      .map((asset) => asset.id),
  };
}

/** Selectable assets in a category that have a loadable reference on disk. */
export function listReferenceBackedSelectableFurniture(
  category: FurnitureCategory,
): FurnitureAsset[] {
  return listFurnitureForCategory(category).filter((asset) =>
    hasFurnitureReferenceImage(asset.id),
  );
}

/** True when the asset is eligible for NEW selection AND has a loadable reference. */
export function isReferenceBackedSelectableFurniture(
  asset: FurnitureAsset,
): boolean {
  return isSelectableFurniture(asset) && hasFurnitureReferenceImage(asset.id);
}

function integrityErrorFromLoadResult(
  result: Extract<FurnitureReferenceLoadResult, { ok: false }>,
  context: { renderId?: number; shotIndex?: number },
): FurnitureReferenceIntegrityError {
  return new FurnitureReferenceIntegrityError({
    message: `Furniture reference required but unavailable: ${result.message}`,
    furnitureAssetId: result.furnitureAssetId,
    reason: result.reason,
    expectedFilename: result.filename ?? null,
    expectedPath: result.filePath ?? null,
    renderId: context.renderId,
    shotIndex: context.shotIndex,
  });
}

/**
 * Load a required furniture reference — throws on any failure.
 * Used immediately before provider generation.
 */
export function requireFurnitureReferenceDataUri(
  furnitureAssetId: string,
  context: { renderId?: number; shotIndex?: number } = {},
): string {
  const result = tryLoadFurnitureReferenceImage(
    furnitureAssetId,
    context.renderId,
  );
  if (!result.ok) {
    throw integrityErrorFromLoadResult(result, context);
  }
  return result.dataUri;
}

/**
 * Re-select furniture when the initially chosen asset has no loadable reference.
 * Uses the same selector semantics on the reference-backed pool only.
 */
export function recoverReferenceBackedFurnitureAsset(
  input: SelectFurnitureInput,
  originalAssetId: string,
  context: { renderId?: number; shotIndex?: number } = {},
): FurnitureAsset {
  const exclude = new Set([
    ...(input.excludeAssetIdsInBatch ?? []),
    originalAssetId,
  ]);
  const baseSeed = input.seed ?? 0;

  for (let attempt = 0; attempt < 8; attempt++) {
    const retry = selectFurnitureAsset({
      ...input,
      excludeAssetIdsInBatch: [...exclude],
      seed: baseSeed + FURNITURE_REFERENCE_RECOVERY_SEED_STEP * (attempt + 1),
    });
    if (!retry) break;
    if (hasFurnitureReferenceImage(retry.asset.id)) {
      logger.warn(
        {
          renderId: context.renderId,
          shotIndex: context.shotIndex,
          originalFurnitureAssetId: originalAssetId,
          recoveredFurnitureAssetId: retry.asset.id,
          attempt,
        },
        "furniture reference: recovered to reference-backed asset after selection/load mismatch",
      );
      return retry.asset;
    }
    exclude.add(retry.asset.id);
  }

  const category = input.prop ?? "unknown";
  throw new FurnitureReferenceIntegrityError({
    message: `No reference-backed furniture asset could be recovered for category ${category} after ${originalAssetId} failed reference resolution`,
    furnitureAssetId: originalAssetId,
    reason: "recovery_exhausted",
    renderId: context.renderId,
    shotIndex: context.shotIndex,
  });
}

export type ResolvedFurnitureReferenceForShot = {
  furnitureAsset: FurnitureAsset;
  referenceDataUri: string;
  filename: string;
  filePath: string;
  referenceDir: string;
  referenceRequired: true;
  fallbackOccurred: boolean;
  originalFurnitureAssetId: string | null;
};

/**
 * Resolve furniture asset + loadable reference for one shot.
 * Applies global recovery when the selected asset cannot load its reference.
 */
export function resolveFurnitureReferenceForShot(
  furnitureAsset: FurnitureAsset,
  selectionInput: SelectFurnitureInput,
  context: { renderId?: number; shotIndex?: number } = {},
): ResolvedFurnitureReferenceForShot {
  let asset = furnitureAsset;
  let load = tryLoadFurnitureReferenceImage(asset.id, context.renderId);
  let fallbackOccurred = false;
  let originalFurnitureAssetId: string | null = null;

  if (!load.ok) {
    originalFurnitureAssetId = asset.id;
    asset = recoverReferenceBackedFurnitureAsset(
      selectionInput,
      asset.id,
      context,
    );
    fallbackOccurred = true;
    load = tryLoadFurnitureReferenceImage(asset.id, context.renderId);
  }

  if (!load.ok) {
    throw integrityErrorFromLoadResult(load, context);
  }

  return {
    furnitureAsset: asset,
    referenceDataUri: load.dataUri,
    filename: load.filename,
    filePath: load.filePath,
    referenceDir: resolveFurnitureReferenceDir(),
    referenceRequired: true,
    fallbackOccurred,
    originalFurnitureAssetId,
  };
}

export type FurnitureReferenceShotDiagnostics = {
  renderId?: number;
  shotIndex: number;
  referenceRequired: boolean;
  selectedFurnitureAssetId: string | null;
  originalFurnitureAssetId: string | null;
  finalFurnitureAssetId: string | null;
  resolvedFilename: string | null;
  referenceDir: string;
  referencePath: string | null;
  referenceLoaded: boolean;
  fallbackOccurred: boolean;
  providerReceivesFurnitureImage: boolean;
};

export function logFurnitureReferenceShotDiagnostics(
  diagnostics: FurnitureReferenceShotDiagnostics,
): void {
  logger.info(
    diagnostics,
    "furniture reference: shot contract diagnostics",
  );
}

export type PlannedPoseRef = {
  poseId?: string | null;
  name?: string | null;
};

export function buildFurnitureSelectionInputForShot(params: {
  plannedPose: PlannedPoseRef;
  garmentTone?: GarmentTone | null;
  furnitureUserHistory?: SelectFurnitureInput["userHistory"];
  slotIndex: number;
  excludeAssetIdsInBatch?: string[];
  excludeFamiliesInBatch?: string[];
}): SelectFurnitureInput | null {
  const lookupKey = params.plannedPose.poseId ?? params.plannedPose.name;
  if (!lookupKey) return null;
  const pose = getPoseDefinition(lookupKey);
  if (!pose || !poseRequiresFurnitureSelection(pose.prop)) return null;

  return {
    prop: pose.prop,
    pose,
    garmentTone: params.garmentTone ?? null,
    userHistory: params.furnitureUserHistory,
    excludeAssetIdsInBatch: params.excludeAssetIdsInBatch,
    excludeFamiliesInBatch: params.excludeFamiliesInBatch,
    seed: furnitureDiversitySeed({
      poseIdOrName: lookupKey,
      slotIndex: params.slotIndex,
      historyLength: params.furnitureUserHistory?.length ?? 0,
    }),
  };
}

export type PerShotFurnitureReferenceResolution = {
  referenceUrls: Array<string | null>;
  furnitureSelections: Array<FurnitureAsset | null>;
  diagnostics: FurnitureReferenceShotDiagnostics[];
};

/**
 * Resolve per-shot furniture references for the generation contract.
 * Mutates selections when global recovery picks a different reference-backed asset.
 */
export function resolvePerShotFurnitureReferences(input: {
  furnitureSelections: Array<FurnitureAsset | null>;
  plannedPoses: PlannedPoseRef[];
  garmentTone?: GarmentTone | null;
  furnitureUserHistory?: SelectFurnitureInput["userHistory"];
  renderId?: number;
}): PerShotFurnitureReferenceResolution {
  const referenceUrls: Array<string | null> = [];
  const finalSelections: Array<FurnitureAsset | null> = [];
  const diagnostics: FurnitureReferenceShotDiagnostics[] = [];
  const batchAssetIds: string[] = [];
  const batchFamilies: string[] = [];

  for (let shotIndex = 0; shotIndex < input.furnitureSelections.length; shotIndex++) {
    const selectedAsset = input.furnitureSelections[shotIndex] ?? null;
    const plannedPose = input.plannedPoses[shotIndex];
    const selectionInput = plannedPose
      ? buildFurnitureSelectionInputForShot({
          plannedPose,
          garmentTone: input.garmentTone,
          furnitureUserHistory: input.furnitureUserHistory,
          slotIndex: shotIndex,
          excludeAssetIdsInBatch: batchAssetIds,
          excludeFamiliesInBatch: batchFamilies,
        })
      : null;
    const referenceRequired = Boolean(selectedAsset ?? selectionInput);

    if (!selectedAsset) {
      if (selectionInput) {
        throw new FurnitureReferenceIntegrityError({
          message: `Furniture reference required for shot ${shotIndex} but no furniture asset was selected`,
          reason: "missing_selection",
          renderId: input.renderId,
          shotIndex,
        });
      }
      referenceUrls.push(null);
      finalSelections.push(null);
      diagnostics.push({
        renderId: input.renderId,
        shotIndex,
        referenceRequired: false,
        selectedFurnitureAssetId: null,
        originalFurnitureAssetId: null,
        finalFurnitureAssetId: null,
        resolvedFilename: null,
        referenceDir: resolveFurnitureReferenceDir(),
        referencePath: null,
        referenceLoaded: false,
        fallbackOccurred: false,
        providerReceivesFurnitureImage: false,
      });
      continue;
    }

    if (!selectionInput) {
      throw new FurnitureReferenceIntegrityError({
        message: `Furniture asset ${selectedAsset.id} was selected for shot ${shotIndex} but pose context is missing`,
        furnitureAssetId: selectedAsset.id,
        reason: "missing_pose_context",
        renderId: input.renderId,
        shotIndex,
      });
    }

    const resolved = resolveFurnitureReferenceForShot(
      selectedAsset,
      selectionInput,
      { renderId: input.renderId, shotIndex },
    );

    finalSelections.push(resolved.furnitureAsset);
    referenceUrls.push(resolved.referenceDataUri);
    batchAssetIds.push(resolved.furnitureAsset.id);
    batchFamilies.push(resolved.furnitureAsset.family);

    const diag: FurnitureReferenceShotDiagnostics = {
      renderId: input.renderId,
      shotIndex,
      referenceRequired: true,
      selectedFurnitureAssetId: selectedAsset.id,
      originalFurnitureAssetId: resolved.originalFurnitureAssetId,
      finalFurnitureAssetId: resolved.furnitureAsset.id,
      resolvedFilename: resolved.filename,
      referenceDir: resolved.referenceDir,
      referencePath: resolved.filePath,
      referenceLoaded: true,
      fallbackOccurred: resolved.fallbackOccurred,
      providerReceivesFurnitureImage: true,
    };
    diagnostics.push(diag);
    logFurnitureReferenceShotDiagnostics(diag);
  }

  return {
    referenceUrls,
    furnitureSelections: finalSelections,
    diagnostics,
  };
}
