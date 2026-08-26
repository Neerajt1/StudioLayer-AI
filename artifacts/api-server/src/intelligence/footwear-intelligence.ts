// ---------------------------------------------------------------------------
// StudioLayer AI — Footwear Intelligence (Fix #6 + Look-Context V1)
//
// Footwear is styling context for clothing heroes, reference evidence when
// the uploaded product itself is footwear. Talent shoes are never evidence.
// ---------------------------------------------------------------------------

import type { GarmentProfile, RecommendedOutfit } from "./types";
import {
  describeLookDirection,
  resolveLookDirection,
  type LookDirection,
} from "./look-direction";

export type FootwearStylingMode = "footwear" | "barefoot";

/** Whether footwear is product evidence or complementary styling. */
export type FootwearRole = "evidence" | "styling";

export interface FootwearStylingResolution {
  mode: FootwearStylingMode;
  /** Established footwear description when mode is "footwear". */
  description: string | null;
  role: FootwearRole;
  lookDirection: LookDirection;
}

export type FootwearStylingOptions = {
  outfitStyle?: string | null;
  lookDirection?: LookDirection;
};

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

const TALENT_FOOTWEAR_EXCLUSION =
  "Talent / model reference footwear is NOT footwear styling evidence — do not copy, inherit, or restyle from shoes visible on the talent reference. Never use talent footwear to determine styling.";

/**
 * Resolves footwear mode + established description for the shoot.
 *
 * Hero product = footwear → REFERENCE EVIDENCE (preserve uploaded product).
 * Hero product = clothing → STYLING CONTEXT (look-direction-aware recommendation).
 * Talent footwear is never used as evidence or styling source.
 */
export function resolveFootwearStyling(
  profile: GarmentProfile,
  recommendedOutfit: RecommendedOutfit,
  options?: FootwearStylingOptions,
): FootwearStylingResolution {
  const direction =
    options?.lookDirection ??
    resolveLookDirection(profile, options?.outfitStyle);

  if (profile.category === "footwear") {
    const evidenceDescription =
      profile.subcategory?.trim() ||
      "the uploaded footwear product exactly as shown";
    return {
      mode: "footwear",
      description: evidenceDescription,
      role: "evidence",
      lookDirection: direction,
    };
  }

  if (isBarefootAppropriateContext(profile)) {
    return {
      mode: "barefoot",
      description: null,
      role: "styling",
      lookDirection: direction,
    };
  }

  const footwear = recommendedOutfit.footwear?.trim() || null;
  return {
    mode: "footwear",
    description: footwear,
    role: "styling",
    lookDirection: direction,
  };
}

/**
 * Prompt block injected into generation briefs — styling intent + batch lock.
 */
export function buildFootwearStylingPrompt(
  profile: GarmentProfile,
  recommendedOutfit: RecommendedOutfit,
  options?: FootwearStylingOptions,
): string {
  const styling = resolveFootwearStyling(profile, recommendedOutfit, options);
  const directionLabel = describeLookDirection(styling.lookDirection);

  if (styling.role === "evidence") {
    return [
      "FOOTWEAR — REFERENCE EVIDENCE:",
      `The uploaded hero product is footwear (${styling.description}).`,
      "Preserve the uploaded footwear faithfully as product evidence — colour, construction, and design must match the reference.",
      TALENT_FOOTWEAR_EXCLUSION,
      "FOOTWEAR BATCH CONSISTENCY — identical footwear product appearance in every shot of this generation batch.",
    ].join(" ");
  }

  if (styling.mode === "barefoot") {
    return [
      "FOOTWEAR STYLING — INTENTIONAL BAREFOOT:",
      "This garment and styling context support barefoot presentation (swimwear, beach/resort, loungewear/sleepwear, or deliberate editorial barefoot concept).",
      "Barefoot is intentional here — not an accidental omission of footwear.",
      "Remain consistently barefoot across every image in this generation batch unless creative direction explicitly requires footwear.",
      "Do not randomly add shoes, sandals, or heels across parallel generations.",
      TALENT_FOOTWEAR_EXCLUSION,
    ].join(" ");
  }

  const establishedFootwear = styling.description
    ? `Established footwear for this shoot (styling context for look direction: ${directionLabel}): ${styling.description}.`
    : `Wear footwear that fits the overall fashion direction of the completed look (${directionLabel}) — professional fashion styling, visible whenever feet appear in frame.`;

  return [
    "FOOTWEAR STYLING — STYLING CONTEXT FOR THE COMPLETE LOOK:",
    `Footwear belongs with the garment as complementary styling for the overall fashion direction (${directionLabel}) — not as an isolated prop.`,
    "Standard commercial fashion photography — bare feet are NOT the default and are NOT acceptable for this garment.",
    establishedFootwear,
    TALENT_FOOTWEAR_EXCLUSION,
    "Do not invent footwear that conflicts with the completed look direction.",
    "Footwear must be visible and correctly placed whenever feet appear in the frame.",
    "Walking, standing, cross-leg, and editorial movement poses must ALL preserve the same footwear — a pose must never cause footwear to disappear.",
    "FOOTWEAR BATCH CONSISTENCY — every image in this generation batch must show identical footwear styling:",
    styling.description
      ? `Same footwear type, colour, and style (${styling.description}) in every shot.`
      : "Same footwear type, colour, and style in every shot — never switch between barefoot, heels, sandals, sneakers, or boots.",
    "Never independently invent, remove, or switch footwear between parallel generations.",
  ].join(" ");
}

/** Compact batch lock appended alongside garment colour consistency rules. */
export function buildFootwearBatchConsistencyRules(
  profile: GarmentProfile,
  recommendedOutfit: RecommendedOutfit,
  options?: FootwearStylingOptions,
): string {
  const styling = resolveFootwearStyling(profile, recommendedOutfit, options);

  if (styling.mode === "barefoot") {
    return [
      "FOOTWEAR BATCH LOCK:",
      "Intentional barefoot for this shoot — remain barefoot in every image.",
      "Never add footwear in one shot and omit it in another.",
      TALENT_FOOTWEAR_EXCLUSION,
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
    "Do not invent footwear that conflicts with the completed look.",
    TALENT_FOOTWEAR_EXCLUSION,
  ].join(" ");
}
