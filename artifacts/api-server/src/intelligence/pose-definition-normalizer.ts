// ---------------------------------------------------------------------------
// Generation-time Pose Master definition normalizer.
// Deterministic repairs for YELLOW/RED audits — Excel/catalog/PNGs untouched.
// ---------------------------------------------------------------------------

import { auditPoseDefinition, type PoseDefinitionAuditResult } from "./pose-definition-audit";
import {
  parsePoseDefinitionFields,
  replaceGarmentInteractionBlock,
} from "./pose-definition-fields";
import { getAllPoseDefinitions, getPoseDefinition } from "./pose-library";
import type { PoseDefinition } from "./pose-vocabulary-types";

/**
 * RULESET (Pose 7 class of defects, reusable):
 * 1. Neutralize garment-category / outfit-recipe language in GARMENT INTERACTION.
 * 2. Preserve pose-defining interactions (pocket, lapel, coat move, bag hold, etc.)
 *    as conditional on the uploaded garment — never invent a category.
 * 3. Preserve distinctive body geometry fields unchanged (prompt-ready, limbs, anchors…).
 * 4. Do NOT inject a catalog-era generic SUPPORT CONTACT layer on all furniture poses.
 * 5. Pose 7/39 keep validated geometric reinforcements (PNG authority).
 *    Pose 38 must NOT receive a kneeling body-state override — registry/PNG side-sit wins.
 * 6. Never introduce type/feel, lady-sitting, or other generic collapse wording.
 * 7. GREEN definitions pass through unchanged (aside from pose-specific anchors).
 */

const POSE7_GEOMETRIC_ANCHOR_REINFORCEMENT = `POSE 7 GEOMETRIC ANCHORS (AUTHORITATIVE — do not dilute; Pose7.png is visual authority):
- Support surface: the model is perched on the TOP/BACK EDGE of the chair's BACKREST — pelvis/seat contact is on that upper backrest / top-edge area only.
- Chair placement: the chair is BEHIND the model. The normal chair seat remains below/behind and is NOT the primary support surface.
- This is NOT conventional sitting on the chair seat, NOT front seat-edge sitting, NOT sitting beside the chair, and NOT lean-only contact with the chair behind the legs.
- Body-to-chair contact must be exact and physically plausible: elevated/perched on the backrest top edge with clear load-bearing contact — not hovering, floating, or suspended in air.
- Where the model is supported: weight is shared between the backrest top-edge contact and both feet engaged on the floor; the pelvis must read as supported by the upper backrest, not by the seat and not by empty space.
- Leg/hip relationship: one knee raised/forward, the other leg supporting; hip and pelvis orientation must match the half-seated three-quarter geometry demonstrated in Pose7.png — preserve the demonstrated asymmetry.
- Chair contact: at least one hand contacts the chair (backrest / top-edge area as demonstrated) for support; the torso stays upright/forward — do not fully sit back into a deep ordinary chair sit, and do not stand fully upright.
- Never create a floating or suspended seated figure. Never collapse this into a generic fully-seated ordinary chair-sit catalog pose. Preserve this distinctive backrest-perch geometry only.`;

/**
 * Pose 38 — registry + Pose Master PNG already define side-sit / side-tuck floor sit.
 * Do NOT inject kneeling-on-heels overrides (that invented a different body state).
 */

/**
 * Pose 39 — upright bilateral kneeling; distinguish from Pose 38 side-sit.
 */
const POSE39_GEOMETRIC_ANCHOR_REINFORCEMENT = `POSE 39 GEOMETRIC ANCHORS (AUTHORITATIVE — do not dilute):
- Body state is upright editorial kneeling on BOTH knees/shins, sitting toward the heels — bilateral and composed.
- Hands rest lightly together / meeting in the lap near the upper thighs — NOT planted on the floor beside/behind for a side-sit balance (that is Pose 38).
- Torso stays upright with a soft three-quarter body angle; face toward camera; preserve the calm bilateral kneeling line.
- Weight is on both knees and shins — never stand, never convert to a side-hip floor sit, and never sit fully on one hip.
- Do not collapse this into Pose 38 (side-sit / side-tuck floor sit) or a generic kneeling/sitting fashion pose.`;

/**
 * Catalog-era generic SUPPORT CONTACT append was disabled.
 * Pose Master PNG + structured definition (+ Pose7/39 anchors) remain
 * the support-contact authority — do not inject a global reinterpretation layer.
 * Pose38 keeps registry/PNG side-sit semantics with no body-state override.
 */

export interface PoseNormalizationTrace {
  poseId: string;
  grade: PoseDefinitionAuditResult["grade"];
  problems: string[];
  oldDefinition: string;
  newDefinition: string;
  changed: boolean;
  whySafe: string;
}

