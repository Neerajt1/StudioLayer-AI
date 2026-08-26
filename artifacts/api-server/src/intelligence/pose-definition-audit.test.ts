// ---------------------------------------------------------------------------
// Pose Master text-definition audit — all 75 poses (generation-path safety)
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditAllPoseDefinitions,
  summarizePoseDefinitionAudit,
} from "./pose-definition-audit";
import {
  normalizePoseMasterStructuredDefinition,
  prepareNormalizedPoseMasterDefinition,
  traceAllPoseNormalizations,
} from "./pose-definition-normalizer";
import { parsePoseDefinitionFields } from "./pose-definition-fields";
import {
  getAllPoseDefinitions,
  getPoseDefinition,
  CANONICAL_POSE_COUNT,
  POSE_ID_LIST,
} from "./pose-library";
import {
  buildPoseMasterReferenceAuthorityLayer,
  buildShotPromptAtSlot,
} from "./pose-selection-engine";
import type { GarmentProfile } from "./types";

const profile: GarmentProfile = {
  category: "tops",
  subcategory: "blouse",
  gender: "womens",
  ageGroup: "young_adult",
  colour: ["white"],
  fit: "relaxed",
  fabric: "cotton",
  pattern: "solid",
  texture: "smooth",
  season: ["spring"],
  occasion: ["casual"],
};

