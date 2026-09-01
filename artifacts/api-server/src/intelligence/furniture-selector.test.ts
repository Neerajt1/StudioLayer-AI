// ---------------------------------------------------------------------------
// Furniture selector — premium material/craft curation, tonal balance,
// pose compatibility, Pose 38/39 isolation and garment fidelity.
//
// Philosophy under test: premium = material + craftsmanship + refined
// proportion. NOT ornamentation, NOT bulk, NOT darkness.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FURNITURE_CATALOG,
  FURNITURE_CRAFT_QUALITY_FLOOR,
  FURNITURE_USER_COOLDOWN,
  getFurnitureAsset,
  isDarkOnDark,
  isSelectableFurniture,
  listFurnitureForCategory,
} from "./furniture-catalog";
import {
  assertFurnitureCatalogQualityInvariants,
  assetIsOrnamentLed,
  buildFurniturePromptLayer,
  buildGarmentFidelityCloser,
  furnitureDiversitySeed,
  garmentToneScore,
  FURNITURE_PROMPT_MAX_CHARS,
  FURNITURE_TOP_BAND,
  materialCraftScore,
  MAX_DARK_ON_DARK_SHARE,
  MAX_GARMENT_TONE_SCORE,
  scaleScore,
  selectFurnitureAsset,
  silhouetteRefinementScore,
  tonalPairingScore,
} from "./furniture-selector";
import { deriveGarmentTone } from "./garment-tone";
import {
  deriveSupportContactClass,
  deriveSupportSpatialRelation,
} from "./furniture-support";
import {
  preparePoseMasterStructuredDefinition,
  buildShotPromptAtSlot,
  buildPoseMasterReferenceAuthorityLayer,
  resolveFurnitureForPose,
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

/** Legacy ornate/heritage pieces retired from selection but never deleted. */
const DEPRECATED_IDS = [
  "furn_chair_wingback_cognac_leather",
  "furn_chair_wingback_amber_velvet",
  "furn_chair_ornate_green_leather",
  "furn_chair_ornate_dark_leather",
  "furn_chair_antique_openwork",
  "furn_chair_antique_openwork_alt",
  "furn_chair_sheesham_rolled",
  "furn_chair_teak_club",
  "furn_chair_smoked_timber_lounge",
];

const PREMIUM_LOUNGE_IDS = [
  "furn_chair_walnut_frame_lounge",
  "furn_chair_natural_oak_lounge",
];

const DEEP_LOUNGE_POSES = [
  "Chair Relaxed Sit",
  "Chair Forward Lean",
  "Cross-Leg Chair Pose",
  "Seated Side Profile",
  "Reclined Chair Pose",
];

describe("Catalogue integrity — historical IDs are permanent", () => {
  it("satisfies every catalogue quality invariant", () => {
    assertFurnitureCatalogQualityInvariants();
  });

  it("resolves every historical id, including deprecated ones", () => {
    for (const id of DEPRECATED_IDS) {
      const asset = getFurnitureAsset(id);
      assert.ok(asset, `${id} must remain resolvable by id`);
      assert.equal(asset!.id, id, "historical id must not change");
      assert.ok(asset!.label.length > 0);
      assert.ok(asset!.promptDescription.length > 0);
      assert.ok(
        FURNITURE_CATALOG.some((a) => a.id === id),
        `${id} must remain in FURNITURE_CATALOG`,
      );
    }
  });

  it("deprecates exactly the ornate/heritage and dark-lounge legacy set", () => {
    const deprecated = FURNITURE_CATALOG.filter((a) => a.deprecated === true).map(
      (a) => a.id,
    );
    assert.deepEqual(deprecated.slice().sort(), DEPRECATED_IDS.slice().sort());
  });

  it("keeps deprecated assets out of every selection pool", () => {
    for (const category of ["chair", "stool", "block"] as const) {
      const pool = listFurnitureForCategory(category).map((a) => a.id);
      for (const id of DEPRECATED_IDS) {
        assert.equal(pool.includes(id), false, `${id} must not be selectable`);
      }
    }
  });

  it("keeps the reference walnut pieces active", () => {
    for (const id of [
      "furn_chair_solid_walnut_editorial",
      "furn_stool_solid_walnut_editorial",
    ]) {
      assert.equal(isSelectableFurniture(getFurnitureAsset(id)!), true, id);
    }
  });
});

describe("Quality floor — cheap construction, not small size, is rejected", () => {
  it("never admits an asset below the craft floor", () => {
    for (const category of ["chair", "stool", "block"] as const) {
      for (const asset of listFurnitureForCategory(category)) {
        assert.ok(
          asset.craftQuality >= FURNITURE_CRAFT_QUALITY_FLOOR,
          `${asset.id} craftQuality ${asset.craftQuality} is below the floor`,
        );
      }
    }
  });

  it("does not require every asset to be large", () => {
    const active = (["chair", "stool", "block"] as const).flatMap((c) =>
      listFurnitureForCategory(c),
    );
    // The old catalogue forced visualWeight === "substantial" on everything.
    // Compact pieces must now be admissible.
    assert.ok(
      active.some((a) => a.scale === "compact"),
      "a compact premium piece must be representable",
    );
  });

  it("a compact premium chair can win an edge-capable pose", () => {
    const pose = getPoseDefinition("Pose7")!;
    const ids = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const picked = selectFurnitureAsset({ prop: pose.prop, pose, seed });
      if (picked) ids.add(picked.asset.id);
    }
    assert.ok(
      ids.has("furn_chair_warm_timber_editorial"),
      `compact premium chair never selected; got ${[...ids].join(", ")}`,
    );
  });
});