function buildNeutralGarmentInteraction(
  originalGi: string,
  prop: string | null | undefined,
): string {
  const preserved: string[] = [];

  if (/pocket/i.test(originalGi)) {
    preserved.push(
      "If this pose uses a pocket hand and the uploaded garment has usable pockets, preserve that pocket interaction; otherwise keep the demonstrated hand placement without inventing pockets.",
    );
  }
  if (/lapel/i.test(originalGi)) {
    preserved.push(
      "If this pose demonstrates a lapel/jacket hand hold and the uploaded garment supports it, preserve that hand interaction; do not invent a jacket or lapel.",
    );
  }
  if (/collar/i.test(originalGi)) {
    preserved.push(
      "If this pose demonstrates collar interaction and the uploaded garment has a collar, preserve that contact; do not invent collar details.",
    );
  }
  if (/sleeve/i.test(originalGi)) {
    preserved.push(
      "If this pose demonstrates sleeve interaction, preserve that contact on the uploaded garment's actual sleeves.",
    );
  }
  if (/coat movement|long coat/i.test(originalGi)) {
    preserved.push(
      "If the uploaded garment is outerwear/coat, preserve the demonstrated coat movement; otherwise preserve body geometry without inventing a coat.",
    );
  }
  if (/skirt sweep|dress hold|flowing dress|flowing skirt|dress\/garment silhouette|dress\/skirt|dress\/back/i.test(originalGi)) {
    preserved.push(
      "Preserve demonstrated garment-hold, silhouette, or fabric-sweep geometry using the uploaded garment's actual drape — do not substitute a different garment category.",
    );
  }
  if (/handbag|bag is a required/i.test(originalGi)) {
    preserved.push(
      "If the Pose Master requires a bag as an intrinsic held object, preserve that hand-object relationship with an independent photographic bag; do not invent bags when not required.",
    );
  }
  if (/sandal|footwear|foot fix|fixing sandal/i.test(originalGi)) {
    preserved.push(
      "Preserve demonstrated hands-to-foot / footwear adjustment geometry using the shoot's established footwear — do not invent a specific sandal style.",
    );
  }
  if (/waistline|back\/seat|back construction|off-shoulder/i.test(originalGi)) {
    preserved.push(
      "Preserve the demonstrated body-to-garment spatial emphasis (waist, back, seat, or shoulder) on the uploaded garment without inventing unevidenced construction details.",
    );
  }
  if (
    /jacket adjustment|jacket detail|suit\/jacket|blazer\/jacket|open jacket|jacket collar|blazer\/jacket detail/i.test(
      originalGi,
    ) &&
    !preserved.some((line) => /lapel|collar|sleeve|coat|jacket/.test(line))
  ) {
    preserved.push(
      "If the uploaded garment supports the demonstrated jacket/outerwear hand interaction, preserve that interaction; do not invent a jacket.",
    );
  }
  if (
    /seated contact|sit|chair|stool/i.test(originalGi) ||
    prop === "chair" ||
    prop === "stool" ||
    prop === "step"
  ) {
    preserved.push(
      "Preserve physically plausible body-to-support contact required by this pose; adapt fabric contact around the uploaded garment's actual silhouette, length, volume and drape.",
    );
  }

  const base = `GARMENT INTERACTION:
Preserve the uploaded garment exactly. Adapt the pose around the garment's actual silhouette, length, volume and drape. Do not invent or substitute a different garment category or outfit.`;

  if (preserved.length === 0) {
    return base;
  }
  return `${base}\n${preserved.join("\n")}`;
}

function appendBlockIfMissing(
  definition: string,
  marker: RegExp,
  block: string,
): string {
  if (marker.test(definition)) return definition;
  return `${definition.trimEnd()}\n\n${block}`;
}

/**
 * Normalize a structured definition for generation.
 * GREEN → unchanged. YELLOW/RED → deterministic field-safe repairs.
 */
