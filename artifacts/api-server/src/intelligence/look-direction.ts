// ---------------------------------------------------------------------------
// StudioLayer AI — Look Direction (Footwear V1)
//
// Lightweight styling-context signal for complementary footwear.
// Uses existing GarmentProfile + Complete the Look only — no new analyzer schema.
// ---------------------------------------------------------------------------

import type { GarmentCategory, GarmentProfile, RecommendedOutfit } from "./types";
import { FashionKnowledgeBase } from "./fashion-knowledge-base";

/**
 * Overall fashion direction of the completed look.
 * Drives styling-context choices (e.g. footwear) — not garment evidence.
 */
export type LookDirection =
  | "contemporary_casual"
  | "traditional_ethnic"
  | "formal_evening"
  | "western"
  | "resort_vacation"
  | "streetwear"
  | "editorial"
  | "general";

const FORMAL_OCCASIONS = [
  "evening",
  "formal",
  "gala",
  "black tie",
  "cocktail",
  "office",
  "business",
  "wedding",
  "bridal",
] as const;

const RESORT_OCCASIONS = [
  "beach",
  "resort",
  "pool",
  "vacation",
  "holiday",
  "swim",
  "spa",
] as const;

const STREET_OCCASIONS = ["street", "streetwear", "urban"] as const;

const ETHNIC_OCCASIONS = [
  "festive",
  "traditional",
  "ethnic",
  "cultural",
  "ceremony",
] as const;

const ETHNIC_SUBCATEGORY_CUES = [
  "kurta",
  "kurti",
  "sherwani",
  "saree",
  "sari",
  "lehenga",
  "anarkali",
  "salwar",
  "churidar",
  "dupatta",
  "banarasi",
  "kanjeevaram",
  "ethnic",
  "nehru",
  "choli",
  "ghagra",
  "dhoti",
  "mojari",
  "kimono",
  "hanbok",
  "abaya",
  "kaftan",
  "dashiki",
] as const;

const FORMAL_SUBCATEGORY_CUES = [
  "gown",
  "evening",
  "cocktail",
  "tuxedo",
  "blazer",
  "suit",
] as const;

const RESORT_SUBCATEGORY_CUES = [
  "swim",
  "bikini",
  "cover-up",
  "cover up",
  "sarong",
  "resort",
  "beachwear",
] as const;

const STREET_SUBCATEGORY_CUES = [
  "hoodie",
  "jogger",
  "cargo",
  "graphic tee",
  "bomber",
  "streetwear",
] as const;

const EDITORIAL_FABRIC_CUES = [
  "silk",
  "satin",
  "velvet",
  "chiffon",
  "organza",
  "brocade",
] as const;

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

function occasionsJoined(profile: GarmentProfile): string {
  return profile.occasion.map((o) => o.toLowerCase()).join(" ");
}

/**
 * Maps Complete the Look / outfitStyle to a look direction when explicit.
 * Returns null when style is absent, "none", or unrecognised.
 */
export function lookDirectionFromOutfitStyle(
  outfitStyle: string | null | undefined,
): LookDirection | null {
  if (!outfitStyle) return null;
  const s = outfitStyle.toLowerCase().replace(/[-\s]/g, "_");
  if (s === "none") return null;
  if (s === "ethnic") return "traditional_ethnic";
  if (s === "formal") return "formal_evening";
  if (s === "streetwear") return "streetwear";
  if (s === "sportswear") return "contemporary_casual";
  if (s === "casual" || s === "denim") return "contemporary_casual";
  if (s === "business_casual") return "western";
  if (s === "ai_recommended") return null;
  return null;
}

/**
 * Soft garment cues only — never aggressive. Prefer general over guessing.
 */
