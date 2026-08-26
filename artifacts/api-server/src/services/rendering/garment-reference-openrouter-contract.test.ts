import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  buildGarmentReferenceCorrespondenceInstruction,
  composeGarmentReferenceSheet,
  prepareGarmentReferenceForGeneration,
} from "../image-processing/garment-reference-sheet.js";
import {
  assembleFreshGenerationPrimaryInstruction,
  buildFreshGenerationImageParts,
} from "./providers/OpenRouterProvider.js";
import {
  OPENROUTER_RENDERING_CONFIG,
  SURFACE_COMPONENT_EVIDENCE_PRINCIPLE,
} from "./rendering.config.js";

async function solidPng(
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .png()
    .toBuffer();
}

function toDataUri(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

describe("OpenRouter garment Ref contract with reference sheet", () => {
  it("keeps Ref 1/2/3 ordering — single garment image only", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: "https://example.invalid/garment-or-sheet.png",
      modelImageUrl: "https://example.invalid/talent.png",
      poseReferenceImageUrl: "https://example.invalid/pose.png",
    });

    assert.equal(parts.length, 3);
    assert.equal(parts[0]?.image_url.url, "https://example.invalid/garment-or-sheet.png");
    assert.equal(parts[1]?.image_url.url, "https://example.invalid/talent.png");
    assert.equal(parts[2]?.image_url.url, "https://example.invalid/pose.png");
  });

  it("sheet mode keeps original Front as Ref1; sheet is supplemental Ref2", async () => {
    const front = await solidPng(400, 500, { r: 200, g: 170, b: 140 });
    const back = await solidPng(380, 480, { r: 90, g: 110, b: 150 });
    const detail = await solidPng(360, 120, { r: 160, g: 60, b: 60 });

    const resolved = await prepareGarmentReferenceForGeneration({
      frontImageUrl: toDataUri(front),
      backImageUrl: toDataUri(back),
      detailImageUrl: toDataUri(detail),
      renderId: 42,
      evidenceMode: "sheet",
    });

    assert.equal(resolved.usedReferenceSheet, true);
    assert.equal(resolved.packaging, "sheet");
    assert.equal(resolved.mode, "front_back_detail");
    assert.ok(resolved.garmentImageUrl.startsWith("data:image/png;base64,"));
    assert.ok(resolved.garmentReferenceSheetImageUrl?.startsWith("data:image/png;base64,"));
    assert.equal(resolved.garmentImageUrl, resolved.garmentFrontImageUrl);
    assert.notEqual(resolved.garmentImageUrl, resolved.garmentReferenceSheetImageUrl);

    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: resolved.garmentImageUrl,
      modelImageUrl: "https://example.invalid/talent.png",
      poseReferenceImageUrl: "https://example.invalid/pose.png",
      garmentEvidencePackaging: "sheet",
      garmentReferenceSheetImageUrl: resolved.garmentReferenceSheetImageUrl,
    });

    assert.equal(parts.length, 4, "Front + supplemental sheet + talent + pose");
    assert.equal(parts[0]?.image_url.url, resolved.garmentImageUrl);
    assert.equal(parts[1]?.image_url.url, resolved.garmentReferenceSheetImageUrl);
    assert.equal(parts[2]?.image_url.url, "https://example.invalid/talent.png");
    assert.equal(parts[3]?.image_url.url, "https://example.invalid/pose.png");
  });

  it("Front-only does not compose a sheet", async () => {
    const frontUrl = "https://cdn.example/front.jpg";
    const resolved = await prepareGarmentReferenceForGeneration({
      frontImageUrl: frontUrl,
      renderId: 7,
      evidenceMode: "sheet",
    });
    assert.equal(resolved.usedReferenceSheet, false);
    assert.equal(resolved.packaging, "sheet");
    assert.equal(resolved.garmentImageUrl, frontUrl);
  });

  it("garmentInstruction prioritizes uploaded visual evidence over category priors", () => {
    const text = OPENROUTER_RENDERING_CONFIG.garmentInstruction;
    assert.match(text, /Reference Image 1 is the garment reference/);
    assert.match(text, /Reference Image 2 is the human model/);
    assert.match(text, /GARMENT AUTHORITY — REFERENCE IMAGE 1/);
    assert.match(text, /category priors/i);
    assert.match(text, /Ref1 outranks category priors and analyzer text/i);
    assert.equal(/Reference Image 4/i.test(text), false);
    assert.equal(/backImageUrl|detailImageUrl|Reference Image 1b/i.test(text), false);
    assert.equal(/MULTI-VIEW GARMENT REFERENCE/i.test(text), false);
    assert.equal(/SURFACE \/ COMPONENT EVIDENCE PRINCIPLE/i.test(text), false);
    assert.equal(/leather jacket|biker jacket/i.test(text), false);
  });

  it("garmentInstruction includes Garment Authority SoT (A/B variant)", () => {
    const text = OPENROUTER_RENDERING_CONFIG.garmentInstruction;
    assert.match(text, /GARMENT AUTHORITY — REFERENCE IMAGE 1/);
    assert.match(text, /AS-WORN STATE:/);
    assert.match(text, /rolled, creased or folded cuffs\/sleeves/i);
    assert.match(text, /MATERIAL \/ SURFACE:/);
    assert.match(text, /crinkle, wrinkles/i);
    assert.match(text, /Do not smooth, polish, flatten, clean up or genericize/i);
    assert.match(text, /Those folds are additive only/i);
    assert.match(
      text,
      /Premium \/ clean \/ luxury studio quality means lighting and photographic finish only/i,
    );
    assert.doesNotMatch(text, /GARMENT FIDELITY — NON-NEGOTIABLE/);
    assert.doesNotMatch(text, /STRUCTURAL ELEMENTS — YOU MUST PRESERVE/);
    assert.doesNotMatch(text, /WHAT MUST NEVER CHANGE:/);
    assert.doesNotMatch(text, /FINAL GARMENT FIDELITY/);
    assert.doesNotMatch(text, /pixel-perfect|exact every wrinkle|maximum texture|hyper-detailed fabric|ultra-sharp texture/i);
  });

  it("D sheet stacks Detail full-width (readable)", async () => {
    const front = await solidPng(800, 1000, { r: 200, g: 170, b: 140 });
    const back = await solidPng(700, 900, { r: 90, g: 110, b: 150 });
    const detail = await solidPng(720, 180, { r: 160, g: 60, b: 60 });
    const sheet = await composeGarmentReferenceSheet({ front, back, detail });
    const detailPanel = sheet.layout.panels.find((p) => p.role === "detail")!;
    assert.equal(detailPanel.panelWidth, 800);
    assert.ok(detailPanel.drawWidth >= 700);
  });
});

