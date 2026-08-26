// ---------------------------------------------------------------------------
// StudioLayer AI — Context-Aware Accessory Intelligence (Batch 3.2)
//
// Filters and selects complementary accessories that respect model gender,
// age, and shoot type (hero / campaign / editorial).
// ---------------------------------------------------------------------------

import type { GarmentProfile, RecommendedOutfit } from "./types";

export type GenerationContext = "hero" | "campaign" | "editorial";

export function imageCountToGenerationContext(shots: 1 | 2 | 4 | 8): GenerationContext {
  if (shots >= 4) return "editorial";
  if (shots === 2) return "campaign";
  return "hero";
}

const FEMININE_ACCESSORY_KEYWORDS = [
  "earring",
  "necklace",
  "pendant",
  "clutch",
  "handbag",
  "purse",
  "tote",
  "pearl",
  "gold jewellery",
  "gold jewelry",
  "jewellery set",
  "jewelry set",
  "strappy heels",
  "block-heel pumps",
  "pointed-toe heels",
];

const MASCULINE_ACCESSORY_KEYWORDS = [
  "cufflink",
  "tie clip",
  "pocket square",
];

const MATURE_ACCESSORY_KEYWORDS = [
  "luxury watch",
  "statement",
  "cocktail",
  "clutch",
  "pearl",
  "diamond",
  "gold jewellery",
  "gold jewelry",
  "embellished",
];

const OBSCURING_ACCESSORY_KEYWORDS = [
  "scarf",
  "shawl",
  "large necklace",
  "statement necklace",
  "chunky necklace",
  "oversized bag",
  "crossbody bag",
];

/** Carry / hand-bag items — must not be batch-locked into every shot. */
const CARRY_ACCESSORY_KEYWORDS = [
  "bag",
  "handbag",
  "purse",
  "tote",
  "clutch",
  "potli",
  "backpack",
  "crossbody",
  "satchel",
  "jute",
  "woven bag",
];

export function isCarryAccessory(accessory: string): boolean {
  return containsKeyword(accessory, CARRY_ACCESSORY_KEYWORDS);
}

const ACCESSORY_POOL: Record<
  "mens" | "womens" | "kids" | "unisex",
  Record<GenerationContext, string[]>
> = {
  mens: {
    hero: ["Simple Watch"],
    campaign: ["Luxury Watch", "Classic Sunglasses"],
    editorial: ["Luxury Watch", "Leather Bracelet", "Minimal Chain Necklace", "Classic Ring", "Aviator Sunglasses"],
  },
  womens: {
    hero: ["Minimal Stud Earrings"],
    campaign: ["Small Hoop Earrings", "Classic Sunglasses"],
    editorial: ["Delicate Earrings", "Fine Necklace", "Bracelet", "Cat-Eye Sunglasses"],
  },
  kids: {
    hero: [],
    campaign: ["Simple Cap"],
    editorial: ["Colourful Backpack", "Simple Hair Clip", "Youthful Cap"],
  },
  unisex: {
    hero: ["Simple Watch"],
    campaign: ["Classic Sunglasses"],
    editorial: ["Minimal Sunglasses", "Simple Watch"],
  },
};

function resolveModelGender(
  modelGender: string | null | undefined,
  profileGender: GarmentProfile["gender"],
): "mens" | "womens" | "kids" | "unisex" {
  const raw = (modelGender ?? profileGender).toLowerCase();
  if (raw === "mens" || raw === "male") return "mens";
  if (raw === "womens" || raw === "female") return "womens";
  if (raw === "kids" || raw === "child") return "kids";
  return "unisex";
}

function isKidsProfile(profile: GarmentProfile, modelGender: string | null | undefined): boolean {
  if (resolveModelGender(modelGender, profile.gender) === "kids") return true;
  return profile.ageGroup === "young_child" || profile.ageGroup === "teen_youth";
}

