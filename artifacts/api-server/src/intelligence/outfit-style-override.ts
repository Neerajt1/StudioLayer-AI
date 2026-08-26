// ---------------------------------------------------------------------------
// StudioLayer AI — Outfit Style Override (SL-018B)
//
// Maps a user's "Complete the Look" selection into a concrete RecommendedOutfit
// that the PromptComposer uses in place of the Intelligence Engine's own
// outfit determination.
//
// This is the backend mirror of the frontend outfit-completion-engine.ts.
// Both files share the same rule data — expressed here in RecommendedOutfit
// types native to the Intelligence layer.
//
// Rule key format: `${placement}_${gender}_${style}`
//   placement — derived from the detected garment category:
//     tops / outerwear / footwear / accessories → "upper"
//     bottoms                                   → "lower"
//     one-pieces                                → "full"
//   gender    — "mens" | "womens" | "kids"
//   style     — one of the 8 non-none CompleteTheLook style values
//
// Returns null when style === "none" (Intelligence Engine determines outfit).
// Falls back to "ai_recommended" rules when an exact key is missing.
// ---------------------------------------------------------------------------

import type { GarmentCategory, RecommendedOutfit } from "./types";

// ---------------------------------------------------------------------------
// Placement group
// ---------------------------------------------------------------------------

type PlacementGroup = "upper" | "lower" | "full";

function garmentCategoryToPlacement(category: GarmentCategory): PlacementGroup {
  if (category === "bottoms")                                      return "lower";
  if (category === "one-pieces")                                   return "full";
  // tops / outerwear / footwear / accessories all complete upward
  return "upper";
}

// ---------------------------------------------------------------------------
// Rule table
// Key format: `${placement}_${gender}_${style}`
// Value: RecommendedOutfit — items that complement the uploaded garment.
// ---------------------------------------------------------------------------

