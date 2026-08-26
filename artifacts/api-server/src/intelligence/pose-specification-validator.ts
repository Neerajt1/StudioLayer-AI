// ---------------------------------------------------------------------------
// Compact Pose Specification — schema validation (precompute experiment)
// ---------------------------------------------------------------------------

import type {
  PoseSpecification,
  PoseSupportObjectSpec,
} from "./pose-specification-types.js";

const MAX_FIELD_CHARS = 160;
const MAX_CRITICAL = 4;
const MAX_CRITICAL_ITEM_CHARS = 120;

const STRING_FIELDS = [
  "action",
  "bodyOrientation",
  "headDirection",
  "gazeDirection",
  "torso",
  "pelvis",
  "leftArm",
  "rightArm",
  "leftHand",
  "rightHand",
  "leftLeg",
  "rightLeg",
  "leftFoot",
  "rightFoot",
  "weightDistribution",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalShortString(
  value: unknown,
  field: string,
  errors: string[],
  max = MAX_FIELD_CHARS,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    errors.push(`${field} must be string or null`);
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    errors.push(`${field} exceeds ${max} characters (truncated)`);
    return trimmed.slice(0, max);
  }
  return trimmed;
}

function validateSupportObject(
  value: unknown,
  errors: string[],
): PoseSupportObjectSpec | null {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) {
    errors.push("supportObject must be object or null");
    return null;
  }
  if (typeof value.required !== "boolean") {
    errors.push("supportObject.required must be boolean");
  }
  const type = optionalShortString(value.type, "supportObject.type", errors, 40);
  const bodySupportRelationship = optionalShortString(
    value.bodySupportRelationship,
    "supportObject.bodySupportRelationship",
    errors,
    MAX_FIELD_CHARS,
  );
  const required = value.required === true;
  if (!required && bodySupportRelationship != null) {
    errors.push(
      "supportObject: bodySupportRelationship set but required is false",
    );
  }
  return {
    required,
    type,
    bodySupportRelationship,
  };
}

export type PoseSpecificationValidationResult = {
  ok: boolean;
  errors: string[];
  /** Soft warnings (truncation) — still persistable. */
  warnings: string[];
  specification: PoseSpecification | null;
  nullFields: string[];
};

/**
 * Validates and normalizes raw GPT JSON into a PoseSpecification.
 */
export function validatePoseSpecification(
  poseId: string,
  raw: unknown,
): PoseSpecificationValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nullFields: string[] = [];

  if (!isPlainObject(raw)) {
    return {
      ok: false,
      errors: ["root must be a JSON object"],
      warnings: [],
      specification: null,
      nullFields: [],
    };
  }

  const spec: PoseSpecification = {
    poseId,
    action: null,
    bodyOrientation: null,
    headDirection: null,
    gazeDirection: null,
    torso: null,
    pelvis: null,
    leftArm: null,
    rightArm: null,
    leftHand: null,
    rightHand: null,
    leftLeg: null,
    rightLeg: null,
    leftFoot: null,
    rightFoot: null,
    weightDistribution: null,
    supportObject: null,
    criticalPoseGeometry: null,
  };

  for (const field of STRING_FIELDS) {
    const before = errors.length;
    const value = optionalShortString(raw[field], field, errors);
    // Truncation is warning, not fatal
    if (errors.length > before) {
      const last = errors[errors.length - 1]!;
      if (last.includes("truncated")) {
        warnings.push(last);
        errors.pop();
      }
    }
    spec[field] = value;
    if (value == null) nullFields.push(field);
  }

  const supportErrorsBefore = errors.length;
  spec.supportObject = validateSupportObject(raw.supportObject, errors);
  for (let i = supportErrorsBefore; i < errors.length; i++) {
    const msg = errors[i]!;
    if (msg.includes("truncated")) {
      warnings.push(msg);
      errors.splice(i, 1);
      i--;
    }
  }
  if (spec.supportObject == null) {
    nullFields.push("supportObject");
  } else {
    if (spec.supportObject.type == null) nullFields.push("supportObject.type");
    if (spec.supportObject.bodySupportRelationship == null) {
      nullFields.push("supportObject.bodySupportRelationship");
    }
  }

  const critical = raw.criticalPoseGeometry;
  if (critical === null || critical === undefined) {
    nullFields.push("criticalPoseGeometry");
    spec.criticalPoseGeometry = null;
  } else if (!Array.isArray(critical)) {
    errors.push("criticalPoseGeometry must be array or null");
    spec.criticalPoseGeometry = null;
    nullFields.push("criticalPoseGeometry");
  } else {
    const items: string[] = [];
    for (let i = 0; i < critical.length && items.length < MAX_CRITICAL; i++) {
      const local: string[] = [];
      const item = optionalShortString(
        critical[i],
        `criticalPoseGeometry[${i}]`,
        local,
        MAX_CRITICAL_ITEM_CHARS,
      );
      for (const msg of local) {
        if (msg.includes("truncated")) warnings.push(msg);
        else errors.push(msg);
      }
      if (item) items.push(item);
    }
    if (critical.length > MAX_CRITICAL) {
      warnings.push(`criticalPoseGeometry exceeds ${MAX_CRITICAL} items (truncated)`);
    }
    spec.criticalPoseGeometry = items.length > 0 ? items : null;
    if (!spec.criticalPoseGeometry) nullFields.push("criticalPoseGeometry");
  }

  if (spec.action == null && spec.criticalPoseGeometry == null) {
    errors.push("must provide action or criticalPoseGeometry");
  }

  const ok = errors.length === 0;
  return {
    ok,
    errors,
    warnings,
    specification: ok || (spec.action != null || spec.criticalPoseGeometry != null)
      ? spec
      : null,
    nullFields,
  };
}

/** Persist only when schema errors are empty (warnings allowed). */
export function isPersistablePoseSpecification(
  result: PoseSpecificationValidationResult,
): result is PoseSpecificationValidationResult & {
  specification: PoseSpecification;
} {
  return result.ok && result.specification != null;
}
