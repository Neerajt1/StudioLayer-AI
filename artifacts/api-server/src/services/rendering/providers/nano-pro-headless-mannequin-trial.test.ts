import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HEADLESS_STAGE1_PROMPT_BASE,
  HEADLESS_STAGE1_REFERENCE_ORDER,
  HEADLESS_STAGE2_PROMPT,
  HEADLESS_STAGE2_REFERENCE_ORDER,
  HEADLESS_TRIAL_TOTAL_GENERATION_CALLS,
  NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_ENV,
  NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME,
  assembleHeadlessStage1Prompt,
  buildHeadlessStage1Request,
  buildHeadlessStage2Request,
  isNanoProHeadlessMannequinTrialEnabled,
  resolveNanoProHeadlessMannequinTrialModel,
} from "./nano-pro-headless-mannequin-trial.js";
import {
  OPENROUTER_RENDERING_CONFIG,
  V1_CREATE_USE_NANO_PRO_CASCADE,
} from "../rendering.config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TALENT = "data:image/jpeg;base64,TALENT_BYTES_FIXTURE_HM";
const GARMENT = "data:image/png;base64,GARMENT_BYTES_FIXTURE_HM";
const POSE = "data:image/png;base64,POSE_FACE_NEUTRAL_FIXTURE_HM";
const HEADLESS_BASE = "data:image/png;base64,HEADLESS_STAGE1_OUTPUT_BYTES";
const IDENTITY_REF = "data:image/png;base64,IDENTITY_CROP_FIXTURE_BYTES";

function providerSrc(): string {
  return readFileSync(
    join(__dirname, "nano-pro-headless-mannequin-trial.ts"),
    "utf8",
  );
}

describe("nano-pro-headless-mannequin-trial — gating and model", () => {
  it("1. gate is OFF by default and opts in explicitly", () => {
    assert.equal(isNanoProHeadlessMannequinTrialEnabled({}), false);
    assert.equal(
      isNanoProHeadlessMannequinTrialEnabled({
        [NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_ENV]: "true",
      }),
      true,
    );
    assert.equal(
      isNanoProHeadlessMannequinTrialEnabled({
        EXPERIMENTAL_NANO_PRO_STANDALONE_TRIAL_ENABLED: "true",
      }),
      true,
    );
  });

  it("2. uses the configured Nano Pro model, never Flash", () => {
    assert.equal(
      resolveNanoProHeadlessMannequinTrialModel(),
      OPENROUTER_RENDERING_CONFIG.nanoBananaProModel,
    );
    assert.equal(providerSrc().includes("gemini-3.1-flash-image"), false);
    assert.equal(V1_CREATE_USE_NANO_PRO_CASCADE, false);
  });
});

