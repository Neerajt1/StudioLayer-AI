// ---------------------------------------------------------------------------
// Nano Pro — Talent identity authority + Pose Master identity isolation
// ---------------------------------------------------------------------------

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assembleNanoProImagesApiPrompt,
  buildEnvironmentAuthorityLayer,
  buildNanoProReferenceRoleMapping,
  buildPoseAuthorityLayer,
  buildTalentIdentityAuthorityLayer,
  clarifyNanoProTalentIdentityInPrimaryInstruction,
  composeNanoProAuthorityLayers,
  mapImagePartsToNanoProInputReferences,
} from "./nano-pro-authority-layers.js";
import {
  assembleFreshGenerationPrimaryInstruction,
  buildFreshGenerationImageParts,
} from "./providers/OpenRouterProvider.js";
import {
  prepareNormalizedPoseMasterDefinition,
  stripPoseSubjectIdentityLanguage,
} from "../../intelligence/pose-definition-normalizer.js";
import {
  buildPoseMasterReferenceAuthorityLayer,
} from "../../intelligence/pose-selection-engine.js";
import { getAllPoseDefinitions, getPoseDefinition } from "../../intelligence/pose-library.js";

describe("Nano Pro identity authority pass", () => {
  it("A — Talent identity authority exists and lists facial identity features", () => {
    const layer = buildTalentIdentityAuthorityLayer(1);
    assert.match(layer, /TALENT IDENTITY AUTHORITY/);
    assert.match(layer, /sole authority/i);
    assert.match(layer, /facial identity/i);
    assert.match(layer, /facial structure/i);
    assert.match(layer, /eyes/i);
    assert.match(layer, /nose/i);
    assert.match(layer, /lips/i);
    assert.match(layer, /jawline/i);
    assert.match(layer, /hair/i);
    assert.match(layer, /skin tone/i);
    assert.match(layer, /recognizable physical appearance/i);
  });

  it("B — Pose authority does not contain gender/person identity language", () => {
    const layer = buildPoseAuthorityLayer(true);
    assert.doesNotMatch(layer, /\bMale model\b/i);
    assert.doesNotMatch(layer, /\bFemale model\b/i);
    assert.doesNotMatch(layer, /\bher facial\b/i);
    assert.doesNotMatch(layer, /Preserve (her|his|the figure'?s) facial/i);

    for (const pose of getAllPoseDefinitions()) {
      const prepared = prepareNormalizedPoseMasterDefinition(
        pose.poseId ?? pose.name,
        pose.description,
      );
      assert.doesNotMatch(
        prepared,
        /\b(?:Male|Female)\s+model\b/i,
        `${pose.poseId} still contains gendered model identity language`,
      );
    }
  });

  it("C — Pose authority explicitly excludes identity from Pose Master", () => {
    const layer = buildPoseAuthorityLayer(true);
    assert.match(layer, /body geometry and action only/i);
    assert.match(layer, /NOT the identity reference/i);
    assert.match(
      layer,
      /Do not derive face, facial structure, hair, skin tone, identity, or physical appearance from the Pose Master/i,
    );

    const pose65 = getPoseDefinition("Pose65")!;
    const poseLayer = buildPoseMasterReferenceAuthorityLayer(
      "Pose65",
      pose65.name,
      pose65.description,
      true,
    );
    assert.match(poseLayer, /NOT the identity reference/i);
    assert.match(poseLayer, /Do not derive face, facial structure, hair, skin tone/i);
    assert.doesNotMatch(poseLayer, /\bMale model\b/i);
  });

  it("D — Final Nano Pro prompt preserves Talent as sole identity authority", () => {
    const pose65 = getPoseDefinition("Pose65")!;
    const creative = buildPoseMasterReferenceAuthorityLayer(
      "Pose65",
      pose65.name,
      pose65.description,
      true,
    );
    const prompt = assembleNanoProImagesApiPrompt({
      talentIdentityImageCount: 1,
      hasPoseReference: true,
      locationEnvironment: "urban_street",
      primaryInstruction: assembleFreshGenerationPrimaryInstruction(),
      creativeShotPrompt: creative,
    });

    assert.match(prompt, /REFERENCE IMAGE ROLES/);
    assert.match(prompt, /TALENT IDENTITY AUTHORITY/);
    assert.match(prompt, /Studio Talent reference image is the sole authority/i);
    assert.match(prompt, /Studio Talent — sole identity authority/);
    assert.match(prompt, /POSE AUTHORITY/);
    assert.match(prompt, /NOT the identity reference/i);

    assert.doesNotMatch(prompt, /\bMale model\b/i);
    assert.doesNotMatch(prompt, /\bFemale model\b/i);

    const rolesIdx = prompt.indexOf("REFERENCE IMAGE ROLES");
    const talentIdx = prompt.indexOf("TALENT IDENTITY AUTHORITY");
    const poseIdx = prompt.indexOf("POSE AUTHORITY");
    assert.ok(rolesIdx === 0);
    assert.ok(talentIdx > rolesIdx && poseIdx > talentIdx);
  });

  it("E — Reference order remains GARMENT → TALENT → POSE_MASTER", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: "data:image/jpeg;base64,garment",
      modelImageUrl: "data:image/png;base64,talent",
      poseReferenceImageUrl: "data:image/png;base64,pose",
    });
    assert.equal(parts.length, 3);
    assert.equal(parts[0]!.image_url.url, "data:image/jpeg;base64,garment");
    assert.equal(parts[1]!.image_url.url, "data:image/png;base64,talent");
    assert.equal(parts[2]!.image_url.url, "data:image/png;base64,pose");
  });

  it("F — Environment authority wording is unchanged by this identity pass", () => {
    assert.match(
      buildEnvironmentAuthorityLayer("urban_street"),
      /Contemporary urban street \/ city exterior/i,
    );
    assert.match(
      buildEnvironmentAuthorityLayer("photo_studio"),
      /Controlled professional fashion studio/i,
    );
  });

  it("stripPoseSubjectIdentityLanguage converts Male/Female model phrasing", () => {
    const before =
      "PROMPT-READY DEFINITION:\nMale model walking in a mid-stride three-quarter fashion walk while one hand adjusts the opposite sleeve/cuff.";
    const after = stripPoseSubjectIdentityLanguage(before);
    assert.doesNotMatch(after, /\bMale model\b/i);
    assert.match(after, /Subject walking in a mid-stride/i);
  });

  it("clarifyNanoProTalentIdentityInPrimaryInstruction retargets human-model wording", () => {
    const clarified = clarifyNanoProTalentIdentityInPrimaryInstruction(
      "Reference Image 2 is the human model.\n\nYour task is to dress the person shown in Reference Image 2 using the exact garment.",
    );
    assert.match(clarified, /Studio Talent — sole identity authority/);
    assert.match(clarified, /dress the Studio Talent shown in Reference Image 2/);
    assert.doesNotMatch(clarified, /is the human model/);
  });

  it("composeNanoProAuthorityLayers keeps a single TALENT IDENTITY AUTHORITY block", () => {
    const text = composeNanoProAuthorityLayers({
      hasPoseReference: true,
      talentIdentityImageCount: 1,
      locationEnvironment: "photo_studio",
    });
    const matches = text.match(/TALENT IDENTITY AUTHORITY/g) ?? [];
    assert.equal(matches.length, 1);
  });

  it("does not invent additional Talent identity images in the image parts builder", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: "g",
      modelImageUrl: "t",
      poseReferenceImageUrl: "p",
      additionalTalentImageUrls: [],
    });
    assert.equal(parts.length, 3);
  });
});

