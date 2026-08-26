// ---------------------------------------------------------------------------
// Pose Master structured-definition audit (all 75 poses).
// Read-only vs Excel/catalog/PNGs — classifies GREEN / YELLOW / RED.
// ---------------------------------------------------------------------------

import { getAllPoseDefinitions, getPoseDefinition } from "./pose-library";
import { parsePoseDefinitionFields } from "./pose-definition-fields";
import type { PoseDefinition } from "./pose-vocabulary-types";

export type PoseAuditGrade = "GREEN" | "YELLOW" | "RED";

export type PoseAuditIssueCode =
  | "missing_critical_field"
  | "garment_outfit_recipe"
  | "garment_category_assumption"
  | "pose_defining_garment_interaction_needs_neutralization"
  | "weak_support_anchor"
  | "ambiguous_generic_action"
  | "missing_weight_distribution"
  | "missing_asymmetry_signal"
  | "contradictory_support";

export interface PoseDefinitionAuditResult {
  poseId: string;
  name: string;
  grade: PoseAuditGrade;
  issues: PoseAuditIssueCode[];
  issueDetails: string[];
  fieldsPresent: string[];
  garmentInteraction: string;
  prop: string | null | undefined;
  bodyState: string | null | undefined;
  needsNormalization: boolean;
}

/** Outfit recipes that invent a category/look (Pose 7 class of defect). */
const OUTFIT_RECIPE =
  /(\+|trouser outfit|t-shirt \+|top \+ jeans|blazer \+|suit \+|jacket \+|wide-leg trousers(?!\s+visible)|loose t-shirt|ripped jeans|simple fitted top|simple top \+|top \+ trousers|trousers \+ top|casual fitted top|casual jacket \+|casual top \+|open jacket \+ shirt)/i;

const HARD_CATEGORY =
  /\b(jeans|trousers?|blazer|suit|t-?shirt|sandals?|lehenga|saree|gown|denim|dress|skirt|coat|jacket|shirt)\b/i;

const POSE_DEFINING_INTERACTION =
  /\b(pocket|lapel|handbag|coat movement|dress hold|skirt sweep|sandal|collar|sleeve|off-shoulder|waistline|back\/seat|back construction|jacket adjustment|jacket detail|long coat|silhouette|wide-leg outfit)\b/i;

const GENERIC_COLLAPSE =
  /\b(lady sitting|woman sitting on (a )?chair|casually sitting|ordinary sit|type\/feel\/action|TYPE and FEEL|creative clue|just standing|casually walking)\b/i;

const REQUIRED_FIELDS = [
  "PROMPT-READY DEFINITION",
  "BODY STATE",
  "TORSO",
  "LEFT ARM",
  "RIGHT ARM",
  "LEFT LEG",
  "RIGHT LEG",
  "WEIGHT / SUPPORT",
  "CRITICAL POSE ANCHORS",
  "FORBIDDEN VARIANTS",
  "GARMENT INTERACTION",
] as const;

function isOutfitRecipe(gi: string): boolean {
  if (OUTFIT_RECIPE.test(gi)) return true;
  // "X + Y" outfit pairings
  if (/\b[\w][\w /-]{0,40}\s*\+\s*[\w][\w /-]{0,40}\b/i.test(gi)) return true;
  return false;
}

function isAlreadyNeutralGarmentInteraction(gi: string): boolean {
  const t = gi.trim();
  if (!t) return false;
  if (/preserve the uploaded garment exactly/i.test(t)) return true;
  if (/^garment interaction is defining\.?$/i.test(t)) return true;
  return false;
}

