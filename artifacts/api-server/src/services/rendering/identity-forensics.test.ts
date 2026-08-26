import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertIdentityForensicsPayloadIsSafe,
  buildFreshGenerationImageRoles,
  buildIdentityForensicsPayload,
  containsForbiddenImagePayload,
  sanitizeAssetRef,
} from "./identity-forensics";

const identitiesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../studiolayer-ai/public/identities",
);

describe("identity forensics — role order + privacy", () => {
  it("reports TALENT and POSE_MASTER in correct order for front-only + pose", () => {
    const roles = buildFreshGenerationImageRoles({
      poseReferenceImageUrl: "data:image/png;base64,aaa",
    });
    assert.deepEqual(roles, ["GARMENT", "TALENT", "POSE_MASTER"]);
    assert.ok(roles.includes("TALENT"));
    assert.ok(roles.includes("POSE_MASTER"));
  });

  it("omits POSE_MASTER when pose reference is absent", () => {
    const roles = buildFreshGenerationImageRoles({});
    assert.deepEqual(roles, ["GARMENT", "TALENT"]);
    assert.equal(roles.includes("POSE_MASTER"), false);
  });

  it("orders separate garment evidence before TALENT and POSE_MASTER", () => {
    const roles = buildFreshGenerationImageRoles({
      garmentEvidencePackaging: "separate",
      garmentBackImageUrl: "back",
      garmentDetailImageUrl: "detail",
      poseReferenceImageUrl: "pose",
    });
    assert.deepEqual(roles, [
      "GARMENT",
      "GARMENT_BACK",
      "GARMENT_DETAIL",
      "TALENT",
      "POSE_MASTER",
    ]);
  });

  it("orders sheet packaging as GARMENT then GARMENT_SHEET before TALENT", () => {
    const roles = buildFreshGenerationImageRoles({
      garmentEvidencePackaging: "sheet",
      garmentReferenceSheetImageUrl: "sheet",
      poseReferenceImageUrl: "pose",
    });
    assert.deepEqual(roles, [
      "GARMENT",
      "GARMENT_SHEET",
      "TALENT",
      "POSE_MASTER",
    ]);
  });

  it("sanitizes data URIs and never returns base64 payloads", () => {
    const huge = `data:image/png;base64,${"A".repeat(2000)}`;
    assert.equal(sanitizeAssetRef(huge, "/identities/M-IN-02.png"), "/identities/M-IN-02.png");
    assert.equal(sanitizeAssetRef(huge), "data-uri");
    assert.equal(containsForbiddenImagePayload(huge), true);
    assert.equal(containsForbiddenImagePayload("/identities/M-IN-02.png"), false);
  });

  it("payload reports talent/pose inclusion without image bytes", () => {
    const pngPath = path.join(identitiesDir, "M-IN-02.png");
    const buf = readFileSync(pngPath);
    const dataUri = `data:image/png;base64,${buf.toString("base64")}`;

    const payload = buildIdentityForensicsPayload({
      renderId: 98,
      generationSessionId: "test-session",
      generationMode: "Hero",
      shotIndex: 0,
      modelIdentityId: "M-IN-02",
      talentAssetPath: "/identities/M-IN-02.png",
      modelImageUrl: dataUri,
      poseId: "Pose7",
      poseAssetPath: "/pose-references/Pose7.png",
      poseReferenceImageUrl: "data:image/png;base64,bbbb",
      openRouterModel: "google/gemini-3.1-flash-image",
      outputResolution: "2K",
      aspectRatio: "4:5",
    });

    assert.equal(payload.marker, "[IDENTITY FORENSICS]");
    assert.equal(payload.talentIncluded, true);
    assert.equal(payload.poseMasterIncluded, true);
    assert.equal(payload.talentAssetPath, "/identities/M-IN-02.png");
    assert.equal(payload.poseMasterAssetPath, "/pose-references/Pose7.png");
    assert.equal(payload.poseId, "Pose7");
    assert.equal(payload.modelIdentityId, "M-IN-02");
    assert.deepEqual(payload.imageInputOrder, ["GARMENT", "TALENT", "POSE_MASTER"]);
    assert.equal(payload.imageInputCount, 3);
    assert.equal(payload.talentMimeType, "image/png");
    assert.equal(payload.talentWidth, 925);
    assert.equal(payload.talentHeight, 1700);
    assert.equal(payload.outputResolution, "2K");
    assert.equal(payload.aspectRatio, "4:5");

    assertIdentityForensicsPayloadIsSafe(payload);
    const serialized = JSON.stringify(payload);
    assert.equal(/data:image/i.test(serialized), false);
    assert.equal(/;base64,/i.test(serialized), false);
  });
});