describe("nano-pro-headless-mannequin-trial — exactly two provider calls", () => {
  it("3. the declared call budget is exactly two", () => {
    assert.equal(HEADLESS_TRIAL_TOTAL_GENERATION_CALLS, 2);
  });

  it("4. the provider issues exactly two fetches to the images endpoint", () => {
    const src = providerSrc();
    // One shared call helper, invoked exactly twice.
    assert.equal(
      (src.match(/async function callNanoProImagesOnce/g) ?? []).length,
      1,
    );
    assert.equal(
      (src.match(/await callNanoProImagesOnce\(/g) ?? []).length,
      2,
    );
    // Exactly one fetch to OpenRouter lives inside that helper. The only other
    // fetch is ensureDataUri, which downloads an already-generated image.
    assert.equal(
      (src.match(/OPENROUTER_RENDERING_CONFIG\.baseUrl/g) ?? []).length,
      1,
    );
  });

  it("5. no third generation stage exists anywhere in the module", () => {
    const src = providerSrc();
    assert.equal(/stage:\s*3/.test(src), false);
    assert.equal(src.includes("buildHeadlessStage3Request"), false);
    assert.equal(/STAGE\s*3/i.test(src), false);
    // Only two stage builders are exported.
    const stageBuilders = [
      ...src.matchAll(/export function buildHeadlessStage(\d)Request/g),
    ].map((m) => m[1]);
    assert.deepEqual(stageBuilders, ["1", "2"]);
  });
});

describe("nano-pro-headless-mannequin-trial — Stage 1 is identity-free", () => {
  it("6. Stage 1 references are GARMENT → POSE_MASTER only", () => {
    const built = buildHeadlessStage1Request({
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
    });
    assert.deepEqual([...built.referenceOrder], ["GARMENT", "POSE_MASTER"]);
    assert.deepEqual(
      built.body.input_references.map((r) => r.image_url.url),
      [GARMENT, POSE],
    );
  });

  it("7. Stage 1 never receives the Studio Talent reference", () => {
    const built = buildHeadlessStage1Request({
      garmentImageUrl: GARMENT,
      poseImageUrl: POSE,
    });
    const urls = built.body.input_references.map((r) => r.image_url.url);
    assert.equal(urls.includes(TALENT), false);
    assert.equal(built.body.input_references.length, 2);
    assert.equal(built.referenceOrder.includes("TALENT" as never), false);
    // The builder signature has no parameter through which a Talent image
    // could arrive at Stage 1.
    const signature = providerSrc()
      .split("export function buildHeadlessStage1Request(")[1]!
      .split("): HeadlessStageBuiltRequest")[0]!;
    assert.equal(signature.includes("talentImageUrl"), false);
    assert.match(signature, /garmentImageUrl/);
    assert.match(signature, /poseImageUrl/);
  });

  it("8. Stage 1 issues no identity instruction", () => {
    const p = HEADLESS_STAGE1_PROMPT_BASE;
    assert.equal(/preserve .*identity/i.test(p), false);
    assert.equal(/facial identity/i.test(p), false);
    assert.equal(/same person/i.test(p), false);
    assert.equal(/Studio Talent — the sole human identity authority/i.test(p), false);
    assert.match(
      p,
      /No Studio Talent reference has been provided\. Do not attempt to depict any specific real person\./,
    );
  });

  it("9. Stage 1 renders a real head — the mechanical mask removes it later", () => {
    const p = HEADLESS_STAGE1_PROMPT_BASE;
    assert.match(p, /Reference Image 1 = GARMENT/);
    assert.match(p, /Reference Image 2 = POSE MASTER/);
    assert.match(p, /body, garment, hands, arms, legs, proportions/);
    // A detectable face is REQUIRED: the face-anchor cross-check validates the
    // mask against it. Prompt-based head removal is explicitly not the mechanism.
    assert.match(p, /anatomically normal human head with a clearly visible/);
    assert.match(p, /Keep the head fully visible, correctly sized, unobstructed/);
    assert.equal(/featureless/i.test(p), false);
    assert.equal(/mannequin form/i.test(p), false);
  });

  it("10. an optional creative brief is appended without replacing the contract", () => {
    const withBrief = assembleHeadlessStage1Prompt({
      creativeShotPrompt: "Soft north-light studio.",
    });
    assert.equal(withBrief.startsWith(HEADLESS_STAGE1_PROMPT_BASE), true);
    assert.equal(withBrief.endsWith("Soft north-light studio."), true);
    assert.equal(
      assembleHeadlessStage1Prompt({}),
      HEADLESS_STAGE1_PROMPT_BASE,
    );
  });
});

describe("nano-pro-headless-mannequin-trial — Stage 2 identity application", () => {
  it("11. Stage 2 receives the masked Stage-1 image then the identity reference", () => {
    const built = buildHeadlessStage2Request({
      headlessBaseImageUrl: HEADLESS_BASE,
      identityReferenceImageUrl: IDENTITY_REF,
    });
    assert.deepEqual(
      [...built.referenceOrder],
      ["HEADLESS_BASE", "IDENTITY_REFERENCE"],
    );
    assert.deepEqual(
      built.body.input_references.map((r) => r.image_url.url),
      [HEADLESS_BASE, IDENTITY_REF],
    );
    // The full-body Talent plate is never a Stage-2 reference.
    assert.equal(
      built.body.input_references.some((r) => r.image_url.url === TALENT),
      false,
    );
  });

  it("12. Stage 2 locks everything below the neck", () => {
    const p = HEADLESS_STAGE2_PROMPT;
    assert.match(p, /LOCKED — reproduce from Reference Image 1 without alteration:/);
    for (const locked of [
      "Body",
      "garment",
      "pose",
      "hands",
      "fingers",
      "arms",
      "legs",
      "furniture",
      "background",
      "composition",
      "framing",
      "camera angle",
      "lighting direction",
    ]) {
      assert.equal(
        p.includes(locked),
        true,
        `expected below-neck lock to cover "${locked}"`,
      );
    }
  });

  it("13. Stage 2 restricts the edit to the head/face/hair region", () => {
    const p = HEADLESS_STAGE2_PROMPT;
    assert.match(p, /RESTORE THE HEAD INTO A NEUTRALISED REGION/);
    assert.match(p, /mechanically removed and replaced with a flat neutral grey plate/);
    assert.match(p, /targeted edit of Reference Image 1, not a new photograph/);
    assert.match(p, /Join the neck and hairline cleanly/);
    assert.match(p, /Leave no grey residue/);
    assert.match(
      p,
      /prioritise leaving them unchanged/,
    );
  });

  it("14. Stage 2 names the cropped identity reference as the sole identity authority", () => {
    const p = HEADLESS_STAGE2_PROMPT;
    assert.match(
      p,
      /Reference Image 2 = IDENTITY REFERENCE — a mechanically cropped close-up derived from the original Studio Talent photograph/,
    );
    assert.match(p, /Sole authority for facial identity and facial structure\./);
    assert.match(p, /face, hair, and a limited amount of neck and shoulder context/);
    assert.match(p, /There is exactly one person in the final photograph/);
    assert.match(
      p,
      /Do not blend, average, merge, or combine the identity reference with another person\./,
    );
    assert.match(p, /face shape, eyes, eye spacing, eye colour, nose, nose width/);
    assert.match(
      p,
      /Do not reshape, beautify, stylise, smooth, symmetrise, idealise, substitute, or otherwise reinterpret the identity\./,
    );
  });

  it("14b. Stage 2 denies Reference 2 any scene authority", () => {
    const p = HEADLESS_STAGE2_PROMPT;
    assert.match(
      p,
      /Do not derive body, body proportions, garment, clothing, pose, camera angle, crop, composition, background, or environment from Reference Image 2\./,
    );
    assert.match(p, /Its framing, scale, and background are artefacts of the crop/);
    // Reference 1 alone owns body proportions.
    assert.match(
      p,
      /Reference Image 1 = THE PHOTOGRAPH TO EDIT\. Sole authority for body, body proportions/,
    );
  });

  it("14c. Stage 2 no longer asks the identity to conform to the grey silhouette", () => {
    const p = HEADLESS_STAGE2_PROMPT;
    assert.equal(
      /occupies the neutral grey region at the same position, scale, and orientation/.test(p),
      false,
    );
    assert.match(
      p,
      /The outline of that grey region is not the shape of this person's head or hair/,
    );
    assert.match(
      p,
      /Render the head with the true shape and proportions shown in Reference Image 2/,
    );
    // Light may be adapted; facial structure may not.
    assert.match(
      p,
      /Adapting light must never change facial structure, facial proportions, or facial features\./,
    );
    // No competing skin/colour authority over the face: Reference 1 no longer
    // claims the colour grade, and Reference 2 no longer claims skin generally.
    assert.equal(/colour grade/.test(p), false);
    assert.equal(/skin appearance/.test(p), false);
    assert.match(p, /facial skin tone/);
  });
});

describe("nano-pro-headless-mannequin-trial — request schema and isolation", () => {
  it("15. neither stage adds seed/fidelity/strength/denoise/guidance", () => {
    for (const built of [
      buildHeadlessStage1Request({
        garmentImageUrl: GARMENT,
        poseImageUrl: POSE,
        packaging: "v2",
      }),
      buildHeadlessStage2Request(
        {
          headlessBaseImageUrl: HEADLESS_BASE,
          identityReferenceImageUrl: IDENTITY_REF,
          packaging: "v2",
        },
      ),
    ]) {
      assert.deepEqual(Object.keys(built.body).sort(), [
        "aspect_ratio",
        "input_references",
        "model",
        "n",
        "prompt",
        "provider",
        "resolution",
      ]);
      assert.equal(built.body.n, 1);
      assert.equal(built.body.aspect_ratio, "4:5");
    }
  });

  it("16. identical inputs yield an identical request fingerprint", () => {
    const a = buildHeadlessStage2Request({
      headlessBaseImageUrl: HEADLESS_BASE,
      identityReferenceImageUrl: IDENTITY_REF,
      packaging: "v2",
    });
    const b = buildHeadlessStage2Request({
      headlessBaseImageUrl: HEADLESS_BASE,
      identityReferenceImageUrl: IDENTITY_REF,
      packaging: "v2",
    });
    assert.equal(
      a.forensics.requestContentSha256_16,
      b.forensics.requestContentSha256_16,
    );
  });

  it("17. the identity-first trial is not reused or imported", () => {
    const src = providerSrc();
    // Prose in comments may name it; code must never import or call it.
    assert.equal(
      /from\s*"[^"]*nano-pro-identity-first-trial[^"]*"/.test(src),
      false,
    );
    assert.equal(src.includes("assembleIdentityFirstStage2Prompt"), false);
    assert.equal(src.includes("buildIdentityFirstStage"), false);
    assert.equal(src.includes("IDENTITY_FIRST_STAGE"), false);
  });

  it("18. production Create, credits, Gallery and furniture are not touched", () => {
    const src = providerSrc();
    const imports = [...src.matchAll(/from\s*"([^"]+)"/g)].map((m) => m[1]!);
    for (const forbidden of [
      "OpenRouterProvider",
      "RenderingEngine",
      "create-cascade-stage2",
      "pose-selection-engine",
      "studio-credit",
      "identity-first",
    ]) {
      assert.equal(
        imports.some((i) => i.includes(forbidden)),
        false,
        `must not import anything matching "${forbidden}"`,
      );
    }
    assert.match(src, /creditsDeducted: 0/);
    assert.match(src, /gallery: false/);
    assert.match(src, /createsRenderRow: false/);
    assert.match(src, /cascade: false/);
    assert.match(src, /nanoRegularInvoked: false/);
  });

  it("19. the route mounts without touching the identity-first route", () => {
    const routeSrc = readFileSync(
      join(__dirname, "../../../routes/test-nano-pro-headless-mannequin-trial.ts"),
      "utf8",
    );
    assert.match(routeSrc, /\/test\/nano-pro-headless-mannequin-trial/);
    // The route must not import or delegate to the identity-first trial.
    const routeImports = [...routeSrc.matchAll(/from\s*"([^"]+)"/g)].map(
      (m) => m[1]!,
    );
    assert.equal(
      routeImports.some((i) => i.includes("identity-first")),
      false,
    );
    // Face-neutral Pose Master enforcement is preserved.
    assert.match(routeSrc, /loadStage1PoseReferenceImageAsDataUri/);
    // Narrow first experiment defaults to a furniture-free pose.
    assert.match(routeSrc, /DEFAULT_POSE_ID = "Pose50"/);
    assert.equal(NANO_PRO_HEADLESS_MANNEQUIN_TRIAL_NAME.length > 0, true);
  });
});