const OVERRIDE_RULES: Record<string, RecommendedOutfit> = {

  // ═══════════════════════════════════════════════════════════════════════════
  // UPPER (tops / outerwear) — Men's
  // ═══════════════════════════════════════════════════════════════════════════
  upper_mens_ai_recommended:  { bottom: "Matching Suit Trousers",    footwear: "Black Oxford Shoes"      },
  upper_mens_formal:          { bottom: "Black Formal Trousers",      footwear: "Black Oxford Shoes"      },
  upper_mens_business_casual: { bottom: "Beige Chinos",               footwear: "Brown Leather Loafers"   },
  upper_mens_casual:          { bottom: "Blue Straight-Cut Jeans",    footwear: "White Leather Sneakers"  },
  upper_mens_denim:           { bottom: "Dark Indigo Denim Jeans",    footwear: "White Canvas Sneakers"   },
  upper_mens_streetwear:      { bottom: "Black Tapered Joggers",      footwear: "High-Top Sneakers"       },
  upper_mens_ethnic:          { bottom: "Matching Churidar Pyjamas",  footwear: "Mojari Shoes"            },
  upper_mens_sportswear:      { bottom: "Navy Athletic Shorts",       footwear: "Running Shoes"           },

  // ═══════════════════════════════════════════════════════════════════════════
  // UPPER (tops / outerwear) — Women's
  // ═══════════════════════════════════════════════════════════════════════════
  upper_womens_ai_recommended:  { bottom: "Straight-Fit Off-White Trousers", footwear: "Nude Block Heels"         },
  upper_womens_formal:          { bottom: "Straight-Fit Black Trousers",     footwear: "Black Pointed-Toe Heels"  },
  upper_womens_business_casual: { bottom: "Beige Tailored Trousers",         footwear: "Nude Block-Heel Pumps"    },
  upper_womens_casual:          { bottom: "Blue Slim Jeans",                 footwear: "White Sneakers"           },
  upper_womens_denim:           { bottom: "Classic Blue Denim Jeans",        footwear: "White Canvas Sneakers"    },
  upper_womens_streetwear:      { bottom: "Black High-Waist Leggings",       footwear: "Chunky Platform Sneakers" },
  upper_womens_ethnic:          { bottom: "Matching Palazzo or Salwar",      footwear: "Embellished Flat Sandals" },
  upper_womens_sportswear:      { bottom: "Fitted Athletic Leggings",        footwear: "Running Shoes"            },

  // ═══════════════════════════════════════════════════════════════════════════
  // UPPER (tops / outerwear) — Kids'
  // ═══════════════════════════════════════════════════════════════════════════
  upper_kids_ai_recommended:  { bottom: "Dark Blue Jeans",         footwear: "White Sneakers"     },
  upper_kids_formal:          { bottom: "Black Formal Trousers",   footwear: "Black Dress Shoes"  },
  upper_kids_business_casual: { bottom: "Khaki Chinos",            footwear: "Brown Loafers"      },
  upper_kids_casual:          { bottom: "Blue Denim Jeans",        footwear: "Colourful Trainers" },
  upper_kids_denim:           { bottom: "Denim Jeans",             footwear: "White Sneakers"     },
  upper_kids_streetwear:      { bottom: "Jogger Pants",            footwear: "High-Top Sneakers"  },
  upper_kids_ethnic:          { bottom: "Matching Pajama Bottoms", footwear: "Mojari Shoes"       },
  upper_kids_sportswear:      { bottom: "Athletic Shorts",         footwear: "Running Shoes"      },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOWER (bottoms) — Men's
  // ═══════════════════════════════════════════════════════════════════════════
  lower_mens_ai_recommended:  { top: "White Dress Shirt",        outerwear: "Charcoal Blazer", footwear: "Black Oxford Shoes"     },
  lower_mens_formal:          { top: "White Dress Shirt",        outerwear: "Navy Blazer",     footwear: "Black Oxford Shoes"     },
  lower_mens_business_casual: { top: "Light Blue Oxford Shirt",                                footwear: "Brown Leather Loafers"  },
  lower_mens_casual:          { top: "White Crew-Neck T-Shirt",                               footwear: "White Sneakers"         },
  lower_mens_denim:           { top: "Grey Marl T-Shirt",                                     footwear: "White Canvas Sneakers"  },
  lower_mens_streetwear:      { top: "Graphic Hoodie",                                        footwear: "High-Top Sneakers"      },
  lower_mens_ethnic:          { top: "Embroidered Kurta",                                     footwear: "Mojari Shoes"           },
  lower_mens_sportswear:      { top: "Performance Polo Shirt",                                footwear: "Running Shoes"          },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOWER (bottoms) — Women's
  // ═══════════════════════════════════════════════════════════════════════════
  lower_womens_ai_recommended:  { top: "Fitted White Blouse",      footwear: "Nude Strappy Heels"         },
  lower_womens_formal:          { top: "White Silk Blouse",         footwear: "Black Pointed-Toe Heels"   },
  lower_womens_business_casual: { top: "Pale Blue Fitted Blouse",   footwear: "Nude Block-Heel Pumps"     },
  lower_womens_casual:          { top: "White Relaxed T-Shirt",     footwear: "White Sneakers"            },
  lower_womens_denim:           { top: "Classic White Tee",         footwear: "White Canvas Sneakers"     },
  lower_womens_streetwear:      { top: "Cropped Graphic Hoodie",    footwear: "Chunky Platform Sneakers"  },
  lower_womens_ethnic:          { top: "Embroidered Kurti",         footwear: "Embellished Flat Sandals"  },
  lower_womens_sportswear:      { top: "Sports Crop Top",           footwear: "Running Shoes"             },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOWER (bottoms) — Kids'
  // ═══════════════════════════════════════════════════════════════════════════
  lower_kids_ai_recommended:  { top: "Plain Coloured T-Shirt",  footwear: "Colourful Trainers" },
  lower_kids_formal:          { top: "White Dress Shirt",       footwear: "Black Dress Shoes"  },
  lower_kids_business_casual: { top: "Polo Shirt",              footwear: "White Trainers"     },
  lower_kids_casual:          { top: "Graphic T-Shirt",         footwear: "Colourful Trainers" },
  lower_kids_denim:           { top: "White T-Shirt",           footwear: "White Sneakers"     },
  lower_kids_streetwear:      { top: "Graphic Hoodie",          footwear: "High-Top Sneakers"  },
  lower_kids_ethnic:          { top: "Embroidered Kurta",       footwear: "Mojari Shoes"       },
  lower_kids_sportswear:      { top: "Sports Jersey",           footwear: "Running Shoes"      },

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL (one-pieces: dresses, jumpsuits, suits) — Women's
  // ═══════════════════════════════════════════════════════════════════════════
  full_womens_ai_recommended:  { footwear: "Nude Strappy Heels",       accessories: ["Minimal Gold Jewellery"]  },
  full_womens_formal:          { footwear: "Black Pointed-Toe Heels",  accessories: ["Clutch Bag"]              },
  full_womens_business_casual: { footwear: "Nude Block-Heel Pumps",    accessories: ["Structured Tote Bag"]     },
  full_womens_casual:          { footwear: "White Sneakers",           accessories: ["Small Hoop Earrings"]     },
  full_womens_denim:           { footwear: "White Canvas Sneakers",    accessories: ["Denim Tote"]              },
  full_womens_streetwear:      { footwear: "Chunky Platform Sneakers", accessories: ["Mini Backpack"]           },
  full_womens_ethnic:          { footwear: "Embellished Juttis",       accessories: ["Statement Earrings"]      },
  full_womens_sportswear:      { footwear: "Running Shoes",            accessories: ["Sports Watch"]            },

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL (one-pieces: jumpsuits, overalls) — Men's
  // ═══════════════════════════════════════════════════════════════════════════
  full_mens_ai_recommended:  { innerLayer: "White Dress Shirt",  footwear: "Black Oxford Shoes"     },
  full_mens_formal:          { innerLayer: "White Dress Shirt",  footwear: "Black Oxford Shoes"     },
  full_mens_business_casual: { innerLayer: "Light Blue Shirt",   footwear: "Brown Leather Loafers"  },
  full_mens_casual:          { innerLayer: "White T-Shirt",      footwear: "White Sneakers"         },
  full_mens_denim:           { innerLayer: "White Tee",          footwear: "White Canvas Sneakers"  },
  full_mens_streetwear:      { innerLayer: "Graphic Tee",        footwear: "High-Top Sneakers"      },
  full_mens_ethnic:          { innerLayer: "Fitted Inner Kurta", footwear: "Mojari Shoes"           },
  full_mens_sportswear:      { innerLayer: "Compression Tee",    footwear: "Running Shoes"          },

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL (one-pieces) — Kids'
  // ═══════════════════════════════════════════════════════════════════════════
  full_kids_ai_recommended:  { footwear: "White Trainers"     },
  full_kids_formal:          { footwear: "Black Dress Shoes"  },
  full_kids_business_casual: { footwear: "White Trainers"     },
  full_kids_casual:          { footwear: "Colourful Trainers" },
  full_kids_denim:           { footwear: "White Sneakers"     },
  full_kids_streetwear:      { footwear: "High-Top Sneakers"  },
  full_kids_ethnic:          { footwear: "Mojari Shoes"       },
  full_kids_sportswear:      { footwear: "Running Shoes"      },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves a user's "Complete the Look" style selection into a RecommendedOutfit
 * override for the PromptComposer.
 *
 * Returns null when:
 *   - style is "none"  → Intelligence Engine determines outfit as normal
 *   - style is absent  → no override requested
 *
 * Fallback chain (same as frontend):
 *   1. Exact key match: `${placement}_${gender}_${style}`
 *   2. ai_recommended fallback: `${placement}_${gender}_ai_recommended`
 *   3. null — no override (Intelligence Engine decides)
 *
 * @param category  - Detected garment category from GarmentAnalyzer
 * @param gender    - Model gender from the rendering request
 * @param style     - Complete the Look selection from the UI
 */
export function resolveOutfitOverride(
  category: GarmentCategory,
  gender:   string | null | undefined,
  style:    string | null | undefined,
): RecommendedOutfit | null {
  if (!style || style === "none") return null;

  const placement = garmentCategoryToPlacement(category);
  const g         = normaliseGender(gender);
  const s         = normaliseStyle(style);

  if (!s) return null; // unrecognised style — do not override

  const exactKey    = `${placement}_${g}_${s}`;
  const fallbackKey = `${placement}_${g}_ai_recommended`;

  return OVERRIDE_RULES[exactKey] ?? OVERRIDE_RULES[fallbackKey] ?? null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normaliseGender(gender: string | null | undefined): "mens" | "womens" | "kids" {
  if (gender === "mens")   return "mens";
  if (gender === "kids")   return "kids";
  return "womens";          // default + unisex → womens
}

const VALID_STYLES = new Set([
  "ai_recommended", "formal", "business_casual", "casual",
  "denim", "streetwear", "ethnic", "sportswear",
]);

function normaliseStyle(style: string): string | null {
  const s = style.toLowerCase().replace(/[-\s]/g, "_");
  return VALID_STYLES.has(s) ? s : null;
}