/** Audit a single pose definition (catalog text — source of truth for grading). */
export function auditPoseDefinition(
  pose: PoseDefinition,
): PoseDefinitionAuditResult {
  const fields = parsePoseDefinitionFields(pose.description);
  const gi = fields["GARMENT INTERACTION"] ?? "";
  const anchors = fields["CRITICAL POSE ANCHORS"] ?? "";
  const weight = fields["WEIGHT / SUPPORT"] ?? "";
  const promptReady = fields["PROMPT-READY DEFINITION"] ?? "";
  const issues: PoseAuditIssueCode[] = [];
  const issueDetails: string[] = [];

  for (const key of REQUIRED_FIELDS) {
    if (!fields[key] || fields[key]!.trim().length < 2) {
      issues.push("missing_critical_field");
      issueDetails.push(`Missing or empty field: ${key}`);
    }
  }

  if (!weight || weight.length < 8) {
    issues.push("missing_weight_distribution");
    issueDetails.push("WEIGHT / SUPPORT missing or too thin");
  }

  if (GENERIC_COLLAPSE.test(pose.description)) {
    issues.push("ambiguous_generic_action");
    issueDetails.push("Generic collapse / soft type-feel language detected in definition");
  }

  if (!isAlreadyNeutralGarmentInteraction(gi)) {
    if (isOutfitRecipe(gi)) {
      issues.push("garment_outfit_recipe");
      issueDetails.push(`Garment outfit recipe / category leak: "${gi.slice(0, 90)}"`);
    } else if (HARD_CATEGORY.test(gi)) {
      issues.push("garment_category_assumption");
      issueDetails.push(`Garment category assumption: "${gi.slice(0, 90)}"`);
    }
    if (POSE_DEFINING_INTERACTION.test(gi)) {
      issues.push("pose_defining_garment_interaction_needs_neutralization");
      issueDetails.push(
        "Pose-defining garment interaction must be neutralized without inventing a garment category",
      );
    }
  }

  const prop = pose.prop;
  if (prop === "chair" || prop === "stool" || prop === "step") {
    const supportMention =
      /chair|stool|block|step|seat|edge|perch|sit|lean|hand|forearm|support/i.test(
        anchors,
      );
    if (!supportMention) {
      issues.push("weak_support_anchor");
      issueDetails.push("Chair/stool/step pose lacks support/contact signal in CRITICAL POSE ANCHORS");
    }
    if (
      /\b(sitting on a chair|seated on a stool)\b/i.test(promptReady) &&
      !/\b(half-seated|perch|edge|asymmetric|cross|sideways|forward|one leg|lean)\b/i.test(
        promptReady,
      )
    ) {
      issues.push("ambiguous_generic_action");
      issueDetails.push("Prompt-ready line risks generic sit without distinctive geometry cues");
    }
  }

  // Distinctive geometry should mention asymmetry OR clear L/R differentiation
  const limbBlob = [
    fields["LEFT ARM"],
    fields["RIGHT ARM"],
    fields["LEFT LEG"],
    fields["RIGHT LEG"],
    anchors,
  ]
    .filter(Boolean)
    .join(" ");
  const hasAsymmetry =
    /asymmetric|offset|one |other |cross|raised|bent|forward|rear|sideways|three-quarter|twist|lean/i.test(
      limbBlob,
    );
  if (!hasAsymmetry && pose.bodyGeometry.length >= 2) {
    issues.push("missing_asymmetry_signal");
    issueDetails.push("Rich bodyGeometry but weak asymmetry/differentiation language");
  }

  const uniqueIssues = [...new Set(issues)];

  let grade: PoseAuditGrade = "GREEN";
  if (
    uniqueIssues.includes("garment_outfit_recipe") ||
    uniqueIssues.includes("weak_support_anchor") ||
    uniqueIssues.includes("ambiguous_generic_action") ||
    uniqueIssues.includes("missing_critical_field") ||
    uniqueIssues.includes("contradictory_support")
  ) {
    grade = "RED";
  } else if (
    uniqueIssues.includes("garment_category_assumption") ||
    uniqueIssues.includes("pose_defining_garment_interaction_needs_neutralization") ||
    uniqueIssues.includes("missing_weight_distribution") ||
    uniqueIssues.includes("missing_asymmetry_signal")
  ) {
    grade = "YELLOW";
  }

  return {
    poseId: pose.poseId ?? pose.name,
    name: pose.name,
    grade,
    issues: uniqueIssues,
    issueDetails,
    fieldsPresent: Object.keys(fields),
    garmentInteraction: gi,
    prop,
    bodyState: pose.bodyState,
    needsNormalization: grade !== "GREEN",
  };
}

export function auditAllPoseDefinitions(): PoseDefinitionAuditResult[] {
  return getAllPoseDefinitions().map(auditPoseDefinition);
}

export function summarizePoseDefinitionAudit(
  results: PoseDefinitionAuditResult[] = auditAllPoseDefinitions(),
): {
  total: number;
  green: number;
  yellow: number;
  red: number;
  modifiedIds: string[];
  unchangedIds: string[];
  results: PoseDefinitionAuditResult[];
} {
  const green = results.filter((r) => r.grade === "GREEN");
  const yellow = results.filter((r) => r.grade === "YELLOW");
  const red = results.filter((r) => r.grade === "RED");
  return {
    total: results.length,
    green: green.length,
    yellow: yellow.length,
    red: red.length,
    modifiedIds: [...yellow, ...red].map((r) => r.poseId),
    unchangedIds: green.map((r) => r.poseId),
    results,
  };
}

export function auditPoseDefinitionById(poseId: string): PoseDefinitionAuditResult {
  const def = getPoseDefinition(poseId);
  if (!def) {
    throw new Error(`Unknown pose: ${poseId}`);
  }
  return auditPoseDefinition(def);
}
