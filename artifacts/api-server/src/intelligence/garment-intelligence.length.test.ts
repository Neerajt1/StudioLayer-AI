// ---------------------------------------------------------------------------
// Garment Intelligence — length landmark definitions (surgical enhancement).
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyGarmentIntelligence,
  applyGarmentLengthSelection,
  buildGarmentPreservationPrompt,
  formatGarmentLengthLabel,
  garmentLengthLandmarkDefinition,
  type GarmentLengthSelection,
} from "./garment-intelligence";
import type { GarmentProfile } from "./types";
import { GARMENT_AUTHORITY_SOT } from "../services/rendering/rendering.config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SELECTION_TO_PROFILE: Record<
  Exclude<GarmentLengthSelection, "auto">,
  string
> = {
  mini: "mini",
  above_knee: "above-knee",
  knee: "knee",
  midi: "midi",
  mid_calf: "mid-calf",
  maxi: "maxi",
  floor: "full-length",
};

const SELECTION_LANDMARK: Record<
  Exclude<GarmentLengthSelection, "auto">,
  string
> = {
  mini: "high thigh",
  above_knee: "above the knee, lower than mini",
  knee: "at the knee",
  midi: "below the knee, ending above mid-calf",
  mid_calf: "hem at the middle of the calf",
  maxi: "ankle length, above the floor",
  floor: "hem reaches/touches the floor",
};

function baseProfile(
  overrides: Partial<GarmentProfile> = {},
): GarmentProfile {
  return {
    category: "one-pieces",
    subcategory: "dress",
    gender: "womens",
    ageGroup: "young_adult",
    colour: ["black"],
    fit: "fitted",
    fabric: "cotton",
    pattern: "solid",
    texture: "woven",
    season: ["summer"],
    occasion: ["casual"],
    garmentLength: "knee",
    ...overrides,
  };
}

describe("garment length landmark definitions", () => {
  it("maps all seven selections to unchanged profile tokens", () => {
    for (const [selection, expectedToken] of Object.entries(
      SELECTION_TO_PROFILE,
    ) as Array<[Exclude<GarmentLengthSelection, "auto">, string]>) {
      const next = applyGarmentLengthSelection(baseProfile(), selection);
      assert.equal(next.garmentLength, expectedToken);
    }
  });

  it("resolves a distinct landmark for each of the seven selections", () => {
    for (const [selection, expectedLandmark] of Object.entries(
      SELECTION_LANDMARK,
    ) as Array<[Exclude<GarmentLengthSelection, "auto">, string]>) {
      const token = SELECTION_TO_PROFILE[selection];
      assert.equal(garmentLengthLandmarkDefinition(token), expectedLandmark);
    }
  });

  it("keeps Midi and Mid-Calf landmark wording distinct", () => {
    const midi = garmentLengthLandmarkDefinition("midi");
    const midCalf = garmentLengthLandmarkDefinition("mid-calf");
    assert.equal(midi, "below the knee, ending above mid-calf");
    assert.equal(midCalf, "hem at the middle of the calf");
    assert.notEqual(midi, midCalf);
  });

  it("keeps Maxi and Floor Length landmark wording distinct", () => {
    const maxi = garmentLengthLandmarkDefinition("maxi");
    const floor = garmentLengthLandmarkDefinition("full-length");
    assert.equal(maxi, "ankle length, above the floor");
    assert.equal(floor, "hem reaches/touches the floor");
    assert.notEqual(maxi, floor);
  });

  it("embeds landmark guidance in the preservation lock", () => {
    for (const [selection, expectedLandmark] of Object.entries(
      SELECTION_LANDMARK,
    ) as Array<[Exclude<GarmentLengthSelection, "auto">, string]>) {
      const profile = applyGarmentLengthSelection(baseProfile(), selection);
      const label = formatGarmentLengthLabel(profile.garmentLength);
      const prompt = buildGarmentPreservationPrompt(profile);
      assert.match(
        prompt,
        new RegExp(
          `Maintain exact garment length: ${label} — ${expectedLandmark}\\.`,
        ),
      );
    }
  });

  it("applies length override only for Full Outfit placement", () => {
    const starting = baseProfile({ garmentLength: "knee" });

    const topwear = applyGarmentIntelligence(starting, {
      garmentPlacement: "upper_body",
      garmentLengthSelection: "midi",
    });
    assert.equal(topwear.garmentLength, "knee");

    const fullOutfit = applyGarmentIntelligence(starting, {
      garmentPlacement: "full_body",
      garmentLengthSelection: "midi",
    });
    assert.equal(fullOutfit.garmentLength, "midi");
  });

  it("does not alter GARMENT_AUTHORITY_SOT with length landmarks", () => {
    assert.match(GARMENT_AUTHORITY_SOT, /^GARMENT AUTHORITY — REFERENCE IMAGE 1/);
    assert.doesNotMatch(GARMENT_AUTHORITY_SOT, /high thigh/);
    assert.doesNotMatch(GARMENT_AUTHORITY_SOT, /middle of the calf/);
    assert.doesNotMatch(GARMENT_AUTHORITY_SOT, /ankle length, above the floor/);
    assert.doesNotMatch(GARMENT_AUTHORITY_SOT, /hem reaches\/touches the floor/);
    assert.doesNotMatch(GARMENT_AUTHORITY_SOT, /Maintain exact garment length/);

    const source = readFileSync(
      join(
        __dirname,
        "../services/rendering/rendering.config.ts",
      ),
      "utf8",
    );
    assert.match(source, /export const GARMENT_AUTHORITY_SOT/);
    assert.doesNotMatch(source, /LENGTH_PROFILE_LANDMARK/);
    assert.doesNotMatch(source, /ending above mid-calf/);
  });
});
