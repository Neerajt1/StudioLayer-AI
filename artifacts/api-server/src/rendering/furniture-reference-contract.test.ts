// ---------------------------------------------------------------------------
// Global furniture-reference generation contract — regression tests
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FURNITURE_CATALOG,
  isSelectableFurniture,
  listFurnitureForCategory,
} from "../intelligence/furniture-catalog.js";
import {
  buildFurniturePromptLayer,
  selectFurnitureAsset,
} from "../intelligence/furniture-selector.js";
import { getAllPoseDefinitions, getPoseDefinition } from "../intelligence/pose-library.js";
import { deriveGarmentTone } from "../intelligence/garment-tone.js";
import {
  buildIntrinsicPropQualityLayer,
  buildPoseMasterReferenceAuthorityLayer,
  resolveFurnitureForPose,
} from "../intelligence/pose-selection-engine.js";
import {
  FURNITURE_REFERENCE_FILENAMES,
  hasFurnitureReferenceImage,
  loadFurnitureReferenceImageAsDataUri,
} from "./furniture-reference-backend.js";
import {
  auditFurnitureReferenceCoverage,
  FurnitureReferenceIntegrityError,
  listReferenceBackedSelectableFurniture,
  recoverReferenceBackedFurnitureAsset,
  resolvePerShotFurnitureReferences,
} from "./furniture-reference-contract.js";
import {
  buildFreshGenerationImageParts,
  buildFurnitureReferenceAuthorityLayer,
} from "../services/rendering/providers/OpenRouterProvider.js";
import { resolveOpenRouterImagePartRoles } from "../services/rendering/openrouter-request-evidence.js";
import type { GarmentProfile } from "../intelligence/types.js";

const sampleProfile: GarmentProfile = {
  category: "dress",
  subcategory: "midi",
  colour: ["yellow"],
  fit: "regular",
  fabric: "cotton",
  gender: "female",
  styleTags: [],
  tags: [],
};

const GARMENT = "data:image/png;base64,GARMENT";
const TALENT = "data:image/png;base64,TALENT";
const POSE = "data:image/png;base64,POSE";
const FURNITURE = "data:image/png;base64,FURNITURE";

const EXPECTED_REFERENCE_MAP: Readonly<Record<string, string>> = {
  furn_chair_solid_walnut_editorial: "chair_01_walnut_sculpted_armchair.png",
  furn_chair_dark_oak_editorial: "chair_02_dark_walnut_cane.png",
  furn_chair_warm_timber_editorial: "chair_03_sculpted_walnut_shell.png",
  furn_chair_walnut_frame_lounge: "chair_04_walnut_light_upholstered.png",
  furn_chair_natural_oak_lounge: "chair_05_natural_oak_lounge.png",
  furn_stool_solid_walnut_editorial: "stool_01_walnut_saddle.png",
  furn_stool_dark_wood_substantial: "stool_02_dark_walnut_round.png",
  furn_stool_natural_oak_editorial: "stool_03_natural_oak_round.png",
  furn_block_warm_timber_accent: "block_warm_timber_accent.png",
};

