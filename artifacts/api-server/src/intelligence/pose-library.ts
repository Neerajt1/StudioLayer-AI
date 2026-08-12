// ---------------------------------------------------------------------------
// StudioLayer AI — Professional Pose Library (Canonical Excel-authoritative)
//
// 75 poses: Pose1–Pose75 from Pose Master worksheet (Pose ID is unique key).
// Authority: StudioLayer_75_Pose_Master_Specification_v3_VISUALLY_VERIFIED.xlsx
// Legacy Phase 5B definitions: pose-library-catalog-legacy.ts (deprecated — do not import).
// ---------------------------------------------------------------------------

export type {
  ShootType,
  PoseGenderPool,
  PoseStance,
  PoseCameraAngle,
  PoseBodyOrientation,
  FabricMovementLevel,
  PoseFamily,
  PoseSelectionClass,
  PoseExposureFlags,
  PoseIntelligenceMetadata,
  PoseBodyState,
  PosePreferredFraming,
  PoseEnergy,
  PoseExpression,
  PoseMovementLevel,
  PoseProp,
  PoseCoveragePurpose,
  PoseVocabularyMetadata,
  PoseDefinition,
} from "./pose-vocabulary-types";

export {
  POSE_FAMILY_LABELS,
  POSE_SELECTION_CLASS_LABELS,
  buildPoseDefinition,
} from "./pose-vocabulary-types";

import type { PoseDefinition, ShootType } from "./pose-vocabulary-types";
import {
  POSE_CATALOG,
  POSE_CATALOG_BY_ID,
  POSE_NAME_LIST,
  POSE_ID_LIST,
  buildPoseLibrary,
  CANONICAL_POSE_COUNT,
} from "./pose-library-catalog";

export const POSE_NAMES = POSE_NAME_LIST as readonly string[];
export type PoseName = string;
export const CANONICAL_POSES: readonly string[] = POSE_NAME_LIST;
export const CANONICAL_POSE_IDS = POSE_ID_LIST;

const POSE_DEFINITIONS_BY_ID: Record<string, PoseDefinition> = buildPoseLibrary();

const POSE_DEFINITIONS_BY_NAME: Record<string, PoseDefinition> = {};
for (const poseId of POSE_ID_LIST) {
  const def = POSE_DEFINITIONS_BY_ID[poseId]!;
  if (!POSE_DEFINITIONS_BY_NAME[def.name]) {
    POSE_DEFINITIONS_BY_NAME[def.name] = def;
  }
}

function namesMatching(predicate: (pose: PoseDefinition) => boolean): string[] {
  return getAllPoseDefinitions().filter(predicate).map((pose) => pose.poseId!);
}

export const HERO_COLLECTION: readonly string[] = namesMatching(
  (p) => p.heroEligible && p.active !== false,
);

export const CAMPAIGN_COLLECTION: readonly string[] = namesMatching(
  (p) => p.campaignEligible && p.active !== false,
);

export const EDITORIAL_COLLECTION: readonly string[] = namesMatching(
  (p) => p.editorialEligible && p.active !== false,
);

const COLLECTION_MAP: Record<ShootType, readonly string[]> = {
  hero: HERO_COLLECTION,
  campaign: CAMPAIGN_COLLECTION,
  editorial: EDITORIAL_COLLECTION,
};

export function getCollectionForShootType(shootType: ShootType): readonly string[] {
  return COLLECTION_MAP[shootType];
}

/** @deprecated Phase 5B — intelligence metadata is embedded in PoseDefinition. */
export const POSE_INTELLIGENCE_METADATA = Object.fromEntries(
  getAllPoseDefinitions().map((def) => [
    def.poseId ?? def.name,
    {
      poseFamily: def.poseFamily,
      selectionClass: def.selectionClass,
      heroEligible: def.heroEligible,
      campaignEligible: def.campaignEligible,
      editorialEligible: def.editorialEligible,
      visualCluster: def.visualCluster,
    },
  ]),
);

