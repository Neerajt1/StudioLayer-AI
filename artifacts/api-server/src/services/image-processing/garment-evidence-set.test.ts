import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGarmentEvidenceSetLayout,
  remapCreativePromptReferenceNumbers,
  resolveGarmentEvidenceMode,
  retargetGarmentInstructionTalentReferences,
} from "./garment-evidence-set.js";

describe("garment evidence mode", () => {
  it("defaults to sheet", () => {
    assert.equal(resolveGarmentEvidenceMode(undefined), "sheet");
    assert.equal(resolveGarmentEvidenceMode(""), "sheet");
    assert.equal(resolveGarmentEvidenceMode("Sheet"), "sheet");
    assert.equal(resolveGarmentEvidenceMode("other"), "sheet");
  });

  it("accepts separate", () => {
    assert.equal(resolveGarmentEvidenceMode("separate"), "separate");
    assert.equal(resolveGarmentEvidenceMode(" SEPARATE "), "separate");
  });
});

describe("garment evidence set layout numbering", () => {
  it("Front only roles → Talent Ref 2, optional Pose Ref 3", () => {
    const layout = buildGarmentEvidenceSetLayout({
      hasBack: false,
      hasDetail: false,
      hasPose: true,
    });
    assert.equal(layout.frontRef, 1);
    assert.equal(layout.backRef, undefined);
    assert.equal(layout.detailRef, undefined);
    assert.equal(layout.talentRef, 2);
    assert.equal(layout.poseRef, 3);
  });

  it("Front + Back → Talent Ref 3, Pose Ref 4", () => {
    const layout = buildGarmentEvidenceSetLayout({
      hasBack: true,
      hasDetail: false,
      hasPose: true,
    });
    assert.equal(layout.frontRef, 1);
    assert.equal(layout.backRef, 2);
    assert.equal(layout.talentRef, 3);
    assert.equal(layout.poseRef, 4);
    assert.match(layout.mappingInstruction, /Reference Image 1 = Garment Front/);
    assert.match(layout.mappingInstruction, /Reference Image 2 = Garment Back/);
    assert.match(layout.mappingInstruction, /Reference Image 3 = Talent/);
    assert.match(layout.mappingInstruction, /Reference Image 4 = Pose Master/);
    assert.match(layout.mappingInstruction, /SAME physical garment/);
  });

  it("Front + Detail → Talent Ref 3, Pose Ref 4", () => {
    const layout = buildGarmentEvidenceSetLayout({
      hasBack: false,
      hasDetail: true,
      hasPose: true,
    });
    assert.equal(layout.frontRef, 1);
    assert.equal(layout.detailRef, 2);
    assert.equal(layout.talentRef, 3);
    assert.equal(layout.poseRef, 4);
    assert.match(layout.mappingInstruction, /Garment Detail/);
    assert.equal(/Garment Back/.test(layout.mappingInstruction), false);
  });

  it("Front + Back + Detail → Talent Ref 4, Pose Ref 5", () => {
    const layout = buildGarmentEvidenceSetLayout({
      hasBack: true,
      hasDetail: true,
      hasPose: true,
    });
    assert.equal(layout.frontRef, 1);
    assert.equal(layout.backRef, 2);
    assert.equal(layout.detailRef, 3);
    assert.equal(layout.talentRef, 4);
    assert.equal(layout.poseRef, 5);
  });

  it("Front + Back without Pose → Talent is last", () => {
    const layout = buildGarmentEvidenceSetLayout({
      hasBack: true,
      hasDetail: false,
      hasPose: false,
    });
    assert.equal(layout.talentRef, 3);
    assert.equal(layout.poseRef, undefined);
  });

  it("Front + supplemental sheet → Talent Ref 3, Pose Ref 4 (sheet never replaces Front)", () => {
    const layout = buildGarmentEvidenceSetLayout({
      hasBack: true,
      hasDetail: true,
      hasPose: true,
      hasSupplementalSheet: true,
    });
    assert.equal(layout.frontRef, 1);
    assert.equal(layout.sheetRef, 2);
    assert.equal(layout.backRef, undefined);
    assert.equal(layout.detailRef, undefined);
    assert.equal(layout.talentRef, 3);
    assert.equal(layout.poseRef, 4);
    assert.match(layout.mappingInstruction, /PRIMARY visual\/construction authority/);
    assert.match(layout.mappingInstruction, /Supplemental multi-view garment sheet/);
    assert.match(layout.mappingInstruction, /must never replace Reference Image 1/);
    assert.match(layout.mappingInstruction, /category interpretation/i);
  });
});

describe("prompt retargeting helpers", () => {
  it("retargets garmentInstruction Talent references when Talent is not Ref 2", () => {
    const source =
      "Reference Image 2 is the human model.\n"
      + "Your task is to dress the person shown in Reference Image 2 using the exact garment shown in Reference Image 1.";
    const out = retargetGarmentInstructionTalentReferences(source, 4);
    assert.match(out, /Reference Image 4 is the human model/);
    assert.match(out, /dress the person shown in Reference Image 4/);
    assert.match(out, /garment shown in Reference Image 1/);
    assert.equal(/Reference Image 2 is the human model/.test(out), false);
  });

  it("leaves garmentInstruction unchanged when Talent is Ref 2", () => {
    const source = "Reference Image 2 is the human model.";
    assert.equal(retargetGarmentInstructionTalentReferences(source, 2), source);
  });

  it("remaps creative prompt Ref2/Ref3 onto dynamic Talent/Pose indices", () => {
    const prompt =
      "Reference Image 2 provides model identity. Reference Image 3 is the Pose Master.";
    const remapped = remapCreativePromptReferenceNumbers(prompt, {
      talentRef: 4,
      poseRef: 5,
    });
    assert.equal(
      remapped,
      "Reference Image 4 provides model identity. Reference Image 5 is the Pose Master.",
    );
  });
});