describe("Ornamentation is a runtime rule, not a test-only concept", () => {
  it("excludes decorative assets from every pool", () => {
    for (const category of ["chair", "stool", "block"] as const) {
      for (const asset of listFurnitureForCategory(category)) {
        assert.notEqual(asset.ornamentation, "decorative", asset.id);
      }
    }
  });

  it("never selects a decorative asset for any furniture pose", () => {
    const decorative = new Set(
      FURNITURE_CATALOG.filter((a) => a.ornamentation === "decorative").map(
        (a) => a.id,
      ),
    );
    assert.ok(decorative.size > 0, "catalogue should retain decorative legacy assets");
    for (const poseId of ["Pose7", "Pose70", "Pose26", "Pose68", ...DEEP_LOUNGE_POSES]) {
      const pose = getPoseDefinition(poseId)!;
      for (let seed = 0; seed < 40; seed++) {
        const picked = selectFurnitureAsset({ prop: pose.prop, pose, seed });
        assert.ok(picked);
        assert.equal(
          decorative.has(picked!.asset.id),
          false,
          `${poseId} seed=${seed} selected decorative ${picked!.asset.id}`,
        );
      }
    }
  });

  it("ornate legacy pieces are declared decorative, not merely low-scoring", () => {
    for (const id of [
      "furn_chair_ornate_green_leather",
      "furn_chair_ornate_dark_leather",
      "furn_chair_antique_openwork",
      "furn_chair_antique_openwork_alt",
      "furn_chair_wingback_cognac_leather",
      "furn_chair_wingback_amber_velvet",
    ]) {
      const asset = getFurnitureAsset(id)!;
      assert.equal(assetIsOrnamentLed(asset), true, `${id} should read ornament-led`);
      assert.equal(asset.ornamentation, "decorative", id);
    }
  });

  it("the regex is an authoring guard only — declared field drives runtime", () => {
    // Every asset whose text reads ornate must declare it, or the invariant throws.
    assertFurnitureCatalogQualityInvariants();
    for (const asset of FURNITURE_CATALOG) {
      if (assetIsOrnamentLed(asset)) {
        assert.notEqual(
          asset.ornamentation,
          "none",
          `${asset.id} text is ornament-led but declares "none"`,
        );
      }
    }
  });
});

describe("Premium is material and craft — not darkness", () => {
  it("does not require dark upholstery for a premium score", () => {
    const walnut = getFurnitureAsset("furn_chair_solid_walnut_editorial")!;
    const naturalOak = getFurnitureAsset("furn_chair_natural_oak_editorial")!;
    assert.notEqual(walnut.seatTreatment, "dark");
    assert.notEqual(naturalOak.seatTreatment, "dark");
    // Both sit at the top of the tonal band despite carrying no dark seat.
    assert.equal(tonalPairingScore(walnut), 12);
    assert.equal(tonalPairingScore(naturalOak), 12);
  });

  it("treats light-neutral upholstery as a positive, never a violation", () => {
    const contrast = getFurnitureAsset("furn_chair_dark_oak_editorial")!;
    assert.equal(contrast.seatTreatment, "light_neutral");
    assert.equal(isSelectableFurniture(contrast), true);
    assert.equal(tonalPairingScore(contrast), 12);
  });

  it("allows dark-on-dark but does not structurally privilege it", () => {
    const darkOnDark = FURNITURE_CATALOG.filter(isDarkOnDark);
    assert.ok(darkOnDark.length > 0, "dark-on-dark must remain representable");
    for (const asset of darkOnDark) {
      assert.equal(tonalPairingScore(asset), 2);
    }
    // Some dark-on-dark pieces remain selectable — allowed, just not preferred.
    assert.ok(darkOnDark.some((a) => isSelectableFurniture(a)));
  });

  it("no category exceeds the dark-on-dark share cap", () => {
    for (const category of ["chair", "stool", "block"] as const) {
      const active = listFurnitureForCategory(category);
      const dark = active.filter(isDarkOnDark).length;
      assert.ok(
        dark <= active.length * MAX_DARK_ON_DARK_SHARE,
        `${category}: ${dark}/${active.length} dark-on-dark`,
      );
    }
  });

  it("a walnut/natural premium piece leads the edge-capable band", () => {
    const pose = getPoseDefinition("Pose7")!;
    const ids = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const picked = selectFurnitureAsset({ prop: pose.prop, pose, seed });
      assert.ok(picked);
      assert.ok(
        picked!.asset.craftQuality >= 4,
        `${picked!.asset.id} craft ${picked!.asset.craftQuality} too low for top band`,
      );
      ids.add(picked!.asset.id);
    }
    assert.ok(
      ids.has("furn_chair_solid_walnut_editorial"),
      `solid walnut must be reachable; got ${[...ids].join(", ")}`,
    );
    assert.ok(ids.size >= 3, `expected variation, got ${ids.size}`);
  });
});

