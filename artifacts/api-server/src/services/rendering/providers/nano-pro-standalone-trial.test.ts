import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NANO_PRO_STANDALONE_TRIAL_ENV,
  NANO_PRO_STANDALONE_TRIAL_NAME,
  NANO_PRO_STANDALONE_TRIAL_REFERENCE_ORDER,
  buildNanoProStandaloneTrialRequest,
  isNanoProStandaloneTrialEnabled,
  resolveNanoProStandaloneTrialModel,
} from "./nano-pro-standalone-trial.js";
import {
  TRIAL_NANO_PRO_STORAGE_PREFIX,
  assertTrialNanoProObjectKeySafe,
  buildTrialNanoProObjectKey,
} from "../trial-nano-pro-storage.js";
import {
  V1_CREATE_USE_NANO_PRO_CASCADE,
  resolveNanoProImageResolution,
  resolveOpenRouterRenderEngine,
} from "../rendering.config.js";
import { buildFreshGenerationImageParts } from "./OpenRouterProvider.js";
import { validateNativeResolutionFromDataUri } from "../native-resolution.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const GARMENT = "data:image/png;base64,GARMENT_BYTES_FIXTURE";
const TALENT = "data:image/jpeg;base64,TALENT_BYTES_FIXTURE";
const POSE = "data:image/png;base64,POSE_FACE_NEUTRAL_FIXTURE";

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