function lookDirectionFromGarmentCues(profile: GarmentProfile): LookDirection | null {
  const sub = profile.subcategory.toLowerCase();
  const fabric = profile.fabric.toLowerCase();
  const pattern = profile.pattern.toLowerCase();
  const occ = occasionsJoined(profile);

  if (includesAny(sub, ETHNIC_SUBCATEGORY_CUES) || includesAny(occ, ETHNIC_OCCASIONS)) {
    return "traditional_ethnic";
  }
  if (includesAny(sub, RESORT_SUBCATEGORY_CUES) || includesAny(occ, RESORT_OCCASIONS)) {
    return "resort_vacation";
  }
  if (
    includesAny(sub, FORMAL_SUBCATEGORY_CUES) ||
    includesAny(occ, FORMAL_OCCASIONS)
  ) {
    return "formal_evening";
  }
  if (includesAny(sub, STREET_SUBCATEGORY_CUES) || includesAny(occ, STREET_OCCASIONS)) {
    return "streetwear";
  }

  // Light editorial cue: luxury fabric + evening/festive already handled;
  // silk/satin alone without formal occasion → general (avoid over-guess).
  if (
    includesAny(fabric, EDITORIAL_FABRIC_CUES) &&
    (occ.includes("editorial") || pattern.includes("editorial"))
  ) {
    return "editorial";
  }

  if (occ.includes("casual") || occ.includes("everyday")) {
    return "contemporary_casual";
  }

  return null;
}

/**
 * Resolves look-level fashion direction for styling-context decisions.
 *
 * Priority: explicit Complete the Look > occasion/soft cues > general.
 * Insufficient evidence → general (no aggressive guessing).
 */
export function resolveLookDirection(
  profile: GarmentProfile,
  outfitStyle?: string | null,
): LookDirection {
  const fromStyle = lookDirectionFromOutfitStyle(outfitStyle);
  if (fromStyle) return fromStyle;

  const fromCues = lookDirectionFromGarmentCues(profile);
  if (fromCues) return fromCues;

  return "general";
}

/** Human label for prompts. */
export function describeLookDirection(direction: LookDirection): string {
  const labels: Record<LookDirection, string> = {
    contemporary_casual: "contemporary casual",
    traditional_ethnic: "traditional / ethnic",
    formal_evening: "formal / evening",
    western: "western",
    resort_vacation: "resort / vacation",
    streetwear: "streetwear",
    editorial: "editorial / fashion-forward",
    general: "general commercial",
  };
  return labels[direction];
}

/**
 * True when sneakers are a natural / preferred option for this look direction.
 * Sneakers remain *eligible* for all directions — this only signals preference.
 */
export function sneakersAllowedForLookDirection(direction: LookDirection): boolean {
  return (
    direction === "contemporary_casual" ||
    direction === "streetwear" ||
    direction === "western" ||
    direction === "resort_vacation" ||
    direction === "editorial" ||
    direction === "general" ||
    direction === "traditional_ethnic" ||
    direction === "formal_evening"
  );
}

const SNEAKER_PATTERN =
  /\b(sneaker|sneakers|trainer|trainers|keds|running shoes?|high-?top sneakers?)\b/i;

const ETHNIC_FOOTWEAR_PATTERN =
  /\b(jutti|juttis|mojari|mojaris|mojri|mojris|kolhapuri|embellished|ethnic|traditional|sandal|sandals|flat sandals|block-heel sandals)\b/i;

const FORMAL_FOOTWEAR_PATTERN =
  /\b(heel|heels|pump|pumps|oxford|derby|slingback|stiletto|pointed-?toe|dress shoe|loafer|loafers|mule|mules)\b/i;

const RESORT_FOOTWEAR_PATTERN =
  /\b(sandal|sandals|espadrille|espadrilles|slide|slides|mule|mules|wedge|wedges)\b/i;

export function isSneakerFootwearDescription(description: string): boolean {
  return SNEAKER_PATTERN.test(description);
}

/**
 * Preference score for footwear under a look direction.
 * Higher = more preferred. Sneakers remain eligible for every direction
 * (score may be lower) — never a hard ban, and never a universal fallback.
 */
export function footwearPreferenceScore(
  footwear: string,
  direction: LookDirection,
): number {
  const text = footwear.trim();
  if (!text) return -1;

  const sneaker = isSneakerFootwearDescription(text);
  const ethnic = ETHNIC_FOOTWEAR_PATTERN.test(text);
  const formal = FORMAL_FOOTWEAR_PATTERN.test(text);
  const resort = RESORT_FOOTWEAR_PATTERN.test(text);

  switch (direction) {
    case "contemporary_casual":
      return sneaker ? 3 : 2;
    case "streetwear":
      return sneaker ? 3 : 2;
    case "western":
      return 2;
    case "traditional_ethnic":
      if (ethnic) return 3;
      if (sneaker) return 1;
      return 2;
    case "formal_evening":
      if (formal && !sneaker) return 3;
      if (sneaker) return 1;
      return 2;
    case "resort_vacation":
      if (resort) return 3;
      return 2;
    case "editorial":
      return 2;
    case "general":
      return 2;
    default:
      return 2;
  }
}

