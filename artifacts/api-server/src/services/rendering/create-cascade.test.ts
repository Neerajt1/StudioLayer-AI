import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleCreateStage2FaceIdentityInstruction,
  buildCreateStage2ImageParts,
  CREATE_CASCADE_STAGE2_REFERENCE_ORDER,
  resolveCreateStage2ImagePartRoles,
} from "./create-cascade-stage2.js";
import {
  buildOpenRouterRequestEvidenceMetadata,
  resolveOpenRouterImagePartRoles,
} from "./openrouter-request-evidence.js";
import {
  isFluxMaxEngine,
  isNanoBananaProEngine,
  resolveOpenRouterModelForResolution,
  resolveOpenRouterRenderEngine,
} from "./rendering.config.js";
import { resolveGenerationCreditCost } from "@workspace/studio-credit-engine";
import { buildFurnitureAuthorityLayer } from "./nano-pro-authority-layers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("Create cascade — engine override", () => {
  it("1. Stage 1 override resolves to Nano Pro model", () => {
    assert.equal(resolveOpenRouterRenderEngine("nano_pro"), "nano_pro");
    assert.equal(isNanoBananaProEngine("nano_pro"), true);
    assert.equal(
      resolveOpenRouterModelForResolution("2K", "nano_pro"),
      "google/gemini-3-pro-image",
    );
    assert.equal(
      resolveOpenRouterModelForResolution("4K", "nano_pro"),
      "google/gemini-3-pro-image",
    );
  });

  it("2. Stage 2 override resolves to Nano Regular (flash)", () => {
    assert.equal(resolveOpenRouterRenderEngine("flash"), "flash");
    assert.equal(isNanoBananaProEngine("flash"), false);
    assert.match(
      resolveOpenRouterModelForResolution("2K", "flash"),
      /flash-image/,
    );
    assert.match(
      resolveOpenRouterModelForResolution("4K", "flash"),
      /preview|flash/,
    );
  });

  it("3. Default engine unchanged when no override (env flash)", () => {
    const prev = process.env["OR_RENDER_ENGINE"];
    process.env["OR_RENDER_ENGINE"] = "flash";
    try {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
      assert.equal(resolveOpenRouterRenderEngine(undefined), "flash");
      assert.equal(resolveOpenRouterRenderEngine(null), "flash");
      assert.equal(isNanoBananaProEngine(), false);
    } finally {
      if (prev === undefined) delete process.env["OR_RENDER_ENGINE"];
      else process.env["OR_RENDER_ENGINE"] = prev;
    }
  });

  it("16. Flux remains unreachable", () => {
    assert.equal(isFluxMaxEngine(), false);
    const prev = process.env["OR_RENDER_ENGINE"];
    process.env["OR_RENDER_ENGINE"] = "flux_max";
    try {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
      assert.equal(isFluxMaxEngine(), false);
    } finally {
      if (prev === undefined) delete process.env["OR_RENDER_ENGINE"];
      else process.env["OR_RENDER_ENGINE"] = prev;
    }
  });
});

