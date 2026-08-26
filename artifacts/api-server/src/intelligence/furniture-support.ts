// ---------------------------------------------------------------------------
// Furniture ↔ pose support compatibility (application-level).
// Derived from existing PoseDefinition fields — Excel/catalog untouched.
//
// SupportContactClass     — WHAT kind of body↔support contact
// SupportSpatialRelation  — HOW the body relates to the support
//   Pose Master PNG/definition remains authoritative for exact spatial
//   relationship. Contact class must NOT invent "front seat edge" unless
//   the pose definition explicitly establishes that relationship.
// ---------------------------------------------------------------------------

import type { PoseDefinition } from "./pose-vocabulary-types";

/**
 * Minimal controlled vocabulary for body↔support relationships that affect
 * furniture selection. Not a full pose taxonomy.
 */
export type SupportContactClass =
  | "half_seated"
  | "edge_seated"
  | "deep_seated"
  | "reclined_seated"
  | "stool_seated"
  | "leaning_supported"
  | "block_seated";

/** How deep/lounge-like a furniture seat reads (selection + prompt semantics). */
export type FurnitureSeatProfile = "edge_capable" | "standard" | "deep_lounge";

/**
 * Where load/contact lands — only assign a concrete seat zone when the pose
 * definition explicitly establishes it. Otherwise defer to Pose Master.
 */
export type SupportContactZone =
  | "as_demonstrated"
  | "front_edge"
  | "seat_surface"
  | "deep_seat"
  | "stool_top"
  | "block_top";

/** Body facing / axis relative to the support (from pose geometry cues). */
export type SupportBodyAxis =
  | "front"
  | "three_quarter"
  | "profile"
  | "unspecified";

/**
 * Spatial body↔furniture relationship required by Pose Master geometry.
 * Encodes "same physical relationship" — NOT the same chair design.
 */
export interface SupportSpatialRelation {
  contactClass: SupportContactClass;
  contactZone: SupportContactZone;
  bodyAxis: SupportBodyAxis;
  /**
   * True only when the pose definition explicitly establishes front/near
   * seat-edge load — never inferred from half_seated / edge_seated alone.
   */
  requiresFrontEdgeLoad: boolean;
  /** Concise prompt line for furniture spatial fidelity. */
  promptHint: string;
}

/** Explicit front/near *seat* edge — not generic "chair edge" (may be backrest). */
const EXPLICIT_FRONT_SEAT_EDGE =
  /\bfront of (the )?seat\b|\bseat[- ]front\b|\bfront\/near seat\b|\bnear (the )?seat edge\b|\bweight at (the )?seat edge\b|\bfront[- ]edge of (the )?seat\b/i;

const EDGE_SEATED_HINT =
  /\bedge-of-chair\b|\bchair edge\b|\bweight at chair edge\b/i;

type PoseSupportSource = Pick<
  PoseDefinition,
  "prop" | "bodyState" | "bodyGeometry" | "description"
>;

/**
 * Derive the support/contact class a furniture-bearing pose requires.
 * Uses bodyState, bodyGeometry, and existing structured-description cues.
 */
export function deriveSupportContactClass(
  pose: PoseSupportSource | null | undefined,
): SupportContactClass | null {
  if (!pose?.prop || pose.prop === "none") return null;

  const prop = pose.prop;
  const bodyState = (pose.bodyState ?? "").toLowerCase();
  const geometry = (pose.bodyGeometry ?? []).map((g) => g.toLowerCase());
  const desc = pose.description ?? "";

  if (prop === "stool") {
    if (bodyState === "leaning" || geometry.includes("leaning")) {
      return "leaning_supported";
    }
    return "stool_seated";
  }

  if (prop === "step") {
    return "block_seated";
  }

  if (prop === "chair") {
    // Standing/leaning with chair contact (e.g. Pose70) — NOT a seated pose.
    if (
      bodyState === "standing" ||
      bodyState === "leaning" ||
      geometry.includes("standing") ||
      (geometry.includes("leaning") && !geometry.includes("perched"))
    ) {
      return "leaning_supported";
    }
    if (
      bodyState === "perched" ||
      geometry.includes("perched") ||
      /\bhalf-seated\b/i.test(desc)
    ) {
      return "half_seated";
    }
    if (EDGE_SEATED_HINT.test(desc)) {
      return "edge_seated";
    }
    if (bodyState === "reclining" || geometry.includes("reclining")) {
      return "reclined_seated";
    }
    return "deep_seated";
  }

  return null;
}

function deriveBodyAxis(pose: PoseSupportSource): SupportBodyAxis {
  const geometry = (pose.bodyGeometry ?? []).map((g) => g.toLowerCase());
  const desc = pose.description ?? "";
  if (geometry.includes("profile") || /\borientation\s+profile\b/i.test(desc)) {
    return "profile";
  }
  if (
    geometry.includes("front") ||
    /\borientation\s+front\b/i.test(desc) ||
    /\bfront-facing\b/i.test(desc)
  ) {
    return "front";
  }
  if (
    geometry.includes("three_quarter") ||
    /\bthree-quarter\b/i.test(desc) ||
    /\borientation\s+three-quarter\b/i.test(desc)
  ) {
    return "three_quarter";
  }
  return "unspecified";
}

/**
 * Concrete contact zone only when explicitly established by pose text.
 * half_seated / edge_seated alone → as_demonstrated (Pose Master PNG decides).
 */