/**
 * Eligibility helper — sneakers are eligible for all look directions.
 * Preference is handled by footwearPreferenceScore / selectFootwearForLookDirection.
 */
export function isFootwearCompatibleWithLookDirection(
  footwear: string,
  _direction: LookDirection,
): boolean {
  return footwear.trim().length > 0;
}

/**
 * Picks footwear from a KB recommendation list using look-direction preference.
 * Does NOT ban sneakers. Prefers direction-appropriate options when alternatives
 * exist; preserves list order on score ties (first highest score wins).
 */
export function selectFootwearForLookDirection(
  options: string[] | undefined,
  direction: LookDirection,
): string | undefined {
  if (!options?.length) return undefined;

  let best = options[0]!;
  let bestScore = footwearPreferenceScore(best, direction);

  for (let i = 1; i < options.length; i++) {
    const option = options[i]!;
    const score = footwearPreferenceScore(option, direction);
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }

  return best;
}

/** Direction-aware hard-fallback footwear (never universal White Leather Sneakers). */
export function defaultFootwearForLookDirection(
  direction: LookDirection,
  gender: GarmentProfile["gender"] = "womens",
): string {
  const mens = gender === "mens";

  switch (direction) {
    case "contemporary_casual":
      return mens ? "White Leather Sneakers" : "White Sneakers";
    case "streetwear":
      return mens ? "High-Top Sneakers" : "Chunky Platform Sneakers";
    case "western":
      return mens ? "Brown Leather Loafers" : "Nude Block Heels";
    case "traditional_ethnic":
      return mens ? "Mojari Shoes" : "Embellished Flat Sandals";
    case "formal_evening":
      return mens ? "Black Oxford Shoes" : "Black Pointed-Toe Heels";
    case "resort_vacation":
      return mens ? "Leather Slide Sandals" : "Strappy Flat Sandals";
    case "editorial":
      return mens ? "Polished Leather Loafers" : "Fashion-Forward Heeled Mules";
    case "general":
      return mens
        ? "Refined leather loafers complementary to the look"
        : "Refined commercial footwear complementary to the look";
  }
}

/**
 * Direction-aware complementary lower garment for Top Wear completion.
 * Not garment-specific (no kurta→pajama hardcode).
 */
export function defaultBottomForLookDirection(
  direction: LookDirection,
  gender: GarmentProfile["gender"] = "womens",
): string {
  const mens = gender === "mens";

  switch (direction) {
    case "traditional_ethnic":
      return mens ? "Slim Churidar" : "Straight Palazzo Pants";
    case "formal_evening":
      return mens ? "Black Formal Trousers" : "Straight-Fit Black Trousers";
    case "streetwear":
      return mens ? "Black Tapered Joggers" : "Black High-Waist Leggings";
    case "resort_vacation":
      return mens ? "Linen Trousers" : "Light Linen Trousers";
    case "western":
      return mens ? "Beige Chinos" : "Beige Tailored Trousers";
    case "editorial":
      return mens ? "Tailored Dark Trousers" : "Wide-Leg Tailored Trousers";
    case "contemporary_casual":
    case "general":
    default:
      return mens ? "Dark Blue Slim Jeans" : "Blue Slim Jeans";
  }
}

/**
 * Look-consistent default inner layer when outerwear (or any plan) requires one.
 */
export function defaultInnerLayerForLookDirection(
  lookDirection: LookDirection,
  gender: GarmentProfile["gender"],
): string {
  const mens = gender === "mens";
  switch (lookDirection) {
    case "formal_evening":
      return mens ? "White Dress Shirt" : "Ivory Silk Camisole";
    case "traditional_ethnic":
      return mens ? "White Cotton Inner Kurta" : "White Cotton Camisole";
    case "streetwear":
      return mens ? "Black Crew Neck T-Shirt" : "Black Fitted Tee";
    case "resort_vacation":
      return mens ? "White Linen Shirt" : "Light Linen Camisole";
    case "western":
      return mens ? "White Oxford Shirt" : "White Crew Neck T-Shirt";
    case "editorial":
      return mens ? "Black Fine-Knit Tee" : "Black Fine-Knit Camisole";
    case "contemporary_casual":
    case "general":
    default:
      return "White Crew Neck T-Shirt";
  }
}

