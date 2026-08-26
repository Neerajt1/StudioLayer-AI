import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPersistablePoseSpecification,
  validatePoseSpecification,
} from "./pose-specification-validator.js";

describe("validatePoseSpecification", () => {
  it("accepts compact valid payload", () => {
    const result = validatePoseSpecification("Pose7", {
      action: "half-sit perch on chair back",
      bodyOrientation: "three-quarter",
      headDirection: "toward camera",
      gazeDirection: "toward camera",
      torso: "upright",
      pelvis: "elevated on chair back",
      leftArm: "down toward thigh",
      rightArm: "back to chair",
      leftHand: "near thigh",
      rightHand: "contacting chair",
      leftLeg: "supporting",
      rightLeg: "raised forward",
      leftFoot: "grounded",
      rightFoot: "grounded",
      weightDistribution: "partial chair + feet",
      supportObject: {
        required: true,
        type: "chair",
        bodySupportRelationship:
          "perched on upper/back portion of chair; pelvis above normal seat plane",
      },
      criticalPoseGeometry: [
        "pelvis elevated on chair back",
        "not ordinary seat-sit",
      ],
    });
    assert.equal(result.ok, true);
    assert.ok(isPersistablePoseSpecification(result));
    assert.equal(result.specification?.poseId, "Pose7");
  });

  it("rejects missing action and criticalPoseGeometry", () => {
    const result = validatePoseSpecification("Pose1", {
      action: null,
      criticalPoseGeometry: null,
      torso: "upright",
    });
    assert.equal(result.ok, false);
    assert.equal(isPersistablePoseSpecification(result), false);
  });

  it("allows nulls when action present", () => {
    const result = validatePoseSpecification("Pose49", {
      action: "arm-extended silhouette",
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
      criticalPoseGeometry: ["extended arm silhouette"],
    });
    assert.equal(result.ok, true);
    assert.ok(result.nullFields.includes("torso"));
  });
});