describe("nano-pro-standalone-trial", () => {
  it("1. feature gate OFF by default", () => {
    assert.equal(isNanoProStandaloneTrialEnabled({}), false);
    assert.equal(
      isNanoProStandaloneTrialEnabled({
        [NANO_PRO_STANDALONE_TRIAL_ENV]: undefined,
      } as NodeJS.ProcessEnv),
      false,
    );
    assert.equal(
      isNanoProStandaloneTrialEnabled({
        [NANO_PRO_STANDALONE_TRIAL_ENV]: "false",
      }),
      false,
    );
  });

  it("2. gate OFF prevents generation (route source contract)", () => {
    const routeSrc = readFileSync(
      join(__dirname, "../../../routes/test-nano-pro-standalone-trial.ts"),
      "utf8",
    );
    assert.match(routeSrc, /isNanoProStandaloneTrialEnabled/);
    assert.match(routeSrc, /status\(403\)/);
    assert.match(routeSrc, /openRouterCalled: false/);
    assert.match(routeSrc, /r2Written: false/);
    // Generation call site must sit after the gate rejection branch.
    const postHandlerIdx = routeSrc.indexOf("testNanoProStandaloneTrialRouter.post");
    const gateIdx = routeSrc.indexOf(
      "if (!isNanoProStandaloneTrialEnabled())",
      postHandlerIdx,
    );
    const genIdx = routeSrc.indexOf(
      "await generateNanoProStandaloneTrial(",
      postHandlerIdx,
    );
    assert.ok(postHandlerIdx >= 0 && gateIdx > postHandlerIdx && genIdx > gateIdx);
  });

  it("3. trial never invokes Nano Regular (flash)", () => {
    const providerSrc = readFileSync(
      join(__dirname, "nano-pro-standalone-trial.ts"),
      "utf8",
    );
    assert.match(providerSrc, /engine: "nano_pro"/);
    assert.match(providerSrc, /nanoRegularInvoked: false/);
    assert.equal(providerSrc.includes("gemini-3.1-flash-image"), false);
    assert.equal(providerSrc.includes('engineOverride: "flash"'), false);
    assert.equal(providerSrc.includes("create-cascade-stage2"), false);

    const built = buildNanoProStandaloneTrialRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
      poseId: "Pose50",
      outputResolution: "2K",
    });
    assert.equal(built.engine, "nano_pro");
    assert.equal(built.nanoRegularInvoked, false);
    assert.match(built.model, /gemini-3-pro-image|nanoBananaProModel|pro-image/);
    assert.equal(built.model.includes("flash"), false);
  });

  it("4. trial never invokes cascade", () => {
    const built = buildNanoProStandaloneTrialRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
      poseId: "Pose36",
    });
    assert.equal(built.cascade, false);
    assert.equal(V1_CREATE_USE_NANO_PRO_CASCADE, false);

    const providerSrc = readFileSync(
      join(__dirname, "nano-pro-standalone-trial.ts"),
      "utf8",
    );
    assert.equal(providerSrc.includes("useCreateCascade"), false);
    assert.equal(providerSrc.includes("V1_CREATE_USE_NANO_PRO_CASCADE = true"), false);
  });

  it("5. trial never creates renders DB rows", () => {
    const routeSrc = readFileSync(
      join(__dirname, "../../../routes/test-nano-pro-standalone-trial.ts"),
      "utf8",
    );
    assert.match(routeSrc, /createsRenderRow: false/);
    assert.equal(routeSrc.includes("db.insert"), false);
    assert.equal(routeSrc.includes("rendersTable"), false);
    assert.equal(routeSrc.includes("from \"../routes/renders"), false);
    assert.equal(routeSrc.includes("runAIPipeline"), false);

    const built = buildNanoProStandaloneTrialRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
      poseId: "Pose1",
    });
    assert.equal(built.createsRenderRow, false);
  });

  it("6. trial never invokes credits", () => {
    const routeSrc = readFileSync(
      join(__dirname, "../../../routes/test-nano-pro-standalone-trial.ts"),
      "utf8",
    );
    const providerSrc = readFileSync(
      join(__dirname, "nano-pro-standalone-trial.ts"),
      "utf8",
    );
    assert.equal(routeSrc.includes("beginGenerationCreditTransaction"), false);
    assert.equal(routeSrc.includes("finalizeGenerationCreditTransaction"), false);
    assert.equal(routeSrc.includes("assertStudioCreditsAvailable"), false);
    assert.equal(providerSrc.includes("studio-credit"), false);
    assert.equal(providerSrc.includes("creditsDeducted: 0"), true);
  });

  it("7. trial never writes renders/{id}/…", () => {
    const key = buildTrialNanoProObjectKey({
      trialRunId: "abc-123",
      mimeType: "image/png",
      date: new Date("2026-08-27T12:00:00Z"),
    });
    assert.equal(key, "trial/nano-pro/2026-08-27/abc-123/output.png");
    assert.equal(key.startsWith(TRIAL_NANO_PRO_STORAGE_PREFIX), true);
    assert.equal(key.startsWith("renders/"), false);
    assertTrialNanoProObjectKeySafe(key);
    assert.throws(() => assertTrialNanoProObjectKeySafe("renders/131/output.png"));
    assert.throws(() => assertTrialNanoProObjectKeySafe("renders/42/preview.webp"));
  });

  it("8. trial uses face-neutral Pose Master (route contract)", () => {
    const routeSrc = readFileSync(
      join(__dirname, "../../../routes/test-nano-pro-standalone-trial.ts"),
      "utf8",
    );
    assert.match(routeSrc, /loadStage1PoseReferenceImageAsDataUri/);
    assert.match(routeSrc, /faceNeutralBackendFilenameForPoseId/);
    assert.equal(routeSrc.includes("loadPoseReferenceImageAsDataUri"), false);
    assert.match(routeSrc, /pose-references-face-neutral/);
  });

  it("9. reference order is GARMENT → TALENT → POSE_MASTER", () => {
    assert.deepEqual([...NANO_PRO_STANDALONE_TRIAL_REFERENCE_ORDER], [
      "GARMENT",
      "TALENT",
      "POSE_MASTER",
    ]);
    const built = buildNanoProStandaloneTrialRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
      poseId: "Pose50",
    });
    assert.equal(built.body.input_references.length, 3);
    assert.equal(built.body.input_references[0]!.image_url.url, GARMENT);
    assert.equal(built.body.input_references[1]!.image_url.url, TALENT);
    assert.equal(built.body.input_references[2]!.image_url.url, POSE);

    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: GARMENT,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
    });
    assert.equal(built.body.input_references[0]!.image_url.url, parts[0]!.image_url.url);
    assert.equal(built.body.input_references[1]!.image_url.url, parts[1]!.image_url.url);
    assert.equal(built.body.input_references[2]!.image_url.url, parts[2]!.image_url.url);
  });

  it("10. 2K is passed correctly", () => {
    const built = buildNanoProStandaloneTrialRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
      poseId: "Pose7",
      outputResolution: "2K",
    });
    assert.equal(built.resolutionRequested, "2K");
    assert.equal(built.resolutionApplied, "2K");
    assert.equal(built.body.resolution, "2K");
    assert.equal(resolveNanoProImageResolution("2K"), "2K");
  });

  it("11. 4K is passed correctly", () => {
    const built = buildNanoProStandaloneTrialRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
      poseId: "Pose7",
      outputResolution: "4K",
    });
    assert.equal(built.resolutionRequested, "4K");
    assert.equal(built.resolutionApplied, "4K");
    assert.equal(built.body.resolution, "4K");
    assert.equal(resolveNanoProImageResolution("4K"), "4K");
  });

  it("12. native resolution is validated (helpers wired)", () => {
    const providerSrc = readFileSync(
      join(__dirname, "nano-pro-standalone-trial.ts"),
      "utf8",
    );
    assert.match(providerSrc, /validateNativeResolutionFromDataUri/);
    assert.match(providerSrc, /resolutionMismatch/);
    assert.match(providerSrc, /NativeResolutionValidationError/);

    const ok2k = validateNativeResolutionFromDataUri(jpegDataUri(1856, 2304), "2K");
    assert.equal(ok2k.width, 1856);
    assert.throws(() =>
      validateNativeResolutionFromDataUri(jpegDataUri(928, 1152), "2K"),
    );
  });

  it("13. experimental metadata is tagged", () => {
    const built = buildNanoProStandaloneTrialRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
      poseId: "Pose44",
      modelIdentityId: "F-IN-01",
      garmentId: "g-test-1",
    });
    assert.equal(built.experimental, true);
    assert.equal(built.experiment, NANO_PRO_STANDALONE_TRIAL_NAME);
    assert.equal(built.credits, "none");
    assert.equal(built.gallery, false);
    assert.ok(built.trialRunId.length > 0);
    assert.equal(built.modelIdentityId, "F-IN-01");
    assert.equal(built.garmentId, "g-test-1");
    assert.equal(built.poseId, "Pose44");
  });

  it("14. production OR_RENDER_ENGINE remains unchanged (default flash)", () => {
    assert.equal(resolveOpenRouterRenderEngine(), "flash");
    const providerSrc = readFileSync(
      join(__dirname, "nano-pro-standalone-trial.ts"),
      "utf8",
    );
    // Trial must not mutate process.env OR_RENDER_ENGINE
    assert.equal(providerSrc.includes('process.env["OR_RENDER_ENGINE"] ='), false);
    assert.equal(providerSrc.includes("OR_RENDER_ENGINE="), false);
  });

  it("15. V1_CREATE_USE_NANO_PRO_CASCADE remains false", () => {
    assert.equal(V1_CREATE_USE_NANO_PRO_CASCADE, false);
  });

  it("16. model resolves from project Nano Pro config", () => {
    const model = resolveNanoProStandaloneTrialModel();
    assert.match(model, /gemini-3-pro-image/);
  });

  it("17. production OpenRouterProvider.generate is not modified by trial imports (source)", () => {
    const providerSrc = readFileSync(
      join(__dirname, "OpenRouterProvider.ts"),
      "utf8",
    );
    assert.equal(providerSrc.includes("nano-pro-standalone-trial"), false);
    assert.equal(providerSrc.includes("NANO_PRO_STANDALONE_TRIAL"), false);
  });

  it("18. route mounted and does not call POST /renders", () => {
    const indexSrc = readFileSync(
      join(__dirname, "../../../routes/index.ts"),
      "utf8",
    );
    assert.match(indexSrc, /test-nano-pro-standalone-trial/);
    const routeSrc = readFileSync(
      join(__dirname, "../../../routes/test-nano-pro-standalone-trial.ts"),
      "utf8",
    );
    assert.match(routeSrc, /Does NOT enter POST \/renders/);
    assert.equal(routeSrc.includes("runAIPipeline"), false);
    assert.equal(routeSrc.includes('app.post("/renders"'), false);
    assert.equal(routeSrc.includes('router.post("/renders"'), false);
  });

  it("19. v2 packaging labels Ref3 Pose Master and pins google-ai-studio", () => {
    const built = buildNanoProStandaloneTrialRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
      poseId: "Pose37",
      packaging: "v2",
    });
    assert.equal(built.packaging, "v2");
    assert.equal(built.forensics.labeledRef3PoseMaster, true);
    assert.match(built.promptUsed, /Reference Image 3 = POSE MASTER/);
    assert.deepEqual(built.body.provider, {
      order: ["google-ai-studio"],
      allow_fallbacks: false,
    });
  });

  it("20. legacy packaging omits provider pin and may omit Ref3 role label", () => {
    const built = buildNanoProStandaloneTrialRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
      poseId: "Pose37",
      packaging: "legacy",
    });
    assert.equal(built.packaging, "legacy");
    assert.equal(built.body.provider, undefined);
    assert.equal(built.forensics.providerPinned, false);
  });

  it("21. identical inputs yield identical request content fingerprint", () => {
    const a = buildNanoProStandaloneTrialRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
      poseId: "Pose37",
      packaging: "v2",
    });
    const b = buildNanoProStandaloneTrialRequest({
      garmentImageUrl: GARMENT,
      talentImageUrl: TALENT,
      poseImageUrl: POSE,
      poseId: "Pose37",
      packaging: "v2",
    });
    assert.equal(
      a.forensics.requestContentSha256_16,
      b.forensics.requestContentSha256_16,
    );
    assert.equal(a.forensics.talent.sha256_16, b.forensics.talent.sha256_16);
    assert.equal(a.forensics.pose.sha256_16, b.forensics.pose.sha256_16);
    assert.notEqual(a.trialRunId, b.trialRunId);
  });
});