describe("Scale is descriptive — bulk is never rewarded", () => {
  it("compact and standard scale never earn or lose points", () => {
    for (const asset of FURNITURE_CATALOG) {
      if (asset.scale === "generous") continue;
      assert.equal(scaleScore(asset, null), 0, asset.id);
      assert.equal(scaleScore(asset, "half_seated"), 0, asset.id);
      assert.equal(scaleScore(asset, "deep_seated"), 0, asset.id);
    }
  });

  it("generous scale never earns a positive score", () => {
    const generous = FURNITURE_CATALOG.filter((a) => a.scale === "generous");
    assert.ok(generous.length > 0);
    for (const asset of generous) {
      for (const supportClass of [
        null,
        "half_seated",
        "edge_seated",
        "deep_seated",
        "reclined_seated",
        "stool_seated",
      ] as const) {
        assert.ok(
          scaleScore(asset, supportClass) <= 0,
          `${asset.id} earned points for being large`,
        );
      }
    }
  });

  it("penalizes generous furniture when the pose does not call for a lounge", () => {
    const generousLounge = FURNITURE_CATALOG.find(
      (a) => a.scale === "generous" && a.seatProfile === "deep_lounge",
    )!;
    assert.equal(scaleScore(generousLounge, "half_seated"), -12);
    assert.equal(scaleScore(generousLounge, null), -12);
    // Free only where a lounge is genuinely appropriate.
    assert.equal(scaleScore(generousLounge, "deep_seated"), 0);
    assert.equal(scaleScore(generousLounge, "reclined_seated"), 0);
  });

  it("no promptDescription sells the piece on bulk", () => {
    for (const asset of FURNITURE_CATALOG) {
      assert.doesNotMatch(
        asset.promptDescription,
        /substantial/i,
        `${asset.id} describes itself as substantial`,
      );
    }
  });
});

