// ---------------------------------------------------------------------------
// Furniture selector + Pose 38/39 isolation + dark/spatial/garment fidelity
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FURNITURE_CATALOG,
  FURNITURE_USER_COOLDOWN,
  getFurnitureAsset,
  isFullyDarkFurniture,
} from "./furniture-catalog";
import {
  assertFurnitureCatalogQualityInvariants,
  assetViolatesDarkAesthetic,
  buildFurniturePromptLayer,
  buildGarmentFidelityCloser,
  furnitureDiversitySeed,
  FURNITURE_PROMPT_MAX_CHARS,
  selectFurnitureAsset,
} from "./furniture-selector";
import {
  deriveSupportContactClass,
  deriveSupportSpatialRelation,
  textImpliesLightUpholstery,
} from "./furniture-support";
import {
  preparePoseMasterStructuredDefinition,
  buildShotPromptAtSlot,
  buildPoseMasterReferenceAuthorityLayer,
} from "./pose-selection-engine";
import { getPoseDefinition } from "./pose-library";
import type { GarmentProfile } from "./types";

const profile: GarmentProfile = {
  category: "tops",
  subcategory: "tank",
  gender: "womens",
  ageGroup: "young_adult",
  colour: ["white"],
  fit: "regular",
  fabric: "cotton",
  pattern: "solid",
  texture: "ribbed",
  season: ["summer"],
  occasion: ["casual"],
};

describe("Furniture catalog quality bar", () => {
  it("contains only substantial non-outdoor fully-dark editorial assets", () => {
    assertFurnitureCatalogQualityInvariants();
    assert.ok(FURNITURE_CATALOG.length >= 10);
    for (const asset of FURNITURE_CATALOG) {
      assert.equal(asset.isLightweightOutdoor, false);
      assert.notEqual(asset.visualWeight, "lightweight");
      assert.equal(asset.isDarkPreferred, true);
      assert.equal(asset.isLightBrown, false);
      assert.equal(asset.isLightUpholstery, false);
      assert.equal(isFullyDarkFurniture(asset), true);
      assert.equal(assetViolatesDarkAesthetic(asset), false);
      assert.equal(
        textImpliesLightUpholstery(
          `${asset.label} ${asset.materialSummary} ${asset.promptDescription}`,
        ),
        false,
      );
    }
  });

  it("edge_capable chairs are dark-seat (not cream/amber pool)", () => {
    const edge = FURNITURE_CATALOG.filter(
      (a) => a.category === "chair" && a.seatProfile === "edge_capable",
    );
    assert.ok(edge.length >= 3);
    for (const asset of edge) {
      assert.equal(asset.isLightUpholstery, false);
      assert.equal(assetViolatesDarkAesthetic(asset), false);
    }
  });
});

describe("Furniture selector — user cooldown + diversity", () => {
  it("same user cannot reuse exact asset within 100 furniture-bearing gens", () => {
    const first = selectFurnitureAsset({ prop: "chair", seed: 1 });
    assert.ok(first);
    const others = FURNITURE_CATALOG.filter(
      (a) => a.category === "chair" && a.id !== first!.asset.id,
    );
    assert.ok(others.length > 0);
    const history = Array.from({ length: FURNITURE_USER_COOLDOWN }, (_, i) => {
      if (i === 0) {
        return {
          furnitureAssetId: first!.asset.id,
          furnitureFamily: first!.asset.family,
          index: 0,
        };
      }
      const alt = others[(i - 1) % others.length]!;
      return {
        furnitureAssetId: alt.id,
        furnitureFamily: alt.family,
        index: i,
      };
    });
    const next = selectFurnitureAsset({
      prop: "chair",
      userHistory: history,
      seed: 2,
    });
    assert.ok(next);
    assert.notEqual(next!.asset.id, first!.asset.id);
  });

  it("different users may receive the same furniture asset", () => {
    const a = selectFurnitureAsset({ prop: "chair", seed: 42, userHistory: [] });
    const b = selectFurnitureAsset({ prop: "chair", seed: 42, userHistory: [] });
    assert.ok(a && b);
    assert.equal(a!.asset.id, b!.asset.id);
  });

  it("failed / empty history does not block selection", () => {
    const selected = selectFurnitureAsset({ prop: "chair", userHistory: [], seed: 3 });
    assert.ok(selected);
    assert.match(selected!.asset.id, /^furn_chair_/);
  });

  it("non-furniture props return null (do not consume furniture)", () => {
    assert.equal(selectFurnitureAsset({ prop: "none" }), null);
    assert.equal(selectFurnitureAsset({ prop: null }), null);
  });

  it("after cooldown window passes, prior asset becomes eligible again", () => {
    const asset = getFurnitureAsset("furn_chair_wingback_cognac_leather")!;
    const others = FURNITURE_CATALOG.filter(
      (a) => a.category === "chair" && a.id !== asset.id,
    );
    const history = Array.from({ length: 100 }, (_, i) => {
      const alt = others[i % others.length]!;
      return {
        furnitureAssetId: alt.id,
        furnitureFamily: alt.family,
        index: i,
      };
    });
    const selected = selectFurnitureAsset({
      prop: "chair",
      userHistory: history,
      seed: 0,
    });
    assert.ok(selected);
    const cooled = new Set(history.map((h) => h.furnitureAssetId));
    assert.equal(cooled.has(selected!.asset.id), false);
    assert.equal(selected!.asset.id, asset.id);
  });

  it("avoids repeating the same family in-batch when alternatives exist", () => {
    const first = selectFurnitureAsset({ prop: "chair", seed: 10 });
    assert.ok(first);
    const second = selectFurnitureAsset({
      prop: "chair",
      seed: 11,
      excludeAssetIdsInBatch: [first!.asset.id],
      excludeFamiliesInBatch: [first!.asset.family],
    });
    assert.ok(second);
    assert.notEqual(second!.asset.id, first!.asset.id);
    assert.notEqual(second!.asset.family, first!.asset.family);
  });

  it("prefers dark substantial furniture and excludes lightweight outdoor", () => {
    const selected = selectFurnitureAsset({ prop: "chair", seed: 5 });
    assert.ok(selected);
    assert.equal(selected!.asset.isDarkPreferred, true);
    assert.equal(selected!.asset.isLightBrown, false);
    assert.equal(selected!.asset.isLightUpholstery, false);
    assert.equal(selected!.asset.isLightweightOutdoor, false);
    assert.equal(selected!.asset.visualWeight, "substantial");
  });
});