describe("Nano Pro identity-conditioning (prompt role map)", () => {
  it("Nano Pro prompt begins with explicit Ref1/Ref2 role mapping", () => {
    const opening = buildNanoProReferenceRoleMapping(2);
    assert.match(opening, /^REFERENCE IMAGE ROLES:/);
    assert.match(opening, /Reference Image 1 = GARMENT SOURCE\./);
    assert.match(
      opening,
      /Reference Image 2 = STUDIO TALENT \/ SUBJECT IDENTITY\./,
    );
    assert.match(
      opening,
      /The Studio Talent in Reference Image 2 is the person who must appear in the final image\./,
    );

    const prompt = assembleNanoProImagesApiPrompt({
      talentIdentityImageCount: 1,
      hasPoseReference: true,
      locationEnvironment: "photo_studio",
      primaryInstruction: assembleFreshGenerationPrimaryInstruction(),
    });
    assert.ok(prompt.startsWith("REFERENCE IMAGE ROLES:"));
    assert.ok(prompt.indexOf("TALENT IDENTITY AUTHORITY") > 0);
  });

  it("Pose36 uses normal GARMENT → TALENT → POSE_MASTER image order (no text-only bypass)", () => {
    const pose36 = getPoseDefinition("Pose36");
    assert.ok(pose36?.poseReferenceImage, "Pose36.png catalog path must exist");

    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: "data:image/jpeg;base64,garment-bytes",
      modelImageUrl: "data:image/png;base64,talent-bytes",
      poseReferenceImageUrl: "data:image/png;base64,pose36-bytes",
    });
    assert.equal(parts.length, 3);
    assert.equal(parts[0]!.image_url.url, "data:image/jpeg;base64,garment-bytes");
    assert.equal(parts[1]!.image_url.url, "data:image/png;base64,talent-bytes");
    assert.equal(parts[2]!.image_url.url, "data:image/png;base64,pose36-bytes");

    const refs = mapImagePartsToNanoProInputReferences(parts);
    assert.equal(refs.length, 3);
    assert.equal(JSON.stringify(refs).includes('"detail"'), false);
  });

  it("does not introduce unsupported detail on Nano Pro input_references", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: "g",
      modelImageUrl: "t",
      poseReferenceImageUrl: "p",
    });
    assert.equal(parts[0]!.image_url.detail, "high");
    const refs = mapImagePartsToNanoProInputReferences(parts);
    for (const ref of refs) {
      assert.deepEqual(Object.keys(ref.image_url).sort(), ["url"]);
      assert.equal("detail" in ref.image_url, false);
    }
  });

  it("Talent and garment image URLs are unchanged through Nano Pro reference mapping", () => {
    const garment = "data:image/jpeg;base64,EXACT_GARMENT";
    const talent = "data:image/png;base64,EXACT_TALENT";
    const pose = "data:image/png;base64,EXACT_POSE";
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: garment,
      modelImageUrl: talent,
      poseReferenceImageUrl: pose,
    });
    const refs = mapImagePartsToNanoProInputReferences(parts);
    assert.equal(refs[0]!.image_url.url, garment);
    assert.equal(refs[1]!.image_url.url, talent);
    assert.equal(refs[2]!.image_url.url, pose);
  });
});