describe("Create cascade — Stage-2 packaging", () => {
  const stage2Base = {
    stage1ImageUrl: "data:image/jpeg;base64,STAGE1",
    talentImageUrl: "data:image/jpeg;base64,TALENT",
    garmentFrontImageUrl: "data:image/jpeg;base64,FRONT",
    garmentEvidencePackaging: "sheet" as const,
    garmentReferenceSheetImageUrl: "data:image/jpeg;base64,SHEET",
  };

  it("1. Stage 2 contains Stage-1 image", () => {
    const parts = buildCreateStage2ImageParts({
      stage1ImageUrl: stage2Base.stage1ImageUrl,
      talentImageUrl: stage2Base.talentImageUrl,
    });
    assert.equal(parts[0]!.image_url.url, stage2Base.stage1ImageUrl);
  });

  it("2. Stage 2 contains Studio Talent", () => {
    const parts = buildCreateStage2ImageParts({
      stage1ImageUrl: stage2Base.stage1ImageUrl,
      talentImageUrl: stage2Base.talentImageUrl,
    });
    assert.equal(parts[1]!.image_url.url, stage2Base.talentImageUrl);
    assert.equal(parts.length, 2);
  });

  it("3. Stage 2 contains NO garment Front reference", () => {
    const parts = buildCreateStage2ImageParts({
      stage1ImageUrl: stage2Base.stage1ImageUrl,
      talentImageUrl: stage2Base.talentImageUrl,
    });
    assert.equal(
      parts.some((p) => p.image_url.url === stage2Base.garmentFrontImageUrl),
      false,
    );
  });

  it("4. Stage 2 contains NO Back/Detail sheet", () => {
    const parts = buildCreateStage2ImageParts({
      stage1ImageUrl: stage2Base.stage1ImageUrl,
      talentImageUrl: stage2Base.talentImageUrl,
    });
    assert.equal(
      parts.some((p) => p.image_url.url === stage2Base.garmentReferenceSheetImageUrl),
      false,
    );
  });

  it("5. Stage 2 contains NO Pose Master", () => {
    const roles = resolveCreateStage2ImagePartRoles();
    assert.deepEqual(roles, ["STAGE1_OUTPUT", "TALENT"]);
    assert.equal(roles.includes("POSE_MASTER" as never), false);
  });

  it("6. Stage 2 contains NO furniture image", () => {
    const roles = resolveCreateStage2ImagePartRoles();
    assert.equal(roles.includes("FURNITURE" as never), false);
  });

  it("7. Stage 2 instruction preserves Stage-1 scene/garment/pose; no Environment input", () => {
    const text = assembleCreateStage2FaceIdentityInstruction();
    assert.match(text, /Reference Image 1 = STAGE-1 FINISHED PHOTOGRAPH/i);
    assert.match(text, /Furniture and furniture placement/i);
    assert.match(text, /Preserve the Stage-1 photograph/i);
    assert.match(text, /Garment exactly as rendered/i);
    assert.match(text, /facial identity/i);
    assert.match(text, /Do NOT beautify/i);
    assert.match(text, /Do NOT use any garment reference/i);
    assert.match(text, /Do NOT attach or invent a Pose Master/i);
    assert.doesNotMatch(text, /ENVIRONMENT AUTHORITY/i);
    assert.doesNotMatch(text, /Enhance Model Face/i);
  });

  it("8. Stage-2 reference order is Stage-1 then Talent only", () => {
    assert.deepEqual(CREATE_CASCADE_STAGE2_REFERENCE_ORDER, [
      "STAGE1_OUTPUT",
      "TALENT",
    ]);
  });
});

describe("Create cascade — evidence", () => {
  it("19. CREATE EVIDENCE reports stage 1/2 correctly", () => {
    const stage1 = buildOpenRouterRequestEvidenceMetadata({
      shotIndex: 0,
      resolvedModel: "google/gemini-3-pro-image",
      resolvedEngine: "nano_pro",
      createStage: 1,
      garmentImageUrl: "g",
      modelImageUrl: "t",
      poseReferenceImageUrl: "p",
      finalImagePartCount: 3,
    });
    assert.equal(stage1.createStage, 1);
    assert.equal(stage1.resolvedEngine, "nano_pro");
    assert.equal(stage1.hasPoseMaster, true);
    assert.equal(stage1.hasStage1Image, false);

    const stage2Roles = resolveOpenRouterImagePartRoles({
      createStage: 2,
      hasStage1Image: true,
    });
    assert.deepEqual(stage2Roles, ["STAGE1_OUTPUT", "TALENT"]);

    const stage2 = buildOpenRouterRequestEvidenceMetadata({
      shotIndex: 0,
      resolvedModel: "google/gemini-3.1-flash-image",
      resolvedEngine: "flash",
      createStage: 2,
      hasStage1Image: true,
      finalImagePartCount: 2,
    });
    assert.equal(stage2.createStage, 2);
    assert.equal(stage2.resolvedEngine, "flash");
    assert.equal(stage2.hasPoseMaster, false);
    assert.equal(stage2.hasStage1Image, true);
    assert.equal(stage2.hasTalent, true);
    assert.equal(stage2.hasFrontGarment, false);
    assert.equal(stage2.hasGarmentSheet, false);
  });
});