/**
 * Hard fallback companions when rule engine + GPT fail.
 * Footwear is direction-aware — never universal White Leather Sneakers.
 * When garmentPlacement is upper_body, always include a look-appropriate bottom
 * even if vision classified the hero as one-pieces.
 */
export function buildHardFallbackOutfit(
  category: GarmentCategory,
  lookDirection: LookDirection,
  gender: GarmentProfile["gender"],
  garmentPlacement?: string | null,
): RecommendedOutfit {
  const footwear = defaultFootwearForLookDirection(lookDirection, gender);
  const bottom = defaultBottomForLookDirection(lookDirection, gender);

  if (garmentPlacement === "upper_body") {
    if (category === "outerwear") {
      return {
        innerLayer: defaultInnerLayerForLookDirection(lookDirection, gender),
        bottom,
        footwear: lookDirection === "general" ? "Chelsea Boots" : footwear,
      };
    }
    return {
      bottom,
      footwear,
      accessories: gender === "mens" ? ["Leather Belt"] : ["Minimal Gold Jewellery"],
    };
  }

  if (garmentPlacement === "full_body") {
    return {
      footwear,
      accessories: ["Minimal Gold Jewellery"],
    };
  }

  switch (category) {
    case "tops":
      return {
        bottom,
        footwear,
        accessories: ["Leather Belt"],
      };
    case "bottoms":
      return {
        top: "White Crew Neck T-Shirt",
        footwear,
        accessories: ["Simple Watch"],
      };
    case "one-pieces":
      return {
        footwear,
        accessories: ["Minimal Gold Jewellery"],
      };
    case "outerwear":
      return {
        innerLayer: defaultInnerLayerForLookDirection(lookDirection, gender),
        bottom,
        footwear: lookDirection === "general" ? "Chelsea Boots" : footwear,
      };
    case "footwear":
      return {
        top: "White Crew Neck T-Shirt",
        bottom,
        accessories: ["Simple Watch"],
      };
    case "accessories":
      return {
        top: "White Crew Neck T-Shirt",
        bottom,
        footwear,
      };
    default:
      return { footwear };
  }
}

/**
 * Knowledge base for outfit matching.
 * Traditional/ethnic looks also score India regional rules so ethnic footwear
 * knowledge is reachable — without hardcoding India as the user's region.
 */
export function knowledgeBaseForLookDirection(
  lookDirection: LookDirection,
): FashionKnowledgeBase {
  if (lookDirection === "traditional_ethnic") {
    return new FashionKnowledgeBase("india");
  }
  return new FashionKnowledgeBase("default");
}

/**
 * Ensures required wardrobe slots survive into generation.
 * Top Wear / required plans get bottom + footwear; outerwear plans get innerLayer.
 * Full Outfit never invents garments (and strips innerLayer).
 */
export function applyPlacementOutfitGuards(
  outfit: RecommendedOutfit,
  lookDirection: LookDirection,
  gender: GarmentProfile["gender"],
  garmentPlacement?: string | null,
  requiredSlots?: readonly string[],
): RecommendedOutfit {
  const next = { ...outfit };

  if (garmentPlacement === "full_body") {
    delete next.bottom;
    delete next.top;
    delete next.innerLayer;
    delete next.outerwear;
    if (!next.footwear) {
      next.footwear = defaultFootwearForLookDirection(lookDirection, gender);
    }
    return next;
  }

  const needsBottom =
    garmentPlacement === "upper_body" || requiredSlots?.includes("bottom");
  if (needsBottom && !next.bottom) {
    next.bottom = defaultBottomForLookDirection(lookDirection, gender);
  }

  const needsFootwear =
    garmentPlacement === "upper_body" ||
    garmentPlacement === "lower_body" ||
    requiredSlots?.includes("footwear");
  if (needsFootwear && !next.footwear) {
    next.footwear = defaultFootwearForLookDirection(lookDirection, gender);
  }

  const needsInnerLayer = requiredSlots?.includes("innerLayer") === true;
  if (needsInnerLayer && !next.innerLayer) {
    next.innerLayer = defaultInnerLayerForLookDirection(lookDirection, gender);
  }

  return next;
}
