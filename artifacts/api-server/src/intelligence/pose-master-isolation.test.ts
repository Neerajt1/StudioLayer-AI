// ---------------------------------------------------------------------------
// Pose Master visual-reference isolation — contract tests
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildIntrinsicPropQualityLayer,
  buildPoseMasterReferenceAuthorityLayer,
  buildPoseAuthorityClosingConstraint,
  buildShotPromptAtSlot,
  preparePoseMasterStructuredDefinition,
} from "./pose-selection-engine";
import { getPoseDefinition } from "./pose-library";
import { FURNITURE_PROMPT_MAX_CHARS } from "./furniture-selector";
import {
  buildGarmentEvidenceSetLayout,
  remapCreativePromptReferenceNumbers,
} from "../services/image-processing/garment-evidence-set";
import type { GarmentProfile } from "./types";

const profile: GarmentProfile = {
  category: "tops",
  subcategory: "kurta",
  gender: "womens",
  ageGroup: "young_adult",
  colour: ["yellow"],
  fit: "regular",
  fabric: "cotton",
  pattern: "embroidered",
  texture: "woven",
  season: ["summer"],
  occasion: ["festive"],
};

describe("Pose Master authority — isolation without removing visual ref", () => {
  it("marks Pose Master as BODY POSE AND ACTION visual reference with authority order", () => {
    const layer = buildPoseMasterReferenceAuthorityLayer(
      "Pose7",
      "Seated Chair",
      "Seated on a chair with composed editorial posture.",
      true,
    );
    assert.match(layer, /^POSE & ACTION DIRECTION \(Pose ID: Pose7/);
    assert.match(layer, /POSE:\nReference Image 3 is the Pose Master visual geometry for BODY POSE AND ACTION only/);
    assert.match(layer, /BODY POSE AND ACTION/);
    assert.match(layer, /Do not replace this pose with a generic standing, walking, sitting, or freestanding fashion pose/);
    assert.match(layer, /Do not copy garment, furniture design, or illustration style from the Pose Master/);
    assert.match(layer, /NOT the identity reference/);
    assert.match(layer, /camera\/viewpoint and subject-to-camera side relationship/);
    assert.match(layer, /POSE MASTER STRUCTURED DEFINITION:/);
    assert.doesNotMatch(layer, /AUTHORITY ORDER/);
    assert.doesNotMatch(layer, /IMPORTANT:/);
    assert.doesNotMatch(layer, /MUST NOT reproduce from the Pose Master/);
    assert.doesNotMatch(layer, /POSE GEOMETRY IS FIXED/);
    assert.doesNotMatch(layer, /Apply GARMENT AUTHORITY/);
    assert.doesNotMatch(layer, /GENERATION AUTHORITY HIERARCHY/);
    assert.doesNotMatch(
      layer,
      /Garment adaptation = the uploaded garment adapts around the pose/,
    );
    assert.doesNotMatch(layer, /Use it as the geometric authority/);
    assert.doesNotMatch(layer, /if \(poseId === ["']Pose29["']\)|if \(poseId === ["']Pose7["']\)/);
    assert.doesNotMatch(layer, /TYPE and FEEL/);
    assert.doesNotMatch(layer, /NOT exact pose duplication/);
  });

  it("viewpoint rule reaches manual and diverse shot prompt paths globally", () => {
    for (const poseId of ["Pose2", "Pose29", "Pose58"] as const) {
      const manual = buildShotPromptAtSlot("base", profile, "hero", poseId, 0, {
        manualDirected: true,
      });
      assert.match(manual, /camera\/viewpoint and subject-to-camera side relationship/);
      assert.match(manual, /Preserve the camera\/viewpoint and subject-to-camera side relationship demonstrated in Reference Image 3/);
      assert.match(manual, /BODY POSE AND ACTION/);
      assert.match(manual, /Pose Master visual geometry/);
      assert.doesNotMatch(manual, /POSE AUTHORITY — FINAL CONSTRAINT/);
      assert.doesNotMatch(manual, /AUTHORITY ORDER/);
      assert.doesNotMatch(manual, /IMPORTANT:/);
      assert.doesNotMatch(manual, /Pose-29-specific|Pose29 only|if \(poseId === ["']Pose29["']\)/);
      assert.doesNotMatch(manual, /GENERATION AUTHORITY HIERARCHY/);
    }

    const diverse = buildShotPromptAtSlot("base", profile, "campaign", "Pose29", 1, {
      manualDirected: false,
    });
    assert.match(diverse, /camera\/viewpoint and subject-to-camera side relationship/);
  });

  it("chair intrinsic prop: minimal furniture contract — no Prefer/Avoid essay", () => {
    const layer = buildIntrinsicPropQualityLayer("chair", "seated on a chair", "Pose7");
    assert.match(layer, /^FURNITURE:\nA chair must be present as required by this pose\./);
    assert.match(layer, /body-to-support relationship/);
    assert.doesNotMatch(layer, /Selected furniture appearance/);
    assert.doesNotMatch(layer, /furn_chair_/);
    assert.doesNotMatch(layer, /FURNITURE APPEARANCE GUIDANCE/);
    assert.match(layer, /FURNITURE REFERENCE AUTHORITY below/);
    assert.doesNotMatch(layer, /Real furniture, honestly made: solid hardwood/);
    assert.ok(layer.length <= FURNITURE_PROMPT_MAX_CHARS);
    assert.doesNotMatch(layer, /INTRINSIC PROP QUALITY/);
    assert.doesNotMatch(layer, /Key qualities:/);
    assert.doesNotMatch(layer, /Match furniture to styling/);
    assert.doesNotMatch(layer, /Do NOT interpret "rich"/);
    assert.doesNotMatch(layer, /Avoid \/ strongly de-prioritize/);
    assert.doesNotMatch(layer, /garment and model remain the visual priority/i);
    assert.doesNotMatch(layer, /Pose Master spatial authority/);
    assert.doesNotMatch(layer, /geometric authority/);
    assert.doesNotMatch(layer, /GENERATION AUTHORITY HIERARCHY/);
    assert.doesNotMatch(layer, /GARMENT AUTHORITY REMINDER/);
    assert.doesNotMatch(layer, /FINAL GARMENT FIDELITY/);
  });

  it("stool intrinsic prop: minimal furniture contract (no catalog visual dump)", () => {
    const layer = buildIntrinsicPropQualityLayer("stool", "seated on a stool", "Pose26");
    assert.match(layer, /^FURNITURE:\nA stool must be present as required by this pose\./);
    assert.doesNotMatch(layer, /Selected furniture appearance/);
    assert.doesNotMatch(layer, /furn_stool_/);
    assert.doesNotMatch(layer, /MUST-PRESENT SUPPORT/);
    assert.match(layer, /FURNITURE REFERENCE AUTHORITY below/);
    assert.doesNotMatch(layer, /Real furniture, honestly made: solid hardwood/);
    assert.ok(layer.length <= FURNITURE_PROMPT_MAX_CHARS);
    assert.doesNotMatch(layer, /INTRINSIC PROP QUALITY/);
    assert.doesNotMatch(layer, /Key qualities:/);
    assert.doesNotMatch(layer, /Match furniture to styling/);
    assert.doesNotMatch(layer, /Pose Master spatial authority/);
    assert.doesNotMatch(layer, /FURNITURE APPEARANCE GUIDANCE/);
    assert.doesNotMatch(layer, /GARMENT AUTHORITY REMINDER/);
    assert.doesNotMatch(layer, /FINAL GARMENT FIDELITY/);
  });

  it("non-chair: emit no furniture essay when prop is none", () => {
    const layer = buildIntrinsicPropQualityLayer("none", "standing front");
    assert.equal(layer, "");
  });

  it("manual directed chair prompt includes isolation + furniture contract", () => {
    const prompt = buildShotPromptAtSlot(
      "base prompt",
      profile,
      "hero",
      "Pose7",
      0,
      { manualDirected: true },
    );
    assert.match(prompt, /Pose Master visual geometry/);
    assert.match(prompt, /BODY POSE AND ACTION/);
    assert.match(prompt, /Do not copy garment, furniture design, or illustration style from the Pose Master/);
    assert.match(prompt, /NOT the identity reference/);
    assert.match(prompt, /\nFURNITURE:\nA chair must be present as required by this pose\./);
    assert.doesNotMatch(prompt, /Selected furniture appearance/);
    assert.doesNotMatch(prompt, /FURNITURE APPEARANCE GUIDANCE/);
    assert.match(prompt, /FURNITURE REFERENCE AUTHORITY below/);
    assert.doesNotMatch(prompt, /Real furniture, honestly made: solid hardwood/);
    assert.doesNotMatch(prompt, /INTRINSIC PROP QUALITY/);
    assert.doesNotMatch(prompt, /Key qualities:/);
    assert.doesNotMatch(prompt, /Match furniture to styling/);
    assert.match(prompt, /GARMENT AUTHORITY REMINDER/);
    assert.match(prompt, /Reference Image 3 is the Pose Master visual geometry/);
    assert.doesNotMatch(prompt, /TYPE and FEEL of pose/);
    assert.doesNotMatch(prompt, /type\/feel\/action/);
    assert.doesNotMatch(prompt, /GENERATION AUTHORITY HIERARCHY/);
    assert.doesNotMatch(prompt, /POSE AUTHORITY — FINAL CONSTRAINT/);
    assert.doesNotMatch(prompt, /AUTHORITY ORDER/);
    assert.doesNotMatch(
      prompt,
      /Garment adaptation = the uploaded garment adapts around the pose/,
    );
  });
});

describe("Pose 7 production-path corrections", () => {
  it("removes Trouser outfit advice and injects garment-neutral interaction", () => {
    const catalog = getPoseDefinition("Pose7")!.description;
    assert.match(catalog, /Trouser outfit/);

    const prepared = preparePoseMasterStructuredDefinition("Pose7", catalog);
    assert.doesNotMatch(prepared, /Trouser outfit/);
    assert.match(
      prepared,
      /Preserve the uploaded garment exactly\. Adapt the pose around the garment's actual silhouette/,
    );
    assert.match(
      prepared,
      /Do not invent or substitute a different garment category or outfit/,
    );
  });

  it("manual Pose 7 prompt has no Trouser outfit and no type/feel/action closer", () => {
    const prompt = buildShotPromptAtSlot(
      "A full-body studio fashion photograph. Natural standing pose.",
      profile,
      "hero",
      "Pose7",
      0,
      { manualDirected: true },
    );
    assert.doesNotMatch(prompt, /Trouser outfit/);
    assert.doesNotMatch(prompt, /type\/feel\/action/);
    assert.doesNotMatch(prompt, /guided by the Pose Master type/);
    assert.doesNotMatch(prompt, /lady sitting on (a )?chair/i);
    assert.doesNotMatch(prompt, /woman sitting on (a )?chair/i);
    assert.doesNotMatch(prompt, /generic "woman sitting/);
    assert.doesNotMatch(prompt, /POSE AUTHORITY — FINAL CONSTRAINT/);
    assert.match(prompt, /half-seated on a chair/i);
    assert.match(prompt, /Half-seated on chair edge/);
    assert.match(prompt, /TOP\/BACK EDGE of the chair's BACKREST|TOP\/BACK EDGE of the chair BACKREST/);
    assert.match(prompt, /chair is (positioned )?BEHIND the subject/i);
    assert.match(prompt, /seat is NOT the (primary )?support|seat is not the support/i);
    assert.match(prompt, /Do not fully sit back or stand fully upright/);
    assert.match(prompt, /POSE 7 GEOMETRIC ANCHORS \(AUTHORITATIVE/);
    assert.match(prompt, /Never create a floating or suspended seated figure/);
    assert.match(
      prompt,
      /Do not invent or substitute a different garment category or outfit/i,
    );
  });

  it("retains authoritative geometric anchors from Pose Master definition", () => {
    const layer = buildPoseMasterReferenceAuthorityLayer(
      "Pose7",
      "Chair Half Seated",
      getPoseDefinition("Pose7")!.description,
      true,
    );
    assert.match(layer, /CRITICAL POSE ANCHORS: Half-seated on chair edge/);
    assert.match(layer, /BACKREST/);
    assert.match(layer, /BEHIND the subject/i);
    assert.match(layer, /one knee lifted/);
    assert.match(layer, /FORBIDDEN VARIANTS: Do not fully sit back/);
    assert.match(layer, /Pose Master visual geometry/);
    assert.doesNotMatch(layer, /Use it as the geometric authority/);
    assert.doesNotMatch(layer, /Trouser outfit/);
    assert.doesNotMatch(layer, /strong visual reference for pose accuracy/);
  });

  it("manual Pose 7 still resolves Pose7.png as the visual reference path", () => {
    const definition = getPoseDefinition("Pose7");
    assert.equal(definition?.poseReferenceImage, "/pose-references/Pose7.png");
    assert.equal(definition?.poseId, "Pose7");

    const prompt = buildShotPromptAtSlot(
      "base",
      profile,
      "hero",
      "Pose7",
      0,
      { manualDirected: true },
    );
    assert.match(prompt, /Reference Image 3 is the Pose Master visual geometry/);
    assert.match(prompt, /Pose ID: Pose7/);
  });

  it("manual directed bypasses only auto selection — pose authority remains", () => {
    const autoPrompt = buildShotPromptAtSlot(
      "base",
      profile,
      "hero",
      "Pose7",
      0,
    );
    const manualPrompt = buildShotPromptAtSlot(
      "base",
      profile,
      "hero",
      "Pose7",
      0,
      { manualDirected: true },
    );

    // Both retain Pose Master visual pose reference — manual does not strip Pose Master
    for (const prompt of [autoPrompt, manualPrompt]) {
      assert.match(prompt, /POSE MASTER STRUCTURED DEFINITION/);
      assert.match(prompt, /BODY POSE AND ACTION/);
      assert.match(prompt, /Pose Master visual geometry/);
      assert.doesNotMatch(prompt, /POSE AUTHORITY — FINAL CONSTRAINT/);
      assert.doesNotMatch(prompt, /AUTHORITY ORDER/);
      assert.doesNotMatch(prompt, /GENERATION AUTHORITY HIERARCHY/);
    }

    // Manual uses photography-only shot direction labelling
    assert.match(
      manualPrompt,
      /photography and styling only — not body pose/,
    );
  });

  it("authoritative closer is empty after Pass B consolidation", () => {
    const closer = buildPoseAuthorityClosingConstraint(true);
    assert.equal(closer, "");
    assert.doesNotMatch(closer, /type\/feel\/action/);
    assert.doesNotMatch(closer, /lady sitting/i);
  });

  it("GREEN Pose58 strips identity language; YELLOW/RED Pose4 is neutralized", () => {
    const greenId = "Pose58";
    const catalog = getPoseDefinition(greenId)!.description;
    const preparedGreen = preparePoseMasterStructuredDefinition(greenId, catalog);
    assert.doesNotMatch(preparedGreen, /\b(?:Male|Female)\s+model\b/i);
    assert.match(preparedGreen, /^PROMPT-READY DEFINITION:\nSubject /);
    // Geometry fields beyond identity phrasing remain intact.
    assert.match(preparedGreen, /mid-thigh editorial crop/i);
    assert.match(preparedGreen, /Hand gripping blazer lapel/i);

    const yellowCatalog = getPoseDefinition("Pose4")!.description;
    const preparedYellow = preparePoseMasterStructuredDefinition(
      "Pose4",
      yellowCatalog,
    );
    assert.notEqual(preparedYellow, yellowCatalog);
    assert.match(preparedYellow, /Preserve the uploaded garment exactly/);
    assert.doesNotMatch(preparedYellow, /\b(?:Male|Female)\s+model\b/i);
    assert.doesNotMatch(
      preparedYellow,
      /GARMENT INTERACTION:\s*Dress\/garment silhouette must remain visible/i,
    );
  });
});

describe("Pose Master reference numbering under separate evidence", () => {
  it("TEST 7 — remaps hardcoded Ref 3 Pose Master onto live pose index", () => {
    const layout = buildGarmentEvidenceSetLayout({
      hasBack: true,
      hasDetail: true,
      hasPose: true,
    });
    assert.equal(layout.talentRef, 4);
    assert.equal(layout.poseRef, 5);

    const brief = buildPoseMasterReferenceAuthorityLayer(
      "Pose7",
      "Seated",
      "definition",
      true,
    );
    assert.match(brief, /Reference Image 3 is the Pose Master/);

    const remapped = remapCreativePromptReferenceNumbers(brief, layout);
    assert.match(remapped, /Reference Image 5 is the Pose Master visual geometry/);
    assert.doesNotMatch(remapped, /Reference Image 3 is the Pose Master/);
    assert.match(layout.mappingInstruction, /Reference Image 5 = Pose Master/);
  });
});
