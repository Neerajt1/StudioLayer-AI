// ---------------------------------------------------------------------------
// StudioLayer AI — Pose Selection Dev Log (Batch 17B)
//
// Development-only diagnostics for tuning pose suitability scores.
// Never runs in production — guarded by NODE_ENV === "development".
// ---------------------------------------------------------------------------

import type { GarmentProfile, GarmentCategory } from "./types";
import {
  type PoseName,
  type PoseFamily,
  type PoseSelectionClass,
  type ShootType,
  POSE_FAMILY_LABELS,
  POSE_SELECTION_CLASS_LABELS,
  getCollectionForShootType,
} from "./pose-library";
import type { ModelGender } from "./pose-selection-engine";

export interface PoseSelectionDevEntry {
  code: string;
  name: PoseName;
  poseFamily: PoseFamily;
  poseFamilyLabel: string;
  selectionClass: PoseSelectionClass;
  selectionClassLabel: string;
  garmentCategory: GarmentCategory;
  /** Original pose before pocket substitution, if different. */
  requestedName?: PoseName;
  pocketSubstitute?: boolean;
  suitabilityScore: number;
  finalWeight: number;
  garmentCompatibility: number;
  varietyModifier: number;
}

export interface PoseSelectionDevReport {
  shootType: ShootType;
  modelLabel: string;
  garmentLabel: string;
  flowingGarment: boolean;
  pockets: boolean;
  pocketIntelligenceActive: boolean;
  garmentTagsApplied: string[];
  collectionSize: number;
  eligibleCount: number;
  filterNotes: string[];
  eligiblePoses: Array<{ code: string; name: PoseName }>;
  selectedPoses: PoseSelectionDevEntry[];
}

const SHOOT_TYPE_PREFIX: Record<ShootType, string> = {
  hero: "H",
  campaign: "C",
  editorial: "E",
};

const SHOOT_TYPE_LABEL: Record<ShootType, string> = {
  hero: "Hero",
  campaign: "Campaign",
  editorial: "Editorial",
};

/** True only when NODE_ENV is development — zero production logging. */
export function isPoseDevLoggingEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

/** Stable collection code — e.g. C07 for the 7th campaign pose. */
export function getPoseCollectionCode(
  shootType: ShootType,
  poseName: PoseName,
): string {
  const collection = getCollectionForShootType(shootType);
  const index = collection.indexOf(poseName);
  const prefix = SHOOT_TYPE_PREFIX[shootType];
  const number = index >= 0 ? index + 1 : collection.length + 1;
  return `${prefix}${String(number).padStart(2, "0")}`;
}

export function formatPoseModelLabel(gender: ModelGender): string {
  if (gender === "mens") return "Male";
  if (gender === "womens") return "Female";
  if (gender === "kids") return "Kids";
  return "Unisex";
}

export function formatPoseGarmentLabel(profile: GarmentProfile): string {
  const raw = profile.subcategory.trim() || profile.category.replace(/-/g, " ");
  return raw
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatYesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

/**
 * Emit a formatted pose-selection report to the dev console.
 * Does not use structured logger — readable box format for tuning sessions.
 */
export function logPoseSelectionDevReport(report: PoseSelectionDevReport): void {
  if (!isPoseDevLoggingEnabled()) return;

  const lines: string[] = [
    "────────────────────────────────────────",
    "StudioLayer Pose Intelligence",
    "",
    "Shoot Type:",
    SHOOT_TYPE_LABEL[report.shootType],
    "",
    "Model:",
    report.modelLabel,
    "",
    "Garment:",
    report.garmentLabel,
    "",
    "Detected:",
    `• Flowing Garment: ${formatYesNo(report.flowingGarment)}`,
    `• Pockets: ${formatYesNo(report.pockets)}`,
  ];

  if (report.pocketIntelligenceActive) {
    lines.push("• Pocket Intelligence: Active");
  }

  if (report.garmentTagsApplied.length > 0) {
    lines.push(
      "",
      "Garment Intelligence:",
      report.garmentTagsApplied.map((tag) => `• ${tag}`).join("\n"),
    );
  }

  if (report.filterNotes.length > 0) {
    lines.push(
      "",
      "Filtering:",
      report.filterNotes.map((note) => `• ${note}`).join("\n"),
    );
  }

  lines.push(
    "",
    `Eligible Poses (${report.eligibleCount} of ${report.collectionSize}):`,
    report.eligiblePoses.map((pose) => pose.code).join("\n"),
    "",
    "Selected Poses:",
  );

  report.selectedPoses.forEach((pose, index) => {
    const substitute =
      pose.pocketSubstitute && pose.requestedName
        ? ` (substituted for ${pose.requestedName})`
        : "";
    lines.push(`${index + 1}. ${pose.code} – ${pose.name}${substitute}`);
    lines.push(
      `   Family: ${pose.poseFamilyLabel} · Class: ${pose.selectionClassLabel} · Garment: ${pose.garmentCategory}`,
    );
  });

  lines.push(
    "",
    "Selection Weights:",
    ...report.selectedPoses.map(
      (pose) =>
        `${pose.code} = suitability ${pose.suitabilityScore}, weight ${pose.finalWeight.toFixed(1)}`,
    ),
    "────────────────────────────────────────",
  );

  // eslint-disable-next-line no-console -- intentional dev-only tuning output
  console.log(lines.join("\n"));
}