describe("Furniture ↔ pose support compatibility", () => {
  it("half_seated / edge_seated default to as_demonstrated — not universal front_edge", () => {
    const pose7 = getPoseDefinition("Pose7")!;
    assert.equal(deriveSupportContactClass(pose7), "half_seated");
    const spatial7 = deriveSupportSpatialRelation(pose7)!;
    assert.equal(spatial7.contactClass, "half_seated");
    assert.equal(spatial7.contactZone, "as_demonstrated");
    assert.equal(spatial7.requiresFrontEdgeLoad, false);
    assert.equal(spatial7.bodyAxis, "three_quarter");
    assert.match(spatial7.promptHint, /Pose Master spatial authority/);
    assert.match(spatial7.promptHint, /demonstrated body↔support relationship|body-to-support spatial relationship/);
    assert.doesNotMatch(spatial7.promptHint, /front\/near seat-edge load/);
    assert.match(spatial7.promptHint, /NEW dark appearance\/finish only/);

    const pose33 = getPoseDefinition("Pose33")!;
    assert.equal(deriveSupportContactClass(pose33), "edge_seated");
    const spatial33 = deriveSupportSpatialRelation(pose33)!;
    assert.equal(spatial33.contactZone, "as_demonstrated");
    assert.equal(spatial33.requiresFrontEdgeLoad, false);
    assert.doesNotMatch(spatial33.promptHint, /front\/near seat-edge load/);
  });

  it("front_edge only when pose definition explicitly establishes front seat-edge", () => {
    const explicit = deriveSupportSpatialRelation({
      prop: "chair",
      bodyState: "perched",
      bodyGeometry: ["perched", "front"],
      description:
        "Half-seated with weight at the seat edge; front of the seat bears load.",
    })!;
    assert.equal(explicit.contactClass, "half_seated");
    assert.equal(explicit.contactZone, "front_edge");
    assert.equal(explicit.requiresFrontEdgeLoad, true);
    assert.match(explicit.promptHint, /front\/near seat-edge load/);
  });

  it("Pose 7 selects dark edge-capable chairs (never cream/amber seats)", () => {
    const pose = getPoseDefinition("Pose7")!;
    for (let seed = 0; seed < 24; seed++) {
      const selected = selectFurnitureAsset({
        prop: pose.prop,
        pose,
        seed,
      });
      assert.ok(selected);
      assert.equal(selected!.supportClass, "half_seated");
      assert.notEqual(selected!.asset.seatProfile, "deep_lounge");
      assert.equal(selected!.asset.isLightUpholstery, false);
      assert.equal(assetViolatesDarkAesthetic(selected!.asset), false);
      assert.equal(selected!.asset.isDarkPreferred, true);
      assert.equal(selected!.asset.visualWeight, "substantial");
      assert.doesNotMatch(
        selected!.asset.promptDescription,
        /\b(cream|amber|caramel|honey|tan|ivory)\b/i,
      );
    }
  });

  it("Pose 33 edge-seated also avoids deep_lounge and light upholstery", () => {
    const pose = getPoseDefinition("Pose33")!;
    assert.equal(deriveSupportContactClass(pose), "edge_seated");
    const selected = selectFurnitureAsset({ prop: pose.prop, pose, seed: 7 });
    assert.ok(selected);
    assert.notEqual(selected!.asset.seatProfile, "deep_lounge");
    assert.equal(selected!.asset.isLightUpholstery, false);
  });

  it("deep_seated chair poses may still select deep_lounge furniture", () => {
    const pose = getPoseDefinition("Pose30")!;
    assert.equal(deriveSupportContactClass(pose), "deep_seated");
    const picks = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const selected = selectFurnitureAsset({ prop: pose.prop, pose, seed });
      assert.ok(selected);
      assert.equal(selected!.asset.isLightUpholstery, false);
      picks.add(selected!.asset.seatProfile);
    }
    assert.ok(
      picks.has("deep_lounge") || picks.has("standard") || picks.has("edge_capable"),
    );
  });

  it("stool poses continue to receive stools", () => {
    const pose = getPoseDefinition("Pose26")!;
    assert.equal(deriveSupportContactClass(pose), "stool_seated");
    const selected = selectFurnitureAsset({ prop: pose.prop, pose, seed: 3 });
    assert.ok(selected);
    assert.equal(selected!.asset.category, "stool");
    assert.match(selected!.asset.id, /^furn_stool_/);
  });

  it("Pose 38/39 do not receive chair furniture", () => {
    for (const id of ["Pose38", "Pose39"] as const) {
      const pose = getPoseDefinition(id)!;
      assert.equal(pose.prop, "none");
      assert.equal(deriveSupportContactClass(pose), null);
      assert.equal(deriveSupportSpatialRelation(pose), null);
      assert.equal(selectFurnitureAsset({ prop: pose.prop, pose }), null);
      const prompt = buildShotPromptAtSlot("base", profile, "hero", id, 0, {
        manualDirected: true,
      });
      assert.doesNotMatch(prompt, /Selected furniture appearance/);
      assert.doesNotMatch(prompt, /FURNITURE APPEARANCE GUIDANCE — APPEARANCE ONLY/);
      assert.doesNotMatch(prompt, /INTRINSIC PROP QUALITY — SUPPORT APPEARANCE ONLY/);
      assert.doesNotMatch(prompt, /INTRINSIC PROP QUALITY — SUPPORT INFRASTRUCTURE/);
      assert.match(prompt, /GARMENT AUTHORITY REMINDER|GARMENT AUTHORITY — REFERENCE IMAGE 1/);
    }
  });

  it("Pose 7 prompt keeps geometry, furniture contract, garment closer", () => {
    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose7", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /POSE 7 GEOMETRIC ANCHORS \(AUTHORITATIVE/);
    assert.match(prompt, /TOP\/BACK EDGE of the chair's BACKREST|TOP\/BACK EDGE of the chair BACKREST/);
    assert.match(prompt, /chair is (positioned )?BEHIND the subject/i);
    assert.match(prompt, /seat is NOT the (primary )?support/i);
    assert.match(prompt, /Half-seated on chair edge/);
    assert.match(prompt, /\nFURNITURE:\nA chair must be present as required by this pose\./);
    assert.doesNotMatch(prompt, /Selected furniture appearance/);
    assert.doesNotMatch(prompt, /FURNITURE APPEARANCE GUIDANCE/);
    assert.match(prompt, /Prefer: solid natural wood/);
    assert.match(prompt, /Strictly avoid:.*plastic/i);
    assert.doesNotMatch(prompt, /appearance may vary/i);
    assert.match(prompt, /Do not copy furniture design from the Pose Master/);
    assert.match(prompt, /body-to-support relationship/);
    assert.doesNotMatch(prompt, /Pose Master spatial authority/);
    assert.doesNotMatch(prompt, /front\/near seat-edge load/);
    assert.match(prompt, /GARMENT AUTHORITY REMINDER/);
    assert.match(prompt, /Apply GARMENT AUTHORITY — REFERENCE IMAGE 1/);
    assert.match(prompt, /Pose Master visual geometry/);
    assert.doesNotMatch(prompt, /POSE GEOMETRY IS FIXED/);
    assert.doesNotMatch(prompt, /garment and model remain the visual priority/i);
    assert.doesNotMatch(prompt, /GENERATION AUTHORITY HIERARCHY/);
    assert.doesNotMatch(
      prompt,
      /Garment adaptation = the uploaded garment adapts around the pose/,
    );
    assert.doesNotMatch(prompt, /cream upholster/i);
    assert.doesNotMatch(prompt, /Cream Cushion/);
    assert.doesNotMatch(prompt, /POSE 38 GEOMETRIC ANCHORS/);
    assert.doesNotMatch(prompt, /POSE 39 GEOMETRIC ANCHORS/);
    // Semantic text only — no Pose-7-specific generation branch
    assert.doesNotMatch(prompt, /if \(poseId === ["']Pose7["']\)/);
    assert.match(prompt, /Selected piece:/);

    const selected = selectFurnitureAsset({
      prop: "chair",
      pose: getPoseDefinition("Pose7")!,
      seed: 7,
    })!;
    assert.notEqual(selected.asset.seatProfile, "deep_lounge");
    assert.equal(selected.asset.isLightUpholstery, false);
    assert.doesNotMatch(selected.asset.promptDescription, /\bcream\b/i);
    assert.doesNotMatch(selected.asset.label, /Cream/i);
  });

  it("non-furniture poses still receive global garment fidelity closer", () => {
    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose2", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /GARMENT AUTHORITY REMINDER/);
    assert.doesNotMatch(prompt, /Selected furniture appearance/);
    assert.doesNotMatch(prompt, /\nFURNITURE:/);
    assert.match(prompt, /Apply GARMENT AUTHORITY — REFERENCE IMAGE 1/);
  });

  it("furniture prompt restores quality floor and never contradicts dark aesthetic", () => {
    const pose = getPoseDefinition("Pose7")!;
    const selected = selectFurnitureAsset({ prop: pose.prop, pose, seed: 7 })!;
    const layer = buildFurniturePromptLayer(
      selected.asset,
      selected.supportClass,
      selected.spatialRelation,
    );
    assert.ok(layer.length <= FURNITURE_PROMPT_MAX_CHARS);
    assert.doesNotMatch(layer, /cream upholster/i);
    assert.doesNotMatch(layer, /Cream Cushion/);
    assert.match(layer, /^FURNITURE:\nA chair must be present/);
    assert.doesNotMatch(layer, /FURNITURE APPEARANCE GUIDANCE/);
    assert.match(layer, /Prefer: solid natural wood/);
    assert.match(layer, /Strictly avoid:.*molded plastic/i);
    assert.doesNotMatch(layer, /appearance may vary/i);
    assert.match(layer, /Do not copy furniture design from the Pose Master/);
    assert.match(layer, /Selected piece:/);
    assert.match(
      layer,
      new RegExp(selected.asset.promptDescription.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.doesNotMatch(layer, /Pose Master spatial authority/);
    assert.doesNotMatch(layer, /geometric authority/);
    assert.doesNotMatch(layer, /garment and model remain the visual priority/i);
    assert.match(buildGarmentFidelityCloser(), /GARMENT AUTHORITY REMINDER/);
    assert.match(buildGarmentFidelityCloser(), /Pose-induced folds are additive only/i);
    assert.match(
      buildGarmentFidelityCloser(),
      /do not redesign, smooth, or genericize the garment/i,
    );
  });

  it("buildFurniturePromptLayer includes selected promptDescription and quality floor", () => {
    const asset = getFurnitureAsset("furn_chair_wingback_cognac_leather")!;
    const layer = buildFurniturePromptLayer(asset);
    assert.match(layer, /^FURNITURE:\nA chair must be present as required by this pose\./);
    assert.match(layer, /body-to-support relationship/);
    assert.doesNotMatch(layer, /FURNITURE APPEARANCE GUIDANCE/);
    assert.match(layer, /Prefer: solid natural wood/);
    assert.match(layer, /Strictly avoid:.*plastic/i);
    assert.doesNotMatch(layer, /appearance may vary/i);
    assert.match(layer, /Do not copy furniture design from the Pose Master/);
    assert.doesNotMatch(layer, /Avoid \/ strongly de-prioritize/);
    assert.doesNotMatch(layer, /MUST-PRESENT SUPPORT/);
    assert.doesNotMatch(layer, /Pose Master spatial authority/);
    assert.doesNotMatch(layer, /Selected furniture appearance/);
    assert.match(layer, /Selected piece:/);
    assert.match(
      layer,
      new RegExp(asset.promptDescription.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    // Catalog IDs / labels stay internal — description text is what Gemini sees.
    assert.doesNotMatch(layer, new RegExp(asset.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(layer, new RegExp(asset.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(layer, /Finish \/ material:/);
  });

  it("stool furniture layer names stool type and keeps quality floor", () => {
    const pose = getPoseDefinition("Pose26")!;
    const selected = selectFurnitureAsset({ prop: pose.prop, pose, seed: 26 })!;
    assert.equal(selected.asset.category, "stool");
    const layer = buildFurniturePromptLayer(
      selected.asset,
      selected.supportClass,
      selected.spatialRelation,
    );
    assert.match(layer, /^FURNITURE:\nA stool must be present as required by this pose\./);
    assert.doesNotMatch(layer, /MUST-PRESENT SUPPORT/);
    assert.match(layer, /Prefer: solid natural wood/);
    assert.match(layer, /Strictly avoid:.*plastic/i);
    assert.doesNotMatch(layer, /appearance may vary/i);
    assert.match(layer, /Do not copy furniture design from the Pose Master/);
    assert.match(
      layer,
      new RegExp(selected.asset.promptDescription.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.doesNotMatch(layer, /Pose Master spatial authority/);
    assert.doesNotMatch(layer, /lounge chairs and armchairs/);
    assert.doesNotMatch(layer, /furn_stool_/);
    assert.ok(layer.length <= FURNITURE_PROMPT_MAX_CHARS);
  });

  it("dark frame + light cushion metadata would violate dark aesthetic", () => {
    const fake = {
      ...getFurnitureAsset("furn_chair_dark_wood_slat_alt")!,
      isLightUpholstery: true,
      upholsteryTone: "dark_leather" as const,
      promptDescription: "espresso frame with cream cushion",
    };
    assert.equal(assetViolatesDarkAesthetic(fake), true);
    assert.equal(isFullyDarkFurniture(fake), false);
  });
});

describe("Furniture appearance layer — surgical aesthetic (no Pose Master entanglement)", () => {
  it("prefers higher editorialLuxuryScore when assets are equally compatible", () => {
    const selected = selectFurnitureAsset({
      prop: "stool",
      seed: 99,
      userHistory: [],
    });
    assert.ok(selected);
    assert.ok(
      (selected!.asset.editorialLuxuryScore ?? 0) >= 4,
      `expected premium stool, got ${selected!.asset.id} score=${selected!.asset.editorialLuxuryScore}`,
    );
  });

  it("does not permanently lock the same pose to one furniture asset when alternatives exist", () => {
    const pose = getPoseDefinition("Pose7")!;
    const ids = new Set<string>();
    for (let histLen = 0; histLen < 12; histLen++) {
      const history = Array.from({ length: histLen }, (_, i) => {
        const prior = FURNITURE_CATALOG.filter((a) => a.category === "chair")[
          i % Math.max(1, FURNITURE_CATALOG.filter((a) => a.category === "chair").length)
        ]!;
        return {
          furnitureAssetId: prior.id,
          furnitureFamily: prior.family,
          index: i,
        };
      });
      const selected = selectFurnitureAsset({
        prop: pose.prop,
        pose,
        userHistory: history,
        seed: furnitureDiversitySeed({
          poseIdOrName: "Pose7",
          slotIndex: 0,
          historyLength: histLen,
        }),
      });
      if (selected) ids.add(selected.asset.id);
    }
    assert.ok(
      ids.size >= 2,
      `Pose7 furniture should vary across history salts; got ${[...ids].join(", ")}`,
    );
  });

  it("Pose70 is standing beside chair — requires furniture, never walking/seated", () => {
    const def = getPoseDefinition("Pose70")!;
    assert.equal(def.prop, "chair");
    assert.equal(def.bodyState, "standing");
    assert.equal(def.poseReferenceImage, "/pose-references/Pose70.png");
    assert.match(def.description, /INTRINSIC OBJECT \(required for this pose only\):\s*Chair/i);
    assert.match(def.description, /BODY STATE:\s*Standing/i);
    assert.match(def.description, /hand.*upper chair\/backrest|upper chair\/backrest/i);
    assert.match(def.description, /crossed\/overlapping standing/i);
    assert.match(def.description, /never seated|not seated|Do not sit/i);
    assert.doesNotMatch(def.description, /mid-stride|side-walk|BODY STATE:\s*Walking/i);
    assert.doesNotMatch(def.description, /INTRINSIC OBJECT:\s*None/i);
    assert.doesNotMatch(def.description, /Do not invent chairs/i);
    assert.doesNotMatch(def.description, /prop:\s*none/i);

    const support = deriveSupportContactClass(def);
    assert.equal(support, "leaning_supported");
    assert.notEqual(support, "deep_seated");
    assert.notEqual(support, "half_seated");

    const selected = selectFurnitureAsset({ prop: def.prop, pose: def, seed: 70 });
    assert.ok(selected);
    assert.equal(selected!.asset.category, "chair");
    assert.ok((selected!.asset.editorialLuxuryScore ?? 0) >= 3);

    const ids = new Set<string>();
    for (let histLen = 0; histLen < 10; histLen++) {
      const history = Array.from({ length: histLen }, (_, i) => {
        const chairs = FURNITURE_CATALOG.filter((a) => a.category === "chair");
        const prior = chairs[i % chairs.length]!;
        return {
          furnitureAssetId: prior.id,
          furnitureFamily: prior.family,
          index: i,
        };
      });
      const pick = selectFurnitureAsset({
        prop: def.prop,
        pose: def,
        userHistory: history,
        seed: furnitureDiversitySeed({
          poseIdOrName: "Pose70",
          slotIndex: 0,
          historyLength: histLen,
        }),
      });
      if (pick) ids.add(pick.asset.id);
    }
    assert.ok(ids.size >= 2, `Pose70 furniture must vary; got ${[...ids].join(", ")}`);
    assert.ok(!ids.has("Pose70"));

    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose70", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /Pose ID: Pose70/);
    assert.match(prompt, /Reference Image 3 is the Pose Master visual geometry/);
    assert.match(prompt, /BODY STATE:\s*Standing/);
    assert.match(prompt, /INTRINSIC OBJECT \(required for this pose only\):\s*Chair/i);
    assert.doesNotMatch(prompt, /Selected furniture appearance/);
    assert.match(prompt, /\nFURNITURE:\nA chair must be present as required by this pose\./);
    assert.match(prompt, /body-to-support relationship/);
    assert.doesNotMatch(prompt, /FURNITURE APPEARANCE GUIDANCE/);
    assert.match(prompt, /Prefer: solid natural wood/);
    assert.match(prompt, /Strictly avoid:.*plastic/i);
    assert.doesNotMatch(prompt, /appearance may vary/i);
    assert.match(prompt, /Do not copy furniture design from the Pose Master/);
    assert.match(prompt, /Do not walk or stride|Do not sit on the chair/i);
    assert.match(prompt, /crossed\/overlapping standing/i);
    assert.doesNotMatch(prompt, /mid-stride|side-walk|BODY STATE:\s*Walking/i);
    assert.doesNotMatch(prompt, /Do not invent chairs/);
    assert.doesNotMatch(prompt, /GENERATION AUTHORITY HIERARCHY/);
    assert.doesNotMatch(prompt, /if \(poseId === ["']Pose70["']\)/);
  });

  it("furniture prompt never introduces geometric / hierarchy / viewpoint authority", () => {
    const pose = getPoseDefinition("Pose7")!;
    const selected = selectFurnitureAsset({ prop: pose.prop, pose, seed: 3 })!;
    const layer = buildFurniturePromptLayer(selected.asset);
    assert.match(layer, /^FURNITURE:\nA chair must be present/);
    assert.match(layer, /Prefer: solid natural wood/);
    assert.match(layer, /Strictly avoid:.*plastic/i);
    assert.doesNotMatch(layer, /Avoid \/ strongly de-prioritize/);
    assert.doesNotMatch(layer, /GENERATION AUTHORITY HIERARCHY/);
    assert.doesNotMatch(layer, /geometric authority/);
    assert.doesNotMatch(layer, /Garment adaptation = the uploaded garment adapts around the pose/);
    assert.doesNotMatch(layer, /orbit to the opposite viewing side/);
    assert.doesNotMatch(layer, /left\/right arm and elbow/);
  });
});

describe("Garment authority hierarchy", () => {
  it("does not restate garment authority inside the pose contract", () => {
    const layer = buildPoseMasterReferenceAuthorityLayer(
      "Pose7",
      "Chair Half Seated",
      getPoseDefinition("Pose7")!.description,
      true,
    );
    assert.match(layer, /Pose Master visual geometry/);
    assert.match(layer, /camera\/viewpoint and subject-to-camera side relationship/);
    assert.doesNotMatch(layer, /POSE GEOMETRY IS FIXED/);
    assert.doesNotMatch(layer, /Apply GARMENT AUTHORITY — REFERENCE IMAGE 1 from the primary instruction/);
    assert.doesNotMatch(layer, /do not redesign, reconstruct, or reinterpret the garment to fit the pose/);
    assert.doesNotMatch(layer, /GENERATION AUTHORITY HIERARCHY/);
    assert.doesNotMatch(
      layer,
      /Garment adaptation = the uploaded garment adapts around the pose/,
    );
  });
});

describe("Pose 38 + Pose 39 isolation", () => {
  it("Pose38 keeps side-sit semantics and does not inject kneeling-on-heels", () => {
    const prepared = preparePoseMasterStructuredDefinition(
      "Pose38",
      getPoseDefinition("Pose38")!.description,
    );
    assert.doesNotMatch(prepared, /POSE 38 GEOMETRIC ANCHORS/);
    assert.doesNotMatch(prepared, /kneeling on BOTH knees/i);
    assert.doesNotMatch(prepared, /NOT a side-hip floor sit/i);
    assert.match(prepared, /side-sit/i);
    assert.match(prepared, /Floor seated|floor/i);
    assert.doesNotMatch(prepared, /Top \+ jeans/);

    const def = getPoseDefinition("Pose38")!;
    assert.equal(def.bodyState, "floor_seated");
    assert.equal(def.prop, "none");

    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose38", 0, {
      manualDirected: true,
    });
    assert.doesNotMatch(prompt, /POSE 38 GEOMETRIC ANCHORS/);
    assert.doesNotMatch(prompt, /kneeling on BOTH knees/i);
    assert.match(prompt, /side-sit/i);
    assert.match(prompt, /Pose ID: Pose38/);
    assert.equal(
      getPoseDefinition("Pose38")!.poseReferenceImage,
      "/pose-references/Pose38.png",
    );
  });

  it("Pose39 reinforces bilateral lap-hands kneeling distinct from Pose38", () => {
    const prepared = preparePoseMasterStructuredDefinition(
      "Pose39",
      getPoseDefinition("Pose39")!.description,
    );
    assert.match(prepared, /POSE 39 GEOMETRIC ANCHORS/);
    assert.match(prepared, /hands rest lightly together/i);
    assert.match(prepared, /side-sit/i);
    assert.match(prepared, /Do not collapse this into Pose 38/i);

    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose39", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /POSE 39 GEOMETRIC ANCHORS/);
    assert.match(prompt, /Pose ID: Pose39/);
    assert.equal(
      getPoseDefinition("Pose39")!.poseReferenceImage,
      "/pose-references/Pose39.png",
    );
  });
});

describe("Pass 1 critical pose semantic corrections", () => {
  it("Pose1 is mid-stride walk, not static standing", () => {
    const def = getPoseDefinition("Pose1")!;
    assert.equal(def.bodyState, "walking");
    assert.equal(def.movement, "dynamic");
    assert.match(def.promptReadyDefinition ?? def.description, /mid-stride walk/i);
    assert.doesNotMatch(def.promptReadyDefinition ?? "", /standing pose/i);
    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose1", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /mid-stride walk/i);
    assert.match(prompt, /BODY STATE: Walking/i);
  });

  it("Pose54 is full-body walk toward camera, not portrait stand", () => {
    const def = getPoseDefinition("Pose54")!;
    assert.equal(def.bodyState, "walking");
    assert.equal(def.preferredFraming, "full_body");
    assert.match(def.description, /full-body mid-stride/i);
    assert.match(def.description, /BODY STATE: Walking/i);
    assert.doesNotMatch(def.description, /BODY STATE: Portrait/i);
    assert.doesNotMatch(def.description, /CAMERA \/ FRAMING: Chest-up portrait/i);
    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose54", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /walking directly toward camera/i);
    assert.match(prompt, /BODY STATE: Walking/i);
  });

  it("Pose56 is rear walk away with skirt hold, not static back portrait", () => {
    const def = getPoseDefinition("Pose56")!;
    assert.equal(def.bodyState, "walking");
    assert.match(def.description, /walking away/i);
    assert.match(def.description, /skirt/i);
    assert.doesNotMatch(def.description, /Upper-body rear crop|BODY STATE: Portrait/i);
    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose56", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /walking away from camera/i);
    assert.match(prompt, /BODY STATE: Walking/i);
  });

  it("Pose61 is mid-stride three-quarter walk, not standing", () => {
    const def = getPoseDefinition("Pose61")!;
    assert.equal(def.bodyState, "walking");
    assert.match(def.description, /mid-stride three-quarter walk/i);
    assert.doesNotMatch(def.promptReadyDefinition ?? "", /classic three-quarter stance/i);
    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose61", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /mid-stride three-quarter walk/i);
    assert.doesNotMatch(prompt, /FURNITURE APPEARANCE GUIDANCE — APPEARANCE ONLY/);
    assert.doesNotMatch(prompt, /\nFURNITURE:/);
  });

  it("Pose63 is walking + jacket adjustment", () => {
    const def = getPoseDefinition("Pose63")!;
    assert.equal(def.bodyState, "walking");
    assert.match(def.description, /walking in a mid-stride/i);
    assert.match(def.description, /jacket with both hands/i);
    assert.doesNotMatch(def.promptReadyDefinition ?? "", /^Male model standing while adjusting/i);
  });

  it("Pose65 is walking + sleeve adjustment", () => {
    const def = getPoseDefinition("Pose65")!;
    assert.equal(def.bodyState, "walking");
    assert.match(def.description, /walking in a mid-stride/i);
    assert.match(def.description, /sleeve\/cuff/i);
    assert.doesNotMatch(def.promptReadyDefinition ?? "", /^Male model standing in a three-quarter pose while/i);
  });

  it("Pose68 is profile lean on tall stool via existing furniture pipeline", () => {
    const def = getPoseDefinition("Pose68")!;
    assert.equal(def.bodyState, "leaning");
    assert.equal(def.prop, "stool");
    assert.ok(def.bodyGeometry.includes("leaning"));
    assert.ok(def.bodyGeometry.includes("stool"));
    assert.match(def.description, /POSE68 — SUPPORTED STOOL LEAN/);
    assert.match(def.description, /leaning against a tall stool/i);
    assert.match(def.description, /required structural support/i);
    assert.match(def.description, /Do not convert the pose into standing, sitting, or a freestanding profile/i);
    assert.match(def.description, /Do not remove or replace the stool/i);
    assert.match(def.description, /BODY STATE: Leaning \(supported\)/);
    assert.doesNotMatch(def.description, /SUPPORT RELATIONSHIP \(AUTHORITATIVE/);
    assert.doesNotMatch(def.description, /Floor \(primary standing support\)/);
    assert.doesNotMatch(def.description, /BODY STATE: Standing\/leaning/);
    assert.equal(deriveSupportContactClass(def), "leaning_supported");
    const spatial = deriveSupportSpatialRelation(def)!;
    assert.match(spatial.promptHint, /body-to-stool lean/i);
    assert.doesNotMatch(spatial.promptHint, /hand contact as shown/);
    const selected = selectFurnitureAsset({ prop: def.prop, pose: def, seed: 11 });
    assert.ok(selected);
    assert.equal(selected!.asset.category, "stool");
    const layer = buildFurniturePromptLayer(
      selected!.asset,
      selected!.supportClass,
      selected!.spatialRelation ?? spatial,
      "Pose68",
    );
    assert.match(layer, /^FURNITURE:\nA tall stool must be present/);
    assert.match(layer, /physically support the body lean/i);
    assert.match(layer, /Do not omit the stool or convert this into a freestanding profile/i);
    assert.match(layer, /Prefer: solid natural wood/);
    assert.match(layer, /Strictly avoid:.*plastic/i);
    assert.doesNotMatch(layer, /appearance may vary/i);
    assert.match(layer, /Do not copy furniture design from the Pose Master/);
    assert.match(
      layer,
      new RegExp(selected!.asset.promptDescription.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.doesNotMatch(layer, /POSE68 SUPPORT — TALL STOOL REQUIRED/);
    assert.doesNotMatch(layer, /MUST-PRESENT SUPPORT/);
    assert.doesNotMatch(layer, /FURNITURE APPEARANCE GUIDANCE — APPEARANCE ONLY/);
    assert.doesNotMatch(layer, /lounge chairs|armchairs/);
    assert.doesNotMatch(layer, /Prefer: tall studio stools/);
    assert.doesNotMatch(layer, /Pose Master spatial authority/);
    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose68", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /POSE68 — SUPPORTED STOOL LEAN/);
    assert.match(prompt, /leaning against a tall stool/i);
    assert.match(prompt, /\nFURNITURE:\nA tall stool must be present/);
    assert.match(prompt, /Prefer: solid natural wood/);
    assert.doesNotMatch(prompt, /appearance may vary/i);
    assert.doesNotMatch(prompt, /POSE68 SUPPORT — TALL STOOL REQUIRED/);
    assert.doesNotMatch(prompt, /FURNITURE APPEARANCE GUIDANCE — APPEARANCE ONLY/);
    assert.doesNotMatch(prompt, /MUST-PRESENT SUPPORT/);
    assert.doesNotMatch(prompt, /SUPPORT RELATIONSHIP \(AUTHORITATIVE/);
    assert.doesNotMatch(prompt, /Prefer: sculptural solid-hardwood lounge chairs and armchairs/);
    assert.doesNotMatch(prompt, /if \(poseId === ["']Pose68["']\)/);
    // Cannot resolve as freestanding — stool required in both definition and furniture contract
    assert.match(prompt, /Do not omit the stool or convert this into a freestanding profile/i);
  });

  it("Pose70 remains standing beside chair correction", () => {
    const def = getPoseDefinition("Pose70")!;
    assert.equal(def.name, "Male Standing Beside Chair");
    assert.equal(def.bodyState, "standing");
    assert.equal(def.prop, "chair");
    assert.match(def.description, /standing beside a chair/i);
    assert.doesNotMatch(def.description, /mid-stride side-profile walking/i);
  });
});
