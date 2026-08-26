import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyContextAwareAccessories,
  accessoryPromptGuidance,
  isCarryAccessory,
} from "./accessory-intelligence.js";
import type { GarmentProfile } from "./types.js";

const profile: GarmentProfile = {
  category: "tops",
  subcategory: "kurti",
  gender: "womens",
  ageGroup: "young_adult",
  colour: ["yellow"],
  fit: "regular",
  fabric: "cotton",
  pattern: "solid",
  texture: "woven",
  season: ["summer"],
  occasion: ["casual"],
};

describe("carry accessory repetition control", () => {
  it("detects jute/tote/handbag carry items", () => {
    assert.equal(isCarryAccessory("Natural Jute Bag"), true);
    assert.equal(isCarryAccessory("Structured Handbag"), true);
    assert.equal(isCarryAccessory("Potli Bag"), true);
    assert.equal(isCarryAccessory("Minimal Stud Earrings"), false);
  });

  it("strips carry bags from shared outfit even when GPT/KB suggested them", () => {
    const outfit = applyContextAwareAccessories(
      {
        footwear: "Kolhapuri Sandals",
        accessories: ["Oxidised Silver Earrings", "Jute Tote Bag", "Potli Bag"],
      },
      profile,
      "female",
      4,
    );
    assert.ok(outfit.accessories);
    assert.ok(outfit.accessories.every((a) => !isCarryAccessory(a)));
    assert.ok(outfit.accessories.some((a) => /earring/i.test(a)));
  });

  it("does not inject Crossbody/Handbag from accessory pools", () => {
    const outfit = applyContextAwareAccessories(
      { footwear: "Heels" },
      profile,
      "female",
      2,
    );
    const accessories = outfit.accessories ?? [];
    assert.ok(!accessories.some((a) => isCarryAccessory(a)));
  });

  it("guidance forbids invented/repeated carry bags unless pose requires", () => {
    const guidance = accessoryPromptGuidance(profile, "female", 4);
    assert.match(guidance, /Do not invent handbags/);
    assert.match(guidance, /Never repeat the same carry bag/);
    assert.match(guidance, /pose for that shot explicitly requires a bag/);
  });
});
