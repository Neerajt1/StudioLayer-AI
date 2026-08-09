// ---------------------------------------------------------------------------
// StudioLayer AI — Professional Pose Library (Phase 5B)
//
// 75-pose master fashion photography vocabulary.
// Definitions live in pose-library-catalog.ts; types in pose-vocabulary-types.ts.
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
  POSE_NAME_LIST,
  buildPoseLibrary,
} from "./pose-library-catalog";

export const POSE_NAMES = POSE_NAME_LIST as readonly string[];
export type PoseName = (typeof POSE_NAME_LIST)[number];
export const CANONICAL_POSES: readonly PoseName[] = POSE_NAME_LIST as readonly PoseName[];

const POSE_DEFINITIONS: Record<PoseName, PoseDefinition> = buildPoseLibrary() as Record<
  PoseName,
  PoseDefinition
>;

function namesMatching(predicate: (pose: PoseDefinition) => boolean): PoseName[] {
  return (POSE_NAME_LIST as PoseName[]).filter((name) => predicate(POSE_DEFINITIONS[name]!));
}

export const HERO_COLLECTION: readonly PoseName[] = namesMatching(
  (p) => p.heroEligible,
) as readonly PoseName[];

export const CAMPAIGN_COLLECTION: readonly PoseName[] = namesMatching(
  (p) => p.campaignEligible,
) as readonly PoseName[];

export const EDITORIAL_COLLECTION: readonly PoseName[] = namesMatching(
  (p) => p.editorialEligible,
) as readonly PoseName[];

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
  (POSE_NAME_LIST as PoseName[]).map((name) => {
    const def = POSE_DEFINITIONS[name]!;
    return [
      name,
      {
        poseFamily: def.poseFamily,
        selectionClass: def.selectionClass,
        heroEligible: def.heroEligible,
        campaignEligible: def.campaignEligible,
        editorialEligible: def.editorialEligible,
        visualCluster: def.visualCluster,
      },
    ];
  }),
);

/** Pocket-pose substitutes when garment has no usable pockets. */
export const POCKET_ALTERNATIVE_POSES: readonly PoseName[] = [
  "Hand on Waist",
  "Hip Shift",
  "Hands Clasped Low",
] as const;

export function getPoseDefinition(name: string): PoseDefinition | undefined {
  return POSE_DEFINITIONS[name as PoseName];
}

export function getPoseDescription(name: PoseName): string {
  return POSE_DEFINITIONS[name]?.description ?? POSE_DEFINITIONS["Relaxed Front"]!.description;
}

export function getAllPoseDefinitions(): PoseDefinition[] {
  return POSE_NAME_LIST.map((name) => POSE_DEFINITIONS[name as PoseName]!);
}

export function getPoseIntelligenceMetadata(name: PoseName) {
  const def = POSE_DEFINITIONS[name];
  if (!def) throw new Error(`Unknown pose: ${name}`);
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
  const names = new Set(getCollectionForShootType(shootType));
  return getAllPoseDefinitions().filter((pose) => names.has(pose.name));
}

/** Machine-readable export of the full pose vocabulary. */
export function exportPoseLibrarySummary() {
  return getAllPoseDefinitions().map((pose) => ({
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

export { POSE_CATALOG, POSE_NAME_LIST };