describe("Furniture selector — user cooldown + diversity", () => {
  it("same user cannot reuse exact asset within 100 furniture-bearing gens", () => {
    const first = selectFurnitureAsset({ prop: "chair", seed: 1 });
    assert.ok(first);
    const others = listFurnitureForCategory("chair").filter(
      (a) => a.id !== first!.asset.id,
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
      return { furnitureAssetId: alt.id, furnitureFamily: alt.family, index: i };
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
    const asset = getFurnitureAsset("furn_chair_solid_walnut_editorial")!;
    const others = listFurnitureForCategory("chair").filter(
      (a) => a.id !== asset.id,
    );
    const history = Array.from({ length: 100 }, (_, i) => {
      const alt = others[i % others.length]!;
      return { furnitureAssetId: alt.id, furnitureFamily: alt.family, index: i };
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

  it("does not permanently lock the same pose to one furniture asset", () => {
    const pose = getPoseDefinition("Pose7")!;
    const chairs = listFurnitureForCategory("chair");
    const ids = new Set<string>();
    for (let histLen = 0; histLen < 12; histLen++) {
      const history = Array.from({ length: histLen }, (_, i) => {
        const prior = chairs[i % chairs.length]!;
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

  it("selection is deterministic for identical inputs", () => {
    for (const name of ["Pose7", "Pose26", "Pose70", ...DEEP_LOUNGE_POSES]) {
      const pose = getPoseDefinition(name)!;
      for (const seed of [0, 7, 23, 61]) {
        const a = selectFurnitureAsset({ prop: pose.prop, pose, seed });
        const b = selectFurnitureAsset({ prop: pose.prop, pose, seed });
        assert.equal(a?.asset.id, b?.asset.id, `${name} seed ${seed} unstable`);
      }
    }
  });

  it("history never outranks furniture quality", () => {
    // Even with the strongest history penalties applied, selection must stay
    // inside the quality-eligible pool rather than falling to a weak asset.
    const pose = getPoseDefinition("Pose7")!;
    const history = listFurnitureForCategory("chair")
      .slice(0, 3)
      .map((a, i) => ({
        furnitureAssetId: a.id,
        furnitureFamily: a.family,
        index: i,
      }));
    for (let seed = 0; seed < 30; seed++) {
      const picked = selectFurnitureAsset({
        prop: pose.prop,
        pose,
        userHistory: history,
        seed,
      });
      assert.ok(picked);
      assert.equal(isSelectableFurniture(picked!.asset), true);
      assert.equal(picked!.asset.ornamentation === "decorative", false);
    }
  });
});

describe("Fallback never relaxes quality guarantees", () => {
  it("cooling out the entire pool still yields a legitimate asset", () => {
    const chairs = listFurnitureForCategory("chair");
    const history = chairs.map((a, i) => ({
      furnitureAssetId: a.id,
      furnitureFamily: a.family,
      index: i,
    }));
    for (let seed = 0; seed < 20; seed++) {
      const picked = selectFurnitureAsset({
        prop: "chair",
        userHistory: history,
        seed,
      });
      assert.ok(picked, "fallback must still produce an asset");
      assert.equal(picked!.asset.deprecated === true, false);
      assert.notEqual(picked!.asset.ornamentation, "decorative");
      assert.ok(picked!.asset.craftQuality >= FURNITURE_CRAFT_QUALITY_FLOOR);
      assert.equal(DEPRECATED_IDS.includes(picked!.asset.id), false);
    }
  });

  it("a deprecated asset in user history still does not resurface", () => {
    const pose = getPoseDefinition("Chair Relaxed Sit")!;
    const history = DEPRECATED_IDS.map((id, i) => ({
      furnitureAssetId: id,
      furnitureFamily: getFurnitureAsset(id)!.family,
      index: i,
    }));
    for (let seed = 0; seed < 40; seed++) {
      const picked = selectFurnitureAsset({
        prop: pose.prop,
        pose,
        seed,
        userHistory: history,
      });
      assert.ok(picked);
      assert.equal(DEPRECATED_IDS.includes(picked!.asset.id), false);
    }
  });
});

describe("Furniture ↔ pose support compatibility", () => {
  it("half_seated / edge_seated default to as_demonstrated", () => {
    const pose7 = getPoseDefinition("Pose7")!;
    assert.equal(deriveSupportContactClass(pose7), "half_seated");
    const spatial7 = deriveSupportSpatialRelation(pose7)!;
    assert.equal(spatial7.contactClass, "half_seated");
    assert.equal(spatial7.contactZone, "as_demonstrated");
    assert.equal(spatial7.requiresFrontEdgeLoad, false);
    assert.equal(spatial7.bodyAxis, "three_quarter");

    const pose33 = getPoseDefinition("Pose33")!;
    assert.equal(deriveSupportContactClass(pose33), "edge_seated");
    const spatial33 = deriveSupportSpatialRelation(pose33)!;
    assert.equal(spatial33.contactZone, "as_demonstrated");
    assert.equal(spatial33.requiresFrontEdgeLoad, false);
  });

  it("front_edge only when the pose definition explicitly establishes it", () => {
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
  });

  it("edge-required poses never receive deep_lounge furniture", () => {
    for (const name of ["Pose7", "Pose33"]) {
      const pose = getPoseDefinition(name)!;
      for (let seed = 0; seed < 40; seed++) {
        const selected = selectFurnitureAsset({ prop: pose.prop, pose, seed });
        assert.ok(selected);
        assert.notEqual(selected!.asset.seatProfile, "deep_lounge");
      }
    }
  });

  it("deep_seated poses retain deep_lounge coverage", () => {
    const pose = getPoseDefinition("Pose30")!;
    assert.equal(deriveSupportContactClass(pose), "deep_seated");
    const profiles = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const selected = selectFurnitureAsset({ prop: pose.prop, pose, seed });
      assert.ok(selected);
      profiles.add(selected!.asset.seatProfile);
    }
    assert.ok(
      profiles.has("deep_lounge"),
      `deep_seated lost deep_lounge coverage: ${[...profiles].join(", ")}`,
    );
  });

  it("both premium lounges stay reachable for deep-lounge poses", () => {
    for (const name of DEEP_LOUNGE_POSES) {
      const pose = getPoseDefinition(name)!;
      const ids = new Set<string>();
      for (let seed = 0; seed < 80; seed++) {
        const picked = selectFurnitureAsset({ prop: pose.prop, pose, seed });
        assert.ok(picked);
        assert.equal(assetIsOrnamentLed(picked!.asset), false);
        ids.add(picked!.asset.id);
      }
      for (const id of PREMIUM_LOUNGE_IDS) {
        assert.ok(ids.has(id), `${name} never selected ${id}`);
      }
      assert.ok(ids.size >= 2, `${name} coverage collapsed to ${ids.size}`);
    }
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
      assert.match(
        prompt,
        /GARMENT AUTHORITY REMINDER|GARMENT AUTHORITY — REFERENCE IMAGE 1/,
      );
    }
  });
});

describe("Furniture prompt language", () => {
  it("no generated furniture layer describes the piece as substantial", () => {
    for (const asset of FURNITURE_CATALOG) {
      const layer = buildFurniturePromptLayer(asset);
      assert.doesNotMatch(layer, /substantial/i, `${asset.id} layer says substantial`);
    }
  });

  it("every furniture prompt layer stays within the length bound", () => {
    for (const asset of FURNITURE_CATALOG) {
      for (const poseId of [null, "Pose68"]) {
        const layer = buildFurniturePromptLayer(asset, null, null, poseId);
        assert.ok(
          layer.length <= FURNITURE_PROMPT_MAX_CHARS,
          `${asset.id} (${poseId ?? "default"}) layer is ${layer.length} chars`,
        );
      }
    }
  });

  it("carries the selected piece, the quality floor and Pose Master isolation", () => {
    const pose = getPoseDefinition("Pose7")!;
    const selected = selectFurnitureAsset({ prop: pose.prop, pose, seed: 7 })!;
    const layer = buildFurniturePromptLayer(
      selected.asset,
      selected.supportClass,
      selected.spatialRelation,
    );
    assert.match(layer, /^FURNITURE:\nA chair must be present as required by this pose\./);
    assert.match(layer, /FURNITURE REFERENCE AUTHORITY below/);
    assert.doesNotMatch(layer, /Real furniture, honestly made: solid hardwood/);
    assert.match(layer, /Preserve the pose's body-to-support relationship\./);
  });

  it("deprecated assets without a reference image keep catalogue prose and quality floor", () => {
    const asset = getFurnitureAsset("furn_chair_wingback_cognac_leather")!;
    const layer = buildFurniturePromptLayer(asset, null, null);
    assert.match(layer, /Selected piece:/);
    assert.match(layer, /Real furniture, honestly made: solid hardwood/);
    assert.match(layer, /Do not copy furniture design from the Pose Master/);
  });

  it("never introduces geometry, hierarchy or viewpoint authority", () => {
    const pose = getPoseDefinition("Pose7")!;
    const selected = selectFurnitureAsset({ prop: pose.prop, pose, seed: 3 })!;
    const layer = buildFurniturePromptLayer(
      selected.asset,
      selected.supportClass,
      selected.spatialRelation,
    );
    assert.doesNotMatch(layer, /Pose Master spatial authority/);
    assert.doesNotMatch(layer, /front\/near seat-edge load/);
    assert.doesNotMatch(layer, /GENERATION AUTHORITY HIERARCHY/);
    assert.doesNotMatch(layer, /geometric authority/);
    assert.doesNotMatch(layer, /body axis/i);
    assert.doesNotMatch(layer, /orbit to the opposite viewing side/);
  });

  it("keeps catalogue ids and labels internal", () => {
    const asset = getFurnitureAsset("furn_chair_solid_walnut_editorial")!;
    const layer = buildFurniturePromptLayer(asset);
    assert.doesNotMatch(
      layer,
      new RegExp(asset.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.doesNotMatch(
      layer,
      new RegExp(asset.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });

  it("stool layer names the stool type and defers appearance to the reference", () => {
    const pose = getPoseDefinition("Pose26")!;
    const selected = selectFurnitureAsset({ prop: pose.prop, pose, seed: 26 })!;
    assert.equal(selected.asset.category, "stool");
    const layer = buildFurniturePromptLayer(
      selected.asset,
      selected.supportClass,
      selected.spatialRelation,
    );
    assert.match(layer, /^FURNITURE:\nA stool must be present as required by this pose\./);
    assert.match(layer, /FURNITURE REFERENCE AUTHORITY below/);
    assert.doesNotMatch(layer, /Real furniture, honestly made: solid hardwood/);
    assert.doesNotMatch(layer, /furn_stool_/);
    assert.ok(layer.length <= FURNITURE_PROMPT_MAX_CHARS);
  });

  it("garment fidelity closer is unchanged", () => {
    assert.match(buildGarmentFidelityCloser(), /GARMENT AUTHORITY REMINDER/);
    assert.match(
      buildGarmentFidelityCloser(),
      /Pose-induced folds are additive only/i,
    );
    assert.match(
      buildGarmentFidelityCloser(),
      /do not redesign, smooth, or genericize the garment/i,
    );
  });
});

describe("Shot prompt integration", () => {
  it("Pose 7 prompt keeps geometry, furniture contract and garment closer", () => {
    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose7", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /POSE 7 GEOMETRIC ANCHORS \(AUTHORITATIVE/);
    assert.match(
      prompt,
      /TOP\/BACK EDGE of the chair's BACKREST|TOP\/BACK EDGE of the chair BACKREST/,
    );
    assert.match(prompt, /Half-seated on chair edge/);
    assert.match(prompt, /\nFURNITURE:\nA chair must be present as required by this pose\./);
    assert.match(prompt, /FURNITURE REFERENCE AUTHORITY below/);
    assert.doesNotMatch(prompt, /Selected piece:/);
    assert.doesNotMatch(prompt, /Real furniture, honestly made: solid hardwood/);
    assert.match(prompt, /body-to-support relationship/);
    assert.doesNotMatch(prompt, /Selected furniture appearance/);
    assert.doesNotMatch(prompt, /FURNITURE APPEARANCE GUIDANCE/);
    // The derived support hint now carries the body↔support relationship as pose
    // authority. It must stay out of the FURNITURE layer, and its obsolete
    // "dark appearance/finish" sentence must never reach the prompt at all.
    const furnitureLayer = prompt.slice(prompt.indexOf("\nFURNITURE:\n"));
    assert.doesNotMatch(furnitureLayer, /Pose Master spatial authority/);
    assert.doesNotMatch(prompt, /Furniture catalog supplies NEW dark/);
    assert.match(prompt, /GARMENT AUTHORITY REMINDER/);
    assert.match(prompt, /Pose Master visual geometry/);
    assert.doesNotMatch(prompt, /cream upholster/i);
  });

  it("non-furniture poses still receive the global garment fidelity closer", () => {
    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose2", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /GARMENT AUTHORITY REMINDER/);
    assert.doesNotMatch(prompt, /\nFURNITURE:/);
  });

  it("Pose70 is standing beside chair — requires furniture, never seated", () => {
    const def = getPoseDefinition("Pose70")!;
    assert.equal(def.prop, "chair");
    assert.equal(def.bodyState, "standing");
    assert.equal(deriveSupportContactClass(def), "leaning_supported");

    const selected = selectFurnitureAsset({ prop: def.prop, pose: def, seed: 70 });
    assert.ok(selected);
    assert.equal(selected!.asset.category, "chair");
    assert.ok(selected!.asset.craftQuality >= FURNITURE_CRAFT_QUALITY_FLOOR);

    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose70", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /Pose ID: Pose70/);
    assert.match(prompt, /BODY STATE:\s*Standing/);
    assert.match(prompt, /\nFURNITURE:\nA chair must be present as required by this pose\./);
    assert.match(prompt, /FURNITURE REFERENCE AUTHORITY below/);
    assert.doesNotMatch(prompt, /Real furniture, honestly made: solid hardwood/);
    assert.match(prompt, /Do not walk or stride|Do not sit on the chair/i);
  });

  it("Pose68 keeps stool support via pose authority and reference-deferred appearance", () => {
    const def = getPoseDefinition("Pose68")!;
    assert.equal(def.bodyState, "leaning");
    assert.equal(def.prop, "stool");
    assert.equal(deriveSupportContactClass(def), "leaning_supported");

    const selected = selectFurnitureAsset({ prop: def.prop, pose: def, seed: 11 });
    assert.ok(selected);
    assert.equal(selected!.asset.category, "stool");

    const layer = buildFurniturePromptLayer(
      selected!.asset,
      selected!.supportClass,
      selected!.spatialRelation,
      "Pose68",
    );
    assert.match(layer, /^FURNITURE:\nA stool must be present as required by this pose\./);
    assert.match(layer, /FURNITURE REFERENCE AUTHORITY below/);
    assert.doesNotMatch(layer, /Real furniture, honestly made: solid hardwood/);

    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose68", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /POSE68 — SUPPORTED STOOL LEAN/);
    assert.match(prompt, /\nFURNITURE:\nA stool must be present as required by this pose\./);
    assert.match(prompt, /BODY ↔ SUPPORT RELATIONSHIP/);
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
    assert.doesNotMatch(layer, /POSE GEOMETRY IS FIXED/);
    assert.doesNotMatch(
      layer,
      /Apply GARMENT AUTHORITY — REFERENCE IMAGE 1 from the primary instruction/,
    );
    assert.doesNotMatch(layer, /GENERATION AUTHORITY HIERARCHY/);
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
    assert.match(prepared, /side-sit/i);

    const def = getPoseDefinition("Pose38")!;
    assert.equal(def.bodyState, "floor_seated");
    assert.equal(def.prop, "none");

    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose38", 0, {
      manualDirected: true,
    });
    assert.doesNotMatch(prompt, /POSE 38 GEOMETRIC ANCHORS/);
    assert.match(prompt, /side-sit/i);
    assert.match(prompt, /Pose ID: Pose38/);
  });

  it("Pose39 reinforces bilateral lap-hands kneeling distinct from Pose38", () => {
    const prepared = preparePoseMasterStructuredDefinition(
      "Pose39",
      getPoseDefinition("Pose39")!.description,
    );
    assert.match(prepared, /POSE 39 GEOMETRIC ANCHORS/);
    assert.match(prepared, /hands rest lightly together/i);
    assert.match(prepared, /Do not collapse this into Pose 38/i);

    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose39", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /POSE 39 GEOMETRIC ANCHORS/);
    assert.match(prompt, /Pose ID: Pose39/);
  });
});

describe("Pose semantic corrections remain intact", () => {
  it("Pose1 is mid-stride walk, not static standing", () => {
    const def = getPoseDefinition("Pose1")!;
    assert.equal(def.bodyState, "walking");
    assert.equal(def.movement, "dynamic");
    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose1", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /mid-stride walk/i);
    assert.match(prompt, /BODY STATE: Walking/i);
  });

  it("Pose54 is full-body walk toward camera", () => {
    const def = getPoseDefinition("Pose54")!;
    assert.equal(def.bodyState, "walking");
    assert.equal(def.preferredFraming, "full_body");
    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose54", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /walking directly toward camera/i);
  });

  it("Pose56 is rear walk away with skirt hold", () => {
    const def = getPoseDefinition("Pose56")!;
    assert.equal(def.bodyState, "walking");
    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose56", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /walking away from camera/i);
  });

  it("Pose61 is mid-stride three-quarter walk with no furniture block", () => {
    const def = getPoseDefinition("Pose61")!;
    assert.equal(def.bodyState, "walking");
    const prompt = buildShotPromptAtSlot("base", profile, "hero", "Pose61", 0, {
      manualDirected: true,
    });
    assert.match(prompt, /mid-stride three-quarter walk/i);
    assert.doesNotMatch(prompt, /\nFURNITURE:/);
  });

  it("Pose63 is walking + jacket adjustment", () => {
    const def = getPoseDefinition("Pose63")!;
    assert.equal(def.bodyState, "walking");
    assert.match(def.description, /jacket with both hands/i);
  });

  it("Pose65 is walking + sleeve adjustment", () => {
    const def = getPoseDefinition("Pose65")!;
    assert.equal(def.bodyState, "walking");
    assert.match(def.description, /sleeve\/cuff/i);
  });

  it("Pose70 remains standing beside chair", () => {
    const def = getPoseDefinition("Pose70")!;
    assert.equal(def.name, "Male Standing Beside Chair");
    assert.equal(def.bodyState, "standing");
    assert.equal(def.prop, "chair");
  });
});

describe("Selection band is sized for the new score range", () => {
  it("uses a band proportionate to a 0–87 model", () => {
    assert.equal(FURNITURE_TOP_BAND, 6);
  });
});

// ---------------------------------------------------------------------------
// Pass B — garment tone is a COMPLEMENT signal, never a quality signal.
// ---------------------------------------------------------------------------

describe("Garment tone — bounded influence", () => {
  const DARK_GARMENT = deriveGarmentTone({ colour: ["black"] });
  const LIGHT_GARMENT = deriveGarmentTone({ colour: ["ivory"] });
  const UNKNOWN_GARMENT = deriveGarmentTone({ colour: ["chartreuse"] });

  it("never exceeds the declared ceiling and is never negative", () => {
    const tones = [
      DARK_GARMENT,
      LIGHT_GARMENT,
      UNKNOWN_GARMENT,
      deriveGarmentTone({ colour: ["camel"] }),
      deriveGarmentTone({ colour: ["navy"] }),
      deriveGarmentTone({ colour: ["grey"] }),
      deriveGarmentTone({ colour: ["black", "cream"] }),
    ];
    for (const asset of FURNITURE_CATALOG) {
      for (const tone of tones) {
        const score = garmentToneScore(asset, tone);
        assert.ok(
          score >= 0 && score <= MAX_GARMENT_TONE_SCORE,
          `${asset.id} scored ${score}`,
        );
      }
    }
  });

  it("unknown garment tone contributes exactly zero", () => {
    for (const asset of FURNITURE_CATALOG) {
      assert.equal(garmentToneScore(asset, UNKNOWN_GARMENT), 0, asset.id);
      assert.equal(garmentToneScore(asset, null), 0, asset.id);
      assert.equal(garmentToneScore(asset, undefined), 0, asset.id);
    }
  });

  it("conflicting colours contribute zero rather than guessing", () => {
    const conflicted = deriveGarmentTone({ colour: ["black", "cream"] });
    assert.equal(conflicted.depth, "unknown");
    for (const asset of FURNITURE_CATALOG) {
      assert.equal(garmentToneScore(asset, conflicted), 0, asset.id);
    }
  });

  it("unknown tone selects identically to no tone at all", () => {
    const pose = getPoseDefinition("Pose7")!;
    for (let seed = 0; seed < 40; seed++) {
      const without = selectFurnitureAsset({ prop: pose.prop, pose, seed });
      const unknown = selectFurnitureAsset({
        prop: pose.prop,
        pose,
        seed,
        garmentTone: UNKNOWN_GARMENT,
      });
      assert.equal(unknown?.asset.id, without?.asset.id, `seed ${seed} diverged`);
    }
  });
});

describe("Garment tone — furniture quality still wins", () => {
  const DARK_GARMENT = deriveGarmentTone({ colour: ["black"] });

  it("the quality gap between a premium and a weak asset exceeds any tone bonus", () => {
    const premium = getFurnitureAsset("furn_chair_solid_walnut_editorial")!;
    const weakDark = getFurnitureAsset("furn_chair_dark_wood_slat")!;
    const qualityGap =
      materialCraftScore(premium) +
      silhouetteRefinementScore(premium) -
      (materialCraftScore(weakDark) + silhouetteRefinementScore(weakDark));
    assert.ok(
      qualityGap > MAX_GARMENT_TONE_SCORE,
      `quality gap ${qualityGap} must exceed the ±${MAX_GARMENT_TONE_SCORE} tone ceiling`,
    );
  });

  it("a materially superior warm-walnut chair beats a colour-matched dark asset", () => {
    const pose = getPoseDefinition("Pose7")!;
    const ids = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const picked = selectFurnitureAsset({
        prop: pose.prop,
        pose,
        seed,
        garmentTone: DARK_GARMENT,
      });
      assert.ok(picked);
      ids.add(picked!.asset.id);
    }
    assert.ok(
      ids.has("furn_chair_solid_walnut_editorial"),
      `walnut must remain reachable for a dark garment; got ${[...ids].join(", ")}`,
    );
    // Colour agreement must not promote dark-on-dark over better-made timber.
    for (const id of ids) {
      assert.equal(
        isDarkOnDark(getFurnitureAsset(id)!),
        false,
        `${id} won on colour agreement rather than quality`,
      );
    }
  });

  it("tone never lifts a decorative, deprecated or sub-floor asset into play", () => {
    for (const colours of [["black"], ["ivory"], ["navy"], ["camel"]]) {
      const tone = deriveGarmentTone({ colour: colours });
      for (const poseId of ["Pose7", "Pose26", ...DEEP_LOUNGE_POSES]) {
        const pose = getPoseDefinition(poseId)!;
        for (let seed = 0; seed < 20; seed++) {
          const picked = selectFurnitureAsset({
            prop: pose.prop,
            pose,
            seed,
            garmentTone: tone,
          });
          assert.ok(picked);
          assert.equal(isSelectableFurniture(picked!.asset), true, picked!.asset.id);
          assert.equal(DEPRECATED_IDS.includes(picked!.asset.id), false);
        }
      }
    }
  });
});

describe("Garment tone — complement, not colour matching", () => {
  it("a dark garment prefers balanced rich timber over dark-on-dark", () => {
    const tone = deriveGarmentTone({ colour: ["black"] });
    const walnutLightSeat = getFurnitureAsset("furn_chair_walnut_frame_lounge")!;
    const darkOnDark = getFurnitureAsset("furn_chair_dark_wood_slat")!;
    assert.ok(
      garmentToneScore(walnutLightSeat, tone) > garmentToneScore(darkOnDark, tone),
    );
    // Dark-on-dark still scores above zero — allowed, simply not preferred.
    assert.ok(garmentToneScore(darkOnDark, tone) > 0);
  });

  it("a light garment permits rich walnut and does not force pale furniture", () => {
    const tone = deriveGarmentTone({ colour: ["ivory"] });
    const walnutBare = getFurnitureAsset("furn_chair_solid_walnut_editorial")!;
    const paleOak = getFurnitureAsset("furn_chair_natural_oak_editorial")!;
    assert.ok(
      garmentToneScore(walnutBare, tone) > garmentToneScore(paleOak, tone),
      "pale-on-pale must not be the automatic answer to a light garment",
    );

    const pose = getPoseDefinition("Pose7")!;
    const ids = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const picked = selectFurnitureAsset({
        prop: pose.prop,
        pose,
        seed,
        garmentTone: tone,
      });
      if (picked) ids.add(picked.asset.id);
    }
    assert.ok(
      ids.has("furn_chair_solid_walnut_editorial"),
      `light garment must still permit rich walnut; got ${[...ids].join(", ")}`,
    );
  });

  it("a dark-frame piece with a light seat complements a dark garment strongly", () => {
    const tone = deriveGarmentTone({ colour: ["black"] });
    const contrast = getFurnitureAsset("furn_chair_dark_oak_editorial")!;
    const darkOnDark = getFurnitureAsset("furn_chair_dark_wood_slat")!;
    assert.ok(garmentToneScore(contrast, tone) > garmentToneScore(darkOnDark, tone));
  });

  it("a cool garment still rewards warm timber as deliberate contrast", () => {
    const tone = deriveGarmentTone({ colour: ["navy"] });
    const warmTimber = getFurnitureAsset("furn_chair_solid_walnut_editorial")!;
    assert.ok(garmentToneScore(warmTimber, tone) > 0);
  });

  it("warm timber is a strong answer to BOTH dark and light garments", () => {
    const walnut = getFurnitureAsset("furn_chair_solid_walnut_editorial")!;
    for (const colours of [["black"], ["ivory"], ["grey"]]) {
      const tone = deriveGarmentTone({ colour: colours });
      assert.ok(
        garmentToneScore(walnut, tone) >= 6,
        `${colours[0]}: warm timber should complement, got ${garmentToneScore(walnut, tone)}`,
      );
    }
  });
});

describe("Garment tone — Pass A guarantees survive", () => {
  const tone = deriveGarmentTone({ colour: ["black"] });

  it("selection remains deterministic with a garment tone applied", () => {
    for (const name of ["Pose7", "Pose26", "Pose70", ...DEEP_LOUNGE_POSES]) {
      const pose = getPoseDefinition(name)!;
      for (const seed of [0, 7, 23, 61]) {
        const a = selectFurnitureAsset({ prop: pose.prop, pose, seed, garmentTone: tone });
        const b = selectFurnitureAsset({ prop: pose.prop, pose, seed, garmentTone: tone });
        assert.equal(a?.asset.id, b?.asset.id, `${name} seed ${seed} unstable`);
      }
    }
  });

  it("cooldown still excludes recently used assets", () => {
    const first = selectFurnitureAsset({ prop: "chair", seed: 1, garmentTone: tone });
    assert.ok(first);
    const others = listFurnitureForCategory("chair").filter(
      (a) => a.id !== first!.asset.id,
    );
    const history = Array.from({ length: FURNITURE_USER_COOLDOWN }, (_, i) => {
      if (i === 0) {
        return {
          furnitureAssetId: first!.asset.id,
          furnitureFamily: first!.asset.family,
          index: 0,
        };
      }
      const alt = others[(i - 1) % others.length]!;
      return { furnitureAssetId: alt.id, furnitureFamily: alt.family, index: i };
    });
    const next = selectFurnitureAsset({
      prop: "chair",
      userHistory: history,
      seed: 2,
      garmentTone: tone,
    });
    assert.ok(next);
    assert.notEqual(next!.asset.id, first!.asset.id);
  });

  it("batch family diversity still applies", () => {
    const first = selectFurnitureAsset({ prop: "chair", seed: 10, garmentTone: tone });
    assert.ok(first);
    const second = selectFurnitureAsset({
      prop: "chair",
      seed: 11,
      garmentTone: tone,
      excludeAssetIdsInBatch: [first!.asset.id],
      excludeFamiliesInBatch: [first!.asset.family],
    });
    assert.ok(second);
    assert.notEqual(second!.asset.family, first!.asset.family);
  });

  it("fallback under a garment tone still refuses relaxed quality filters", () => {
    const chairs = listFurnitureForCategory("chair");
    const history = chairs.map((a, i) => ({
      furnitureAssetId: a.id,
      furnitureFamily: a.family,
      index: i,
    }));
    for (let seed = 0; seed < 20; seed++) {
      const picked = selectFurnitureAsset({
        prop: "chair",
        userHistory: history,
        seed,
        garmentTone: tone,
      });
      assert.ok(picked);
      assert.equal(picked!.asset.deprecated === true, false);
      assert.notEqual(picked!.asset.ornamentation, "decorative");
      assert.ok(picked!.asset.craftQuality >= FURNITURE_CRAFT_QUALITY_FLOOR);
    }
  });

  it("Pose68 still receives a stool under a garment tone", () => {
    const def = getPoseDefinition("Pose68")!;
    const selected = selectFurnitureAsset({
      prop: def.prop,
      pose: def,
      seed: 11,
      garmentTone: tone,
    });
    assert.ok(selected);
    assert.equal(selected!.asset.category, "stool");
    const layer = buildFurniturePromptLayer(
      selected!.asset,
      selected!.supportClass,
      selected!.spatialRelation,
      "Pose68",
    );
    assert.match(layer, /^FURNITURE:\nA stool must be present as required by this pose\./);
    assert.match(layer, /FURNITURE REFERENCE AUTHORITY below/);
  });

  it("edge-required poses still refuse deep_lounge under a garment tone", () => {
    const pose = getPoseDefinition("Pose7")!;
    for (let seed = 0; seed < 40; seed++) {
      const picked = selectFurnitureAsset({
        prop: pose.prop,
        pose,
        seed,
        garmentTone: tone,
      });
      assert.notEqual(picked!.asset.seatProfile, "deep_lounge");
    }
  });

  it("garment tone does not enter the furniture prompt in this pass", () => {
    const pose = getPoseDefinition("Pose7")!;
    const selected = selectFurnitureAsset({
      prop: pose.prop,
      pose,
      seed: 7,
      garmentTone: tone,
    })!;
    const layer = buildFurniturePromptLayer(
      selected.asset,
      selected.supportClass,
      selected.spatialRelation,
    );
    assert.doesNotMatch(layer, /garment tone|colour complement|tonal complement/i);
  });
});

describe("Garment tone is optional — frozen callers keep working", () => {
  it("selectFurnitureAsset works with garmentTone entirely omitted", () => {
    const pose = getPoseDefinition("Pose7")!;
    const picked = selectFurnitureAsset({ prop: pose.prop, pose, seed: 5 });
    assert.ok(picked);
    assert.match(picked!.reason, /garmentTone=none/);
  });

  it("resolveFurnitureForPose works without garment context, as the frozen trial calls it", () => {
    // Mirrors nano-pro-identity-first-trial.ts exactly: no garmentTone argument.
    const def = getPoseDefinition("Pose7")!;
    const asset = resolveFurnitureForPose({
      prop: def.prop,
      poseIdOrName: "Pose7",
      pose: def,
    });
    assert.ok(asset);
    assert.equal(asset!.category, "chair");
    assert.equal(isSelectableFurniture(asset!), true);
  });

  it("omitting the tone matches passing an unknown tone", () => {
    const def = getPoseDefinition("Pose7")!;
    for (let seed = 0; seed < 20; seed++) {
      const bare = selectFurnitureAsset({ prop: def.prop, pose: def, seed });
      const unknown = selectFurnitureAsset({
        prop: def.prop,
        pose: def,
        seed,
        garmentTone: deriveGarmentTone({ colour: [] }),
      });
      assert.equal(bare?.asset.id, unknown?.asset.id);
    }
  });
});