function containsKeyword(value: string, keywords: string[]): boolean {
  const lower = value.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function accessoryObscuresGarment(accessory: string, profile: GarmentProfile): boolean {
  if (!containsKeyword(accessory, OBSCURING_ACCESSORY_KEYWORDS)) return false;

  const neckline = profile.neckline?.toLowerCase() ?? "";
  const category = profile.category;
  const hasDistinctNeckline =
    category === "tops" ||
    category === "one-pieces" ||
    category === "outerwear" ||
    neckline.includes("v-neck") ||
    neckline.includes("square") ||
    neckline.includes("collar");

  return hasDistinctNeckline;
}

export function isAccessoryAppropriate(
  accessory: string,
  profile: GarmentProfile,
  modelGender?: string | null,
): boolean {
  const gender = resolveModelGender(modelGender, profile.gender);
  const lower = accessory.toLowerCase();

  if (isKidsProfile(profile, modelGender)) {
    if (containsKeyword(accessory, MATURE_ACCESSORY_KEYWORDS)) return false;
    if (containsKeyword(accessory, ["watch", "jewellery", "jewelry", "ring", "bracelet"])) {
      return containsKeyword(accessory, ["simple", "youthful", "colourful", "colorful", "hair", "cap", "backpack"]);
    }
  }

  if (gender === "mens") {
    if (containsKeyword(accessory, FEMININE_ACCESSORY_KEYWORDS)) return false;
  }

  if (gender === "womens") {
    if (containsKeyword(accessory, MASCULINE_ACCESSORY_KEYWORDS)) return false;
  }

  if (accessoryObscuresGarment(accessory, profile)) return false;

  // Reject clearly mismatched gender styling phrases in free-text accessories.
  if (gender === "mens" && (lower.includes("her ") || lower.includes("feminine"))) return false;
  if (gender === "womens" && (lower.includes("his ") || lower.includes("masculine"))) return false;

  return true;
}

function maxAccessoriesForContext(context: GenerationContext): number {
  if (context === "editorial") return 2;
  if (context === "campaign") return 1;
  return 1;
}

/**
 * Replace or filter outfit accessories so they respect model demographics and shoot type.
 * Carry bags are stripped from the shared shoot outfit — they must not become a persistent
 * batch accessory unless a specific pose later requires a bag as pose geometry.
 */
export function applyContextAwareAccessories(
  outfit: RecommendedOutfit,
  profile: GarmentProfile,
  modelGender: string | null | undefined,
  shots: 1 | 2 | 4 | 8,
): RecommendedOutfit {
  const context = imageCountToGenerationContext(shots);
  const gender = resolveModelGender(modelGender, profile.gender);
  const pool = ACCESSORY_POOL[gender][context];
  const maxAccessories = maxAccessoriesForContext(context);

  const filtered = (outfit.accessories ?? []).filter(
    (accessory) =>
      isAccessoryAppropriate(accessory, profile, modelGender)
      && !isCarryAccessory(accessory),
  );

  const resolved = [...filtered];
  for (const candidate of pool) {
    if (resolved.length >= maxAccessories) break;
    if (isCarryAccessory(candidate)) continue;
    if (resolved.some((item) => item.toLowerCase() === candidate.toLowerCase())) continue;
    if (!isAccessoryAppropriate(candidate, profile, modelGender)) continue;
    resolved.push(candidate);
  }

  const trimmed = resolved
    .filter((accessory) => !accessoryObscuresGarment(accessory, profile))
    .filter((accessory) => !isCarryAccessory(accessory))
    .slice(0, maxAccessories);

  return {
    ...outfit,
    accessories: trimmed.length > 0 ? trimmed : undefined,
  };
}

export function accessoryPromptGuidance(
  profile: GarmentProfile,
  modelGender: string | null | undefined,
  shots: 1 | 2 | 4 | 8,
): string {
  const gender = resolveModelGender(modelGender, profile.gender);
  const context = imageCountToGenerationContext(shots);

  const carryRule =
    "CARRY ACCESSORIES: Do not invent handbags, totes, jute/woven bags, potli bags, clutches, or backpacks unless the selected pose for that shot explicitly requires a bag as part of the body pose. Never repeat the same carry bag across multiple shots of the same garment.";

  if (isKidsProfile(profile, modelGender)) {
    return [
      "Accessories must be age-appropriate for a child model only — never luxury jewellery, mature styling, or adult fashion accessories.",
      carryRule,
    ].join(" ");
  }

  if (gender === "mens") {
    return [
      context === "editorial"
        ? "Accessories may include a luxury watch, bracelet, chain, ring, or sunglasses — never feminine jewellery or handbags."
        : "Accessories must remain commercially wearable for a male model — watch or sunglasses only, never feminine jewellery.",
      carryRule,
    ].join(" ");
  }

  if (gender === "womens") {
    return [
      context === "editorial"
        ? "Optional accessories may include earrings, necklace, bracelet, or sunglasses — expressive but brand-appropriate, never obscuring the hero garment."
        : "Optional accessories should remain commercially wearable — subtle earrings or sunglasses that do not dominate the garment.",
      carryRule,
    ].join(" ");
  }

  return [
    "Accessories must enhance styling without obscuring the hero garment or conflicting with the selected model demographic.",
    carryRule,
  ].join(" ");
}