/** Pocket-pose substitutes when garment has no usable pockets. */
export const POCKET_ALTERNATIVE_POSES: readonly string[] = [
  "Pose3",
  "Pose12",
  "Pose6",
] as const;

function normalizePoseLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

export function getPoseDefinitionById(poseId: string): PoseDefinition | undefined {
  return POSE_DEFINITIONS_BY_ID[poseId.trim()];
}

/** Resolve by Pose ID (preferred) or unique Excel pose name. */
export function getPoseDefinition(nameOrId: string): PoseDefinition | undefined {
  const trimmed = nameOrId.trim();
  if (!trimmed) return undefined;

  const byId = getPoseDefinitionById(trimmed);
  if (byId) return byId;

  const exactByName = POSE_DEFINITIONS_BY_NAME[trimmed];
  if (exactByName) return exactByName;

  const normalized = normalizePoseLookupKey(trimmed);
  return getAllPoseDefinitions().find(
    (pose) => normalizePoseLookupKey(pose.name) === normalized,
  );
}

/** Resolve description by Pose ID (preferred) or unique Pose Master name. No silent pose substitution. */
export function getPoseDescription(nameOrId: string): string {
  const definition = getPoseDefinition(nameOrId);
  if (!definition?.description) {
    throw new Error(`Canonical pose definition not found for: ${nameOrId}`);
  }
  return definition.description;
}

export function getAllPoseDefinitions(): PoseDefinition[] {
  return POSE_ID_LIST.map((poseId) => POSE_DEFINITIONS_BY_ID[poseId]!).filter(
    (pose) => pose.active !== false,
  );
}

export function getPoseIntelligenceMetadata(poseId: string) {
  const def = getPoseDefinitionById(poseId);
  if (!def) throw new Error(`Unknown pose: ${poseId}`);
  return {
    poseFamily: def.poseFamily,
    selectionClass: def.selectionClass,
    heroEligible: def.heroEligible,
    campaignEligible: def.campaignEligible,
    editorialEligible: def.editorialEligible,
    visualCluster: def.visualCluster,
  };
}

export function getPosesInCollection(shootType: ShootType): PoseDefinition[] {
  const ids = new Set(getCollectionForShootType(shootType));
  return getAllPoseDefinitions().filter((pose) => ids.has(pose.poseId!));
}

/** Machine-readable export of the full pose vocabulary. */
export function exportPoseLibrarySummary() {
  return getAllPoseDefinitions().map((pose) => ({
    poseId: pose.poseId ?? null,
    active: pose.active !== false,
    name: pose.name,
    category: pose.category,
    bodyState: pose.bodyState,
    bodyGeometry: pose.bodyGeometry,
    cameraRelationship: pose.cameraRelationship,
    preferredFraming: pose.preferredFraming,
    energy: pose.energy,
    expression: pose.expression,
    movement: pose.movement,
    interaction: pose.interaction,
    prop: pose.prop,
    editorialIntensity: pose.editorialIntensity,
    coveragePurpose: pose.coveragePurpose,
    genderPool: pose.genderPool,
    collections: pose.collections,
    garmentCategories: pose.garmentCategories,
    garmentTags: pose.garmentTags,
    avoidForTags: pose.avoidForTags,
    poseFamily: pose.poseFamily,
    selectionClass: pose.selectionClass,
    heroEligible: pose.heroEligible,
    campaignEligible: pose.campaignEligible,
    editorialEligible: pose.editorialEligible,
    visualCluster: pose.visualCluster ?? null,
    requiresPockets: pose.requiresPockets,
    suitabilityScore: pose.suitabilityScore,
    poseReferenceImage: pose.poseReferenceImage,
  }));
}

export function getAutomaticSelectionFallbackPose(): PoseDefinition {
  return POSE_DEFINITIONS_BY_ID[POSE_ID_LIST[0]!]!;
}

export {
  POSE_CATALOG,
  POSE_CATALOG_BY_ID,
  POSE_NAME_LIST,
  POSE_ID_LIST,
  CANONICAL_POSE_COUNT,
};
