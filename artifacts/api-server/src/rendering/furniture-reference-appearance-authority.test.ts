import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFurnitureReferenceAuthorityLayer,
  buildFurnitureReferencePrimaryPointer,
  FURNITURE_REFERENCE_DEFERRED_APPEARANCE_LINE,
} from "./furniture-reference-appearance-authority.js";
import { buildFurniturePromptLayer } from "../intelligence/furniture-selector.js";
import { getFurnitureAsset } from "../intelligence/furniture-catalog.js";

describe("furniture-reference-appearance-authority", () => {
  it("names the reference image and forbids redesign/genericization", () => {
    const layer = buildFurnitureReferenceAuthorityLayer(4);
    assert.match(layer, /FURNITURE REFERENCE AUTHORITY — REFERENCE IMAGE 4/);
    assert.match(layer, /Reproduce this exact furniture piece/);
    assert.match(layer, /Do not substitute a similar, generic, simplified, or redesigned/);
    assert.match(layer, /Do not smooth, CGI-polish, beautify, or genericize/);
    assert.match(layer, /sole authority for furniture identity/);
    assert.match(layer, /MATERIAL & SURFACE FIDELITY/);
    assert.match(layer, /do not regenerate, simplify, or smooth grain/);
    assert.match(layer, /do not add artificial gloss, lacquer sheen, CGI specular highlights/);
  });

  it("primary pointer establishes material fidelity and locks scale to human proportion", () => {
    const pointer = buildFurnitureReferencePrimaryPointer(4);
    assert.match(pointer, /FURNITURE REFERENCE — REFERENCE IMAGE 4/);
    assert.match(pointer, /wood grain character, material, finish, surface texture/);
    assert.match(pointer, /Do not redesign, restyle, smooth, beautify, add gloss/i);
    assert.match(
      pointer,
      /physical furniture scale and proportions must remain locked to Reference Image 4 and realistic human-scale/,
    );
    assert.match(pointer, /do not enlarge or shrink the furniture relative to the model/);
    assert.doesNotMatch(pointer, /scale, placement, perspective, and occlusion may adapt/i);
    assert.match(pointer, /placement, perspective, and occlusion may adapt for integration/);
    assert.match(pointer, /Full FURNITURE REFERENCE AUTHORITY follows/);
  });

  it("locks physical scale and proportion without permitting scale adaptation", () => {
    const layer = buildFurnitureReferenceAuthorityLayer(4);
    assert.match(layer, /PHYSICAL SCALE & PROPORTION \(authoritative\):/);
    assert.match(layer, /realistic full-scale adult furniture size/);
    assert.match(layer, /naturally proportioned to the Studio Talent's body and this pose/);
    assert.match(layer, /Do not arbitrarily enlarge, shrink, bulk up, or miniaturize/);
    assert.match(layer, /not a resized or hero-scaled version of the reference/);
    assert.match(
      layer,
      /Do not resize the furniture to match the Pose Master's drawn furniture silhouette/,
    );
    assert.doesNotMatch(layer, /You MAY adapt scale/i);
    assert.doesNotMatch(layer, /MAY adapt scale, placement/i);
  });

  it("permits placement, perspective, occlusion, and lighting without taking pose from the reference", () => {
    const layer = buildFurnitureReferenceAuthorityLayer(4);
    assert.match(layer, /SCENE INTEGRATION/);
    assert.match(
      layer,
      /You MAY adapt placement, camera perspective, occlusion by the model or garment, contact shadows, and scene lighting/,
    );
    assert.match(layer, /Perspective foreshortening may change apparent size on camera/);
    assert.match(
      layer,
      /Do NOT take body pose, camera angle, framing, composition, or environment from Reference Image 4/,
    );
  });

  it("preserves Pose Master contact authority and supersedes generic brief text", () => {
    const layer = buildFurnitureReferenceAuthorityLayer(4);
    assert.match(layer, /Pose Master remains authoritative for body pose/);
    assert.match(
      layer,
      /supersedes any earlier generic FURNITURE appearance description/,
    );
    assert.match(layer, /photography or shot-direction language \(premium, polished, editorial/);
  });

  it("reference-backed prompt layer defers appearance to the authority block", () => {
    const asset = getFurnitureAsset("furn_chair_solid_walnut_editorial")!;
    const layer = buildFurniturePromptLayer(asset, null, null, "Pose26");
    assert.match(layer, new RegExp(FURNITURE_REFERENCE_DEFERRED_APPEARANCE_LINE));
    assert.doesNotMatch(layer, /Real furniture, honestly made: solid hardwood/);
    assert.doesNotMatch(layer, /Selected piece:/);
  });
});
