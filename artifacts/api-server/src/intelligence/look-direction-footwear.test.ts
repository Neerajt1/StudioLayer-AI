// ---------------------------------------------------------------------------
// Look Direction + Footwear + Top Wear / Full Outfit — contract tests
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GarmentProfile, RecommendedOutfit } from "./types";
import {
  buildHardFallbackOutfit,
  defaultBottomForLookDirection,
  defaultFootwearForLookDirection,
  footwearPreferenceScore,
  isFootwearCompatibleWithLookDirection,
  isSneakerFootwearDescription,
  knowledgeBaseForLookDirection,
  resolveLookDirection,
  selectFootwearForLookDirection,
  applyPlacementOutfitGuards,
  defaultInnerLayerForLookDirection,
} from "./look-direction";
import {
  buildFootwearBatchConsistencyRules,
  buildFootwearStylingPrompt,
  isBarefootAppropriateContext,
  resolveFootwearStyling,
} from "./footwear-intelligence";
import { resolveWardrobeCompletionPlan } from "./wardrobe-completion";
import { composeRenderPrompt } from "./prompt-composer";
import { resolveOutfitOverride } from "./outfit-style-override";
import { OPENROUTER_RENDERING_CONFIG } from "../services/rendering/rendering.config";

function baseProfile(overrides: Partial<GarmentProfile> = {}): GarmentProfile {
  return {
    category: "tops",
    subcategory: "cotton blouse",
    gender: "womens",
    ageGroup: "young_adult",
    colour: ["ivory"],
    fit: "regular",
    fabric: "cotton",
    pattern: "solid",
    texture: "woven",
    season: ["spring"],
    occasion: ["casual"],
    ...overrides,
  };
}

describe("footwear preference — sneakers remain eligible", () => {
  it("9 — contemporary casual prefers / can select sneakers", () => {
    const picked = selectFootwearForLookDirection(
      ["Loafers", "White Leather Sneakers"],
      "contemporary_casual",
    );
    assert.equal(picked, "White Leather Sneakers");
    assert.equal(
      footwearPreferenceScore("White Leather Sneakers", "contemporary_casual") >
        footwearPreferenceScore("Loafers", "contemporary_casual"),
      true,
    );
  });

  it("10 — streetwear prefers sneakers", () => {
    const picked = selectFootwearForLookDirection(
      ["Chelsea Boots", "High-Top Sneakers"],
      "streetwear",
    );
    assert.equal(picked, "High-Top Sneakers");
  });

  it("11 — ethnic prefers ethnic footwear when available (not a ban)", () => {
    const withEthnic = selectFootwearForLookDirection(
      ["White Leather Sneakers", "Juttis", "Kolhapuri Sandals"],
      "traditional_ethnic",
    );
    assert.match(withEthnic!, /Jutti|Kolhapuri/i);

    // F — sneakers remain eligible (compatible), just lower preference
    assert.equal(
      isFootwearCompatibleWithLookDirection("White Leather Sneakers", "traditional_ethnic"),
      true,
    );
    assert.ok(
      footwearPreferenceScore("Juttis", "traditional_ethnic") >
        footwearPreferenceScore("White Leather Sneakers", "traditional_ethnic"),
    );

    // Only sneakers in list → still selected (no blanket ban)
    const onlySneaker = selectFootwearForLookDirection(
      ["White Leather Sneakers"],
      "traditional_ethnic",
    );
    assert.equal(onlySneaker, "White Leather Sneakers");
  });

  it("12 — formal prefers formal footwear; sneakers still eligible", () => {
    const picked = selectFootwearForLookDirection(
      ["White Sneakers", "Black Pointed-Toe Heels"],
      "formal_evening",
    );
    assert.equal(picked, "Black Pointed-Toe Heels");
    assert.equal(
      isFootwearCompatibleWithLookDirection("White Sneakers", "formal_evening"),
      true,
    );
  });

  it("13 — general does not universally fall back to White Leather Sneakers", () => {
    const fw = defaultFootwearForLookDirection("general", "womens");
    assert.equal(isSneakerFootwearDescription(fw), false);

    // General preserves KB list order / equal scores — sneakers eligible if first
    const fromKb = selectFootwearForLookDirection(
      ["White Leather Sneakers", "Nude Block Heels"],
      "general",
    );
    assert.equal(fromKb, "White Leather Sneakers");

    const outfit = buildHardFallbackOutfit("one-pieces", "general", "womens");
    assert.equal(isSneakerFootwearDescription(outfit.footwear!), false);
  });

  it("14 — talent footwear excluded as styling evidence", () => {
    const prompt = buildFootwearStylingPrompt(baseProfile(), {
      footwear: "White Sneakers",
    });
    assert.match(prompt, /Talent \/ model reference footwear is NOT footwear styling evidence/i);
    assert.doesNotMatch(
      OPENROUTER_RENDERING_CONFIG.garmentInstruction,
      /FOOTWEAR STYLING CONTEXT —/,
    );
    assert.match(
      prompt,
      /FOOTWEAR STYLING — STYLING CONTEXT FOR THE COMPLETE LOOK:|FOOTWEAR STYLING — INTENTIONAL BAREFOOT:|FOOTWEAR — REFERENCE EVIDENCE:/,
    );
  });

  it("editorial and general do not hard-filter sneakers", () => {
    assert.equal(
      isFootwearCompatibleWithLookDirection("Clean White Trainers", "editorial"),
      true,
    );
    assert.equal(
      isFootwearCompatibleWithLookDirection("White Leather Sneakers", "general"),
      true,
    );
  });
});

