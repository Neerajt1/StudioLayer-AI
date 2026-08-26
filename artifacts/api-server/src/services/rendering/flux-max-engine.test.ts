import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  FLUX_MAX_OPENROUTER_MODEL,
  FLUX_MAX_OPENROUTER_ASPECT_RATIO,
  FLUX_MAX_STANDARD_REFERENCE_ORDER,
  assembleFluxMaxImagesApiPrompt,
  buildFluxMaxImagesApiRequestBody,
  buildFluxMaxReferenceRoleMapping,
  mapImagePartsToFluxMaxInputReferences,
  mapStudioResolutionToFluxMax,
} from "./flux-max-request.js";
import {
  OPENROUTER_RENDERING_CONFIG,
  isFluxMaxEngine,
  isNanoBananaProEngine,
  resolveOpenRouterModelForResolution,
  resolveOpenRouterRenderEngine,
  resolveNanoProImageResolution,
} from "./rendering.config.js";
import { buildFreshGenerationImageParts } from "./providers/OpenRouterProvider.js";
import { assembleNanoProImagesApiPrompt } from "./nano-pro-authority-layers.js";

const here = dirname(fileURLToPath(import.meta.url));

function withEngine<T>(engine: string | undefined, fn: () => T): T {
  const prev = process.env["OR_RENDER_ENGINE"];
  if (engine === undefined) delete process.env["OR_RENDER_ENGINE"];
  else process.env["OR_RENDER_ENGINE"] = engine;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env["OR_RENDER_ENGINE"];
    else process.env["OR_RENDER_ENGINE"] = prev;
  }
}

const GARMENT = "data:image/jpeg;base64,GARMENT_BYTES";
const TALENT = "data:image/png;base64,TALENT_BYTES";
const POSE = "data:image/png;base64,POSE_BYTES";
const GARMENT_B = "data:image/jpeg;base64,GARMENT_B_BYTES";

describe("FLUX.2 Max engine selection (production Create — rejected)", () => {
  it("1. OR_RENDER_ENGINE=flux_max does NOT select Flux — falls back to flash", () => {
    withEngine("flux_max", () => {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
      assert.equal(isFluxMaxEngine(), false);
      assert.equal(isNanoBananaProEngine(), false);
    });
  });

  it("1b. flux aliases do NOT select Flux — fall back to flash", () => {
    for (const alias of ["flux-max", "flux.2-max", "flux2_max", "FLUX_MAX"]) {
      withEngine(alias, () => {
        assert.equal(resolveOpenRouterRenderEngine(), "flash");
        assert.equal(isFluxMaxEngine(), false);
      });
    }
  });

  it("12. flash engine remains flash (unchanged default)", () => {
    withEngine("flash", () => {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
      assert.equal(isFluxMaxEngine(), false);
      assert.equal(isNanoBananaProEngine(), false);
    });
    withEngine(undefined, () => {
      assert.equal(resolveOpenRouterRenderEngine(), "flash");
    });
  });

  it("13. nano_pro engine remains nano_pro", () => {
    withEngine("nano_pro", () => {
      assert.equal(resolveOpenRouterRenderEngine(), "nano_pro");
      assert.equal(isNanoBananaProEngine(), true);
      assert.equal(isFluxMaxEngine(), false);
    });
  });
});

