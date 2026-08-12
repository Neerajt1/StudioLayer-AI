// ---------------------------------------------------------------------------
// StudioLayer AI — Canonical Pose Library Catalog (Pose Master authoritative)
// 75 poses: Pose1–Pose75, 1:1 with Pose Master worksheet
// (StudioLayer_75_Pose_Master_Specification_v3_VISUALLY_VERIFIED.xlsx)
// ---------------------------------------------------------------------------

import registry from "./pose-canonical-registry.json";
import {
  buildPoseDefinition,
  type PoseCatalogSpec,
  type PoseDefinition,
} from "./pose-vocabulary-types";

interface CanonicalRegistryPose {
  poseId: string;
  name: string;
  description: string;
  category: string;
  bodyState: PoseCatalogSpec["bodyState"];
  bodyGeometry: string[];
  cameraRelationship: string;
  preferredFraming: PoseCatalogSpec["preferredFraming"];
  energy: PoseCatalogSpec["energy"];
  expression: PoseCatalogSpec["expression"];
  movement: PoseCatalogSpec["movement"];
  interaction: string;
  prop: PoseCatalogSpec["prop"];
  editorialIntensity: PoseCatalogSpec["editorialIntensity"];
  coveragePurpose: PoseCatalogSpec["coveragePurpose"][number][];
  genderPool: PoseCatalogSpec["genderPool"];
  collections: PoseCatalogSpec["collections"][number][];
  garmentCategories: PoseCatalogSpec["garmentCategories"];
  garmentTags: string[];
  avoidForTags: string[];
  poseFamily: PoseCatalogSpec["poseFamily"];
  selectionClass: PoseCatalogSpec["selectionClass"];
  exposure: PoseCatalogSpec["exposure"];
  stance: PoseCatalogSpec["stance"];
  cameraAngle: PoseCatalogSpec["cameraAngle"];
  bodyOrientation: PoseCatalogSpec["bodyOrientation"];
  fabricMovement: PoseCatalogSpec["fabricMovement"];
  accessoriesAllowed: boolean;
  requiresPockets: boolean;
  heroPriority: number;
  suitabilityScore: number;
  poseReferenceImage: string | null;
  active: boolean;
  filename: string;
  visualPath: string;
  /** Pose Master short prompt-ready line — optional metadata. */
  promptReadyDefinition?: string;
  mirroringRule?: string;
  forbiddenVariants?: string;
  intrinsicObject?: string;
}

function toCatalogSpec(entry: CanonicalRegistryPose): PoseCatalogSpec & { poseId: string; active: boolean } {
  return {
    poseId: entry.poseId,
    active: entry.active,
    name: entry.name,
    description: entry.description,
    category: entry.category,
    bodyState: entry.bodyState,
    bodyGeometry: entry.bodyGeometry,
    cameraRelationship: entry.cameraRelationship,
    preferredFraming: entry.preferredFraming,
    energy: entry.energy,
    expression: entry.expression,
    movement: entry.movement,
    interaction: entry.interaction,
    prop: entry.prop,
    editorialIntensity: entry.editorialIntensity,
    coveragePurpose: entry.coveragePurpose,
    genderPool: entry.genderPool,
    collections: entry.collections,
    garmentCategories: entry.garmentCategories,
    garmentTags: entry.garmentTags,
    avoidForTags: entry.avoidForTags,
    poseFamily: entry.poseFamily,
    selectionClass: entry.selectionClass,
    exposure: entry.exposure,
    stance: entry.stance,
    cameraAngle: entry.cameraAngle,
    bodyOrientation: entry.bodyOrientation,
    fabricMovement: entry.fabricMovement,
    accessoriesAllowed: entry.accessoriesAllowed,
    requiresPockets: entry.requiresPockets,
    heroPriority: entry.heroPriority,
    suitabilityScore: entry.suitabilityScore,
    poseReferenceImage: entry.visualPath,
  };
}

const CANONICAL_ENTRIES = (registry.poses as CanonicalRegistryPose[]).filter((pose) => pose.active);

export const POSE_CATALOG: readonly PoseCatalogSpec[] = CANONICAL_ENTRIES.map(toCatalogSpec);

export const POSE_CATALOG_BY_NAME: Record<string, PoseCatalogSpec> = Object.fromEntries(
  POSE_CATALOG.map((spec) => [spec.name, spec]),
);

export const POSE_CATALOG_BY_ID: Record<string, PoseCatalogSpec & { poseId: string; active: boolean }> =
  Object.fromEntries(CANONICAL_ENTRIES.map((entry) => [entry.poseId, toCatalogSpec(entry)]));

export const POSE_NAME_LIST: readonly string[] = CANONICAL_ENTRIES.map((entry) => entry.name);

export const POSE_ID_LIST: readonly string[] = CANONICAL_ENTRIES.map((entry) => entry.poseId);

export function buildPoseLibrary(): Record<string, PoseDefinition> {
  return Object.fromEntries(
    CANONICAL_ENTRIES.map((entry) => {
      const spec = toCatalogSpec(entry);
      return [entry.poseId, buildPoseDefinition(spec)];
    }),
  );
}

export const CANONICAL_POSE_COUNT = CANONICAL_ENTRIES.length;