describe("Top Wear — must complete lower half", () => {
  it("1 — female kurta + Top Wear requires bottom", () => {
    const plan = resolveWardrobeCompletionPlan("one-pieces", "upper_body");
    assert.ok(plan.requiredSlots.includes("bottom"));

    const guarded = applyPlacementOutfitGuards(
      { footwear: "Embellished Flat Sandals" },
      "traditional_ethnic",
      "womens",
      "upper_body",
      plan.requiredSlots,
    );
    assert.ok(guarded.bottom);
    assert.equal(guarded.bottom, defaultBottomForLookDirection("traditional_ethnic", "womens"));

    const prompt = composeRenderPrompt({
      profile: baseProfile({
        category: "one-pieces",
        subcategory: "embroidered kurta",
        occasion: ["festive"],
      }),
      recommendation: {
        styleMode: "ecommerce_catalog",
        uploadedGarment: { category: "one-pieces", subcategory: "embroidered kurta" },
        recommendedOutfit: guarded,
        confidence: 0.9,
        decisionSource: "rule_engine",
      },
      garmentPlacement: "upper_body",
      lookDirection: "traditional_ethnic",
    });
    assert.match(prompt, /TOP WEAR/i);
    assert.match(prompt, /MUST complete a full commercial look/i);
    assert.match(prompt, new RegExp(guarded.bottom!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("2 — male shirt + Top Wear requires bottom", () => {
    const plan = resolveWardrobeCompletionPlan("tops", "upper_body");
    assert.ok(plan.requiredSlots.includes("bottom"));
    const guarded = applyPlacementOutfitGuards(
      {},
      "contemporary_casual",
      "mens",
      "upper_body",
      plan.requiredSlots,
    );
    assert.ok(guarded.bottom);
    assert.ok(guarded.footwear);
  });

  it("3 — outerwear + Top Wear requires bottom and innerLayer", () => {
    const plan = resolveWardrobeCompletionPlan("outerwear", "upper_body");
    assert.ok(plan.requiredSlots.includes("bottom"));
    assert.ok(plan.requiredSlots.includes("innerLayer"));
    const hard = buildHardFallbackOutfit(
      "outerwear",
      "western",
      "womens",
      "upper_body",
    );
    assert.ok(hard.bottom);
    assert.ok(hard.innerLayer);

    const guarded = applyPlacementOutfitGuards(
      { bottom: "Beige Tailored Trousers", footwear: "Chelsea Boots" },
      "western",
      "womens",
      "upper_body",
      plan.requiredSlots,
    );
    assert.ok(guarded.innerLayer);
    assert.equal(
      guarded.innerLayer,
      defaultInnerLayerForLookDirection("western", "womens"),
    );
  });

  it("3b — missing innerLayer is force-filled when plan requires it", () => {
    const plan = resolveWardrobeCompletionPlan("outerwear", "upper_body");
    const guarded = applyPlacementOutfitGuards(
      {},
      "formal_evening",
      "mens",
      "upper_body",
      plan.requiredSlots,
    );
    assert.ok(guarded.innerLayer);
    assert.ok(guarded.bottom);
    assert.ok(guarded.footwear);
    assert.equal(
      guarded.innerLayer,
      defaultInnerLayerForLookDirection("formal_evening", "mens"),
    );
  });

  it("3c — Full Outfit still strips innerLayer even if present", () => {
    const plan = resolveWardrobeCompletionPlan("one-pieces", "full_body");
    const guarded = applyPlacementOutfitGuards(
      {
        innerLayer: "Should Not Survive",
        bottom: "Blue Jeans",
        footwear: "White Sneakers",
      },
      "contemporary_casual",
      "womens",
      "full_body",
      plan.requiredSlots,
    );
    assert.equal(guarded.innerLayer, undefined);
    assert.equal(guarded.bottom, undefined);
  });

  it("3d — specified innerLayer is mandatory in render prompt (not merely paired with)", () => {
    const plan = resolveWardrobeCompletionPlan("outerwear", "upper_body");
    const guarded = applyPlacementOutfitGuards(
      { bottom: "Blue Slim Jeans", footwear: "White Sneakers" },
      "contemporary_casual",
      "womens",
      "upper_body",
      plan.requiredSlots,
    );
    assert.ok(guarded.innerLayer);

    const prompt = composeRenderPrompt({
      profile: baseProfile({
        category: "outerwear",
        subcategory: "structured overcoat",
        colour: ["navy"],
      }),
      recommendation: {
        styleMode: "ecommerce_catalog",
        uploadedGarment: { category: "outerwear", subcategory: "structured overcoat" },
        recommendedOutfit: guarded,
        confidence: 0.9,
        decisionSource: "rule_engine",
      },
      garmentPlacement: "upper_body",
      lookDirection: "contemporary_casual",
    });

    assert.match(prompt, /INNER LAYER — MANDATORY RENDER/);
    assert.match(prompt, new RegExp(guarded.innerLayer!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(prompt, /MUST be rendered beneath the uploaded garment/);
    assert.match(prompt, /must be worn OVER that base layer/);
    assert.match(prompt, /Do not render the uploaded garment directly against bare skin when an innerLayer is specified/);
    assert.match(prompt, /Anti-filler rules apply only to OPTIONAL \/ UNSPECIFIED/);
    assert.match(
      prompt,
      new RegExp(
        `specified base layer \\(${guarded.innerLayer!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\) worn under the uploaded garment`,
      ),
    );
    assert.match(prompt, /OUTFIT COMPLETION MODE — TOP WEAR/);
    assert.match(prompt, /Blue Slim Jeans|complementary lower garment/);
    assert.match(prompt, /established footwear/);
    // Anti-filler must not contradict the specified underlayer
    assert.doesNotMatch(
      prompt,
      /Never use a plain grey T-shirt, plain white undershirt, or generic filler clothing as a complementary item —/,
    );
    assert.doesNotMatch(
      prompt,
      /unless the garment is explicitly a structured jacket, coat, or blazer/,
    );
  });

  it("3e — without innerLayer, anti-filler remains and no mandatory underlayer block", () => {
    const prompt = composeRenderPrompt({
      profile: baseProfile({ category: "tops", subcategory: "cotton blouse" }),
      recommendation: {
        styleMode: "ecommerce_catalog",
        uploadedGarment: { category: "tops", subcategory: "cotton blouse" },
        recommendedOutfit: {
          bottom: "Blue Slim Jeans",
          footwear: "White Sneakers",
        },
        confidence: 0.9,
        decisionSource: "rule_engine",
      },
      garmentPlacement: "upper_body",
      lookDirection: "contemporary_casual",
    });
    assert.doesNotMatch(prompt, /INNER LAYER — MANDATORY RENDER/);
    assert.match(prompt, /OPTIONAL complementary item|generic filler clothing as an OPTIONAL/);
    assert.match(prompt, /OUTFIT COMPLETION MODE — TOP WEAR/);
    assert.doesNotMatch(prompt, /specified base layer/);
  });

  it("3f — Full Outfit prompt must not require innerLayer", () => {
    const prompt = composeRenderPrompt({
      profile: baseProfile({
        category: "one-pieces",
        subcategory: "denim dress",
      }),
      recommendation: {
        styleMode: "ecommerce_catalog",
        uploadedGarment: { category: "one-pieces", subcategory: "denim dress" },
        recommendedOutfit: { footwear: "White Sneakers" },
        confidence: 0.9,
        decisionSource: "rule_engine",
      },
      garmentPlacement: "full_body",
      lookDirection: "contemporary_casual",
    });
    assert.match(prompt, /FULL OUTFIT/i);
    assert.doesNotMatch(prompt, /INNER LAYER — MANDATORY RENDER/);
    assert.doesNotMatch(prompt, /Do not invent additional garments.*innerLayer/i);
  });

  it("3g — creative brief owns innerLayer; garmentInstruction must not contradict", () => {
    assert.doesNotMatch(
      OPENROUTER_RENDERING_CONFIG.garmentInstruction,
      /OUTFIT COMPLETION — When generating complementary clothing/,
    );
    assert.doesNotMatch(
      OPENROUTER_RENDERING_CONFIG.garmentInstruction,
      /unless the uploaded garment is structured outerwear \(a tailored blazer, coat, or jacket\) that physically requires an inner layer/,
    );
    const profile = baseProfile({
      category: "outerwear",
      subcategory: "blazer",
    });
    const plan = resolveWardrobeCompletionPlan("outerwear", "upper_body");
    const guarded = applyPlacementOutfitGuards(
      { footwear: "Leather Loafers", bottom: "Tailored Trousers", innerLayer: "White Shirt" },
      "formal_evening",
      "womens",
      "upper_body",
      plan.requiredSlots,
    );
    const prompt = composeRenderPrompt({
      profile,
      recommendation: {
        styleMode: "ecommerce_catalog",
        uploadedGarment: { category: "outerwear", subcategory: "blazer" },
        recommendedOutfit: guarded,
        confidence: 0.9,
        decisionSource: "rule_engine",
      },
      garmentPlacement: "upper_body",
    });
    assert.match(prompt, /INNER LAYER — MANDATORY RENDER/);
    assert.match(prompt, /OUTFIT COMPLETION MODE — TOP WEAR/);
    assert.match(
      prompt,
      /specified base layer \(White Shirt\) MUST be rendered beneath the uploaded garment/i,
    );
  });

  it("4 — inferred bottom is direction-appropriate", () => {
    assert.match(
      defaultBottomForLookDirection("traditional_ethnic", "womens"),
      /Palazzo|Churidar|Salwar|Trouser/i,
    );
    assert.match(
      defaultBottomForLookDirection("contemporary_casual", "mens"),
      /Jean/i,
    );
    assert.match(
      defaultBottomForLookDirection("formal_evening", "womens"),
      /Trouser/i,
    );
  });

  it("5 — footwear remains direction-aware with Top Wear", () => {
    const hard = buildHardFallbackOutfit(
      "tops",
      "traditional_ethnic",
      "womens",
      "upper_body",
    );
    assert.ok(hard.bottom);
    assert.equal(isSneakerFootwearDescription(hard.footwear!), false);
  });
});

describe("Full Outfit — must not invent bottoms", () => {
  it("6 — denim dress + Full Outfit → no invented bottom", () => {
    const plan = resolveWardrobeCompletionPlan("one-pieces", "full_body");
    assert.equal(plan.requiredSlots.includes("bottom"), false);

    const guarded = applyPlacementOutfitGuards(
      { bottom: "Blue Jeans", footwear: "White Sneakers" },
      "contemporary_casual",
      "womens",
      "full_body",
      plan.requiredSlots,
    );
    assert.equal(guarded.bottom, undefined);

    const prompt = composeRenderPrompt({
      profile: baseProfile({
        category: "one-pieces",
        subcategory: "denim dress",
      }),
      recommendation: {
        styleMode: "ecommerce_catalog",
        uploadedGarment: { category: "one-pieces", subcategory: "denim dress" },
        recommendedOutfit: { footwear: "White Sneakers" },
        confidence: 0.9,
        decisionSource: "rule_engine",
      },
      garmentPlacement: "full_body",
      lookDirection: "contemporary_casual",
    });
    assert.match(prompt, /FULL OUTFIT/i);
    assert.match(prompt, /Do NOT invent additional garments/i);
    assert.equal(prompt.includes("Blue Jeans"), false);
  });

  it("7 — jumpsuit + Full Outfit → no invented bottom", () => {
    const guarded = applyPlacementOutfitGuards(
      { bottom: "Invented Trousers", footwear: "Sandals" },
      "resort_vacation",
      "womens",
      "full_body",
    );
    assert.equal(guarded.bottom, undefined);
  });

  it("8 — complete ethnic outfit + Full Outfit → no invented bottom", () => {
    const hard = buildHardFallbackOutfit(
      "one-pieces",
      "traditional_ethnic",
      "womens",
      "full_body",
    );
    assert.equal(hard.bottom, undefined);
    assert.ok(hard.footwear);
  });
});

describe("India KB + Complete the Look + barefoot", () => {
  it("F — traditional_ethnic reaches India footwear KB", () => {
    const kb = knowledgeBaseForLookDirection("traditional_ethnic");
    const match = kb.bestMatch(
      baseProfile({
        subcategory: "kurta",
        gender: "womens",
        occasion: ["festive"],
      }),
      "ecommerce_catalog",
    );
    assert.ok(match);
    const footwear = match!.rule.recommendations.footwear ?? [];
    const selected = selectFootwearForLookDirection(footwear, "traditional_ethnic");
    assert.ok(selected);
    assert.equal(isSneakerFootwearDescription(selected!), false);
  });

  it("H — Complete the Look ethnic override remains authoritative for footwear", () => {
    const override = resolveOutfitOverride("tops", "womens", "ethnic");
    assert.ok(override?.footwear);
    assert.equal(isSneakerFootwearDescription(override!.footwear!), false);
  });

  it("E — barefoot unchanged", () => {
    const profile = baseProfile({ subcategory: "bikini", occasion: ["beach"] });
    assert.equal(isBarefootAppropriateContext(profile), true);
    const styling = resolveFootwearStyling(profile, { footwear: "White Sneakers" });
    assert.equal(styling.mode, "barefoot");
  });

  it("I — batch consistency lock preserved", () => {
    const lock = buildFootwearBatchConsistencyRules(
      baseProfile(),
      { footwear: "Embellished Flat Sandals" },
      { lookDirection: "traditional_ethnic" },
    );
    assert.match(lock, /Lock footwear to: Embellished Flat Sandals/);
  });
});