describe("FLUX.2 Max model + OpenRouter schema (dormant helpers)", () => {
  it("2. verified OpenRouter model identifier remains for dormant helpers only", () => {
    assert.equal(FLUX_MAX_OPENROUTER_MODEL, "black-forest-labs/flux.2-max");
    // Production Create must NOT resolve to Flux even if env asks for it.
    withEngine("flux_max", () => {
      assert.match(resolveOpenRouterModelForResolution("2K"), /flash-image/);
      assert.equal(
        resolveOpenRouterModelForResolution("2K"),
        OPENROUTER_RENDERING_CONFIG.defaultModel,
      );
      assert.notEqual(
        resolveOpenRouterModelForResolution("2K"),
        OPENROUTER_RENDERING_CONFIG.fluxMaxModel,
      );
      assert.notEqual(
        resolveOpenRouterModelForResolution("4K"),
        OPENROUTER_RENDERING_CONFIG.fluxMaxModel,
      );
    });
  });

  it("3. Images API body schema — no chat/completions, no resolution, no detail", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: GARMENT,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
    });
    const prompt = assembleFluxMaxImagesApiPrompt({
      garmentImageCount: 1,
      talentImageCount: 1,
      hasPoseReference: true,
      locationEnvironment: "photo_studio",
      creativeShotPrompt: "Hero commercial stand.",
    });
    const built = buildFluxMaxImagesApiRequestBody({
      prompt,
      input_references: mapImagePartsToFluxMaxInputReferences(parts),
      studioUiResolution: "2K",
    });

    assert.equal(built.api, "POST /api/v1/images");
    assert.equal(built.endpointPath, "/images");
    assert.equal(built.body.model, FLUX_MAX_OPENROUTER_MODEL);
    assert.equal(built.body.n, 1);
    assert.equal(built.body.aspect_ratio, "3:4");
    assert.equal(built.body.aspect_ratio, FLUX_MAX_OPENROUTER_ASPECT_RATIO);
    assert.equal(built.body.output_format, "jpeg");
    assert.ok(typeof built.body.prompt === "string" && built.body.prompt.length > 0);
    assert.ok(Array.isArray(built.body.input_references));

    const serialized = JSON.stringify(built.body);
    assert.equal(serialized.includes('"size"'), false);
    assert.equal(serialized.includes("1728"), false);
    assert.equal(serialized.includes('"width"'), false);
    assert.equal(serialized.includes('"height"'), false);
    assert.equal(serialized.includes('"resolution"'), false);
    assert.equal(serialized.includes("image_config"), false);
    assert.equal(serialized.includes("modalities"), false);
    assert.equal(serialized.includes('"detail"'), false);
    assert.equal(serialized.includes("chat/completions"), false);
    assert.equal(serialized.includes("messages"), false);
    assert.match(serialized, /"aspect_ratio":"3:4"/);
  });
});

describe("FLUX.2 Max references + role map", () => {
  it("4. reference order GARMENT → TALENT → POSE_MASTER", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: GARMENT,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
    });
    assert.deepEqual(
      [...FLUX_MAX_STANDARD_REFERENCE_ORDER],
      ["GARMENT", "TALENT", "POSE_MASTER"],
    );
    assert.equal(parts[0]!.image_url.url, GARMENT);
    assert.equal(parts[1]!.image_url.url, TALENT);
    assert.equal(parts[2]!.image_url.url, POSE);

    const refs = mapImagePartsToFluxMaxInputReferences(parts);
    assert.equal(refs.length, 3);
    assert.equal(refs[0]!.image_url.url, GARMENT);
    assert.equal(refs[1]!.image_url.url, TALENT);
    assert.equal(refs[2]!.image_url.url, POSE);
  });

  it("5. reference-role prompt mapping is explicit", () => {
    const map = buildFluxMaxReferenceRoleMapping({
      garmentImageCount: 1,
      talentImageCount: 1,
      hasPoseReference: true,
    });
    assert.match(map, /Reference Image 1 = GARMENT SOURCE\./);
    assert.match(
      map,
      /Reference Image 2 = STUDIO TALENT \/ SUBJECT IDENTITY\./,
    );
    assert.match(
      map,
      /Reference Image 3 = POSE MASTER \/ BODY POSE AND ACTION GEOMETRY\./,
    );

    const prompt = assembleFluxMaxImagesApiPrompt({
      garmentImageCount: 1,
      talentImageCount: 1,
      hasPoseReference: true,
    });
    assert.ok(prompt.startsWith("REFERENCE IMAGE ROLES:"));
    assert.match(prompt, /sole|identity authority|Studio Talent/i);
    assert.match(prompt, /garment/i);
    assert.match(prompt, /Pose Master/i);
    assert.match(prompt, /do not copy identity/i);
  });

  it("6. dynamic Talent / Garment / Pose assets — no hardcoded IDs", () => {
    const garmentA = "https://cdn.example/garment-uuid-aaa.jpg";
    const talentB = "https://cdn.example/talent-uuid-bbb.png";
    const poseC = "https://cdn.example/pose-uuid-ccc.png";
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: garmentA,
      modelImageUrl: talentB,
      poseReferenceImageUrl: poseC,
    });
    const refs = mapImagePartsToFluxMaxInputReferences(parts);
    assert.equal(refs[0]!.image_url.url, garmentA);
    assert.equal(refs[1]!.image_url.url, talentB);
    assert.equal(refs[2]!.image_url.url, poseC);

    const src = readFileSync(join(here, "flux-max-request.ts"), "utf8");
    assert.equal(src.includes("M-IN-02"), false);
    assert.equal(src.includes("Pose36"), false);

    // Multi-view garment still dynamic
    const multi = buildFreshGenerationImageParts({
      garmentImageUrl: garmentA,
      modelImageUrl: talentB,
      poseReferenceImageUrl: poseC,
      garmentEvidencePackaging: "separate",
      garmentBackImageUrl: GARMENT_B,
    });
    const multiRefs = mapImagePartsToFluxMaxInputReferences(multi);
    assert.equal(multiRefs[0]!.image_url.url, garmentA);
    assert.equal(multiRefs[1]!.image_url.url, GARMENT_B);
    assert.equal(multiRefs[2]!.image_url.url, talentB);
    assert.equal(multiRefs[3]!.image_url.url, poseC);
  });
});

