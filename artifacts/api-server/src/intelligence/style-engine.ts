// ---------------------------------------------------------------------------
// StudioLayer AI — Style Engine (SL-013A)
//
// Selects the appropriate StyleMode for a garment profile.
//
// Active modes: ecommerce_catalog (the only UI-exposed mode today)
//
// Future modes defined in types.ts are ready but not yet exposed in the UI:
//   casual, smart_casual, business_casual, luxury, minimal, streetwear,
//   old_money, editorial, athleisure, kids_casual
//
// Architecture note: StyleMode selection is intentionally separate from the
// FashionKnowledgeBase and DecisionEngine. Changing the selection logic here
// (e.g. adding user preference input) does not require touching other modules.
// ---------------------------------------------------------------------------

import type { GarmentProfile, StyleMode } from "./types";

// ---------------------------------------------------------------------------
// Mode selection heuristics — deterministic, no external calls
// ---------------------------------------------------------------------------

/** Occasions that suggest formal / office styling. */
const FORMAL_OCCASIONS = new Set(["office", "formal", "evening", "gala", "business"]);

/** Occasions that suggest athleisure styling. */
const SPORT_OCCASIONS = new Set(["sport", "gym", "athleisure"]);

/** Occasions that suggest festive / luxury styling. */
const FESTIVE_OCCASIONS = new Set(["festive", "wedding", "gala"]);

/**
 * Selects the most appropriate StyleMode for the given garment profile.
 *
 * Currently always returns "ecommerce_catalog" — the only UI-exposed mode.
 * The internal heuristics are in place for future activation when the UI
 * exposes style mode selection.
 *
 * @param profile - The analysed garment profile
 * @param overrideMode - Optional explicit mode from user input (future use)
 */
export function selectStyleMode(
  profile: GarmentProfile,
  overrideMode?: StyleMode,
): StyleMode {
  // Explicit user override takes priority (future UI feature)
  if (overrideMode) return overrideMode;

  // Kids garments → kids_casual
  if (profile.gender === "kids") return "ecommerce_catalog";

  // Internal heuristics (ready for future UI activation):
  const occasions = new Set(profile.occasion.map((o) => o.toLowerCase()));

  if ([...occasions].some((o) => FESTIVE_OCCASIONS.has(o))) {
    // Future: return "luxury";
  }
  if ([...occasions].some((o) => FORMAL_OCCASIONS.has(o))) {
    // Future: return "business_casual";
  }
  if ([...occasions].some((o) => SPORT_OCCASIONS.has(o))) {
    // Future: return "athleisure";
  }

  // Default: ecommerce_catalog (active production mode)
  return "ecommerce_catalog";
}

/**
 * Returns a human-readable description of a style mode.
 * Used in developer logs and future UI display.
 */
export function describeStyleMode(mode: StyleMode): string {
  const descriptions: Record<StyleMode, string> = {
    ecommerce_catalog: "E-Commerce Catalog — clean, commercially presentable styling",
    casual:            "Casual — relaxed, everyday outfitting",
    smart_casual:      "Smart Casual — elevated everyday, office-friendly",
    business_casual:   "Business Casual — professional with personality",
    luxury:            "Luxury — premium materials, editorial presentation",
    minimal:           "Minimal — clean lines, neutral palette",
    streetwear:        "Streetwear — urban, expressive, layered",
    old_money:         "Old Money — understated heritage classics",
    editorial:         "Editorial — bold, conceptual, avant-garde",
    athleisure:        "Athleisure — performance meets style",
    kids_casual:       "Kids Casual — comfortable, playful, durable",
  };
  return descriptions[mode] ?? mode;
}