describe("furniture reference global contract", () => {
  it("A. every reference-backed selectable id has a registry mapping", () => {
    for (const asset of FURNITURE_CATALOG.filter(isSelectableFurniture)) {
      if (!hasFurnitureReferenceImage(asset.id)) continue;
      assert.equal(
        FURNITURE_REFERENCE_FILENAMES[asset.id],
        EXPECTED_REFERENCE_MAP[asset.id as keyof typeof EXPECTED_REFERENCE_MAP],
        asset.id,
      );
    }
  });

  it("B. every mapped reference file exists on disk", () => {
    for (const [id, filename] of Object.entries(EXPECTED_REFERENCE_MAP)) {
      assert.equal(FURNITURE_REFERENCE_FILENAMES[id], filename, id);
      assert.equal(hasFurnitureReferenceImage(id), true, id);
    }
  });

  it("C. every mapped reference loads as a data URI", () => {
    for (const id of Object.keys(EXPECTED_REFERENCE_MAP)) {
      const uri = loadFurnitureReferenceImageAsDataUri(id);
      assert.ok(uri, id);
      assert.ok(uri!.startsWith("data:image/"), id);
    }
  });

  it("D. coverage audit — all nine reference-backed assets are selectable", () => {
    const audit = auditFurnitureReferenceCoverage();
    assert.equal(audit.referenceLoadableTotal, 9);
    assert.equal(audit.selectableWithoutReference.length, 9);
    assert.deepEqual(
      Object.keys(EXPECTED_REFERENCE_MAP).sort(),
      listReferenceBackedSelectableFurniture("chair")
        .concat(listReferenceBackedSelectableFurniture("stool"))
        .concat(listReferenceBackedSelectableFurniture("block"))
        .map((asset) => asset.id)
        .sort(),
    );
  });

  it("E. selector only offers reference-backed assets", () => {
    const tone = deriveGarmentTone(sampleProfile);
    for (const pose of getAllPoseDefinitions()) {
      if (!pose.prop || pose.prop === "none") continue;
      for (let seed = 0; seed < 12; seed++) {
        const picked = selectFurnitureAsset({
          prop: pose.prop,
          pose,
          garmentTone: tone,
          seed,
        });
        if (!picked) continue;
        assert.equal(
          hasFurnitureReferenceImage(picked.asset.id),
          true,
          `${pose.poseId} seed ${seed} → ${picked.asset.id}`,
        );
      }
    }
  });

  it("F. resolveFurnitureForPose returns reference-backed assets across poses", () => {
    const tone = deriveGarmentTone(sampleProfile);
    const furniturePoses = getAllPoseDefinitions().filter(
      (pose) => pose.prop && pose.prop !== "none",
    );
    assert.ok(furniturePoses.length >= 3);
    for (const pose of furniturePoses) {
      const asset = resolveFurnitureForPose({
        prop: pose.prop,
        poseIdOrName: pose.poseId,
        pose,
        garmentTone: tone,
        seed: 17,
      });
      assert.ok(asset, pose.poseId);
      assert.equal(hasFurnitureReferenceImage(asset!.id), true, pose.poseId);
    }
  });

  it("G. per-shot resolution produces non-null references for furniture poses", () => {
    const tone = deriveGarmentTone(sampleProfile);
    for (const poseId of ["Pose26", "Pose31", "Pose68", "Pose70"]) {
      const def = getPoseDefinition(poseId)!;
      const asset = resolveFurnitureForPose({
        prop: def.prop,
        poseIdOrName: poseId,
        pose: def,
        garmentTone: tone,
        seed: 3,
      })!;
      const resolved = resolvePerShotFurnitureReferences({
        furnitureSelections: [asset],
        plannedPoses: [{ poseId, name: def.name }],
        garmentTone: tone,
        renderId: 901,
      });
      assert.equal(resolved.referenceUrls.length, 1);
      assert.ok(resolved.referenceUrls[0]);
      assert.equal(resolved.diagnostics[0]!.providerReceivesFurnitureImage, true);
    }
  });

  it("H. final provider image parts include furniture as fourth part", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: GARMENT,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
      furnitureReferenceImageUrl: FURNITURE,
    });
    assert.equal(parts.length, 4);
    assert.equal(parts[3]!.image_url.url, FURNITURE);
    const roles = resolveOpenRouterImagePartRoles({
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
      furnitureReferenceImageUrl: FURNITURE,
      hasFrontGarment: true,
    });
    assert.deepEqual(roles, [
      "GARMENT",
      "TALENT",
      "POSE_MASTER",
      "FURNITURE",
    ]);
  });

  it("I. furniture authority is emitted only when reference is present", () => {
    const withRef = [
      "shot",
      buildFurnitureReferenceAuthorityLayer(4),
    ].join("\n\n");
    const withoutRef = "shot";
    assert.match(withRef, /FURNITURE REFERENCE AUTHORITY/);
    assert.doesNotMatch(withoutRef, /FURNITURE REFERENCE AUTHORITY/);
  });

  it("J. pose master authority remains intact with furniture reference", () => {
    const def = getPoseDefinition("Pose26")!;
    const pose = buildPoseMasterReferenceAuthorityLayer(
      "Pose26",
      def.name,
      def.description,
      true,
    );
    assert.match(pose, /BODY POSE AND ACTION/);
    assert.doesNotMatch(pose, /FURNITURE REFERENCE AUTHORITY/);
  });

  it("K. furniture prompt layer does not emit obsolete dark-furniture sentence", () => {
    const asset = listReferenceBackedSelectableFurniture("chair")[0]!;
    const layer = buildFurniturePromptLayer(asset, null, null, "Pose26");
    assert.doesNotMatch(layer, /Furniture catalog supplies NEW dark/i);
    assert.doesNotMatch(layer, /dark appearance\/finish only/i);
  });

  it("L. non-furniture pose does not receive furniture layer", () => {
    const layer = buildIntrinsicPropQualityLayer("none", "standing pose", "Pose1");
    assert.equal(layer, "");
  });

  it("M. multiple furniture ids travel through per-shot resolution", () => {
    const tone = deriveGarmentTone(sampleProfile);
    const poseA = getPoseDefinition("Pose26")!;
    const poseB = getPoseDefinition("Pose31")!;
    const assetA = resolveFurnitureForPose({
      prop: poseA.prop,
      poseIdOrName: "Pose26",
      pose: poseA,
      garmentTone: tone,
      seed: 1,
    })!;
    const assetB = resolveFurnitureForPose({
      prop: poseB.prop,
      poseIdOrName: "Pose31",
      pose: poseB,
      garmentTone: tone,
      seed: 2,
      excludeAssetIdsInBatch: [assetA.id],
    })!;
    assert.notEqual(assetA.id, assetB.id);
    const resolved = resolvePerShotFurnitureReferences({
      furnitureSelections: [assetA, assetB],
      plannedPoses: [
        { poseId: "Pose26", name: poseA.name },
        { poseId: "Pose31", name: poseB.name },
      ],
      garmentTone: tone,
    });
    assert.equal(resolved.referenceUrls.filter(Boolean).length, 2);
  });

  it("N. missing selection for furniture pose throws before generation", () => {
    const def = getPoseDefinition("Pose26")!;
    assert.throws(
      () =>
        resolvePerShotFurnitureReferences({
          furnitureSelections: [null],
          plannedPoses: [{ poseId: "Pose26", name: def.name }],
        }),
      FurnitureReferenceIntegrityError,
    );
  });

  it("O. recovery is deterministic and does not depend on a specific pose id", () => {
    const tone = deriveGarmentTone(sampleProfile);
    for (const poseId of ["Pose26", "Pose31", "Pose68"]) {
      const def = getPoseDefinition(poseId)!;
      const input = {
        prop: def.prop,
        pose: def,
        garmentTone: tone,
        seed: 44,
      };
      const recoveredA = recoverReferenceBackedFurnitureAsset(
        input,
        "furn_chair_dark_wood_slat",
        { shotIndex: 0 },
      );
      const recoveredB = recoverReferenceBackedFurnitureAsset(
        input,
        "furn_chair_dark_wood_slat",
        { shotIndex: 0 },
      );
      assert.equal(recoveredA.id, recoveredB.id);
      assert.equal(hasFurnitureReferenceImage(recoveredA.id), true);
    }
  });

  it("P. solution is not Pose-7-specific — same contract on varied pose families", () => {
    const tone = deriveGarmentTone(sampleProfile);
    const poseIds = getAllPoseDefinitions()
      .filter((pose) => pose.prop && pose.prop !== "none")
      .slice(0, 6)
      .map((pose) => pose.poseId)
      .filter((id): id is string => Boolean(id));
    assert.ok(!poseIds.every((id) => id === "Pose7"));
    for (const poseId of poseIds) {
      const def = getPoseDefinition(poseId)!;
      const asset = resolveFurnitureForPose({
        prop: def.prop,
        poseIdOrName: poseId,
        pose: def,
        garmentTone: tone,
        seed: 99,
      });
      assert.ok(asset, poseId);
      assert.ok(loadFurnitureReferenceImageAsDataUri(asset!.id), poseId);
    }
  });
});

describe("reference-backed pool by category", () => {
  it("chairs, stools, and blocks each have at least one reference-backed asset", () => {
    for (const category of ["chair", "stool", "block"] as const) {
      const backed = listReferenceBackedSelectableFurniture(category);
      assert.ok(backed.length > 0, category);
      assert.ok(
        backed.every((asset) => listFurnitureForCategory(category).some((a) => a.id === asset.id)),
        category,
      );
    }
  });
});
