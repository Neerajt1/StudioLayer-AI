// ---------------------------------------------------------------------------
// StudioLayer AI — Prompt Composer (SL-014)
//
// Converts an OutfitRecommendation + GarmentProfile into a natural language
// render prompt. The prompt is used for developer logging and future
// text-to-image model integrations.
//
// The prompt is NOT sent to fal-ai/fashn/tryon/v1.6 — that API does not
// support a prompt parameter (confirmed SL-011A audit). The prompt captures
// the intelligence decision as a human-readable artefact.
//
// Architecture principle:
//   The PromptComposer only reads the recommendation — it never calls
//   external APIs, has no side effects, and is always synchronous.
// ---------------------------------------------------------------------------

import type { GarmentProfile, OutfitRecommendation } from "./types";

// ---------------------------------------------------------------------------
// Human-readable field formatters
// ---------------------------------------------------------------------------

function humanGender(gender: string): string {
  if (gender === "mens")   return "male";
  if (gender === "womens") return "female";
  if (gender === "kids")   return "child";
  return "model";
}

function humanAge(ageGroup: string): string {
  const map: Record<string, string> = {
    young_adult:       "young adult",
    classic_mid_age:   "mid-age adult",
    mature_executive:  "mature",
    teen_youth:        "teenage",
    young_child:       "child",
  };
  return map[ageGroup] ?? "adult";
}

// ---------------------------------------------------------------------------
// PromptComposer
// ---------------------------------------------------------------------------

export interface PromptComposerParams {
  profile: GarmentProfile;
  recommendation: OutfitRecommendation;
  /** Override gender from the selected model identity (optional). */
  modelGender?: string | null;
  /** Override age group from the selected model identity (optional). */
  modelAgeGroup?: string | null;
}

/**
 * Composes a natural-language catalog photography prompt from the
 * intelligence engine's outfit recommendation and garment profile.
 *
 * Part 4 (garment protection) clauses are always included.
 * Part 5 (outfit composition) and Part 6 (photography) requirements are
 * always included.
 */
export function composeRenderPrompt(params: PromptComposerParams): string {
  const { profile, recommendation, modelGender, modelAgeGroup } = params;
  const { recommendedOutfit } = recommendation;

  // Model descriptor — prefer identity override over detected profile
  const gender  = humanGender(modelGender  ?? profile.gender);
  const age     = humanAge(modelAgeGroup   ?? profile.ageGroup);

  // Hero garment description
  const colours    = profile.colour.filter(Boolean).slice(0, 2).join(" ");
  const heroStr    = `${colours} ${profile.subcategory}`.trim();

  // Complementary items — ordered by visual layer (inner → outer → feet)
  const companions: string[] = [];
  if (recommendedOutfit.innerLayer)                    companions.push(recommendedOutfit.innerLayer);
  if (recommendedOutfit.top)                           companions.push(recommendedOutfit.top);
  if (recommendedOutfit.bottom)                        companions.push(recommendedOutfit.bottom);
  if (recommendedOutfit.outerwear)                     companions.push(recommendedOutfit.outerwear);
  if (recommendedOutfit.footwear)                      companions.push(recommendedOutfit.footwear);
  if (recommendedOutfit.accessories?.length)           companions.push(...recommendedOutfit.accessories.slice(0, 2));

  const companionClause = companions.length
    ? `, paired with ${companions.join(", ")}`
    : "";

  // ── Prompt sections ───────────────────────────────────────────────────────

  const opening = `A full-body studio fashion photograph of a ${age} ${gender}`;

  const hero = `wearing the uploaded ${heroStr} as the hero product${companionClause}.`;

  // Part 5 — composition rules
  const composition = [
    "The uploaded garment is the primary visual focal point.",
    "Complementary items are neutral, secondary, and must not distract from the hero garment.",
    "Avoid oversized accessories or brightly patterned supporting garments.",
  ].join(" ");

  // Part 4 — garment protection
  const protection = [
    "Preserve every detail of the uploaded garment exactly as photographed:",
    "precise colour, fabric texture, stitching, logos, branding, pockets, buttons, zippers, prints, and embroidery.",
    "Complementary garments adapt around the uploaded product — never replace or obscure it.",
  ].join(" ");

  // Part 6 — commercial photography
  const photography = [
    "Natural standing pose, balanced posture, neutral expression.",
    "Full body visible head to foot.",
    "Professional catalogue lighting, accurate garment draping, realistic footwear placement, natural shadows.",
    "Clean white seamless studio background, premium fashion catalogue quality.",
  ].join(" ");

  return [opening, hero, composition, protection, photography].join(" ");
}
