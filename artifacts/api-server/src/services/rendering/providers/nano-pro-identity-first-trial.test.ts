import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  IDENTITY_FIRST_STAGE1_REFERENCE_ORDER,
  IDENTITY_FIRST_STAGE2_REFERENCE_ORDER,
  NANO_PRO_IDENTITY_FIRST_TRIAL_ENV,
  NANO_PRO_IDENTITY_FIRST_TRIAL_NAME,
  buildIdentityFirstStage1Request,
  buildIdentityFirstStage2Request,
  isNanoProIdentityFirstTrialEnabled,
  resolveNanoProIdentityFirstTrialModel,
} from "./nano-pro-identity-first-trial.js";
import {
  V1_CREATE_USE_NANO_PRO_CASCADE,
  resolveNanoProImageResolution,
  resolveOpenRouterRenderEngine,
} from "../rendering.config.js";
import { validateNativeResolutionFromDataUri } from "../native-resolution.js";
import { TRIAL_NANO_PRO_STORAGE_PREFIX } from "../trial-nano-pro-storage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TALENT = "data:image/jpeg;base64,TALENT_BYTES_FIXTURE_IF";
const GARMENT = "data:image/png;base64,GARMENT_BYTES_FIXTURE_IF";
const POSE = "data:image/png;base64,POSE_FACE_NEUTRAL_FIXTURE_IF";
const STAGE1_OUT = "data:image/png;base64,STAGE1_IDENTITY_ANCHOR_BYTES_EXACT";

function jpegDataUri(width: number, height: number): string {
  const sof = Buffer.alloc(19);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 3;
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    sof,
    Buffer.from([0xff, 0xd9]),
  ]);
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

