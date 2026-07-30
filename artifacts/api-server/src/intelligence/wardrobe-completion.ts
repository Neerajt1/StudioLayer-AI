// ---------------------------------------------------------------------------
// StudioLayer AI — Wardrobe Completion Engine (SL-013A)
//
// Given a garment category, determines which outfit slots need completing.
//
// Rules:
//   tops        → recommend: bottom, footwear, accessories
//   bottoms     → recommend: top, footwear, accessories
//   one-pieces  → recommend: footwear, accessories
//   outerwear   → recommend: inner_layer, bottom, footwear
//   footwear    → recommend: (full outfit — top, bottom, accessories)
//   accessories → recommend: (full outfit — top, bottom, footwear)
//
// Constraint: NEVER recommend another garment from the uploaded category.
// The completed outfit must always look intentional and commercially presentable.
// The user should never see reference clothing (grey tees, compression shorts)
// in a recommended outfit — only real styled pieces.
// ---------------------------------------------------------------------------

import type { GarmentCategory } from "./types";

export type OutfitSlot =
  | "top"
  | "bottom"
  | "innerLayer"
  | "outerwear"
  | "footwear"
  | "accessories";

export interface WardrobeCompletionPlan {
  /** The garment the user uploaded. */
  uploadedCategory: GarmentCategory;
  /** Which slots need to be filled to complete the outfit. */
  requiredSlots: OutfitSlot[];
  /** Brief human-readable rationale (used in developer logs). */
  rationale: string;
}

const COMPLETION_PLANS: Record<GarmentCategory, WardrobeCompletionPlan> = {
  tops: {
    uploadedCategory: "tops",
    requiredSlots: ["bottom", "footwear", "accessories"],
    rationale: "Top uploaded — completing with bottom, footwear, and accessories",
  },
  bottoms: {
    uploadedCategory: "bottoms",
    requiredSlots: ["top", "footwear", "accessories"],
    rationale: "Bottom uploaded — completing with top, footwear, and accessories",
  },
  "one-pieces": {
    uploadedCategory: "one-pieces",
    requiredSlots: ["footwear", "accessories"],
    rationale: "One-piece uploaded — completing with footwear and accessories only",
  },
  outerwear: {
    uploadedCategory: "outerwear",
    requiredSlots: ["innerLayer", "bottom", "footwear"],
    rationale: "Outerwear uploaded — completing with inner layer, bottom, and footwear",
  },
  footwear: {
    uploadedCategory: "footwear",
    requiredSlots: ["top", "bottom", "accessories"],
    rationale: "Footwear uploaded — completing full outfit around the shoes",
  },
  accessories: {
    uploadedCategory: "accessories",
    requiredSlots: ["top", "bottom", "footwear"],
    rationale: "Accessory uploaded — completing full outfit around the accessory",
  },
};

/**
 * Returns the wardrobe completion plan for a given garment category.
 * Always safe — defaults to tops plan if category is unrecognised.
 */
export function getCompletionPlan(
  category: GarmentCategory,
): WardrobeCompletionPlan {
  return COMPLETION_PLANS[category] ?? COMPLETION_PLANS["tops"];
}

/**
 * Filters a recommendations map to only include slots required by the plan.
 * Prevents recommending another garment from the same category as the upload.
 */
export function filterRecommendationsToSlots(
  recommendations: Partial<Record<string, string[]>>,
  plan: WardrobeCompletionPlan,
): Partial<Record<OutfitSlot, string[]>> {
  const result: Partial<Record<OutfitSlot, string[]>> = {};

  // Map KB recommendation keys → outfit slot keys
  const slotKeyMap: Record<string, OutfitSlot> = {
    tops:       "top",
    bottoms:    "bottom",
    innerLayer: "innerLayer",
    outerwear:  "outerwear",
    footwear:   "footwear",
    accessories:"accessories",
  };

  for (const [kbKey, values] of Object.entries(recommendations)) {
    const slot = slotKeyMap[kbKey];
    if (slot && plan.requiredSlots.includes(slot) && values?.length) {
      result[slot] = values;
    }
  }

  return result;
}
