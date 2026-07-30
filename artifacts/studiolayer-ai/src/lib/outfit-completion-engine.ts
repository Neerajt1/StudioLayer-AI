// ---------------------------------------------------------------------------
// StudioLayer AI — Outfit Completion Engine (SL-018A)
//
// Rule-based, deterministic engine that maps:
//   (garmentPlacement, gender, completeTheLookStyle) → OutfitSpec
//
// Design principles:
//   - No AI / No LLM. Every mapping is an explicit rule.
//   - Exhaustive coverage: every (placement × gender × style) combination has
//     an entry. Missing combinations fall back to ai_recommended.
//   - Extensibility: add a new row to OUTFIT_RULES to support new garments,
//     gender variants, or style modes with zero downstream code changes.
//   - "AI Recommended" = curated editorial default for each placement/gender.
//   - "None" = null spec; instructs the pipeline to handle outfit completion
//     entirely server-side via the Intelligence Engine.
//
// Rule key format: `${placement}_${gender}_${style}`
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GarmentPlacement = 'upper_body' | 'lower_body' | 'full_body';
export type ModelGender       = 'womens' | 'mens' | 'kids';

export type CompleteTheLookStyle =
  | 'ai_recommended'
  | 'formal'
  | 'business_casual'
  | 'casual'
  | 'denim'
  | 'streetwear'
  | 'ethnic'
  | 'sportswear'
  | 'none';

/** The computed outfit items that complement the uploaded garment. */
export interface OutfitSpec {
  top?:       string;   // for lower_body garments
  bottom?:    string;   // for upper_body garments
  innerLayer?: string;  // shirt/tee worn under outerwear
  outerwear?: string;   // jacket/coat (rarely needed, for lower_body completions)
  footwear?:  string;
  accessory?: string;
}

/** One rendered option in the Complete the Look UI. */
export interface CompleteTheLookOption {
  value:    CompleteTheLookStyle;
  label:    string;
  emoji:    string;
}

// ---------------------------------------------------------------------------
// UI options — order matches the PRD specification
// ---------------------------------------------------------------------------

export const COMPLETE_THE_LOOK_OPTIONS: CompleteTheLookOption[] = [
  { value: 'ai_recommended', label: 'AI Recommended', emoji: '✨' },
  { value: 'formal',         label: 'Formal',         emoji: '👔' },
  { value: 'business_casual',label: 'Business Casual', emoji: '💼' },
  { value: 'casual',         label: 'Casual',         emoji: '😎' },
  { value: 'denim',          label: 'Denim',          emoji: '👖' },
  { value: 'streetwear',     label: 'Streetwear',     emoji: '🧢' },
  { value: 'ethnic',         label: 'Ethnic',         emoji: '🪡' },
  { value: 'sportswear',     label: 'Sportswear',     emoji: '🏃' },
  { value: 'none',           label: 'None',           emoji: '—'  },
];

// ---------------------------------------------------------------------------
// Outfit rule table
//
// Key: `${placement}_${gender}_${style}`
// Value: OutfitSpec — items that COMPLEMENT the uploaded garment.
//
// Null entries are not used here — the computeOutfitSpec() function handles
// the "none" style and unknown-key fallbacks separately.
// ---------------------------------------------------------------------------

