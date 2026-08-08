// ---------------------------------------------------------------------------
// StudioLayer AI — Footwear Intelligence (Fix #6)
//
// Makes footwear an intentional, predictable part of styling logic.
// Reuses GarmentProfile + OutfitRecommendation — no parallel footwear system.
// ---------------------------------------------------------------------------

import type { GarmentProfile, RecommendedOutfit } from "./types";

export type FootwearStylingMode = "footwear" | "barefoot";

export interface FootwearStylingResolution {
  mode: FootwearStylingMode;
  /** Established footwear description when mode is "footwear". */
  description: string | null;
}

const BAREFOOT_SUBCATEGORY_KEYWORDS = [
  "swim",
  "bikini",
  "swimsuit",
  "beachwear",
  "beach wear",
  "cover-up",
  "cover up",
  "sarong",
  "loungewear",
  "lounge wear",
  "sleepwear",
  "sleep wear",
  "pyjama",
  "pajama",
  "nightwear",
  "night wear",
  "nightgown",
  "night gown",
  "robe",
  "bathrobe",
  "negligee",
  "lingerie",
] as const;

const BAREFOOT_OCCASION_KEYWORDS = [
  "beach",
  "resort",
  "pool",
  "swim",
  "spa",
] as const;

/**
 * Returns true when garment category/context supports intentional barefoot styling.
 * Commercial fashion garments (dresses, trousers, jackets, etc.) return false.
 */
export function isBarefootAppropriateContext(profile: GarmentProfile): boolean {
  const sub = profile.subcategory.toLowerCase();
  const occasions = profile.occasion.map((o) => o.toLowerCase());

  if (BAREFOOT_SUBCATEGORY_KEYWORDS.some((keyword) => sub.includes(keyword))) {
    return true;
  }

  if (occasions.some((occasion) =>
    BAREFOOT_OCCASION_KEYWORDS.some((keyword) => occasion.includes(keyword)),
  )) {
    return true;
  }

  return false;
}

/**
 * Resolves whether this shoot should be styled with footwear or intentional barefoot,
 * using the intelligence layer's outfit recommendation when footwear is required.
 */
export function resolveFootwearStyling(
  profile: GarmentProfile,
  recommendedOutfit: RecommendedOutfit,
): FootwearStylingResolution {
  if (isBarefootAppropriateContext(profile)) {
    return { mode: "barefoot", description: null };
  }

  const footwear = recommendedOutfit.footwear?.trim() || null;
  return { mode: "footwear", description: footwear };
}

/**
 * Prompt block injected into generation briefs — styling intent + batch lock.
 */
export function buildFootwearStylingPrompt(
  profile: GarmentProfile,
  recommendedOutfit: RecommendedOutfit,
): string {
  const styling = resolveFootwearStyling(profile, recommendedOutfit);

  if (styling.mode === "barefoot") {
    return [
      "FOOTWEAR STYLING — INTENTIONAL BAREFOOT:",
      "This garment and styling context support barefoot presentation (swimwear, beach/resort, loungewear/sleepwear, or deliberate editorial barefoot concept).",
      "Barefoot is intentional here — not an accidental omission of footwear.",
      "Remain consistently barefoot across every image in this generation batch unless creative direction explicitly requires footwear.",
      "Do not randomly add shoes, sandals, or heels across parallel generations.",
    ].join(" ");
  }

  const establishedFootwear = styling.description
    ? `Established footwear for this shoot: ${styling.description}.`
    : "Wear appropriate commercial footwear that complements the garment — professional fashion styling, visible whenever feet appear in frame.";

  return [
    "FOOTWEAR STYLING — MANDATORY FOR COMMERCIAL FASHION:",
    "Standard commercial fashion photography — bare feet are NOT the default and are NOT acceptable for this garment.",
    establishedFootwear,
    "Footwear must be visible and correctly placed whenever feet appear in the frame.",
    "Walking, standing, cross-leg, and editorial movement poses must ALL preserve the same footwear — a pose must never cause footwear to disappear.",
    "FOOTWEAR BATCH CONSISTENCY — every image in this generation batch must show identical footwear styling:",
    styling.description
      ? `Same footwear type, colour, and style (${styling.description}) in every shot.`
      : "Same footwear type, colour, and style in every shot — never switch between barefoot, heels, sandals, sneakers, or boots.",
    "Never independently invent, remove, or switch footwear between parallel generations.",
    "Do not hallucinate unusual footwear — choose conservative, garment-appropriate styling only.",
  ].join(" ");
}

/** Compact batch lock appended alongside garment colour consistency rules. */
export function buildFootwearBatchConsistencyRules(
  profile: GarmentProfile,
  recommendedOutfit: RecommendedOutfit,
): string {
  const styling = resolveFootwearStyling(profile, recommendedOutfit);

  if (styling.mode === "barefoot") {
    return [
      "FOOTWEAR BATCH LOCK:",
      "Intentional barefoot for this shoot — remain barefoot in every image.",
      "Never add footwear in one shot and omit it in another.",
    ].join(" ");
  }

  const lockDetail = styling.description
    ? `Lock footwear to: ${styling.description}.`
    : "Lock footwear type, colour, and style across all batch images.";

  return [
    "FOOTWEAR BATCH LOCK:",
    lockDetail,
    "Same garment + same shoot = coherent footwear styling across the batch.",
    "Never switch between barefoot, heels, sandals, sneakers, or boots between shots.",
  ].join(" ");
}