export function deriveContactZone(
  contactClass: SupportContactClass,
  pose: PoseSupportSource,
): SupportContactZone {
  const desc = pose.description ?? "";

  if (contactClass === "stool_seated") {
    return "stool_top";
  }
  if (contactClass === "leaning_supported") {
    // Standing/leaning hand-contact — Pose Master demonstrates zone (chair backrest vs stool).
    return "as_demonstrated";
  }
  if (contactClass === "block_seated") {
    return "block_top";
  }
  if (contactClass === "reclined_seated") {
    return "deep_seat";
  }
  if (contactClass === "deep_seated") {
    return "seat_surface";
  }

  // half_seated / edge_seated: only front_edge when definition is explicit
  if (EXPLICIT_FRONT_SEAT_EDGE.test(desc)) {
    return "front_edge";
  }

  return "as_demonstrated";
}

/**
 * Derive Pose Master spatial body↔support relationship.
 * Used for prompt fidelity — does not select a specific furniture design.
 */
export function deriveSupportSpatialRelation(
  pose: PoseSupportSource | null | undefined,
): SupportSpatialRelation | null {
  const contactClass = deriveSupportContactClass(pose);
  if (!contactClass || !pose) return null;

  const contactZone = deriveContactZone(contactClass, pose);
  const bodyAxis = deriveBodyAxis(pose);
  const requiresFrontEdgeLoad = contactZone === "front_edge";

  const axisLabel =
    bodyAxis === "unspecified" ? "as demonstrated" : bodyAxis.replace(/_/g, "-");

  const catalogFinish =
    "Furniture catalog supplies NEW dark appearance/finish only — do not copy Pose Master furniture design or ornamentation.";

  let promptHint: string;
  if (requiresFrontEdgeLoad) {
    promptHint = `Pose Master spatial authority: front/near seat-edge load as explicitly defined; body axis ${axisLabel}; preserve contact sides. ${catalogFinish}`;
  } else if (contactClass === "reclined_seated") {
    promptHint = `Pose Master spatial authority: preserve the demonstrated reclined body-to-support relationship; body axis ${axisLabel}. ${catalogFinish}`;
  } else if (
    contactClass === "stool_seated"
  ) {
    promptHint = `Pose Master spatial authority: preserve the demonstrated body-to-stool relationship; body axis ${axisLabel}. ${catalogFinish}`;
  } else if (contactClass === "leaning_supported") {
    const prop = (pose.prop ?? "").toLowerCase();
    if (prop === "stool") {
      promptHint = `Pose Master spatial authority: preserve the demonstrated load-bearing body-to-stool lean (visible body-to-stool contact and foot/rung relationship as shown — not seated on the stool seat); body axis ${axisLabel}. ${catalogFinish}`;
    } else {
      promptHint = `Pose Master spatial authority: preserve the demonstrated standing/leaning body-to-support contact (hand contact as shown — not seated); body axis ${axisLabel}. ${catalogFinish}`;
    }
  } else if (contactClass === "block_seated") {
    promptHint = `Pose Master spatial authority: preserve the demonstrated body-to-block relationship; body axis ${axisLabel}. ${catalogFinish}`;
  } else {
    // half_seated / edge_seated / deep without explicit seat-front — PNG is authority
    promptHint = `Pose Master spatial authority: preserve the demonstrated body↔support relationship (surface, edge, orientation, load) — not a conventional seat sit. Body axis ${axisLabel}. ${catalogFinish}`;
  }

  return {
    contactClass,
    contactZone,
    bodyAxis,
    requiresFrontEdgeLoad,
    promptHint,
  };
}

/** Whether this support class needs furniture that does not imply deep lounge sit. */
export function requiresEdgeCapableSeat(
  supportClass: SupportContactClass | null | undefined,
): boolean {
  return supportClass === "half_seated" || supportClass === "edge_seated";
}

/**
 * Score adjustment for seat profile vs required support class.
 * Does not remove dark/substantial preference — only lounge-depth conflict.
 */
export function seatProfileCompatibilityScore(
  seatProfile: FurnitureSeatProfile,
  supportClass: SupportContactClass | null | undefined,
): number {
  if (!supportClass) return 0;

  if (requiresEdgeCapableSeat(supportClass)) {
    if (seatProfile === "edge_capable") return 45;
    if (seatProfile === "standard") return 15;
    if (seatProfile === "deep_lounge") return -55;
  }

  if (supportClass === "reclined_seated" || supportClass === "deep_seated") {
    if (seatProfile === "deep_lounge") return 25;
    if (seatProfile === "standard") return 10;
    if (seatProfile === "edge_capable") return 5;
  }

  return 0;
}

export function supportClassPromptLabel(
  supportClass: SupportContactClass,
): string {
  switch (supportClass) {
    case "half_seated":
      return "half-seated / perch contact (partial support as demonstrated by Pose Master)";
    case "edge_seated":
      return "edge contact as demonstrated by Pose Master (not deep lounge sit)";
    case "deep_seated":
      return "full chair seating";
    case "reclined_seated":
      return "reclined chair support";
    case "stool_seated":
      return "stool seating";
    case "leaning_supported":
      return "standing/leaning support contact as demonstrated by Pose Master (not seated)";
    case "block_seated":
      return "block / step seating";
    default:
      return "pose-required support contact";
  }
}

/** Light/warm seat language forbidden for dark editorial furniture. */
export const LIGHT_UPHOLSTERY_PATTERN =
  /\b(cream|ivory|beige|caramel|amber|honey|blonde|blond|tan|light\s*brown|washed)\b/i;

export function textImpliesLightUpholstery(text: string): boolean {
  return LIGHT_UPHOLSTERY_PATTERN.test(text);
}
