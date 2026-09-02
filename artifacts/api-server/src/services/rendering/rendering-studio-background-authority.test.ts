import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STUDIO_BACKGROUND_AUTHORITY_SOT,
  appendStudioBackgroundAuthorityToCreativePrompt,
} from "./rendering-studio-background-authority.js";
import { PHOTOGRAPHY_AUTHORITY_SOT } from "./rendering-photography.js";
import { OPENROUTER_RENDERING_CONFIG } from "./rendering.config.js";
import { assembleHeadlessCreateStage1CreativePrompt } from "./headless-create-stage1-authority.js";
import { composeNanoProAuthorityLayers } from "./nano-pro-authority-layers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const openRouterSrc = readFileSync(
  join(__dirname, "providers/OpenRouterProvider.ts"),
  "utf8",
);
const poseEngineSrc = readFileSync(
  join(__dirname, "../../intelligence/pose-selection-engine.ts"),
  "utf8",
);

describe("Studio background authority — global SoT", () => {
  it("1. global white-background authority exists", () => {
    assert.match(STUDIO_BACKGROUND_AUTHORITY_SOT, /BACKGROUND AUTHORITY/);
    assert.match(STUDIO_BACKGROUND_AUTHORITY_SOT, /#FFFFFF/);
    assert.match(STUDIO_BACKGROUND_AUTHORITY_SOT, /pure white/i);
    assert.match(STUDIO_BACKGROUND_AUTHORITY_SOT, /NON-NEGOTIABLE/i);
  });

  it("2. grey/gray substitution is explicitly prohibited", () => {
    assert.match(STUDIO_BACKGROUND_AUTHORITY_SOT, /grey/i);
    assert.match(STUDIO_BACKGROUND_AUTHORITY_SOT, /gray/i);
    assert.match(STUDIO_BACKGROUND_AUTHORITY_SOT, /cream|beige|off-white/i);
    assert.match(STUDIO_BACKGROUND_AUTHORITY_SOT, /Do NOT substitute/i);
  });

  it("3. realism — contact shadows and grounding permitted; soft plane grey forbidden", () => {
    assert.match(STUDIO_BACKGROUND_AUTHORITY_SOT, /contact shadow/i);
    assert.match(STUDIO_BACKGROUND_AUTHORITY_SOT, /grounding/i);
    assert.match(STUDIO_BACKGROUND_AUTHORITY_SOT, /RGB 255,255,255|#FFFFFF/);
    assert.match(STUDIO_BACKGROUND_AUTHORITY_SOT, /near-white|light-grey|soft studio-wall/i);
    assert.doesNotMatch(
      STUDIO_BACKGROUND_AUTHORITY_SOT,
      /soft tonal variation from professional studio lighting/i,
    );
    assert.doesNotMatch(
      STUDIO_BACKGROUND_AUTHORITY_SOT,
      /flat white entire image|remove all shadow/i,
    );
  });

  it("4. authority reaches Flash Create primary instruction via photography SoT", () => {
    assert.match(PHOTOGRAPHY_AUTHORITY_SOT, /BACKGROUND AUTHORITY/);
    assert.match(
      OPENROUTER_RENDERING_CONFIG.garmentInstruction,
      /BACKGROUND AUTHORITY/,
    );
  });

  it("5. authority reaches Headless production Stage 1 creative brief", () => {
    const prompt = assembleHeadlessCreateStage1CreativePrompt({
      shotPrompt: "POSE:\nEditorial walk.",
    });
    assert.match(prompt, /BACKGROUND AUTHORITY/);
    assert.match(prompt, /#FFFFFF/);
    assert.match(prompt, /Do NOT substitute grey/i);
    assert.match(prompt, /BACKGROUND PIXEL PRECISION — FINAL/);
    assert.ok(prompt.indexOf("BACKGROUND PIXEL PRECISION — FINAL") >
      prompt.indexOf("BACKGROUND AUTHORITY — PURE WHITE"));
  });

  it("6. authority reaches OpenRouter creative shot path after image refs", () => {
    assert.match(openRouterSrc, /appendStudioBackgroundAuthorityToCreativePrompt/);
    assert.match(openRouterSrc, /creativeShotPromptBase/);
  });

  it("7. Nano Pro ENVIRONMENT AUTHORITY uses white studio summary", () => {
    const layers = composeNanoProAuthorityLayers({
      hasPoseReference: true,
      talentIdentityImageCount: 1,
    });
    assert.match(layers, /ENVIRONMENT AUTHORITY/);
    assert.match(layers, /#FFFFFF|pure white/i);
    assert.match(layers, /No grey, gray, cream/i);
  });

  it("8. no pose-specific background logic introduced", () => {
    assert.doesNotMatch(
      openRouterSrc,
      /if\s*\([^)]*poseId[^)]*\)[\s\S]{0,200}background/i,
    );
    assert.doesNotMatch(
      poseEngineSrc,
      /if\s*\([^)]*poseId[^)]*\)[\s\S]{0,200}background/i,
    );
    assert.doesNotMatch(
      readFileSync(join(__dirname, "headless-create-adapter.ts"), "utf8"),
      /if\s*\([^)]*pose/i,
    );
  });

  it("9. append helper dedupes empty creative prompts", () => {
    assert.equal(
      appendStudioBackgroundAuthorityToCreativePrompt(""),
      STUDIO_BACKGROUND_AUTHORITY_SOT,
    );
    const combined = appendStudioBackgroundAuthorityToCreativePrompt(
      "POSE:\nWalk toward camera.",
    );
    assert.match(combined, /^POSE:/);
    assert.match(combined, /BACKGROUND AUTHORITY/);
  });
});