describe("Pose Master definition audit — 75 poses", () => {
  it("audits exactly 75 active poses", () => {
    const results = auditAllPoseDefinitions();
    assert.equal(CANONICAL_POSE_COUNT, 75);
    assert.equal(POSE_ID_LIST.length, 75);
    assert.equal(results.length, 75);
    assert.equal(getAllPoseDefinitions().length, 75);
  });

  it("every pose has a valid structured definition and Pose Master PNG path", () => {
    for (const id of POSE_ID_LIST) {
      const def = getPoseDefinition(id);
      assert.ok(def, id);
      assert.equal(def!.poseId, id);
      assert.ok(def!.description.length > 100, `${id} description too short`);
      assert.ok(def!.poseReferenceImage, `${id} missing poseReferenceImage`);
      assert.match(def!.poseReferenceImage!, /\/pose-references\//);
      assert.match(
        def!.poseReferenceImage!.toLowerCase(),
        new RegExp(`${id.toLowerCase()}\\.png$`),
      );
    }
  });

  it("every pose retains critical structured fields", () => {
    for (const def of getAllPoseDefinitions()) {
      const fields = parsePoseDefinitionFields(def.description);
      for (const key of [
        "PROMPT-READY DEFINITION",
        "WEIGHT / SUPPORT",
        "CRITICAL POSE ANCHORS",
        "FORBIDDEN VARIANTS",
        "LEFT ARM",
        "RIGHT ARM",
        "LEFT LEG",
        "RIGHT LEG",
      ]) {
        assert.ok(fields[key]?.trim(), `${def.poseId} missing ${key}`);
      }
    }
  });

  it("classifies every pose GREEN, YELLOW, or RED with summary counts", () => {
    const summary = summarizePoseDefinitionAudit();
    assert.equal(summary.total, 75);
    assert.equal(summary.green + summary.yellow + summary.red, 75);
    assert.ok(summary.red + summary.yellow > 0, "expected garment-leak findings");
  });

  it("normalization changes only YELLOW/RED and preserves geometry fields", () => {
    const traces = traceAllPoseNormalizations();
    assert.equal(traces.length, 75);

    for (const trace of traces) {
      const before = parsePoseDefinitionFields(trace.oldDefinition);
      const after = parsePoseDefinitionFields(trace.newDefinition);

      for (const key of [
        "PROMPT-READY DEFINITION",
        "CRITICAL POSE ANCHORS",
        "FORBIDDEN VARIANTS",
        "WEIGHT / SUPPORT",
        "LEFT ARM",
        "RIGHT ARM",
        "LEFT LEG",
        "RIGHT LEG",
        "MIRRORING RULE",
      ]) {
        if (before[key]) {
          assert.equal(
            after[key],
            before[key],
            `${trace.poseId} must retain ${key}`,
          );
        }
      }

      if (trace.grade === "GREEN") {
        assert.equal(trace.changed, false, `${trace.poseId} GREEN must be unchanged`);
        assert.equal(trace.newDefinition, trace.oldDefinition);
      } else {
        assert.equal(trace.changed, true, `${trace.poseId} ${trace.grade} must change`);
        assert.doesNotMatch(trace.newDefinition, /Trouser outfit/i);
        assert.doesNotMatch(
          trace.newDefinition,
          /GARMENT INTERACTION:\s*[^\n]*\b(t-shirt \+|blazer \+|suit \+|jeans)\b/i,
        );
        assert.match(
          trace.newDefinition,
          /Preserve the uploaded garment exactly/i,
        );
      }

      assert.doesNotMatch(trace.newDefinition, /type\/feel\/action/i);
      assert.doesNotMatch(trace.newDefinition, /lady sitting on (a )?chair/i);
      assert.doesNotMatch(trace.newDefinition, /woman sitting on (a )?chair/i);
      assert.equal(trace.poseId.startsWith("Pose"), true);
    }
  });

  it("generation prompts for all 75 poses use normalized definitions and pose contract", () => {
    for (const id of POSE_ID_LIST) {
      const def = getPoseDefinition(id)!;
      const prepared = prepareNormalizedPoseMasterDefinition(
        id,
        def.description,
      );
      const prompt = buildShotPromptAtSlot("base", profile, "hero", id, 0, {
        manualDirected: true,
      });
      assert.match(prompt, new RegExp(`Pose ID: ${id}`));
      assert.match(prompt, /POSE:\nReference Image 3 is the Pose Master visual geometry/);
      assert.doesNotMatch(prompt, /\b(?:Male|Female)\s+model\b/i);
      assert.doesNotMatch(prompt, /AUTHORITY ORDER/);
      assert.doesNotMatch(prompt, /POSE AUTHORITY — FINAL CONSTRAINT/);
      assert.doesNotMatch(prompt, /GENERATION AUTHORITY HIERARCHY/);
      assert.doesNotMatch(
        prompt,
        /Garment adaptation = the uploaded garment adapts around the pose/,
      );
      assert.doesNotMatch(prompt, /type\/feel\/action/);
      assert.doesNotMatch(prompt, /Trouser outfit/);
      const anchors =
        prepared.match(/CRITICAL POSE ANCHORS:\s*([^\n]+)/i)?.[1] ?? null;
      assert.match(
        prompt,
        anchors
          ? new RegExp(anchors.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          : /CRITICAL POSE ANCHORS/,
      );
      assert.ok(
        def.poseReferenceImage,
        `${id} must still attach via ${def.poseReferenceImage}`,
      );
    }
  });

  it("Pose 7 regression remains protected", () => {
    const prepared = prepareNormalizedPoseMasterDefinition(
      "Pose7",
      getPoseDefinition("Pose7")!.description,
    );
    assert.doesNotMatch(prepared, /Trouser outfit/);
    assert.match(prepared, /POSE 7 GEOMETRIC ANCHORS/);
    assert.match(prepared, /half-seated on a chair/i);
    assert.match(prepared, /Half-seated on chair edge/);
    assert.match(prepared, /TOP\/BACK EDGE of the chair's BACKREST|TOP\/BACK EDGE of the chair BACKREST/);
    assert.match(prepared, /chair is (positioned )?BEHIND the subject/i);
    assert.match(prepared, /seat is NOT the (primary )?support|seat is not the support/i);
    // No ambiguous standalone seat-edge redirect (must be qualified with BACKREST)
    assert.match(prepared, /Half-seated on chair edge; one knee lifted; torso angled —/);
    assert.match(prepared, /TOP\/BACK EDGE of the chair BACKREST/);

    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose7", 0, {
      manualDirected: true,
    });
    assert.doesNotMatch(prompt, /type\/feel\/action/);
    assert.match(prompt, /POSE 7 GEOMETRIC ANCHORS/);
    assert.match(prompt, /BACKREST/);
    assert.equal(getPoseDefinition("Pose7")!.poseReferenceImage, "/pose-references/Pose7.png");
  });

  it("does not introduce garment-specific pose replacement in authority layer", () => {
    const layer = buildPoseMasterReferenceAuthorityLayer(
      "Pose6",
      getPoseDefinition("Pose6")!.name,
      getPoseDefinition("Pose6")!.description,
      true,
    );
    assert.doesNotMatch(layer, /T-shirt \+ jeans/i);
    assert.match(layer, /Preserve the uploaded garment exactly/);
    assert.match(layer, /Pose Master visual geometry/);
    assert.doesNotMatch(layer, /AUTHORITY ORDER/);
    assert.doesNotMatch(layer, /GENERATION AUTHORITY HIERARCHY/);
    assert.doesNotMatch(layer, /POSE GEOMETRY IS FIXED/);
    assert.doesNotMatch(layer, /Apply GARMENT AUTHORITY — REFERENCE IMAGE 1 from the primary instruction/);
    assert.doesNotMatch(
      layer,
      /Garment adaptation = the uploaded garment adapts around the pose/,
    );
  });

  it("normalization traces are deterministic", () => {
    const a = normalizePoseMasterStructuredDefinition(
      "Pose1",
      getPoseDefinition("Pose1")!.description,
    );
    const b = normalizePoseMasterStructuredDefinition(
      "Pose1",
      getPoseDefinition("Pose1")!.description,
    );
    assert.equal(a.newDefinition, b.newDefinition);
    assert.equal(a.changed, b.changed);
  });
});