const OUTFIT_RULES: Record<string, OutfitSpec> = {

  // ═══════════════════════════════════════════════════════════════════════════
  // UPPER BODY — Men's
  // ═══════════════════════════════════════════════════════════════════════════
  upper_body_mens_ai_recommended: { bottom: 'Matching Suit Trousers',    footwear: 'Black Oxford Shoes'     },
  upper_body_mens_formal:         { bottom: 'Black Formal Trousers',      footwear: 'Black Oxford Shoes'     },
  upper_body_mens_business_casual:{ bottom: 'Beige Chinos',               footwear: 'Brown Leather Loafers'  },
  upper_body_mens_casual:         { bottom: 'Blue Straight-Cut Jeans',    footwear: 'White Leather Sneakers' },
  upper_body_mens_denim:          { bottom: 'Dark Indigo Denim Jeans',    footwear: 'White Canvas Sneakers'  },
  upper_body_mens_streetwear:     { bottom: 'Black Tapered Joggers',      footwear: 'High-Top Sneakers'      },
  upper_body_mens_ethnic:         { bottom: 'Matching Churidar Pyjamas',  footwear: 'Mojari Shoes'           },
  upper_body_mens_sportswear:     { bottom: 'Navy Athletic Shorts',       footwear: 'Running Shoes'          },

  // ═══════════════════════════════════════════════════════════════════════════
  // UPPER BODY — Women's
  // ═══════════════════════════════════════════════════════════════════════════
  upper_body_womens_ai_recommended: { bottom: 'Straight-Fit Off-White Trousers', footwear: 'Nude Block Heels'        },
  upper_body_womens_formal:         { bottom: 'Straight-Fit Black Trousers',     footwear: 'Black Pointed-Toe Heels' },
  upper_body_womens_business_casual:{ bottom: 'Beige Tailored Trousers',         footwear: 'Nude Block-Heel Pumps'   },
  upper_body_womens_casual:         { bottom: 'Blue Slim Jeans',                 footwear: 'White Sneakers'          },
  upper_body_womens_denim:          { bottom: 'Classic Blue Denim Jeans',        footwear: 'White Canvas Sneakers'   },
  upper_body_womens_streetwear:     { bottom: 'Black High-Waist Leggings',       footwear: 'Chunky Platform Sneakers'},
  upper_body_womens_ethnic:         { bottom: 'Matching Palazzo or Salwar',      footwear: 'Embellished Flat Sandals'},
  upper_body_womens_sportswear:     { bottom: 'Fitted Athletic Leggings',        footwear: 'Running Shoes'           },

  // ═══════════════════════════════════════════════════════════════════════════
  // UPPER BODY — Kids'
  // ═══════════════════════════════════════════════════════════════════════════
  upper_body_kids_ai_recommended: { bottom: 'Dark Blue Jeans',         footwear: 'White Sneakers'     },
  upper_body_kids_formal:         { bottom: 'Black Formal Trousers',   footwear: 'Black Dress Shoes'  },
  upper_body_kids_business_casual:{ bottom: 'Khaki Chinos',            footwear: 'Brown Loafers'      },
  upper_body_kids_casual:         { bottom: 'Blue Denim Jeans',        footwear: 'Colourful Trainers' },
  upper_body_kids_denim:          { bottom: 'Denim Jeans',             footwear: 'White Sneakers'     },
  upper_body_kids_streetwear:     { bottom: 'Jogger Pants',            footwear: 'High-Top Sneakers'  },
  upper_body_kids_ethnic:         { bottom: 'Matching Pajama Bottoms', footwear: 'Mojari Shoes'       },
  upper_body_kids_sportswear:     { bottom: 'Athletic Shorts',         footwear: 'Running Shoes'      },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOWER BODY — Men's
  // ═══════════════════════════════════════════════════════════════════════════
  lower_body_mens_ai_recommended: { top: 'White Dress Shirt',         outerwear: 'Charcoal Blazer',    footwear: 'Black Oxford Shoes'     },
  lower_body_mens_formal:         { top: 'White Dress Shirt',         outerwear: 'Navy Blazer',        footwear: 'Black Oxford Shoes'     },
  lower_body_mens_business_casual:{ top: 'Light Blue Oxford Shirt',                                    footwear: 'Brown Leather Loafers'  },
  lower_body_mens_casual:         { top: 'White Crew-Neck T-Shirt',                                    footwear: 'White Sneakers'         },
  lower_body_mens_denim:          { top: 'Grey Marl T-Shirt',                                          footwear: 'White Canvas Sneakers'  },
  lower_body_mens_streetwear:     { top: 'Graphic Hoodie',                                             footwear: 'High-Top Sneakers'      },
  lower_body_mens_ethnic:         { top: 'Embroidered Kurta',                                          footwear: 'Mojari Shoes'           },
  lower_body_mens_sportswear:     { top: 'Performance Polo Shirt',                                     footwear: 'Running Shoes'          },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOWER BODY — Women's
  // ═══════════════════════════════════════════════════════════════════════════
  lower_body_womens_ai_recommended: { top: 'Fitted White Blouse',         footwear: 'Nude Strappy Heels'          },
  lower_body_womens_formal:         { top: 'White Silk Blouse',            footwear: 'Black Pointed-Toe Heels'    },
  lower_body_womens_business_casual:{ top: 'Pale Blue Fitted Blouse',      footwear: 'Nude Block-Heel Pumps'      },
  lower_body_womens_casual:         { top: 'White Relaxed T-Shirt',        footwear: 'White Sneakers'             },
  lower_body_womens_denim:          { top: 'Classic White Tee',            footwear: 'White Canvas Sneakers'      },
  lower_body_womens_streetwear:     { top: 'Cropped Graphic Hoodie',       footwear: 'Chunky Platform Sneakers'   },
  lower_body_womens_ethnic:         { top: 'Embroidered Kurti',            footwear: 'Embellished Flat Sandals'   },
  lower_body_womens_sportswear:     { top: 'Sports Crop Top',              footwear: 'Running Shoes'              },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOWER BODY — Kids'
  // ═══════════════════════════════════════════════════════════════════════════
  lower_body_kids_ai_recommended: { top: 'Plain Coloured T-Shirt',      footwear: 'Colourful Trainers' },
  lower_body_kids_formal:         { top: 'White Dress Shirt',           footwear: 'Black Dress Shoes'  },
  lower_body_kids_business_casual:{ top: 'Polo Shirt',                  footwear: 'White Trainers'     },
  lower_body_kids_casual:         { top: 'Graphic T-Shirt',             footwear: 'Colourful Trainers' },
  lower_body_kids_denim:          { top: 'White T-Shirt',               footwear: 'White Sneakers'     },
  lower_body_kids_streetwear:     { top: 'Graphic Hoodie',              footwear: 'High-Top Sneakers'  },
  lower_body_kids_ethnic:         { top: 'Embroidered Kurta',           footwear: 'Mojari Shoes'       },
  lower_body_kids_sportswear:     { top: 'Sports Jersey',               footwear: 'Running Shoes'      },

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL BODY (Dresses, Jumpsuits, Suits) — Women's
  // Full-body garments only need footwear and optional accessory
  // ═══════════════════════════════════════════════════════════════════════════
  full_body_womens_ai_recommended: { footwear: 'Nude Strappy Heels',        accessory: 'Minimal Gold Jewellery'  },
  full_body_womens_formal:         { footwear: 'Black Pointed-Toe Heels',   accessory: 'Clutch Bag'              },
  full_body_womens_business_casual:{ footwear: 'Nude Block-Heel Pumps',     accessory: 'Structured Tote Bag'     },
  full_body_womens_casual:         { footwear: 'White Sneakers',            accessory: 'Crossbody Bag'           },
  full_body_womens_denim:          { footwear: 'White Canvas Sneakers',     accessory: 'Denim Tote'              },
  full_body_womens_streetwear:     { footwear: 'Chunky Platform Sneakers',  accessory: 'Mini Backpack'           },
  full_body_womens_ethnic:         { footwear: 'Embellished Juttis',        accessory: 'Statement Earrings'      },
  full_body_womens_sportswear:     { footwear: 'Running Shoes',             accessory: 'Sports Watch'            },

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL BODY — Men's (Suits, Jumpsuits, Overalls)
  // ═══════════════════════════════════════════════════════════════════════════
  full_body_mens_ai_recommended: { innerLayer: 'White Dress Shirt',  footwear: 'Black Oxford Shoes'     },
  full_body_mens_formal:         { innerLayer: 'White Dress Shirt',  footwear: 'Black Oxford Shoes'     },
  full_body_mens_business_casual:{ innerLayer: 'Light Blue Shirt',   footwear: 'Brown Leather Loafers'  },
  full_body_mens_casual:         { innerLayer: 'White T-Shirt',      footwear: 'White Sneakers'         },
  full_body_mens_denim:          { innerLayer: 'White Tee',          footwear: 'White Canvas Sneakers'  },
  full_body_mens_streetwear:     { innerLayer: 'Graphic Tee',        footwear: 'High-Top Sneakers'      },
  full_body_mens_ethnic:         { innerLayer: 'Fitted Inner Kurta', footwear: 'Mojari Shoes'           },
  full_body_mens_sportswear:     { innerLayer: 'Compression Tee',    footwear: 'Running Shoes'          },

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL BODY — Kids'
  // ═══════════════════════════════════════════════════════════════════════════
  full_body_kids_ai_recommended: { footwear: 'White Trainers'    },
  full_body_kids_formal:         { footwear: 'Black Dress Shoes' },
  full_body_kids_business_casual:{ footwear: 'White Trainers'    },
  full_body_kids_casual:         { footwear: 'Colourful Trainers'},
  full_body_kids_denim:          { footwear: 'White Sneakers'    },
  full_body_kids_streetwear:     { footwear: 'High-Top Sneakers' },
  full_body_kids_ethnic:         { footwear: 'Mojari Shoes'      },
  full_body_kids_sportswear:     { footwear: 'Running Shoes'     },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the outfit specification for the given combination.
 * Returns null for the "none" style (no outfit completion requested).
 * Falls back to "ai_recommended" for any missing key combination.
 */
export function computeOutfitSpec(
  placement: GarmentPlacement | string,
  gender:    ModelGender | string,
  style:     CompleteTheLookStyle,
): OutfitSpec | null {
  if (style === 'none') return null;

  const key = `${placement}_${gender}_${style}`;

  if (OUTFIT_RULES[key]) return OUTFIT_RULES[key];

  // Fallback: try ai_recommended for this placement + gender
  const fallbackKey = `${placement}_${gender}_ai_recommended`;
  if (OUTFIT_RULES[fallbackKey]) return OUTFIT_RULES[fallbackKey];

  // Ultimate fallback: standard women's upper body ai_recommended
  return OUTFIT_RULES['upper_body_womens_ai_recommended']!;
}

/**
 * Converts an OutfitSpec into a comma-separated human-readable string.
 * Used in prompt construction and logging.
 *
 * Example: "Black Formal Trousers, Black Oxford Shoes"
 */
export function formatOutfitSpec(spec: OutfitSpec): string {
  return [
    spec.innerLayer,
    spec.top,
    spec.bottom,
    spec.outerwear,
    spec.footwear,
    spec.accessory,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Builds the complete outfit description sentence for prompt construction.
 * This is the structured outfit specification that is included in the
 * rendering request (per SL-018A Part 3).
 *
 * Example output:
 *   "dressing the model in Black Formal Trousers and Black Oxford Shoes"
 */
export function buildOutfitPromptAddendum(spec: OutfitSpec): string {
  const items = formatOutfitSpec(spec);
  if (!items) return '';
  return `dressing the model in ${items}`;
}

/**
 * Returns the display label for a given style value.
 */
export function getStyleLabel(style: CompleteTheLookStyle): string {
  return COMPLETE_THE_LOOK_OPTIONS.find((o) => o.value === style)?.label ?? style;
}