describe("Create cascade — billing / resolution preserved", () => {
  it("13/14. Existing 2K=1 and 4K=2 Studio Credits unchanged", () => {
    assert.equal(
      resolveGenerationCreditCost({ imageCount: 1, outputResolution: "2K" }),
      1,
    );
    assert.equal(
      resolveGenerationCreditCost({ imageCount: 1, outputResolution: "4K" }),
      2,
    );
    assert.equal(
      resolveGenerationCreditCost({ imageCount: 2, outputResolution: "2K" }),
      2,
    );
    assert.equal(
      resolveGenerationCreditCost({ imageCount: 2, outputResolution: "4K" }),
      4,
    );
  });

  it("12. renders.ts still has a single beginGenerationCreditTransaction", () => {
    const rendersSrc = readFileSync(
      join(__dirname, "../../routes/renders.ts"),
      "utf8",
    );
    const begins = rendersSrc.match(/beginGenerationCreditTransaction/g) ?? [];
    // import + one call site
    assert.ok(begins.length >= 2);
    assert.equal(
      (rendersSrc.match(/await beginGenerationCreditTransaction/g) ?? []).length,
      1,
    );
  });

  it("15. Provider cascade passes outputResolution to both stages (source)", () => {
    const providerSrc = readFileSync(
      join(__dirname, "providers/OpenRouterProvider.ts"),
      "utf8",
    );
    assert.match(providerSrc, /useCreateCascade/);
    assert.match(providerSrc, /"nano_pro"/);
    assert.match(providerSrc, /"flash"/);
    assert.match(providerSrc, /createStage === 2/);
    assert.equal(providerSrc.includes("outputResolution"), true);
  });
});

describe("Create cascade — furniture conflict + diversity untouched", () => {
  it("furniture authority allows required furniture without Environment", () => {
    const layer = buildFurnitureAuthorityLayer(true);
    assert.doesNotMatch(layer, /^FURNITURE AUTHORITY:\nNo furniture/m);
    assert.match(layer, /support furniture/i);
    assert.doesNotMatch(layer, /selected environment/i);
  });

  it("OpenRouterProvider does not reselect furniture on Stage 2 (source)", () => {
    const providerSrc = readFileSync(
      join(__dirname, "providers/OpenRouterProvider.ts"),
      "utf8",
    );
    assert.equal(providerSrc.includes("selectFurnitureAsset"), false);
    assert.equal(providerSrc.includes("resolveFurnitureForPose"), false);
  });

  it("17. Enhance Model Face / refinement path remains non-cascade (source)", () => {
    const providerSrc = readFileSync(
      join(__dirname, "providers/OpenRouterProvider.ts"),
      "utf8",
    );
    assert.match(providerSrc, /Refinement \/ Enhance Face keep the single-shot/);
    assert.match(providerSrc, /V1_CREATE_USE_NANO_PRO_CASCADE/);
    assert.match(
      providerSrc,
      /const useCreateCascade = !isRefinement && V1_CREATE_USE_NANO_PRO_CASCADE/,
    );
  });
});

describe("Create cascade — multi-shot / failure contracts (source)", () => {
  it("8. Stage 2 does not invoke furniture selection (source)", () => {
    const providerSrc = readFileSync(
      join(__dirname, "providers/OpenRouterProvider.ts"),
      "utf8",
    );
    assert.equal(providerSrc.includes("selectFurnitureAsset"), false);
    assert.equal(providerSrc.includes("resolveFurnitureForPose"), false);
    assert.match(providerSrc, /never Pose Master on Stage-2/);
  });

  it("9. Stage 1 packaging unchanged (source)", () => {
    const providerSrc = readFileSync(
      join(__dirname, "providers/OpenRouterProvider.ts"),
      "utf8",
    );
    assert.match(providerSrc, /buildFreshGenerationImageParts/);
    assert.match(providerSrc, /"nano_pro",\s*\n\s*1,/s);
    assert.match(providerSrc, /useNanoProImagesApi/);
  });

  it("10. Stage 2 uses in-place edit contract — no generative modalities (source)", () => {
    const providerSrc = readFileSync(
      join(__dirname, "providers/OpenRouterProvider.ts"),
      "utf8",
    );
    assert.match(providerSrc, /!isRefinementEdit && !isCreateStage2/);
    assert.match(providerSrc, /buildCreateStage2ImageParts\(\{/);
    assert.doesNotMatch(
      providerSrc,
      /buildCreateStage2ImageParts\([\s\S]*garmentFrontImageUrl/s,
    );
  });

  it("11. Stage-1→Stage-2 index wiring and failure skip (source)", () => {
    const providerSrc = readFileSync(
      join(__dirname, "providers/OpenRouterProvider.ts"),
      "utf8",
    );
    assert.match(providerSrc, /const stage1Url = stage1Results\[i\]/);
    assert.match(providerSrc, /if \(!stage1Url\) return Promise\.resolve\(null\)/);
    assert.match(providerSrc, /"flash",\s*\n\s*2,\s*\n\s*stage1Url/s);
  });
});