describe("multi-view garment correspondence instruction", () => {
  it("Front-only — evidence principle present; no multi-view wording; fidelity intact", () => {
    const correspondence = buildGarmentReferenceCorrespondenceInstruction("front_only");
    assert.equal(correspondence, undefined);

    const primary = assembleFreshGenerationPrimaryInstruction(correspondence);
    assert.ok(primary.startsWith(OPENROUTER_RENDERING_CONFIG.garmentInstruction));
    assert.match(primary, /SURFACE \/ COMPONENT EVIDENCE PRINCIPLE/);
    assert.ok(primary.includes(SURFACE_COMPONENT_EVIDENCE_PRINCIPLE));
    assert.equal(/MULTI-VIEW GARMENT REFERENCE/i.test(primary), false);
    assert.equal(/NEGATIVE CORRESPONDENCE/i.test(primary), false);
    assert.match(primary, /Preserve visible construction from Ref1/);
    assert.match(primary, /Reference Image 2 provides talent identity and body context only/);
  });

  it("Front + Back — principle + Front/Back correspondence both present", () => {
    const correspondence = buildGarmentReferenceCorrespondenceInstruction("front_back");
    assert.ok(correspondence);
    assert.match(correspondence, /SAME garment/i);
    assert.match(correspondence, /PRIMARY GARMENT AUTHORITY/i);
    assert.match(correspondence, /original uploaded FRONT/i);
    assert.match(correspondence, /SUPPLEMENTAL MULTI-VIEW SHEET/i);
    assert.match(correspondence, /Back View/i);
    assert.equal(/Design\/Texture Detail/i.test(correspondence), false);
    assert.match(correspondence, /NEGATIVE CORRESPONDENCE/i);
    assert.match(correspondence, /must not be transferred, mirrored, repeated/i);
    assert.match(correspondence, /Do not transfer Front embroidery onto the Back/i);
    assert.match(correspondence, /Do not mirror Front decoration onto the Back/i);
    assert.match(correspondence, /Absence of embroidery or decorative construction in the Back reference is meaningful/i);
    assert.match(correspondence, /Match the actual Back panel rather than inferring/i);

    const primary = assembleFreshGenerationPrimaryInstruction(correspondence);
    assert.ok(primary.startsWith(OPENROUTER_RENDERING_CONFIG.garmentInstruction));
    assert.match(primary, /SURFACE \/ COMPONENT EVIDENCE PRINCIPLE/);
    assert.match(primary, /SUPPLEMENTAL MULTI-VIEW SHEET|PRIMARY GARMENT AUTHORITY/);
    assert.match(primary, /Preserve visible construction from Ref1/);
    assert.match(primary, /never use clothing visible on the talent as evidence/i);
    assert.equal((primary.match(/Do not invent embroidery/g) ?? []).length, 1);
  });

  it("Front + Detail — principle + Detail correspondence both present", () => {
    const correspondence = buildGarmentReferenceCorrespondenceInstruction("front_detail");
    assert.ok(correspondence);
    assert.match(correspondence, /SAME garment/i);
    assert.match(correspondence, /PRIMARY GARMENT AUTHORITY/i);
    assert.match(correspondence, /SUPPLEMENTAL MULTI-VIEW SHEET/i);
    assert.match(correspondence, /Design\/Texture Detail/i);
    assert.equal(/\bBack View\b/i.test(correspondence), false);
    assert.equal(/NEGATIVE CORRESPONDENCE/i.test(correspondence), false);

    const primary = assembleFreshGenerationPrimaryInstruction(correspondence);
    assert.ok(primary.includes(OPENROUTER_RENDERING_CONFIG.garmentInstruction));
    assert.match(primary, /SURFACE \/ COMPONENT EVIDENCE PRINCIPLE/);
    assert.match(primary, /SUPPLEMENTAL MULTI-VIEW SHEET|PRIMARY GARMENT AUTHORITY/);
    assert.match(primary, /Design\/Texture Detail/);
  });

  it("Front + Back + Detail — principle + full correspondence both present", () => {
    const correspondence = buildGarmentReferenceCorrespondenceInstruction("front_back_detail");
    assert.ok(correspondence);
    assert.match(correspondence, /SAME garment/i);
    assert.match(correspondence, /PRIMARY GARMENT AUTHORITY/i);
    assert.match(correspondence, /SUPPLEMENTAL MULTI-VIEW SHEET/i);
    assert.match(correspondence, /Back View/i);
    assert.match(correspondence, /Design\/Texture Detail/i);
    assert.match(correspondence, /NEGATIVE CORRESPONDENCE/i);
    assert.match(correspondence, /Do not transfer Front embroidery onto the Back/i);

    const primary = assembleFreshGenerationPrimaryInstruction(correspondence);
    assert.ok(primary.startsWith(OPENROUTER_RENDERING_CONFIG.garmentInstruction));
    assert.match(primary, /SURFACE \/ COMPONENT EVIDENCE PRINCIPLE/);
    assert.match(primary, /SUPPLEMENTAL MULTI-VIEW SHEET|PRIMARY GARMENT AUTHORITY/);
    assert.match(primary, /Ref1 outranks category priors/i);
    assert.equal((primary.match(/Do not invent embroidery/g) ?? []).length, 1);
    assert.equal((primary.match(/SURFACE \/ COMPONENT EVIDENCE PRINCIPLE/g) ?? []).length, 1);
  });

  it("evidence principle treats Ref2 as identity, not garment-construction evidence", () => {
    const primary = assembleFreshGenerationPrimaryInstruction(undefined);
    assert.match(primary, /Reference Image 2 provides talent identity and body context only/);
    assert.match(primary, /never use clothing visible on the talent as evidence for garment construction or decoration/i);
  });

  it("Front-only primary includes principle without replacing garmentInstruction", () => {
    const primary = assembleFreshGenerationPrimaryInstruction(
      buildGarmentReferenceCorrespondenceInstruction("front_only"),
    );
    assert.equal(
      primary,
      `${OPENROUTER_RENDERING_CONFIG.garmentInstruction}\n\n${SURFACE_COMPONENT_EVIDENCE_PRINCIPLE}`,
    );
    assert.equal(
      assembleFreshGenerationPrimaryInstruction(undefined),
      `${OPENROUTER_RENDERING_CONFIG.garmentInstruction}\n\n${SURFACE_COMPONENT_EVIDENCE_PRINCIPLE}`,
    );
  });

  it("prepare mode drives correspondence presence", async () => {
    const front = await solidPng(200, 250, { r: 200, g: 170, b: 140 });
    const back = await solidPng(180, 220, { r: 90, g: 110, b: 150 });
    const detail = await solidPng(160, 80, { r: 160, g: 60, b: 60 });

    const frontOnly = await prepareGarmentReferenceForGeneration({
      frontImageUrl: toDataUri(front),
      renderId: 1,
    });
    assert.equal(
      buildGarmentReferenceCorrespondenceInstruction(frontOnly.mode),
      undefined,
    );

    const frontBack = await prepareGarmentReferenceForGeneration({
      frontImageUrl: toDataUri(front),
      backImageUrl: toDataUri(back),
      renderId: 2,
      evidenceMode: "sheet",
    });
    assert.equal(frontBack.mode, "front_back");
    assert.match(
      buildGarmentReferenceCorrespondenceInstruction(frontBack.mode)!,
      /Back View/,
    );

    const frontDetail = await prepareGarmentReferenceForGeneration({
      frontImageUrl: toDataUri(front),
      detailImageUrl: toDataUri(detail),
      renderId: 3,
      evidenceMode: "sheet",
    });
    assert.equal(frontDetail.mode, "front_detail");
    assert.match(
      buildGarmentReferenceCorrespondenceInstruction(frontDetail.mode)!,
      /Design\/Texture Detail/,
    );

    const all = await prepareGarmentReferenceForGeneration({
      frontImageUrl: toDataUri(front),
      backImageUrl: toDataUri(back),
      detailImageUrl: toDataUri(detail),
      renderId: 4,
      evidenceMode: "sheet",
    });
    assert.equal(all.mode, "front_back_detail");
    const text = buildGarmentReferenceCorrespondenceInstruction(all.mode)!;
    assert.match(text, /PRIMARY GARMENT AUTHORITY/);
    assert.match(text, /original uploaded FRONT/);
    assert.match(text, /SUPPLEMENTAL/);
    assert.match(text, /Back View/);
    assert.match(text, /Design\/Texture Detail/);
    assert.match(text, /category interpretation/i);
  });
});