export function normalizePoseMasterStructuredDefinition(
  poseId: string,
  structuredDefinition: string,
  pose?: PoseDefinition | null,
): PoseNormalizationTrace {
  const definition =
    pose ?? getPoseDefinition(poseId) ?? null;
  const audit = definition
    ? auditPoseDefinition(definition)
    : ({
        poseId,
        name: poseId,
        grade: "RED" as const,
        issues: ["missing_critical_field" as const],
        issueDetails: ["Pose definition not found"],
        fieldsPresent: [],
        garmentInteraction: "",
        prop: null,
        bodyState: null,
        needsNormalization: true,
      } satisfies PoseDefinitionAuditResult);

  const oldDefinition = structuredDefinition;
  let next = structuredDefinition;
  const why: string[] = [];
  const idKey = poseId.trim().toLowerCase();

  // Pose-specific PNG reinforcements always apply (even if GI grade is GREEN).
  // Pose38 intentionally has NO body-state override — registry/PNG side-sit is authoritative.
  if (idKey === "pose7") {
    next = appendBlockIfMissing(
      next,
      /POSE 7 GEOMETRIC ANCHORS \(AUTHORITATIVE/i,
      POSE7_GEOMETRIC_ANCHOR_REINFORCEMENT,
    );
    why.push(
      "Appended Pose 7 geometric reinforcement only — clarifies backrest-top-edge perch from Pose7.png; does not redesign geometry.",
    );
  } else if (idKey === "pose39") {
    next = appendBlockIfMissing(
      next,
      /POSE 39 GEOMETRIC ANCHORS \(AUTHORITATIVE/i,
      POSE39_GEOMETRIC_ANCHOR_REINFORCEMENT,
    );
    why.push(
      "Appended Pose 39 bilateral kneeling reinforcement — distinguishes from Pose 38 side-sit.",
    );
  }

  if (audit.grade === "GREEN" && idKey !== "pose7" && idKey !== "pose39") {
    return {
      poseId: audit.poseId,
      grade: audit.grade,
      problems: [],
      oldDefinition,
      newDefinition: oldDefinition,
      changed: false,
      whySafe: "GREEN — source definition left untouched.",
    };
  }

  if (audit.grade === "GREEN") {
    return {
      poseId: audit.poseId,
      grade: audit.grade,
      problems: [],
      oldDefinition,
      newDefinition: next,
      changed: next !== oldDefinition,
      whySafe: why.join(" ") || "Pose-specific reinforcement only.",
    };
  }

  const fields = parsePoseDefinitionFields(structuredDefinition);
  const originalGi = fields["GARMENT INTERACTION"] ?? audit.garmentInteraction;

  if (
    audit.issues.includes("garment_outfit_recipe") ||
    audit.issues.includes("garment_category_assumption") ||
    audit.issues.includes("pose_defining_garment_interaction_needs_neutralization")
  ) {
    const neutral = buildNeutralGarmentInteraction(originalGi, audit.prop);
    next = replaceGarmentInteractionBlock(next, neutral);
    why.push(
      "Neutralized garment-category / outfit-recipe language while preserving conditional pose-defining interactions.",
    );
  }

  // Never alter prompt-ready / limb / anchor field values themselves.
  const afterFields = parsePoseDefinitionFields(next);
  for (const key of [
    "PROMPT-READY DEFINITION",
    "BODY STATE",
    "LEFT ARM",
    "RIGHT ARM",
    "LEFT LEG",
    "RIGHT LEG",
    "WEIGHT / SUPPORT",
    "CRITICAL POSE ANCHORS",
    "FORBIDDEN VARIANTS",
    "MIRRORING RULE",
  ] as const) {
    if (fields[key] && afterFields[key] && fields[key] !== afterFields[key]) {
      throw new Error(
        `Normalizer must not alter field ${key} for ${poseId}`,
      );
    }
  }

  return {
    poseId: audit.poseId,
    grade: audit.grade,
    problems: audit.issueDetails,
    oldDefinition,
    newDefinition: next,
    changed: next !== oldDefinition,
    whySafe:
      why.join(" ") ||
      "Deterministic generation-time repair; catalog/PNG/Excel unchanged; geometry fields preserved.",
  };
}

/**
 * Generation-path only: remove subject-identity language from Pose Master text so
 * pose definitions cannot compete with Studio Talent identity.
 * Catalog / Excel / PNG sources are not mutated.
 *
 * Examples:
 * - "Male model walking in a mid-stride…" → "Subject walking in a mid-stride…"
 * - "Female model in a relaxed three-quarter…" → "Subject in a relaxed three-quarter…"
 * - "the model is perched…" → "the subject is perched…"
 */
export function stripPoseSubjectIdentityLanguage(definition: string): string {
  let text = definition;

  // Gendered model subject phrases (PROMPT-READY and narrative blocks).
  text = text.replace(/\b(?:Male|Female)\s+models?\b/gi, "Subject");

  // Person-referring "model" → "subject" (geometry language only).
  text = text.replace(/\bthe model\b/gi, "the subject");
  text = text.replace(/\bthis model\b/gi, "this subject");
  text = text.replace(/\ba model\b/gi, "a subject");

  // Gendered possessives that typically attach to the posed figure's body.
  text = text.replace(/\bat her\b/gi, "at the");
  text = text.replace(/\bat his\b/gi, "at the");
  text = text.replace(/\bher (sides|side|hand|hands|arm|arms|shoulder|shoulders|leg|legs|foot|feet|hip|hips|head|hair|face|left|right)\b/gi, "the $1");
  text = text.replace(/\bhis (sides|side|hand|hands|arm|arms|shoulder|shoulders|leg|legs|foot|feet|hip|hips|head|hair|face|left|right)\b/gi, "the $1");
  text = text.replace(/\bher\b/gi, "their");
  text = text.replace(/\bhis\b/gi, "their");

  return text;
}

/** Apply normalization for the generation path (catalog text in → Gemini text out). */
export function prepareNormalizedPoseMasterDefinition(
  poseId: string,
  structuredDefinition: string,
): string {
  const normalized = normalizePoseMasterStructuredDefinition(
    poseId,
    structuredDefinition,
  ).newDefinition;
  return stripPoseSubjectIdentityLanguage(normalized);
}

/** Trace every pose normalization for reporting (GREEN included as unchanged). */
export function traceAllPoseNormalizations(): PoseNormalizationTrace[] {
  return getAllPoseDefinitions().map((pose) =>
    normalizePoseMasterStructuredDefinition(
      pose.poseId ?? pose.name,
      pose.description,
      pose,
    ),
  );
}