describe("nano-pro-identity-first-trial", () => {
  it("1. Stage 1 contains only Talent as the human reference", () => {
    const built = buildIdentityFirstStage1Request({
      talentImageUrl: TALENT,
      packaging: "v2",
    });
    assert.deepEqual([...built.referenceOrder], ["TALENT"]);
    assert.equal(built.body.input_references.length, 1);
    assert.equal(built.body.input_references[0]!.image_url.url, TALENT);
    assert.deepEqual([...IDENTITY_FIRST_STAGE1_REFERENCE_ORDER], ["TALENT"]);
  });

  it("2. Stage 1 contains no Pose Master", () => {
    const built = buildIdentityFirstStage1Request({
      talentImageUrl: TALENT,
      packaging: "v2",
    });
    assert.equal(built.body.input_references.length, 1);
    assert.equal(
      built.referenceOrder.includes("POSE_MASTER" as never),
      false,
    );
    assert.equal(built.promptUsed.toLowerCase().includes("pose master is provided"), true);
    assert.match(built.promptUsed, /No pose master is provided/i);
    for (const ref of built.body.input_references) {
      assert.notEqual(ref.image_url.url, POSE);
    }
  });

  it("3. Stage 2 contains Stage-1 output as identity anchor", () => {
    const built = buildIdentityFirstStage2Request({
      identityAnchorImageUrl: STAGE1_OUT,
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      poseId: "Pose37",
      packaging: "v2",
    });
    assert.equal(built.body.input_references[0]!.image_url.url, STAGE1_OUT);
    assert.equal(built.referenceOrder[0], "IDENTITY_ANCHOR");
  });

  it("4. Stage 2 contains garment", () => {
    const built = buildIdentityFirstStage2Request({
      identityAnchorImageUrl: STAGE1_OUT,
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      poseId: "Pose37",
      packaging: "v2",
    });
    assert.equal(built.body.input_references[1]!.image_url.url, GARMENT);
    assert.equal(built.referenceOrder[1], "GARMENT");
  });

  it("5. Stage 2 contains face-neutral Pose Master", () => {
    const built = buildIdentityFirstStage2Request({
      identityAnchorImageUrl: STAGE1_OUT,
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      poseId: "Pose37",
      packaging: "v2",
    });
    assert.equal(built.body.input_references[2]!.image_url.url, POSE);
    assert.equal(built.referenceOrder[2], "POSE_MASTER");
    assert.deepEqual(
      [...IDENTITY_FIRST_STAGE2_REFERENCE_ORDER],
      ["IDENTITY_ANCHOR", "GARMENT", "POSE_MASTER"],
    );
  });

  it("6. Face-bearing Pose Library asset is never sent (route contract)", () => {
    const routeSrc = readFileSync(
      join(__dirname, "../../../routes/test-nano-pro-identity-first-trial.ts"),
      "utf8",
    );
    assert.match(routeSrc, /loadStage1PoseReferenceImageAsDataUri/);
    assert.match(routeSrc, /face-neutral Stage-1 only/);
    assert.equal(routeSrc.includes("loadPoseReferenceImageAsDataUri"), false);
    assert.match(routeSrc, /pose-references-face-neutral/);
    assert.match(routeSrc, /Never \/pose-references\/PoseN\.png/);
  });

  it("7. Nano Pro is used for both stages", () => {
    const s1 = buildIdentityFirstStage1Request({
      talentImageUrl: TALENT,
      packaging: "v2",
    });
    const s2 = buildIdentityFirstStage2Request({
      identityAnchorImageUrl: STAGE1_OUT,
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      poseId: "Pose37",
      packaging: "v2",
    });
    const model = resolveNanoProIdentityFirstTrialModel();
    assert.match(model, /gemini-3-pro-image/);
    assert.equal(s1.model, model);
    assert.equal(s2.model, model);
    assert.equal(s1.body.model, model);
    assert.equal(s2.body.model, model);
  });

  it("8. Nano Regular is never used", () => {
    const providerSrc = readFileSync(
      join(__dirname, "nano-pro-identity-first-trial.ts"),
      "utf8",
    );
    assert.match(providerSrc, /engine: "nano_pro"/);
    assert.match(providerSrc, /nanoRegularInvoked: false/);
    assert.equal(providerSrc.includes("gemini-3.1-flash-image"), false);
    assert.equal(providerSrc.includes('engineOverride: "flash"'), false);
    assert.equal(providerSrc.includes("create-cascade-stage2"), false);
    assert.equal(providerSrc.includes('from "./OpenRouterProvider'), false);
    assert.equal(providerSrc.includes("OpenRouterProvider.js"), false);
  });

  it("9. Cascade remains OFF", () => {
    assert.equal(V1_CREATE_USE_NANO_PRO_CASCADE, false);
    const providerSrc = readFileSync(
      join(__dirname, "nano-pro-identity-first-trial.ts"),
      "utf8",
    );
    assert.match(providerSrc, /cascade: false/);
    assert.equal(providerSrc.includes("V1_CREATE_USE_NANO_PRO_CASCADE = true"), false);
  });

  it("10. No production render endpoint is called (route contract)", () => {
    const indexSrc = readFileSync(
      join(__dirname, "../../../routes/index.ts"),
      "utf8",
    );
    assert.match(indexSrc, /test-nano-pro-identity-first-trial/);
    const routeSrc = readFileSync(
      join(__dirname, "../../../routes/test-nano-pro-identity-first-trial.ts"),
      "utf8",
    );
    assert.match(routeSrc, /Does NOT enter POST \/renders/);
    assert.equal(routeSrc.includes("runAIPipeline"), false);
    assert.equal(routeSrc.includes('router.post("/renders"'), false);
    assert.equal(routeSrc.includes("from \"./renders\""), false);
  });

  it("11. No credits are deducted (contract)", () => {
    const providerSrc = readFileSync(
      join(__dirname, "nano-pro-identity-first-trial.ts"),
      "utf8",
    );
    assert.match(providerSrc, /creditsDeducted: 0/);
    const routeSrc = readFileSync(
      join(__dirname, "../../../routes/test-nano-pro-identity-first-trial.ts"),
      "utf8",
    );
    assert.match(routeSrc, /creditsDeducted: 0/);
    assert.equal(routeSrc.includes("deductStudioCredits"), false);
    assert.equal(routeSrc.includes("studio_credit"), false);
  });

  it("12. No production Render DB row is created (contract)", () => {
    const providerSrc = readFileSync(
      join(__dirname, "nano-pro-identity-first-trial.ts"),
      "utf8",
    );
    assert.match(providerSrc, /createsRenderRow: false/);
    const routeSrc = readFileSync(
      join(__dirname, "../../../routes/test-nano-pro-identity-first-trial.ts"),
      "utf8",
    );
    assert.match(routeSrc, /createsRenderRow: false/);
    assert.equal(routeSrc.includes("insert(renders"), false);
    assert.equal(routeSrc.includes("db.insert"), false);
  });

  it("13. No production renders/{id}/ R2 object is created (contract)", () => {
    const routeSrc = readFileSync(
      join(__dirname, "../../../routes/test-nano-pro-identity-first-trial.ts"),
      "utf8",
    );
    assert.match(routeSrc, /TRIAL_NANO_PRO_STORAGE_PREFIX/);
    assert.equal(routeSrc.includes("renders/"), false);
    assert.equal(TRIAL_NANO_PRO_STORAGE_PREFIX, "trial/nano-pro/");
  });

  it("14. Stage-1 bytes are preserved into Stage 2 (exact string equality)", () => {
    const built = buildIdentityFirstStage2Request({
      identityAnchorImageUrl: STAGE1_OUT,
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      poseId: "Pose37",
      packaging: "v2",
    });
    assert.equal(built.body.input_references[0]!.image_url.url, STAGE1_OUT);
    // Generate path asserts exact equality before Stage 2 call.
    const providerSrc = readFileSync(
      join(__dirname, "nano-pro-identity-first-trial.ts"),
      "utf8",
    );
    assert.match(
      providerSrc,
      /Stage-1 bytes were altered before Stage 2/,
    );
    assert.match(providerSrc, /identityAnchorImageUrl = stage1Call\.imageDataUri/);
  });

  it("15. 2K resolution is correctly validated", () => {
    const built = buildIdentityFirstStage1Request({
      talentImageUrl: TALENT,
      outputResolution: "2K",
      packaging: "v2",
    });
    assert.equal(built.resolutionRequested, "2K");
    assert.equal(built.resolutionApplied, resolveNanoProImageResolution("2K"));
    assert.equal(built.body.resolution, "2K");

    const ok2k = validateNativeResolutionFromDataUri(
      jpegDataUri(1856, 2304),
      "2K",
    );
    assert.equal(ok2k.width, 1856);
    assert.throws(() =>
      validateNativeResolutionFromDataUri(jpegDataUri(928, 1152), "2K"),
    );
  });

  it("16. Original Talent is NOT duplicated in Stage 2", () => {
    const built = buildIdentityFirstStage2Request({
      identityAnchorImageUrl: STAGE1_OUT,
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      poseId: "Pose37",
      packaging: "v2",
    });
    assert.equal(built.body.input_references.length, 3);
    for (const ref of built.body.input_references) {
      assert.notEqual(ref.image_url.url, TALENT);
    }
    assert.match(built.promptUsed, /IDENTITY ANCHOR/);
    assert.equal(built.promptUsed.includes("STUDIO TALENT"), false);
  });

  it("17. Stage 1 contains no garment reference", () => {
    const built = buildIdentityFirstStage1Request({
      talentImageUrl: TALENT,
      packaging: "v2",
    });
    for (const ref of built.body.input_references) {
      assert.notEqual(ref.image_url.url, GARMENT);
    }
  });

  it("18. Provider strategy matches standalone v2 (AI Studio pin)", () => {
    const s1 = buildIdentityFirstStage1Request({
      talentImageUrl: TALENT,
      packaging: "v2",
    });
    const s2 = buildIdentityFirstStage2Request({
      identityAnchorImageUrl: STAGE1_OUT,
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
      poseId: "Pose37",
      packaging: "v2",
    });
    assert.deepEqual(s1.body.provider, {
      order: ["google-ai-studio"],
      allow_fallbacks: false,
    });
    assert.deepEqual(s2.body.provider, {
      order: ["google-ai-studio"],
      allow_fallbacks: false,
    });
  });

  it("19. Feature gate OFF by default; shared standalone gate accepted", () => {
    assert.equal(isNanoProIdentityFirstTrialEnabled({}), false);
    assert.equal(
      isNanoProIdentityFirstTrialEnabled({
        [NANO_PRO_IDENTITY_FIRST_TRIAL_ENV]: "false",
      }),
      false,
    );
    assert.equal(
      isNanoProIdentityFirstTrialEnabled({
        [NANO_PRO_IDENTITY_FIRST_TRIAL_ENV]: "true",
      }),
      true,
    );
    assert.equal(
      isNanoProIdentityFirstTrialEnabled({
        EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_ENABLED: "true",
      }),
      true,
    );
  });

  it("20. Single-shot standalone trial is not modified by this module", () => {
    const standaloneSrc = readFileSync(
      join(__dirname, "nano-pro-standalone-trial.ts"),
      "utf8",
    );
    assert.equal(
      standaloneSrc.includes("identity-first"),
      false,
    );
    assert.equal(
      standaloneSrc.includes("NANO_PRO_IDENTITY_FIRST"),
      false,
    );
    assert.equal(NANO_PRO_IDENTITY_FIRST_TRIAL_NAME, "nano-pro-identity-first-trial");
  });

  it("21. Production OpenRouterProvider / engine defaults untouched", () => {
    assert.equal(resolveOpenRouterRenderEngine(), "flash");
    const providerSrc = readFileSync(
      join(__dirname, "OpenRouterProvider.ts"),
      "utf8",
    );
    assert.equal(providerSrc.includes("nano-pro-identity-first"), false);
    assert.equal(providerSrc.includes("NANO_PRO_IDENTITY_FIRST"), false);
  });

  it("22. 4K remains structurally supported without being required", () => {
    const built = buildIdentityFirstStage1Request({
      talentImageUrl: TALENT,
      outputResolution: "4K",
      packaging: "v2",
    });
    assert.equal(built.resolutionRequested, "4K");
    assert.equal(built.resolutionApplied, resolveNanoProImageResolution("4K"));
  });
});