describe("garment evidence set — separate packaging", () => {
  it("separate + Front only — single garment image; no sheet; no multi-view correspondence", async () => {
    const frontUrl = "https://cdn.example/front-only.jpg";
    const resolved = await prepareGarmentReferenceForGeneration({
      frontImageUrl: frontUrl,
      renderId: 10,
      evidenceMode: "separate",
    });
    assert.equal(resolved.usedReferenceSheet, false);
    assert.equal(resolved.mode, "front_only");
    assert.equal(resolved.garmentImageUrl, frontUrl);
    assert.equal(resolved.garmentBackImageUrl, undefined);
    assert.equal(resolved.garmentDetailImageUrl, undefined);

    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: resolved.garmentImageUrl,
      modelImageUrl: "https://example.invalid/talent.png",
      poseReferenceImageUrl: "https://example.invalid/pose.png",
      garmentEvidencePackaging: "separate",
    });
    assert.equal(parts.length, 3);
    assert.equal(parts[0]?.image_url.url, frontUrl);
    assert.equal(parts[1]?.image_url.url, "https://example.invalid/talent.png");
    assert.equal(parts[2]?.image_url.url, "https://example.invalid/pose.png");

    const primary = assembleFreshGenerationPrimaryInstruction({
      talentReferenceImageNumber: 2,
    });
    assert.match(primary, /SURFACE \/ COMPONENT EVIDENCE PRINCIPLE/);
    assert.equal(/MULTI-VIEW GARMENT REFERENCE/i.test(primary), false);
    assert.equal(/GARMENT EVIDENCE SET/i.test(primary), false);
  });

  it("separate + Front/Back — ordered Front, Back, Talent, Pose; dynamic numbering", async () => {
    const front = await solidPng(200, 250, { r: 200, g: 170, b: 140 });
    const back = await solidPng(180, 220, { r: 90, g: 110, b: 150 });
    const frontUri = toDataUri(front);
    const backUri = toDataUri(back);

    const resolved = await prepareGarmentReferenceForGeneration({
      frontImageUrl: frontUri,
      backImageUrl: backUri,
      renderId: 11,
      evidenceMode: "separate",
    });
    assert.equal(resolved.usedReferenceSheet, false);
    assert.equal(resolved.packaging, "separate");
    assert.equal(resolved.mode, "front_back");
    assert.equal(resolved.garmentBackImageUrl, backUri);
    assert.equal(resolved.garmentDetailImageUrl, undefined);
    assert.equal(resolved.garmentImageUrl, resolved.garmentFrontImageUrl);

    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: resolved.garmentImageUrl,
      garmentBackImageUrl: resolved.garmentBackImageUrl,
      modelImageUrl: "https://example.invalid/talent.png",
      poseReferenceImageUrl: "https://example.invalid/pose.png",
      garmentEvidencePackaging: "separate",
    });
    assert.equal(parts.length, 4);
    assert.equal(parts[0]?.image_url.url, resolved.garmentImageUrl);
    assert.equal(parts[1]?.image_url.url, backUri);
    assert.equal(parts[2]?.image_url.url, "https://example.invalid/talent.png");
    assert.equal(parts[3]?.image_url.url, "https://example.invalid/pose.png");

    const primary = assembleFreshGenerationPrimaryInstruction({
      evidenceSetMappingInstruction:
        "GARMENT EVIDENCE SET: Reference Image 1 = Garment Front. "
        + "Reference Image 2 = Garment Back. "
        + "Reference Image 3 = Talent. "
        + "Reference Image 4 = Pose Master visual reference.",
      talentReferenceImageNumber: 3,
    });
    assert.match(primary, /GARMENT EVIDENCE SET/);
    assert.match(primary, /Reference Image 3 = Talent/);
    assert.match(primary, /Reference Image 3 is the human model/);
    assert.match(primary, /Reference Image 3 provides talent identity/);
    assert.equal(/MULTI-VIEW GARMENT REFERENCE/i.test(primary), false);
    assert.match(primary, /SURFACE \/ COMPONENT EVIDENCE PRINCIPLE/);
    assert.match(primary, /Preserve visible construction from Ref1/);
  });

  it("separate + Front/Detail — ordered Front, Detail, Talent, Pose", async () => {
    const front = await solidPng(200, 250, { r: 200, g: 170, b: 140 });
    const detail = await solidPng(160, 80, { r: 160, g: 60, b: 60 });
    const detailUri = toDataUri(detail);

    const resolved = await prepareGarmentReferenceForGeneration({
      frontImageUrl: toDataUri(front),
      detailImageUrl: detailUri,
      renderId: 12,
      evidenceMode: "separate",
    });
    assert.equal(resolved.packaging, "separate");
    assert.equal(resolved.usedReferenceSheet, false);
    assert.equal(resolved.mode, "front_detail");
    assert.equal(resolved.garmentDetailImageUrl, detailUri);

    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: resolved.garmentImageUrl,
      garmentDetailImageUrl: resolved.garmentDetailImageUrl,
      modelImageUrl: "https://example.invalid/talent.png",
      poseReferenceImageUrl: "https://example.invalid/pose.png",
      garmentEvidencePackaging: "separate",
    });
    assert.equal(parts.length, 4);
    assert.equal(parts[1]?.image_url.url, detailUri);
    assert.equal(parts[2]?.image_url.url, "https://example.invalid/talent.png");
  });

  it("separate + Front/Back/Detail — five refs with Talent Ref 4 and Pose Ref 5", async () => {
    const front = await solidPng(200, 250, { r: 200, g: 170, b: 140 });
    const back = await solidPng(180, 220, { r: 90, g: 110, b: 150 });
    const detail = await solidPng(160, 80, { r: 160, g: 60, b: 60 });
    const backUri = toDataUri(back);
    const detailUri = toDataUri(detail);

    const resolved = await prepareGarmentReferenceForGeneration({
      frontImageUrl: toDataUri(front),
      backImageUrl: backUri,
      detailImageUrl: detailUri,
      renderId: 13,
      evidenceMode: "separate",
    });
    assert.equal(resolved.packaging, "separate");
    assert.equal(resolved.usedReferenceSheet, false);
    assert.equal(resolved.mode, "front_back_detail");

    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: resolved.garmentImageUrl,
      garmentBackImageUrl: resolved.garmentBackImageUrl,
      garmentDetailImageUrl: resolved.garmentDetailImageUrl,
      modelImageUrl: "https://example.invalid/talent.png",
      poseReferenceImageUrl: "https://example.invalid/pose.png",
      garmentEvidencePackaging: "separate",
    });
    assert.equal(parts.length, 5);
    assert.equal(parts[0]?.image_url.url, resolved.garmentImageUrl);
    assert.equal(parts[1]?.image_url.url, backUri);
    assert.equal(parts[2]?.image_url.url, detailUri);
    assert.equal(parts[3]?.image_url.url, "https://example.invalid/talent.png");
    assert.equal(parts[4]?.image_url.url, "https://example.invalid/pose.png");

    const primary = assembleFreshGenerationPrimaryInstruction({
      evidenceSetMappingInstruction:
        "GARMENT EVIDENCE SET: Reference Image 1 = Garment Front. "
        + "Reference Image 2 = Garment Back. "
        + "Reference Image 3 = Garment Detail. "
        + "Reference Image 4 = Talent. "
        + "Reference Image 5 = Pose Master visual reference.",
      talentReferenceImageNumber: 4,
    });
    assert.match(primary, /Reference Image 4 = Talent/);
    assert.match(primary, /Reference Image 4 is the human model/);
    assert.match(primary, /Reference Image 4 provides talent identity/);
    assert.equal(/MULTI-VIEW GARMENT REFERENCE/i.test(primary), false);
    assert.equal((primary.match(/Do not invent embroidery/g) ?? []).length, 1);
  });

  it("sheet mode remains default packaging when evidenceMode is omitted", async () => {
    const front = await solidPng(120, 150, { r: 10, g: 20, b: 30 });
    const back = await solidPng(100, 140, { r: 40, g: 50, b: 60 });
    const resolved = await prepareGarmentReferenceForGeneration({
      frontImageUrl: toDataUri(front),
      backImageUrl: toDataUri(back),
      renderId: 99,
    });
    assert.equal(resolved.packaging, "sheet");
    assert.equal(resolved.usedReferenceSheet, true);
    assert.ok(resolved.garmentReferenceSheetImageUrl);
    assert.equal(resolved.garmentImageUrl, resolved.garmentFrontImageUrl);
    assert.notEqual(resolved.garmentImageUrl, resolved.garmentReferenceSheetImageUrl);
  });
});