describe("nano-pro-headless-mannequin-trial — mechanical masking between the calls", () => {
  it("20. masking happens after Stage 1 and before Stage 2 is built", () => {
    const src = providerSrc();
    const maskAt = src.indexOf("await neutralizeHeadRegion(");
    const stage1At = src.indexOf("const stage1Call = await callNanoProImagesOnce(");
    const stage2BuildAt = src.indexOf("const stage2Built = buildHeadlessStage2Request(");
    const stage2CallAt = src.indexOf("stage2Call = await callNanoProImagesOnce(");

    assert.equal(maskAt > 0, true, "masking step must exist");
    assert.equal(stage1At < maskAt, true, "masking must run after Stage 1");
    assert.equal(maskAt < stage2BuildAt, true, "masking must run before Stage 2 is built");
    assert.equal(stage2BuildAt < stage2CallAt, true);
  });

  it("21. Stage 2 is fed the MASKED bytes, never the raw Stage-1 bytes", () => {
    const src = providerSrc();
    assert.match(
      src,
      /const headlessBaseImageUrl = maskResult\.maskedDataUri;/,
    );
    // An explicit runtime guard rejects the unmasked image.
    assert.match(src, /Stage 2 received the UNMASKED Stage-1 image/);
    assert.match(src, /if \(stage2Ref1 === stage1Call\.imageDataUri\)/);
  });

  it("22. a failed mask aborts before Stage 2 and reports machine-readable reasons", () => {
    const src = providerSrc();
    const throwAt = src.indexOf("throw new HeadlessMaskFailureError(");
    const stage2CallAt = src.indexOf("stage2Call = await callNanoProImagesOnce(");
    assert.equal(throwAt > 0 && throwAt < stage2CallAt, true);
    assert.match(src, /if \(!maskResult\.ok\)/);
    assert.match(src, /reasons: maskResult\.reasons/);
    // The failure carries a one-call budget: Stage 2 never ran.
    assert.match(src, /readonly generationCalls = 1 as const;/);
  });

  it("23. masking is segmentation, not a third generation call", () => {
    const src = providerSrc();
    // Still exactly two provider invocations after the masking step landed.
    assert.equal((src.match(/await callNanoProImagesOnce\(/g) ?? []).length, 2);
    assert.equal(HEADLESS_TRIAL_TOTAL_GENERATION_CALLS, 2);
    assert.equal(/stage:\s*3/.test(src), false);
  });

  it("24. both the original and masked Stage-1 hashes are retained", () => {
    const src = providerSrc();
    assert.match(src, /originalStage1Sha256_16: maskResult\.originalSha256_16/);
    assert.match(src, /maskedStage1Sha256_16: maskResult\.maskedSha256_16/);
    assert.match(src, /unmaskedStage1Sha256_16: stage1Call\.imageSha256_16/);
    assert.match(src, /headlessBaseSha256_16: maskResult\.maskedSha256_16/);
  });
});

describe("nano-pro-headless-mannequin-trial — mechanical identity reference", () => {
  it("25. the identity crop is derived after Stage 1 and before Stage 2 is built", () => {
    const src = providerSrc();
    const cropAt = src.indexOf("await buildTalentIdentityReference(");
    const stage1At = src.indexOf(
      "const stage1Call = await callNanoProImagesOnce(",
    );
    const stage2BuildAt = src.indexOf(
      "const stage2Built = buildHeadlessStage2Request(",
    );
    assert.equal(cropAt > 0, true, "identity crop step must exist");
    assert.equal(stage1At < cropAt, true);
    assert.equal(cropAt < stage2BuildAt, true);
  });

  it("26. Stage 2 is fed the crop, never the full-body Talent plate", () => {
    const src = providerSrc();
    assert.match(
      src,
      /const identityReferenceImageUrl = identityResult\.dataUri;/,
    );
    assert.match(
      src,
      /Stage 2 received the FULL-BODY Talent image instead of the identity reference/,
    );
    assert.match(src, /if \(stage2Ref2 === input\.talentImageUrl\)/);
    // input.talentImageUrl is never passed into the Stage-2 builder.
    const stage2Call = src
      .split("const stage2Built = buildHeadlessStage2Request(")[1]!
      .split("newRunId(),")[0]!;
    assert.equal(stage2Call.includes("talentImageUrl"), false);
  });

  it("27. a failed identity crop aborts before Stage 2", () => {
    const src = providerSrc();
    const throwAt = src.indexOf(
      "throw new HeadlessIdentityReferenceFailureError(",
    );
    const stage2CallAt = src.indexOf(
      "stage2Call = await callNanoProImagesOnce(",
    );
    assert.equal(throwAt > 0 && throwAt < stage2CallAt, true);
    assert.match(src, /if \(!identityResult\.ok\)/);
    assert.match(src, /reason: identityResult\.reason/);
  });

  it("28. deriving the identity reference adds no generation call", () => {
    const src = providerSrc();
    assert.equal((src.match(/await callNanoProImagesOnce\(/g) ?? []).length, 2);
    assert.equal(HEADLESS_TRIAL_TOTAL_GENERATION_CALLS, 2);
    assert.equal(/stage:\s*3/.test(src), false);

    // The crop utility itself calls no image model.
    const cropSrc = readFileSync(
      join(__dirname, "../../image-processing/talent-identity-reference.ts"),
      "utf8",
    );
    for (const forbidden of [
      "openrouter",
      "OPENROUTER",
      "fal.subscribe",
      "@fal-ai",
      "callNanoPro",
      "input_references",
      "/v1/images",
    ]) {
      assert.equal(
        cropSrc.includes(forbidden),
        false,
        `identity crop must not reference "${forbidden}"`,
      );
    }
    assert.equal((cropSrc.match(/fetch\(/g) ?? []).length, 0);
  });

  it("29. forensic hashes cover Talent, crop, masked Stage-1 and both Stage-2 refs", () => {
    const src = providerSrc();
    assert.match(src, /sourceTalentSha256_16: identityResult\.sourceSha256_16/);
    assert.match(
      src,
      /identityReferenceSha256_16: identityResult\.identitySha256_16/,
    );
    assert.match(src, /talentSha256_16: talentMeta\.sha256_16/);
    assert.match(src, /headlessBaseSha256_16: maskResult\.maskedSha256_16/);
    assert.match(src, /inputReferenceSha256_16: \[/);
  });

  it("30. the masking algorithm, detector and thresholds are reused, not reimplemented", () => {
    const src = providerSrc();
    assert.match(src, /from "\.\.\/\.\.\/image-processing\/headless-head-mask\.js"/);
    assert.match(
      src,
      /from "\.\.\/\.\.\/image-processing\/talent-identity-reference\.js"/,
    );
    const cropSrc = readFileSync(
      join(__dirname, "../../image-processing/talent-identity-reference.ts"),
      "utf8",
    );
    // The crop reuses the shipped YuNet detector and never touches the mask
    // thresholds validated for head segmentation.
    assert.match(cropSrc, /from "\.\/face-anchor-detector\.js"/);
    // It must not import — or redefine — the validated head-mask thresholds.
    assert.equal(/from\s*"[^"]*headless-head-mask[^"]*"/.test(cropSrc), false);
    assert.equal(cropSrc.includes("HEAD_PLATE_GRAY"), false);
    assert.equal(cropSrc.includes("HEAD_SEGMENTATION"), false);
  });
});
