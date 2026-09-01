// ---------------------------------------------------------------------------
// Furniture visual reference — resolution and payload contract.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, before, after } from "node:test";

import {
  FURNITURE_REFERENCE_FILENAMES,
  hasFurnitureReferenceImage,
  loadFurnitureReferenceImageAsDataUri,
  resolveFurnitureReferenceAbsolutePath,
  resolveFurnitureReferenceFilename,
  tryLoadFurnitureReferenceImage,
} from "./furniture-reference-backend";
import {
  buildFreshGenerationImageParts,
  buildFurnitureReferenceAuthorityLayer,
} from "../services/rendering/providers/OpenRouterProvider";
import { buildPoseMasterReferenceAuthorityLayer } from "../intelligence/pose-selection-engine";
import { getPoseDefinition } from "../intelligence/pose-library";

const GARMENT = "data:image/png;base64,GARMENT";
const TALENT = "data:image/png;base64,TALENT";
const POSE = "data:image/png;base64,POSE";
const FURNITURE = "data:image/png;base64,FURNITURE";

const REFERENCE_MAP: Readonly<Record<string, string>> = {
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

describe("furniture reference registry", () => {
  it("registers exactly the nine production reference assets", () => {
    assert.deepEqual(
      Object.keys(FURNITURE_REFERENCE_FILENAMES).sort(),
      Object.keys(REFERENCE_MAP).sort(),
    );
  });

  it("each id resolves to the correct production filename", () => {
    for (const [id, filename] of Object.entries(REFERENCE_MAP)) {
      assert.equal(resolveFurnitureReferenceFilename(id), filename);
      assert.ok(resolveFurnitureReferenceAbsolutePath(id)?.endsWith(filename));
    }
  });

  it("unregistered ids resolve safely", () => {
    assert.equal(resolveFurnitureReferenceFilename("furn_stool_rosewood_bar"), undefined);
    assert.equal(hasFurnitureReferenceImage("furn_stool_rosewood_bar"), false);
  });

  it("null / empty / unknown ids return structured failure without throw", () => {
    assert.equal(loadFurnitureReferenceImageAsDataUri(null), null);
    assert.equal(loadFurnitureReferenceImageAsDataUri(""), null);
    assert.equal(tryLoadFurnitureReferenceImage("not_a_furniture_id").ok, false);
  });

  it("each production reference loads as png data URI", () => {
    for (const [id, filename] of Object.entries(REFERENCE_MAP)) {
      assert.equal(hasFurnitureReferenceImage(id), true, id);
      const uri = loadFurnitureReferenceImageAsDataUri(id);
      assert.ok(uri, `${id} should load`);
      assert.ok(uri!.startsWith("data:image/png;base64,"), filename);
    }
  });
});

describe("furniture reference payload contract", () => {
  let originalCwd = "";

  before(() => {
    originalCwd = process.cwd();
    const dir = mkdtempSync(path.join(tmpdir(), "furniture-ref-"));
    const assetsDir = path.join(dir, "assets", "furniture-references");
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(
      path.join(assetsDir, "chair_01_walnut_sculpted_armchair.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    process.chdir(dir);
  });

  after(() => {
    process.chdir(originalCwd);
  });

  it("furniture image is appended after pose master", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: GARMENT,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
      furnitureReferenceImageUrl: FURNITURE,
    });
    assert.deepEqual(
      parts.map((part) => part.image_url.url),
      [GARMENT, TALENT, POSE, FURNITURE],
    );
  });

  it("pose master authority is unchanged when furniture reference is present", () => {
    const definition = getPoseDefinition("Pose26")!;
    const pose = buildPoseMasterReferenceAuthorityLayer(
      "Pose26",
      definition.name,
      definition.description,
      true,
    );
    assert.match(pose, /BODY POSE AND ACTION/);
    assert.doesNotMatch(pose, /FURNITURE REFERENCE AUTHORITY/);
  });

  it("furniture authority references the computed image number", () => {
    const parts = buildFreshGenerationImageParts({
      garmentImageUrl: GARMENT,
      modelImageUrl: TALENT,
      poseReferenceImageUrl: POSE,
      furnitureReferenceImageUrl: FURNITURE,
    });
    const furnitureNumber =
      parts.findIndex((part) => part.image_url.url === FURNITURE) + 1;
    assert.equal(furnitureNumber, 4);
    const authority = buildFurnitureReferenceAuthorityLayer(furnitureNumber);
    assert.match(authority, /Reference Image 4/);
  });
});
