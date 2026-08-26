// ---------------------------------------------------------------------------
// StudioLayer AI — Compact Pose Specification (precompute experiment)
//
// Geometry/action only. NOT wired into generation yet.
// ---------------------------------------------------------------------------

/** Physical support required by the pose — relationship only, never design. */
export type PoseSupportObjectSpec = {
  required: boolean;
  /** Generic type only: chair, stool, wall, floor, railing, etc. */
  type: string | null;
  /** Body ↔ support contact geometry; null if unclear. */
  bodySupportRelationship: string | null;
};

/**
 * Compact structural interpretation of a Pose Master PNG.
 * Keep fields short — reinforcement, not a second pose essay.
 */
export type PoseSpecification = {
  poseId: string;
  action: string | null;
  bodyOrientation: string | null;
  headDirection: string | null;
  gazeDirection: string | null;
  torso: string | null;
  pelvis: string | null;
  leftArm: string | null;
  rightArm: string | null;
  leftHand: string | null;
  rightHand: string | null;
  leftLeg: string | null;
  rightLeg: string | null;
  leftFoot: string | null;
  rightFoot: string | null;
  weightDistribution: string | null;
  supportObject: PoseSupportObjectSpec | null;
  /** 1–4 short anchors that must not collapse. */
  criticalPoseGeometry: string[] | null;
};

export type PoseSpecificationAnalysisMeta = {
  poseId: string;
  sourceFilename: string;
  analyzedAt: string;
  model: string;
  /** Fields that validated as null (uncertain / not inventable). */
  nullFields: string[];
  /** Soft flags for manual review (uncertainty / contradiction). */
  reviewFlags: string[];
  validationOk: boolean;
  validationErrors: string[];
};

export type PoseSpecificationRecord = {
  specification: PoseSpecification;
  meta: PoseSpecificationAnalysisMeta;
};

export type PoseSpecificationPrecomputeFile = {
  version: 1;
  generatedAt: string;
  model: string;
  /** Keyed by poseId, e.g. "Pose7". */
  byPoseId: Record<string, PoseSpecificationRecord>;
};