describe("FLUX.2 Max aspect + resolution mapping", () => {
  it("7. uses advertised OpenRouter portrait aspect_ratio 3:4 (not 4:5)", () => {
    assert.equal(FLUX_MAX_OPENROUTER_ASPECT_RATIO, "3:4");
    const m = mapStudioResolutionToFluxMax("2K");
    assert.equal(m.aspect_ratio, "3:4");
    assert.equal(m.size, null);
  });

  it("8. UI 2K/4K unchanged; request sends 3:4 only — no size", () => {
    const m2 = mapStudioResolutionToFluxMax("2K");
    const m4 = mapStudioResolutionToFluxMax("4K");
    assert.equal(m2.studioUiResolution, "2K");
    assert.equal(m4.studioUiResolution, "4K");
    assert.equal(m2.aspect_ratio, "3:4");
    assert.equal(m4.aspect_ratio, "3:4");
    assert.equal(m2.size, null);
    assert.match(m2.note, /3:4/);
    assert.doesNotMatch(m2.note, /1728x2160/);
  });
});

describe("FLUX.2 Max prompt isolation from other engines", () => {
  it("does not call Nano Pro authority assembler", () => {
    const flux = assembleFluxMaxImagesApiPrompt({
      garmentImageCount: 1,
      talentImageCount: 1,
      hasPoseReference: true,
      creativeShotPrompt: "Pose brief",
    });
    assert.doesNotMatch(flux, /TALENT IDENTITY AUTHORITY/);
    assert.doesNotMatch(flux, /GARMENT TEXTURE AUTHORITY/);
    assert.doesNotMatch(flux, /LOWER WARDROBE AUTHORITY/);

    const nano = assembleNanoProImagesApiPrompt({
      hasPoseReference: true,
      talentIdentityImageCount: 1,
      locationEnvironment: "photo_studio",
      primaryInstruction: "PRIMARY",
      creativeShotPrompt: "Pose brief",
    });
    assert.match(nano, /TALENT IDENTITY AUTHORITY/);
    assert.notEqual(flux, nano);
  });

  it("does not embed Nano Regular GARMENT AUTHORITY SOT essay", () => {
    const flux = assembleFluxMaxImagesApiPrompt({
      garmentImageCount: 1,
      talentImageCount: 1,
      hasPoseReference: true,
    });
    assert.doesNotMatch(flux, /GARMENT AUTHORITY — REFERENCE IMAGE 1/);
    assert.doesNotMatch(flux, /SURFACE \/ COMPONENT EVIDENCE PRINCIPLE/);
  });
});

describe("FLUX.2 Max billing / gallery / errors (architecture contracts)", () => {
  it("9. credits — Create still goes through OpenRouterProvider / renders lifecycle (no separate credit path)", () => {
    const providerSrc = readFileSync(
      join(here, "providers/OpenRouterProvider.ts"),
      "utf8",
    );
    const rendersSrc = readFileSync(
      join(here, "../../routes/renders.ts"),
      "utf8",
    );
    assert.match(providerSrc, /isFluxMaxEngine/);
    assert.match(providerSrc, /assembleFluxMaxImagesApiPrompt/);
    // No silent fallback to another model on FLUX failure
    assert.equal(
      /flux_max[\s\S]{0,200}fallback|fallback[\s\S]{0,200}flux/i.test(
        providerSrc,
      ),
      false,
    );
    // Studio Credits still owned by renders route (unchanged path)
    assert.match(rendersSrc, /assertStudioCreditsAvailable|beginGenerationCreditTransaction|studio.?credit/i);
    assert.equal(rendersSrc.includes("flux_max"), false); // engine not special-cased in billing
  });

  it("10. Gallery/render lifecycle — same generate() entry; no experimental gallery", () => {
    const providerSrc = readFileSync(
      join(here, "providers/OpenRouterProvider.ts"),
      "utf8",
    );
    assert.match(providerSrc, /async generate\(input: ProviderInput\)/);
    assert.match(providerSrc, /resolveOpenRouterRenderEngine\(\)/);
    const routesIndex = readFileSync(
      join(here, "../../routes/index.ts"),
      "utf8",
    );
    assert.equal(routesIndex.includes("flux-max-gallery"), false);
    assert.equal(routesIndex.includes("test-flux-max"), false);
  });

  it("11. error handling — FLUX uses shared OpenRouter HTTP error throw (no silent swap)", () => {
    const providerSrc = readFileSync(
      join(here, "providers/OpenRouterProvider.ts"),
      "utf8",
    );
    assert.match(providerSrc, /OpenRouter API error: HTTP/);
    assert.equal(
      providerSrc.includes("silently fall back to flash"),
      false,
    );
    assert.equal(
      providerSrc.includes("fall back to nano_pro"),
      false,
    );
  });
});

describe("Existing engines unchanged under their own OR_RENDER_ENGINE", () => {
  it("12. flash model split unchanged when engine=flash", () => {
    withEngine("flash", () => {
      assert.match(resolveOpenRouterModelForResolution("2K"), /flash-image/);
      assert.match(resolveOpenRouterModelForResolution("4K"), /preview/);
      assert.equal(
        resolveOpenRouterModelForResolution("2K"),
        OPENROUTER_RENDERING_CONFIG.defaultModel,
      );
    });
  });

  it("13. nano_pro resolution + model unchanged when engine=nano_pro", () => {
    withEngine("nano_pro", () => {
      assert.equal(resolveNanoProImageResolution("2K"), "2K");
      assert.equal(resolveNanoProImageResolution("4K"), "4K");
      assert.equal(
        resolveOpenRouterModelForResolution("2K"),
        "google/gemini-3-pro-image",
      );
      assert.equal(
        resolveOpenRouterModelForResolution("4K"),
        "google/gemini-3-pro-image",
      );
    });
  });

  it("Flash chat path still uses garmentInstruction assembler helpers (source intact)", () => {
    const providerSrc = readFileSync(
      join(here, "providers/OpenRouterProvider.ts"),
      "utf8",
    );
    assert.match(providerSrc, /assembleFreshGenerationPrimaryInstruction/);
    assert.match(providerSrc, /modalities: \["image", "text"\]/);
    assert.match(providerSrc, /image_config:/);
    assert.match(providerSrc, /assembleNanoProImagesApiPrompt/);
    // Flux branch is additive
    assert.match(providerSrc, /useFluxMaxImagesApi/);
  });
});
